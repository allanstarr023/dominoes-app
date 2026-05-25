import {
  MATCH_STATUS,
  addPlayerToMatch,
  cancelMatch,
  setPlayerConnection,
  startMatch
} from "./matchEngine.js";

export const ROOM_STATUS = Object.freeze({
  WAITING: "waiting",
  ACTIVE: "active",
  COMPLETED: "completed",
  CANCELLED: "cancelled"
});

export const MAX_BOTS_PER_ROOM = 3;
export const MAX_PLAYERS_PER_ROOM = 7;
export const ACTIVE_PLAYERS_PER_GAME = 4;
export const PLAYER_AVATAR_IDS = Object.freeze([
  "crown",
  "rocket",
  "star",
  "bolt",
  "shield",
  "gem",
  "flame",
  "moon",
  "sun",
  "anchor"
]);

export function createRoom(options) {
  const {
    id = createRoomId(),
    host,
    matchLength,
    now = Date.now()
  } = options;

  const hostPlayer = normalizePlayer(host);

  return {
    id,
    status: ROOM_STATUS.WAITING,
    hostPlayerId: hostPlayer.id,
    matchLength,
    seats: [
      {
        playerId: hostPlayer.id,
        name: hostPlayer.name,
        avatarId: hostPlayer.avatarId,
        joinedAt: now,
        connected: true
      }
    ],
    createdAt: now,
    rematchRequest: null,
    match: null
  };
}

export function roomInviteUrl(room, baseUrl) {
  return `${baseUrl.replace(/\/$/, "")}/rooms/${room.id}`;
}

export function joinRoom(room, player, options = {}) {
  const { now = Date.now() } = options;

  assertJoinableRoom(room);

  if (room.seats.length >= MAX_PLAYERS_PER_ROOM) {
    throw new Error("Room is full.");
  }

  const nextPlayer = normalizePlayer(player);

  if (room.seats.some((seat) => seat.playerId === nextPlayer.id)) {
    throw new Error(`Player ${nextPlayer.id} is already in the room.`);
  }

  const nextName = canonicalPlayerName(nextPlayer.name);

  if (room.seats.some((seat) => canonicalPlayerName(seat.name) === nextName)) {
    throw new Error(`Player name "${nextPlayer.name}" is already in use in this room.`);
  }

  if (room.seats.some((seat) => seat.avatarId === nextPlayer.avatarId)) {
    throw new Error("That player graphic is already in use in this room.");
  }

  const nextRoom = {
    ...room,
    seats: [
      ...room.seats,
      {
        playerId: nextPlayer.id,
        name: nextPlayer.name,
        avatarId: nextPlayer.avatarId,
        joinedAt: now,
        connected: true
      }
    ]
  };

  if (!room.match) {
    return nextRoom;
  }

  return {
    ...nextRoom,
    match: addPlayerToMatch(room.match, {
      id: nextPlayer.id,
      name: nextPlayer.name,
      avatarId: nextPlayer.avatarId
    }, { now })
  };
}

export function addBotToRoom(room, options = {}) {
  const { now = Date.now() } = options;

  assertBotAddableRoom(room);

  if (room.seats.length >= MAX_PLAYERS_PER_ROOM) {
    throw new Error("Room is full.");
  }

  const botCount = room.seats.filter((seat) => seat.isBot).length;

  if (botCount >= MAX_BOTS_PER_ROOM) {
    throw new Error(`A room can have at most ${MAX_BOTS_PER_ROOM} bots.`);
  }

  const bot = nextBotPlayer(room);

  return {
    ...room,
    seats: [
      ...room.seats,
      {
        playerId: bot.id,
        name: bot.name,
        avatarId: bot.avatarId,
        joinedAt: now,
        connected: true,
        isBot: true
      }
    ]
  };
}

export function startRoomMatch(room, options = {}) {
  const { now = Date.now(), rng = Math.random, hands = null, settings = {} } = options;

  assertWaitingRoom(room);

  if (room.seats.length < ACTIVE_PLAYERS_PER_GAME) {
    throw new Error("Room requires at least 4 players before starting.");
  }

  const players = room.seats.map((seat) => ({
    id: seat.playerId,
    name: seat.name,
    avatarId: seat.avatarId,
    isBot: Boolean(seat.isBot)
  }));
  const match = startMatch({
    id: room.id,
    players,
    matchLength: room.matchLength,
    now,
    rng,
    hands,
    settings
  });

  return {
    ...room,
    status: ROOM_STATUS.ACTIVE,
    startedAt: now,
    rematchRequest: null,
    match
  };
}

export function requestRoomRematch(room, playerId, options = {}) {
  const {
    now = Date.now(),
    matchLength,
    rng = Math.random,
    settings = {},
    hands = null
  } = options;

  assertSeatedPlayer(room, playerId);
  assertMatchLength(matchLength);
  const normalizedMatchLength = Number(matchLength);

  if (room.match?.status !== MATCH_STATUS.COMPLETED) {
    throw new Error("A new championship can only be requested after the match is complete.");
  }

  const rematchRequest = {
    createdAt: room.rematchRequest?.createdAt ?? now,
    votesByPlayerId: {
      ...(room.rematchRequest?.votesByPlayerId ?? {}),
      [playerId]: {
        matchLength: normalizedMatchLength,
        votedAt: now
      }
    }
  };

  for (const seat of room.seats.filter((item) => item.isBot)) {
    rematchRequest.votesByPlayerId[seat.playerId] = {
      matchLength: normalizedMatchLength,
      votedAt: now,
      automatic: true
    };
  }

  const votedPlayerIds = Object.entries(rematchRequest.votesByPlayerId)
    .filter(([, vote]) => vote.matchLength === normalizedMatchLength)
    .map(([seatPlayerId]) => seatPlayerId);

  if (votedPlayerIds.length < ACTIVE_PLAYERS_PER_GAME) {
    return {
      ...room,
      rematchRequest
    };
  }

  const nextSeats = room.seats.filter((seat) => votedPlayerIds.includes(seat.playerId));
  const players = nextSeats.map((seat) => ({
    id: seat.playerId,
    name: seat.name,
    avatarId: seat.avatarId,
    isBot: Boolean(seat.isBot)
  }));
  const match = startMatch({
    id: `${room.id}-${now}`,
    players,
    matchLength: normalizedMatchLength,
    now,
    rng,
    hands,
    settings
  });

  return {
    ...room,
    status: ROOM_STATUS.ACTIVE,
    matchLength: normalizedMatchLength,
    seats: nextSeats,
    startedAt: now,
    completedAt: null,
    rematchRequest: null,
    match
  };
}

export function disconnectRoomPlayer(room, playerId, options = {}) {
  const { now = Date.now() } = options;

  assertSeatedPlayer(room, playerId);

  const seats = room.seats.map((seat) => seat.playerId === playerId
    ? { ...seat, connected: false }
    : seat);

  if (!room.match) {
    return {
      ...room,
      seats
    };
  }

  return syncRoomWithMatch({
    ...room,
    seats,
    match: setPlayerConnection(room.match, playerId, false, { now })
  });
}

export function reconnectRoomPlayer(room, playerId, options = {}) {
  const { now = Date.now() } = options;

  assertSeatedPlayer(room, playerId);

  const seats = room.seats.map((seat) => seat.playerId === playerId
    ? { ...seat, connected: true }
    : seat);

  if (!room.match) {
    return {
      ...room,
      seats
    };
  }

  return syncRoomWithMatch({
    ...room,
    seats,
    match: setPlayerConnection(room.match, playerId, true, { now })
  });
}

export function replaceRoomMatch(room, match) {
  return syncRoomWithMatch({
    ...room,
    match
  });
}

export function cancelRoom(room, options = {}) {
  const { now = Date.now(), reason = "cancelled" } = options;

  return {
    ...room,
    status: ROOM_STATUS.CANCELLED,
    cancelledAt: now,
    cancelReason: reason,
    match: room.match
      ? cancelMatch(room.match, { now, reason })
      : null
  };
}

function syncRoomWithMatch(room) {
  if (!room.match) {
    return room;
  }

  if (room.match.status === MATCH_STATUS.COMPLETED) {
    return {
      ...room,
      status: ROOM_STATUS.COMPLETED,
      completedAt: room.match.completedAt
    };
  }

  if (room.match.status === MATCH_STATUS.CANCELLED) {
    return {
      ...room,
      status: ROOM_STATUS.CANCELLED
    };
  }

  return {
    ...room,
    status: ROOM_STATUS.ACTIVE
  };
}

function normalizePlayer(player) {
  if (typeof player === "string") {
    return {
      id: player,
      name: player,
      avatarId: defaultAvatarForId(player)
    };
  }

  if (!player?.id) {
    throw new Error("Player requires an id.");
  }

  return {
    id: player.id,
    name: player.name ?? player.id,
    avatarId: normalizeAvatarId(player.avatarId ?? defaultAvatarForId(player.id))
  };
}

function nextBotPlayer(room) {
  const usedNames = new Set(room.seats.map((seat) => canonicalPlayerName(seat.name)));
  const usedIds = new Set(room.seats.map((seat) => seat.playerId));

  for (let index = 1; index <= 999; index += 1) {
    const suffix = String(index).padStart(3, "0");
    const name = `Bot-${suffix}`;
    const id = `bot-${suffix}`;

    if (!usedNames.has(canonicalPlayerName(name)) && !usedIds.has(id)) {
      return {
        id,
        name,
        avatarId: nextAvailableAvatarId(room)
      };
    }
  }

  throw new Error("No bot names are available.");
}

function normalizeAvatarId(avatarId) {
  const normalized = String(avatarId ?? "").trim();

  if (!PLAYER_AVATAR_IDS.includes(normalized)) {
    throw new Error("Choose a valid player graphic.");
  }

  return normalized;
}

function defaultAvatarForId(id) {
  const text = String(id ?? "");
  const total = [...text].reduce((sum, char) => sum + char.charCodeAt(0), 0);

  return PLAYER_AVATAR_IDS[total % PLAYER_AVATAR_IDS.length];
}

function nextAvailableAvatarId(room) {
  const used = new Set(room.seats.map((seat) => seat.avatarId));
  const avatarId = PLAYER_AVATAR_IDS.find((candidate) => !used.has(candidate));

  if (!avatarId) {
    throw new Error("No player graphics are available.");
  }

  return avatarId;
}

function canonicalPlayerName(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase();
}

function createRoomId() {
  return Math.random().toString(36).slice(2, 10);
}

function assertWaitingRoom(room) {
  if (room.status !== ROOM_STATUS.WAITING) {
    throw new Error("Room is not waiting for players.");
  }
}

function assertBotAddableRoom(room) {
  if (room.status === ROOM_STATUS.WAITING) {
    return;
  }

  if (room.status === ROOM_STATUS.COMPLETED && room.match?.status === MATCH_STATUS.COMPLETED) {
    return;
  }

  throw new Error("Bots can only be added before a championship or during new championship voting.");
}

function assertJoinableRoom(room) {
  if (![ROOM_STATUS.WAITING, ROOM_STATUS.ACTIVE].includes(room.status)) {
    throw new Error("Room is not open for players.");
  }
}

function assertMatchLength(matchLength) {
  if (![2, 5, 10].includes(Number(matchLength))) {
    throw new Error("Match length must be 2, 5, or 10 games.");
  }
}

function assertSeatedPlayer(room, playerId) {
  if (!room.seats.some((seat) => seat.playerId === playerId)) {
    throw new Error(`Player ${playerId} is not seated in this room.`);
  }
}
