import test from "node:test";
import assert from "node:assert/strict";

import {
  createEmptyBoard,
  createTile
} from "../src/dominoesEngine.js";
import {
  BETWEEN_GAMES_DURATION_MS,
  BATHROOM_BREAK_DURATION_MS,
  FINAL_REVIEW_DURATION_MS,
  MATCH_STATUS,
  addChatMessage,
  advanceFromGameBreak,
  completeMatchReview,
  currentStandings,
  handleTurnTimeout,
  passTurn,
  playTile,
  requestBathroomBreak,
  resumeBathroomBreak,
  setPlayerConnection,
  startMatch,
  turnRemainingMs
} from "../src/matchEngine.js";

const players = ["p1", "p2", "p3", "p4"];
const t = (first, second) => createTile(first, second);

function basicHands() {
  return {
    p1: [t(6, 6), t(6, 0)],
    p2: [t(5, 5)],
    p3: [t(4, 4)],
    p4: [t(3, 3)]
  };
}

test("starts the first game with the player holding double-six", () => {
  const match = startMatch({
    players,
    matchLength: 5,
    now: 1000,
    hands: basicHands()
  });

  assert.equal(match.status, MATCH_STATUS.ACTIVE);
  assert.equal(match.currentGameNumber, 1);
  assert.equal(match.game.currentPlayerId, "p1");
  assert.equal(match.game.requiredOpeningTileId, "6:6");
  assert.equal(match.game.turnDeadlineAt, 46_000);
});

test("requires double-six as the first move of the first game", () => {
  const match = startMatch({
    players,
    matchLength: 5,
    now: 1000,
    hands: basicHands()
  });

  assert.throws(
    () => playTile(match, "p1", { tileId: "6:0" }, { now: 2000 }),
    /Opening move must be 6:6/
  );
});

test("starts the next game with the previous winner using any tile", () => {
  const match = startMatch({
    players,
    matchLength: 5,
    now: 1000,
    hands: {
      p1: [t(6, 6)],
      p2: [t(5, 5)],
      p3: [t(4, 4)],
      p4: [t(3, 3)]
    }
  });
  const nextGameHands = {
    p1: [t(1, 0), t(2, 0)],
    p2: [t(3, 3)],
    p3: [t(4, 4)],
    p4: [t(5, 5)]
  };

  const gameBreak = playTile(match, "p1", { tileId: "6:6" }, { now: 2000 });

  assert.equal(gameBreak.status, MATCH_STATUS.ACTIVE);
  assert.equal(gameBreak.currentGameNumber, 2);
  assert.equal(gameBreak.previousWinnerId, "p1");
  assert.equal(gameBreak.game, null);
  assert.equal(gameBreak.betweenGames.previousGameNumber, 1);
  assert.equal(gameBreak.betweenGames.nextGameNumber, 2);
  assert.equal(gameBreak.betweenGames.durationMs, BETWEEN_GAMES_DURATION_MS);
  assert.equal(gameBreak.betweenGames.deadlineAt, 62_000);
  assert.deepEqual(gameBreak.betweenGames.scoresBefore, {
    p1: 0,
    p2: 0,
    p3: 0,
    p4: 0
  });
  assert.deepEqual(gameBreak.betweenGames.scoresAfter, {
    p1: 5,
    p2: 1,
    p3: 2,
    p4: 3
  });

  const gameTwo = advanceFromGameBreak(gameBreak, {
    now: 63_000,
    hands: nextGameHands
  });

  assert.equal(gameTwo.currentGameNumber, 2);
  assert.equal(gameTwo.game.currentPlayerId, "p1");
  assert.equal(gameTwo.game.requiredOpeningTileId, null);

  const afterOpening = playTile(gameTwo, "p1", { tileId: "1:0" }, { now: 3000 });

  assert.equal(afterOpening.game.board.leftEnd, 1);
  assert.equal(afterOpening.game.board.rightEnd, 0);
});

test("bots are automatically ready during the between-game review", () => {
  const match = startMatch({
    players: [
      { id: "p1", name: "Host" },
      { id: "bot-001", name: "Bot-001", isBot: true },
      { id: "bot-002", name: "Bot-002", isBot: true },
      { id: "p4", name: "Player 4" }
    ],
    matchLength: 2,
    now: 1000,
    hands: {
      p1: [t(6, 6)],
      "bot-001": [t(5, 5)],
      "bot-002": [t(4, 4)],
      p4: [t(3, 3)]
    }
  });

  const gameBreak = playTile(match, "p1", { tileId: "6:6" }, { now: 2000 });

  assert.equal(gameBreak.betweenGames.startNowRequest.votesByPlayerId["bot-001"], true);
  assert.equal(gameBreak.betweenGames.startNowRequest.votesByPlayerId["bot-002"], true);
  assert.equal(gameBreak.betweenGames.startNowRequest.votesByPlayerId.p1, undefined);
  assert.equal(gameBreak.betweenGames.startNowRequest.votesByPlayerId.p4, undefined);
});

test("five-player sack rotation swaps fourth place with the lobby player", () => {
  const match = startMatch({
    players: ["p1", "p2", "p3", "p4", "p5"],
    matchLength: 5,
    now: 1000,
    hands: {
      p1: [t(6, 6)],
      p2: [t(4, 4)],
      p3: [t(5, 5)],
      p4: [t(3, 3)]
    }
  });

  assert.deepEqual(match.playerOrder, ["p1", "p2", "p3", "p4"]);
  assert.deepEqual(match.benchPlayerIds, ["p5"]);

  const gameBreak = playTile(match, "p1", { tileId: "6:6" }, { now: 2000 });

  assert.deepEqual(gameBreak.playerOrder, ["p1", "p2", "p4", "p5"]);
  assert.deepEqual(gameBreak.benchPlayerIds, ["p3"]);
  assert.deepEqual(gameBreak.betweenGames.rotation.sackedPlayerIds, ["p3"]);
  assert.deepEqual(gameBreak.betweenGames.rotation.incomingPlayerIds, ["p5"]);
});

test("six-player sack rotation swaps third and fourth place with the lobby players", () => {
  const match = startMatch({
    players: ["p1", "p2", "p3", "p4", "p5", "p6"],
    matchLength: 5,
    now: 1000,
    hands: {
      p1: [t(6, 6)],
      p2: [t(4, 4)],
      p3: [t(5, 5)],
      p4: [t(2, 2)]
    }
  });

  const gameBreak = playTile(match, "p1", { tileId: "6:6" }, { now: 2000 });

  assert.deepEqual(gameBreak.playerOrder, ["p1", "p4", "p5", "p6"]);
  assert.deepEqual(gameBreak.benchPlayerIds, ["p3", "p2"]);
  assert.deepEqual(gameBreak.betweenGames.rotation.sackedPlayerIds, ["p3", "p2"]);
});

test("seven-player sack rotation keeps only first place active and brings in three lobby players", () => {
  const match = startMatch({
    players: ["p1", "p2", "p3", "p4", "p5", "p6", "p7"],
    matchLength: 5,
    now: 1000,
    hands: {
      p1: [t(3, 3)],
      p2: [t(4, 4)],
      p3: [t(5, 5)],
      p4: [t(6, 6)]
    }
  });

  const gameBreak = playTile(match, "p4", { tileId: "6:6" }, { now: 2000 });

  assert.deepEqual(gameBreak.playerOrder, ["p4", "p5", "p6", "p7"]);
  assert.deepEqual(gameBreak.benchPlayerIds, ["p3", "p2", "p1"]);
  assert.deepEqual(gameBreak.betweenGames.rotation.sackedPlayerIds, ["p3", "p2", "p1"]);
  assert.equal(gameBreak.previousWinnerId, "p4");
});

test("manual pass is only allowed when no legal move exists", () => {
  const match = startMatch({
    players,
    matchLength: 5,
    now: 1000,
    hands: basicHands()
  });
  const passableMatch = {
    ...match,
    game: {
      ...match.game,
      board: {
        ...createEmptyBoard(),
        leftEnd: 6,
        rightEnd: 1
      },
      currentPlayerId: "p2",
      hands: {
        ...match.game.hands,
        p2: [t(4, 4)]
      }
    }
  };

  const afterPass = passTurn(passableMatch, "p2", { now: 2000 });

  assert.equal(afterPass.game.currentPlayerId, "p3");

  const illegalPassMatch = {
    ...passableMatch,
    game: {
      ...passableMatch.game,
      hands: {
        ...passableMatch.game.hands,
        p2: [t(6, 4)]
      }
    }
  };

  assert.throws(
    () => passTurn(illegalPassMatch, "p2", { now: 3000 }),
    /Cannot pass/
  );
});

test("timeout autoplay increments infractions and plays the lowest matching tile", () => {
  const match = startMatch({
    players,
    matchLength: 5,
    now: 1000,
    hands: basicHands()
  });
  const timeoutMatch = {
    ...match,
    game: {
      ...match.game,
      board: {
        ...createEmptyBoard(),
        leftEnd: 6,
        rightEnd: 1
      },
      currentPlayerId: "p1",
      turnDeadlineAt: 2000,
      hands: {
        p1: [t(6, 5), t(6, 4), t(1, 5), t(1, 0)],
        p2: [t(5, 5)],
        p3: [t(4, 4)],
        p4: [t(3, 3)]
      }
    }
  };

  const afterTimeout = handleTurnTimeout(timeoutMatch, { now: 2000 });

  assert.equal(afterTimeout.infractions.p1, 1);
  assert.equal(afterTimeout.game.board.rightEnd, 0);
  assert.deepEqual(
    afterTimeout.game.hands.p1.map((tile) => tile.id),
    ["6:5", "6:4", "5:1"]
  );
  assert.equal(afterTimeout.game.currentPlayerId, "p2");
});

test("timeout auto-pass increments infractions when no move exists", () => {
  const match = startMatch({
    players,
    matchLength: 5,
    now: 1000,
    hands: basicHands()
  });
  const timeoutMatch = {
    ...match,
    game: {
      ...match.game,
      board: {
        ...createEmptyBoard(),
        leftEnd: 6,
        rightEnd: 2
      },
      currentPlayerId: "p1",
      turnDeadlineAt: 2000,
      hands: {
        p1: [t(5, 1)],
        p2: [t(5, 5)],
        p3: [t(4, 4)],
        p4: [t(3, 3)]
      }
    }
  };

  const afterTimeout = handleTurnTimeout(timeoutMatch, { now: 2000 });

  assert.equal(afterTimeout.infractions.p1, 1);
  assert.equal(afterTimeout.game.currentPlayerId, "p2");
  assert.equal(afterTimeout.game.lastAction.type, "timeoutPass");
});

test("pause and resume preserves remaining turn time after a disconnect", () => {
  const match = startMatch({
    players,
    matchLength: 5,
    now: 1000,
    hands: basicHands()
  });

  const paused = setPlayerConnection(match, "p2", false, { now: 11_000 });

  assert.equal(paused.status, MATCH_STATUS.PAUSED);
  assert.equal(paused.pausedTimerRemainingMs, 35_000);
  assert.equal(turnRemainingMs(paused, 12_000), 34_000);

  const resumed = setPlayerConnection(paused, "p2", true, { now: 60_000 });

  assert.equal(resumed.status, MATCH_STATUS.ACTIVE);
  assert.equal(resumed.game.turnStartedAt, 60_000);
  assert.equal(resumed.game.turnDeadlineAt, 95_000);
});

test("bathroom break pauses ten-game matches once per player", () => {
  const match = startMatch({
    players,
    matchLength: 10,
    now: 1000,
    hands: basicHands()
  });

  const paused = requestBathroomBreak(match, "p2", { now: 11_000 });

  assert.equal(paused.status, MATCH_STATUS.PAUSED);
  assert.equal(paused.pauseReason, "bathroomBreak");
  assert.equal(paused.pausedByPlayerId, "p2");
  assert.equal(paused.pauseEndsAt, 11_000 + BATHROOM_BREAK_DURATION_MS);
  assert.equal(paused.pausedTimerRemainingMs, 35_000);
  assert.equal(paused.bathroomBreaksByPlayerId.p2, true);
  assert.equal(turnRemainingMs(paused, 12_000), 119_000);

  const resumed = resumeBathroomBreak(paused, { now: 131_000 });

  assert.equal(resumed.status, MATCH_STATUS.ACTIVE);
  assert.equal(resumed.game.turnStartedAt, 131_000);
  assert.equal(resumed.game.turnDeadlineAt, 166_000);
  assert.throws(
    () => requestBathroomBreak(resumed, "p2", { now: 132_000 }),
    /already used/
  );
});

test("bathroom break is unavailable in five-game matches", () => {
  const match = startMatch({
    players,
    matchLength: 5,
    now: 1000,
    hands: basicHands()
  });

  assert.throws(
    () => requestBathroomBreak(match, "p2", { now: 11_000 }),
    /only available in 10-game matches/
  );
});

test("bathroom break ending keeps the match paused when a player has exited", () => {
  const match = startMatch({
    players,
    matchLength: 10,
    now: 1000,
    hands: basicHands()
  });

  const paused = requestBathroomBreak(match, "p2", { now: 11_000 });
  const disconnected = setPlayerConnection(paused, "p3", false, { now: 12_000 });
  const stillPaused = resumeBathroomBreak(disconnected, { now: 131_000 });

  assert.equal(stillPaused.status, MATCH_STATUS.PAUSED);
  assert.equal(stillPaused.pauseReason, "disconnect");
  assert.deepEqual(stillPaused.disconnectedPlayerIds, ["p3"]);
  assert.equal(stillPaused.pausedTimerRemainingMs, 35_000);
});

test("stores trimmed in-game chat messages", () => {
  const match = startMatch({
    players,
    matchLength: 5,
    now: 1000,
    hands: basicHands()
  });

  const withChat = addChatMessage(match, {
    playerId: "p3",
    text: "  play faster nah  ",
    now: 2000
  });

  assert.equal(withChat.chatMessages.length, 1);
  assert.deepEqual(withChat.chatMessages[0], {
    id: "chat-1",
    playerId: "p3",
    text: "play faster nah",
    createdAt: 2000
  });
});

test("shows a final review after the configured fifth game before completing the match", () => {
  const match = startMatch({
    players,
    matchLength: 5,
    now: 1000,
    hands: {
      p1: [t(6, 6)],
      p2: [t(5, 5)],
      p3: [t(4, 4)],
      p4: [t(3, 3)]
    }
  });
  const fifthGame = {
    ...match,
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
      ...match.game,
      number: 5
    }
  };

  const finalReview = playTile(fifthGame, "p1", { tileId: "6:6" }, { now: 2000 });

  assert.equal(finalReview.status, MATCH_STATUS.ACTIVE);
  assert.equal(finalReview.game, null);
  assert.equal(finalReview.finalReview.durationMs, FINAL_REVIEW_DURATION_MS);
  assert.equal(finalReview.finalReview.deadlineAt, 22_000);
  assert.deepEqual(finalReview.finalReview.scoreResult.pointsByPlayerId, {
    p1: 5,
    p2: 1,
    p3: 2,
    p4: 3
  });
  assert.deepEqual(finalReview.finalScores, {
    p1: 25,
    p2: 13,
    p3: 12,
    p4: 12
  });
  assert.deepEqual(finalReview.winnerIds, ["p1"]);

  const completed = completeMatchReview(finalReview, { now: 23_000 });

  assert.equal(completed.status, MATCH_STATUS.COMPLETED);
  assert.equal(completed.finalReview, null);
  assert.equal(completed.completedAt, 23_000);
});

test("current standings include timeout penalties", () => {
  const match = startMatch({
    players,
    matchLength: 5,
    now: 1000,
    hands: basicHands()
  });
  const scored = {
    ...match,
    rawScores: {
      p1: 22,
      p2: 20,
      p3: 18,
      p4: 16
    },
    infractions: {
      p1: 4,
      p2: 1,
      p3: 2,
      p4: 0
    }
  };

  const standings = currentStandings(scored);

  assert.deepEqual(
    standings.map((standing) => [standing.playerId, standing.score]),
    [
      ["p1", 20],
      ["p2", 20],
      ["p3", 17],
      ["p4", 16]
    ]
  );
});
