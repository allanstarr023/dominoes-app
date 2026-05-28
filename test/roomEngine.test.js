import test from "node:test";
import assert from "node:assert/strict";

import { createTile } from "../src/dominoesEngine.js";
import { completeMatchReview, playTile } from "../src/matchEngine.js";
import {
  ROOM_STATUS,
  addBotToRoom,
  cancelRoom,
  createRoom,
  disconnectRoomPlayer,
  joinRoom,
  reconnectRoomPlayer,
  replaceRoomMatch,
  requestRoomRematch,
  roomInviteUrl,
  startRoomMatch
} from "../src/roomEngine.js";

const t = (first, second) => createTile(first, second);

function fourPlayerRoom() {
  let room = createRoom({
    id: "room-123",
    host: { id: "p1", name: "Player 1" },
    matchLength: 5,
    now: 1000
  });

  room = joinRoom(room, { id: "p2", name: "Player 2" }, { now: 1100 });
  room = joinRoom(room, { id: "p3", name: "Player 3" }, { now: 1200 });
  room = joinRoom(room, { id: "p4", name: "Player 4" }, { now: 1300 });

  return room;
}

function startingHands() {
  return {
    p1: [t(6, 6), t(6, 0)],
    p2: [t(5, 5)],
    p3: [t(4, 4)],
    p4: [t(3, 3)]
  };
}

test("creates an inviteable room with the host seated", () => {
  const room = createRoom({
    id: "abc123",
    host: { id: "p1", name: "Allan" },
    matchLength: 10,
    now: 1000
  });

  assert.equal(room.status, ROOM_STATUS.WAITING);
  assert.equal(room.hostPlayerId, "p1");
  assert.equal(room.seats.length, 1);
  assert.equal(room.seats[0].name, "Allan");
  assert.equal(roomInviteUrl(room, "https://domino.example.com/"), "https://domino.example.com/rooms/abc123");
});

test("allows up to 7 players to join a room", () => {
  let room = fourPlayerRoom();

  room = joinRoom(room, { id: "p5", name: "Player 5" });
  room = joinRoom(room, { id: "p6", name: "Player 6" });
  room = joinRoom(room, { id: "p7", name: "Player 7" });

  assert.equal(room.seats.length, 7);
  assert.throws(
    () => joinRoom(room, { id: "p8", name: "Player 8" }),
    /Room is full/
  );
});

test("host can fill seats with unique generated bots", () => {
  let room = createRoom({
    id: "room-bots",
    host: { id: "p1", name: "Allan" },
    matchLength: 5,
    now: 1000
  });

  room = addBotToRoom(room, { now: 1100 });
  room = addBotToRoom(room, { now: 1200 });
  room = addBotToRoom(room, { now: 1300 });

  assert.deepEqual(
    room.seats.map((seat) => [seat.playerId, seat.name, Boolean(seat.isBot)]),
    [
      ["p1", "Allan", false],
      ["bot-001", "Bot-001", true],
      ["bot-002", "Bot-002", true],
      ["bot-003", "Bot-003", true]
    ]
  );
  assert.throws(
    () => addBotToRoom(room, { now: 1400 }),
    /at most 3 bots/
  );
});

test("rejects duplicate player names in the same room", () => {
  const room = createRoom({
    id: "room-dup-name",
    host: { id: "p1", name: "Allan" },
    matchLength: 5,
    now: 1000
  });

  assert.throws(
    () => joinRoom(room, { id: "p2", name: " allan " }, { now: 1100 }),
    /already in use/
  );
});

test("rejects duplicate player graphics in the same room", () => {
  const room = createRoom({
    id: "room-dup-avatar",
    host: { id: "p1", name: "Allan", avatarId: "crown" },
    matchLength: 5,
    now: 1000
  });

  assert.throws(
    () => joinRoom(room, { id: "p2", name: "Player 2", avatarId: "crown" }, { now: 1100 }),
    /graphic is already in use/
  );
});

test("does not start until the room has 4 players", () => {
  const room = createRoom({
    id: "abc123",
    host: "p1",
    matchLength: 5,
    now: 1000
  });

  assert.throws(
    () => startRoomMatch(room, { now: 2000, hands: startingHands() }),
    /at least 4 players/
  );
});

test("starts a room match using the seated players", () => {
  const room = startRoomMatch(fourPlayerRoom(), {
    now: 2000,
    hands: startingHands()
  });

  assert.equal(room.status, ROOM_STATUS.ACTIVE);
  assert.equal(room.match.id, "room-123");
  assert.deepEqual(room.match.playerOrder, ["p1", "p2", "p3", "p4"]);
  assert.equal(room.match.game.currentPlayerId, "p1");
});

test("disconnecting and reconnecting a room player pauses and resumes the match", () => {
  const room = startRoomMatch(fourPlayerRoom(), {
    now: 1000,
    hands: startingHands()
  });

  const disconnected = disconnectRoomPlayer(room, "p3", { now: 11_000 });

  assert.equal(disconnected.status, ROOM_STATUS.ACTIVE);
  assert.equal(disconnected.seats.find((seat) => seat.playerId === "p3").connected, false);
  assert.equal(disconnected.match.status, "paused");

  const reconnected = reconnectRoomPlayer(disconnected, "p3", { now: 60_000 });

  assert.equal(reconnected.status, ROOM_STATUS.ACTIVE);
  assert.equal(reconnected.seats.find((seat) => seat.playerId === "p3").connected, true);
  assert.equal(reconnected.match.status, "active");
  assert.equal(reconnected.match.game.turnDeadlineAt, 80_000);
});

test("room status follows a completed match", () => {
  const room = startRoomMatch(fourPlayerRoom(), {
    now: 1000,
    hands: {
      p1: [t(6, 6)],
      p2: [t(5, 5)],
      p3: [t(4, 4)],
      p4: [t(3, 3)]
    }
  });
  const fifthGame = {
    ...room.match,
    currentGameNumber: 5,
    rawScores: {
      p1: 20,
      p2: 12,
      p3: 10,
      p4: 9
    },
    completedGames: [
      { number: 1 },
      { number: 2 },
      { number: 3 },
      { number: 4 }
    ],
    game: {
      ...room.match.game,
      number: 5
    }
  };
  const finalReviewMatch = playTile(fifthGame, "p1", { tileId: "6:6" }, { now: 2000 });
  const reviewRoom = replaceRoomMatch(room, finalReviewMatch);

  assert.equal(reviewRoom.status, ROOM_STATUS.ACTIVE);

  const completedMatch = completeMatchReview(finalReviewMatch, { now: 23_000 });
  const completedRoom = replaceRoomMatch(room, completedMatch);

  assert.equal(completedRoom.status, ROOM_STATUS.COMPLETED);
  assert.deepEqual(completedRoom.match.winnerIds, ["p1"]);
});

test("four matching new championship votes start with only the voting players", () => {
  const room = startRoomMatch(fourPlayerRoom(), {
    now: 1000,
    hands: {
      p1: [t(6, 6)],
      p2: [t(5, 5)],
      p3: [t(4, 4)],
      p4: [t(3, 3)]
    }
  });
  const fifthGame = {
    ...room.match,
    currentGameNumber: 5,
    game: {
      ...room.match.game,
      number: 5
    }
  };
  const completedMatch = completeMatchReview(
    playTile(fifthGame, "p1", { tileId: "6:6" }, { now: 2000 }),
    { now: 23_000 }
  );
  let completedRoom = replaceRoomMatch(room, completedMatch);

  completedRoom = requestRoomRematch(completedRoom, "p1", { now: 24_000, matchLength: 10 });
  completedRoom = requestRoomRematch(completedRoom, "p2", { now: 25_000, matchLength: 10 });
  completedRoom = requestRoomRematch(completedRoom, "p3", { now: 26_000, matchLength: 10 });

  assert.equal(completedRoom.status, ROOM_STATUS.COMPLETED);
  assert.equal(Object.keys(completedRoom.rematchRequest.votesByPlayerId).length, 3);

  const rematchRoom = requestRoomRematch(completedRoom, "p4", {
    now: 27_000,
    matchLength: 10,
    hands: startingHands()
  });

  assert.equal(rematchRoom.status, ROOM_STATUS.ACTIVE);
  assert.equal(rematchRoom.matchLength, 10);
  assert.equal(rematchRoom.match.currentGameNumber, 1);
  assert.equal(rematchRoom.rematchRequest, null);
});

test("host can add a bot when only three players vote for a new championship", () => {
  const room = startRoomMatch(fourPlayerRoom(), {
    now: 1000,
    hands: {
      p1: [t(6, 6)],
      p2: [t(5, 5)],
      p3: [t(4, 4)],
      p4: [t(3, 3)]
    }
  });
  const fifthGame = {
    ...room.match,
    currentGameNumber: 5,
    game: {
      ...room.match.game,
      number: 5
    }
  };
  const completedMatch = completeMatchReview(
    playTile(fifthGame, "p1", { tileId: "6:6" }, { now: 2000 }),
    { now: 23_000 }
  );
  let completedRoom = replaceRoomMatch(room, completedMatch);

  completedRoom = requestRoomRematch(completedRoom, "p1", { now: 24_000, matchLength: 10 });
  completedRoom = requestRoomRematch(completedRoom, "p2", { now: 25_000, matchLength: 10 });
  completedRoom = requestRoomRematch(completedRoom, "p3", { now: 26_000, matchLength: 10 });

  assert.equal(completedRoom.status, ROOM_STATUS.COMPLETED);

  const withBot = addBotToRoom(completedRoom, { now: 26_500 });
  const botSeat = withBot.seats.at(-1);
  const rematchRoom = requestRoomRematch(withBot, botSeat.playerId, {
    now: 27_000,
    matchLength: 10,
    hands: {
      p1: [t(6, 6), t(6, 0)],
      p2: [t(5, 5)],
      p3: [t(4, 4)],
      [botSeat.playerId]: [t(3, 3)]
    }
  });

  assert.equal(rematchRoom.status, ROOM_STATUS.ACTIVE);
  assert.deepEqual(rematchRoom.seats.map((seat) => seat.playerId), ["p1", "p2", "p3", botSeat.playerId]);
  assert.deepEqual(rematchRoom.match.playerOrder, ["p1", "p2", "p3", botSeat.playerId]);
});

test("cancel room cancels the active match", () => {
  const room = startRoomMatch(fourPlayerRoom(), {
    now: 1000,
    hands: startingHands()
  });

  const cancelled = cancelRoom(room, {
    now: 2000,
    reason: "hostEndedSession"
  });

  assert.equal(cancelled.status, ROOM_STATUS.CANCELLED);
  assert.equal(cancelled.cancelReason, "hostEndedSession");
  assert.equal(cancelled.match.status, "cancelled");
  assert.equal(cancelled.match.cancelReason, "hostEndedSession");
});
