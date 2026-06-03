import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import {
  addChatMessage,
  advanceFromGameBreak,
  blockPlayerChat,
  completeMatchReview,
  deleteChatMessage,
  handleTurnTimeout,
  MATCH_STATUS,
  passTurn,
  playTile,
  releaseAnimationLock,
  requestBathroomBreak,
  resumeBathroomBreak,
  setPlayerReaction,
  slamTile,
  useTakeDat,
  useSeedToBoard
} from "./matchEngine.js";
import {
  addBotToRoom,
  cancelRoom,
  disconnectRoomPlayer,
  joinRoom,
  moveWaitingRoomPlayer,
  reconnectRoomPlayer,
  removeRoomPlayer,
  removeWaitingRoomPlayer,
  replaceRoomMatch,
  requestRoomRematch,
  ROOM_STATUS,
  roomInviteUrl,
  startRoomMatch,
  createRoom
} from "./roomEngine.js";
import {
  BOT_TURN_DELAY_MS,
  chooseBotTurn,
  isBotPlayer
} from "./botEngine.js";
import {
  DEFAULT_CHAT_BLOCK_MINUTES,
  chatBlockMinutes,
  containsLink,
  containsOffensiveLanguage
} from "./chatModeration.js";
import { createStatsStore } from "./statsStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");
const WAITING_ROOM_TIMEOUT_MS = 10 * 60_000;
const WAITING_ROOM_TIMEOUT_REASON = "waitingRoomInactivity";
const WAITING_ROOM_TIMEOUT_MESSAGE = "Championship cancelled due to inactivity. Please ensure all 4 players are ready before starting a new championship.";

export function createAppServer(options = {}) {
  const rooms = new Map();
  const timers = new Map();
  const portalTimers = new Set();
  const sseClients = new Map();
  const adminSessions = new Map();
  const rng = options.rng ?? Math.random;
  const waitingRoomTimeoutMs = options.waitingRoomTimeoutMs ?? WAITING_ROOM_TIMEOUT_MS;
  const statsStore = options.statsStore ?? createStatsStore({
    filePath: options.statsFilePath ?? join(__dirname, "..", "data", "app-state.json"),
    adminPassword: options.adminPassword
  });

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

      if (requestUrl.pathname.startsWith("/api/")) {
        await handleApiRequest({
          request,
          response,
          requestUrl,
          rooms,
          timers,
          portalTimers,
          sseClients,
          adminSessions,
          statsStore,
          rng,
          waitingRoomTimeoutMs
        });
        return;
      }

      await serveStaticFile(requestUrl.pathname, response);
    } catch (error) {
      sendError(response, error.statusCode ?? 500, error.message);
    }
  });

  server.rooms = rooms;
  server.closeApp = () => {
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }

    for (const timer of portalTimers.values()) {
      clearTimeout(timer);
    }

    for (const clients of sseClients.values()) {
      for (const client of clients) {
        client.response.end();
      }
    }
  };
  server.on("close", server.closeApp);

  return server;
}

async function handleApiRequest(context) {
  const { request, response, requestUrl } = context;
  const parts = requestUrl.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && requestUrl.pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/rooms") {
    await createRoomHandler(context);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/stats") {
    const stats = await context.statsStore.getSnapshot();
    sendJson(response, 200, stats);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/portal-status") {
    await portalStatusHandler(context);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/settings") {
    const settings = await context.statsStore.getSettings();
    sendJson(response, 200, { settings });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/login") {
    await adminLoginHandler(context);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/admin/portal") {
    await adminPortalHandler(context);
    return;
  }

  if (request.method === "PUT" && requestUrl.pathname === "/api/admin/portal-settings") {
    await updatePortalSettingsHandler(context);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/reports/action") {
    await adminReportActionHandler(context);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/player-action") {
    await adminPlayerActionHandler(context);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/shutdowns") {
    await adminShutdownHandler(context);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/broadcasts") {
    await adminBroadcastHandler(context);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/users") {
    await adminUserCreateHandler(context);
    return;
  }

  if (request.method === "PUT" && requestUrl.pathname === "/api/admin/users/status") {
    await adminUserStatusHandler(context);
    return;
  }

  if (request.method === "PUT" && requestUrl.pathname === "/api/settings") {
    await updateSettingsHandler(context);
    return;
  }

  if (parts[0] !== "api" || parts[1] !== "rooms" || !parts[2]) {
    sendError(response, 404, "API route not found.");
    return;
  }

  const roomId = parts[2];
  const action = parts[3] ?? null;

  if (request.method === "GET" && action === null) {
    const room = requireRoom(context.rooms, roomId);
    sendJson(response, 200, {
      room: serializeRoom(room, requestUrl.searchParams.get("playerId"))
    });
    return;
  }

  if (request.method === "GET" && action === "events") {
    subscribeToRoomEvents(context, roomId, requestUrl.searchParams.get("playerId"));
    return;
  }

  if (request.method !== "POST") {
    sendError(response, 405, "Method not allowed.");
    return;
  }

  if (action === "join") {
    await joinRoomHandler(context, roomId);
    return;
  }

  if (action === "add-bot") {
    await addBotHandler(context, roomId);
    return;
  }

  if (action === "remove-player") {
    await removeWaitingPlayerHandler(context, roomId);
    return;
  }

  if (action === "move-player") {
    await moveWaitingPlayerHandler(context, roomId);
    return;
  }

  if (action === "start") {
    await startRoomHandler(context, roomId);
    return;
  }

  if (action === "play") {
    await playTileHandler(context, roomId);
    return;
  }

  if (action === "slam") {
    await slamTileHandler(context, roomId);
    return;
  }

  if (action === "take-dat") {
    await takeDatHandler(context, roomId);
    return;
  }

  if (action === "reaction") {
    await reactionHandler(context, roomId);
    return;
  }

  if (action === "seed-to-board") {
    await seedToBoardHandler(context, roomId);
    return;
  }

  if (action === "pass") {
    await passTurnHandler(context, roomId);
    return;
  }

  if (action === "chat") {
    await chatHandler(context, roomId);
    return;
  }

  if (action === "report-player") {
    await reportPlayerHandler(context, roomId);
    return;
  }

  if (action === "delete-chat-message") {
    await deleteChatMessageHandler(context, roomId);
    return;
  }

  if (action === "block-chat-player") {
    await blockChatPlayerHandler(context, roomId);
    return;
  }

  if (action === "bathroom-break") {
    await bathroomBreakHandler(context, roomId);
    return;
  }

  if (action === "resume-break") {
    await resumeBathroomBreakHandler(context, roomId);
    return;
  }

  if (action === "disconnect") {
    await connectionHandler(context, roomId, false);
    return;
  }

  if (action === "reconnect") {
    await connectionHandler(context, roomId, true);
    return;
  }

  if (action === "end-session") {
    await endSessionHandler(context, roomId);
    return;
  }

  if (action === "new-match") {
    await newMatchHandler(context, roomId);
    return;
  }

  if (action === "start-now-request") {
    await startNowRequestHandler(context, roomId);
    return;
  }

  if (action === "start-now-vote") {
    await startNowVoteHandler(context, roomId);
    return;
  }

  sendError(response, 404, "Room action not found.");
}

async function createRoomHandler(context) {
  const { request, response, requestUrl, rooms } = context;
  const body = await readJsonBody(request);
  const portalBlock = await newChampionshipBlockReason(context, { creatingRoom: true });

  if (portalBlock) {
    sendError(response, 403, portalBlock);
    return;
  }

  const hostId = body.hostId ?? createId("player");
  const room = createRoom({
    id: body.roomId ?? createId("room"),
    host: {
      id: hostId,
      name: body.hostName ?? "Host",
      avatarId: body.avatarId
    },
    matchLength: body.matchLength ?? 5,
    now: Date.now()
  });

  rooms.set(room.id, room);
  scheduleRoomTimer(context, room);
  sendJson(response, 201, {
    playerId: hostId,
    inviteUrl: roomInviteUrl(room, requestOrigin(requestUrl)),
    room: serializeRoom(room, hostId)
  });
}

async function adminLoginHandler(context) {
  const { request, response, adminSessions, statsStore, rooms } = context;
  const body = await readJsonBody(request);

  if (!body.roomId) {
    const adminUser = await statsStore.authenticatePortalAdmin({
      email: body.email,
      password: body.password
    });

    if (!adminUser) {
      sendError(response, 401, "Invalid admin password.");
      return;
    }

    const token = createId("admin");
    const adminName = [adminUser.firstName, adminUser.lastName].filter(Boolean).join(" ") || adminUser.email;
    adminSessions.set(token, {
      scope: "portal",
      adminUserId: adminUser.id,
      role: adminUser.role,
      email: adminUser.email,
      adminName,
      createdAt: Date.now()
    });
    await statsStore.recordAdminAction({
      type: "adminLogin",
      adminTokenId: token,
      adminUserId: adminUser.id,
      adminName,
      adminEmail: adminUser.email,
      adminRole: adminUser.role,
      targetName: adminName,
      summary: `${adminUser.role} admin logged in`,
      at: Date.now()
    });
    sendJson(response, 200, { token, scope: "portal", adminUser });
    return;
  }

  const room = requireRoom(rooms, body.roomId);

  if (!canEditSettingsForRoom(room)) {
    sendError(response, 403, "Championship rules can only be edited by the host before Start Match.");
    return;
  }

  if (body.playerId !== room.hostPlayerId) {
    sendError(response, 403, "Only the host who started the game can access settings.");
    return;
  }

  if (!statsStore.verifyAdminPassword(body.password)) {
    sendError(response, 401, "Invalid admin password.");
    return;
  }

  const token = createId("admin");
  const hostName = room.seats.find((seat) => seat.playerId === body.playerId)?.name ?? body.playerId;
  adminSessions.set(token, {
    scope: "settings",
    roomId: room.id,
    playerId: body.playerId,
    adminName: hostName,
    adminRole: "host",
    createdAt: Date.now()
  });
  sendJson(response, 200, { token, scope: "settings" });
}

async function updateSettingsHandler(context) {
  const { request, response, adminSessions, statsStore, rooms } = context;
  const token = authorizationToken(request);
  const session = token ? adminSessions.get(token) : null;

  if (!token || !session) {
    sendError(response, 401, "Championship rules login required.");
    return;
  }

  const room = rooms.get(session.roomId);

  if (!room || room.hostPlayerId !== session.playerId) {
    sendError(response, 403, "Championship rules session is no longer valid for this host.");
    return;
  }

  if (!canEditSettingsForRoom(room)) {
    sendError(response, 403, "Championship rules are locked once Start Match is clicked.");
    return;
  }

  const body = await readJsonBody(request);
  const settings = await statsStore.updateSettings(body.settings ?? body, {
    ...adminAuditFields(session),
    roomId: room.id,
    now: Date.now()
  });

  sendJson(response, 200, { settings });
}

async function portalStatusHandler(context) {
  const { response, statsStore, rooms } = context;
  const snapshot = await statsStore.getPortalSnapshot(Date.now());
  const latestBroadcast = snapshot.broadcasts.find((broadcast) => Number(broadcast.expiresAt ?? 0) > Date.now()) ?? null;
  const liveRooms = [...rooms.values()].filter(isLiveAdminRoom);

  sendJson(response, 200, {
    activeShutdown: snapshot.activeShutdown,
    latestBroadcast,
    portalSettings: snapshot.portalSettings,
    openChampionships: openRoomCount(rooms),
    capacity: portalCapacitySnapshot(rooms, snapshot.portalSettings),
    viewableChampionships: liveRooms
      .filter((room) => room.status === ROOM_STATUS.ACTIVE)
      .map(serializePublicRoom)
  });
}

async function adminPortalHandler(context) {
  const { response, rooms, statsStore } = context;
  const session = requirePortalAdmin(context);
  const snapshot = await statsStore.getPortalSnapshot(Date.now());
  const liveRooms = [...rooms.values()].filter(isLiveAdminRoom);

  sendJson(response, 200, {
    ...snapshot,
    session: {
      scope: session.scope,
      role: session.role,
      adminUserId: session.adminUserId,
      email: session.email,
      createdAt: session.createdAt
    },
    capacity: portalCapacitySnapshot(rooms, snapshot.portalSettings),
    metrics: {
      activeChampionships: liveRooms.filter((room) => room.status === "active").length,
      waitingChampionships: liveRooms.filter((room) => room.status === "waiting").length,
      connectedPlayers: liveRooms.reduce((sum, room) => sum + connectedHumanSeats(room).length, 0),
      bots: liveRooms.reduce((sum, room) => sum + room.seats.filter((seat) => seat.isBot).length, 0)
    },
    rooms: liveRooms.map(serializeAdminRoom)
  });
}

async function updatePortalSettingsHandler(context) {
  const { request, response, statsStore } = context;
  const session = requirePortalAdmin(context, ["owner", "manager"]);
  const body = await readJsonBody(request);
  const portalSettings = await statsStore.updatePortalSettings(body.portalSettings ?? body, {
    ...adminAuditFields(session),
    now: Date.now()
  });

  sendJson(response, 200, { portalSettings });
}

async function adminReportActionHandler(context) {
  const { request, response, statsStore } = context;
  const session = requirePortalAdmin(context, ["owner", "manager", "moderator"]);
  const body = await readJsonBody(request);
  const report = await statsStore.resolveModerationReport(String(body.reportId ?? ""), {
    status: body.status ?? "reviewed",
    resolution: body.resolution ?? body.status ?? "reviewed",
    ...adminAuditFields(session),
    now: Date.now()
  });

  sendJson(response, 200, { report });
}

async function adminPlayerActionHandler(context) {
  const { request, response, rooms, statsStore, sseClients, timers } = context;
  const session = requirePortalAdmin(context, ["owner", "manager", "moderator"]);
  const body = await readJsonBody(request);
  const room = requireRoom(rooms, body.roomId);
  const targetSeat = room.seats.find((seat) => seat.playerId === body.targetPlayerId);

  if (!targetSeat) {
    sendError(response, 404, "Player is not in this championship.");
    return;
  }

  const action = String(body.action ?? "");
  let nextRoom = room;
  let summary = "";

  if (action === "warn") {
    summary = `Warned ${targetSeat.name}: ${String(body.reason ?? "moderation warning").slice(0, 140)}`;
  } else if (action === "mute") {
    if (!room.match) {
      sendError(response, 400, "Player can only be muted after chat starts.");
      return;
    }

    const match = blockPlayerChat(room.match, body.targetPlayerId, {
      now: Date.now(),
      minutes: chatBlockMinutes(body.minutes ?? DEFAULT_CHAT_BLOCK_MINUTES)
    });
    nextRoom = replaceRoomMatch(room, match);
    summary = `Muted ${targetSeat.name} for ${chatBlockMinutes(body.minutes ?? DEFAULT_CHAT_BLOCK_MINUTES)} minutes`;
  } else if (action === "remove") {
    nextRoom = removeRoomPlayer(room, body.targetPlayerId, {
      now: Date.now(),
      reason: "adminRemovedPlayer"
    });
    summary = nextRoom.status === "cancelled"
      ? `Removed active player ${targetSeat.name}; championship cancelled`
      : `Removed lobby player ${targetSeat.name}`;
  } else {
    sendError(response, 400, "Choose a valid admin action.");
    return;
  }

  if (nextRoom.status === "cancelled") {
    if (timers.has(room.id)) {
      clearTimeout(timers.get(room.id));
      timers.delete(room.id);
    }

    rooms.delete(room.id);
  } else {
    rooms.set(room.id, nextRoom);
    scheduleRoomTimer(context, nextRoom);
  }

  broadcastRoom(context, nextRoom);
  if (nextRoom.status === "cancelled") {
    closeRoomEventStreams(sseClients, room.id);
  }

  await statsStore.recordAdminAction({
    type: `player${capitalize(action)}`,
    ...adminAuditFields(session),
    roomId: room.id,
    targetPlayerId: body.targetPlayerId,
    targetName: targetSeat.name,
    summary,
    at: Date.now()
  });

  if (body.reportId) {
    await statsStore.resolveModerationReport(String(body.reportId), {
      status: "actioned",
      resolution: action,
      ...adminAuditFields(session),
      now: Date.now()
    }).catch(() => null);
  }

  sendJson(response, 200, {
    room: serializeRoom(nextRoom, null),
    summary
  });
}

async function adminShutdownHandler(context) {
  const { request, response, statsStore } = context;
  const session = requirePortalAdmin(context, ["owner", "manager"]);
  const body = await readJsonBody(request);
  const shutdown = await statsStore.createShutdownWindow({
    mode: body.mode,
    message: body.message,
    startAt: Number(body.startAt),
    endAt: Number(body.endAt),
    ...adminAuditFields(session),
    now: Date.now()
  });

  schedulePortalShutdown(context, shutdown);

  if (shutdown.startAt <= Date.now() && shutdown.endAt > Date.now()) {
    await applyShutdownWindow(context, shutdown);
  }

  sendJson(response, 200, { shutdown });
}

async function adminBroadcastHandler(context) {
  const { request, response, statsStore } = context;
  const session = requirePortalAdmin(context, ["owner", "manager"]);
  const body = await readJsonBody(request);
  const broadcast = await statsStore.createBroadcast({
    audience: body.audience,
    message: body.message,
    expiresAt: body.expiresAt ?? Date.now() + 60_000,
    ...adminAuditFields(session),
    now: Date.now()
  });

  broadcastAllRooms(context, "broadcast", broadcast);
  sendJson(response, 200, { broadcast });
}

async function adminUserCreateHandler(context) {
  const { request, response, statsStore } = context;
  const session = requirePortalAdmin(context, ["owner", "manager"]);
  const body = await readJsonBody(request);
  const adminUser = await statsStore.createAdminUser(body.adminUser ?? body, {
    ...adminAuditFields(session),
    now: Date.now()
  });

  sendJson(response, 201, { adminUser });
}

async function adminUserStatusHandler(context) {
  const { request, response, statsStore } = context;
  const session = requirePortalAdmin(context, ["owner", "manager"]);
  const body = await readJsonBody(request);
  const adminUser = await statsStore.updateAdminUserStatus(String(body.adminUserId ?? ""), body.status, {
    ...adminAuditFields(session),
    now: Date.now()
  });

  sendJson(response, 200, { adminUser });
}

async function joinRoomHandler(context, roomId) {
  const { request, response, rooms } = context;
  const body = await readJsonBody(request);
  const playerId = body.playerId ?? createId("player");
  const currentRoom = requireRoom(rooms, roomId);
  const requestedName = String(body.name ?? "Player").trim();

  if (currentRoom.seats.some((seat) => canonicalPlayerName(seat.name) === canonicalPlayerName(requestedName))) {
    sendError(response, 409, `Player name "${requestedName}" is already in use in this room.`);
    return;
  }

  let room;

  try {
    room = joinRoom(currentRoom, {
      id: playerId,
      name: body.name ?? "Player",
      avatarId: body.avatarId
    });
  } catch (error) {
    sendError(response, 400, error.message);
    return;
  }

  rooms.set(roomId, room);
  scheduleRoomTimer(context, room);
  broadcastRoom(context, room);
  sendJson(response, 200, {
    playerId,
    room: serializeRoom(room, playerId)
  });
}

async function addBotHandler(context, roomId) {
  const { request, response, rooms, rng, statsStore } = context;
  const body = await readJsonBody(request);
  const room = requireRoom(rooms, roomId);

  if (body.playerId !== room.hostPlayerId) {
    sendError(response, 403, "Only the host can add bots.");
    return;
  }

  let nextRoom = addBotToRoom(room, {
    now: Date.now()
  });

  if (nextRoom.status === "completed" && nextRoom.rematchRequest) {
    const botSeat = nextRoom.seats.at(-1);
    const requestedLength = Number(body.matchLength)
      || Object.values(nextRoom.rematchRequest.votesByPlayerId ?? {})[0]?.matchLength
      || nextRoom.matchLength;

    nextRoom = requestRoomRematch(nextRoom, botSeat.playerId, {
      now: Date.now(),
      matchLength: requestedLength,
      rng,
      settings: await statsStore.getSettings()
    });
  }

  rooms.set(roomId, nextRoom);
  scheduleRoomTimer(context, nextRoom);
  broadcastRoom(context, nextRoom);
  sendJson(response, 200, {
    room: serializeRoom(nextRoom, body.playerId)
  });
}

async function removeWaitingPlayerHandler(context, roomId) {
  const { request, response, rooms } = context;
  const body = await readJsonBody(request);
  const room = requireRoom(rooms, roomId);

  if (body.playerId !== room.hostPlayerId) {
    sendError(response, 403, "Only the host can remove players before Start Match.");
    return;
  }

  let nextRoom;

  try {
    nextRoom = removeWaitingRoomPlayer(room, body.targetPlayerId);
  } catch (error) {
    sendError(response, 400, error.message);
    return;
  }

  rooms.set(roomId, nextRoom);
  scheduleRoomTimer(context, nextRoom);
  broadcastRoom(context, nextRoom);
  sendJson(response, 200, {
    room: serializeRoom(nextRoom, body.playerId)
  });
}

async function moveWaitingPlayerHandler(context, roomId) {
  const { request, response, rooms } = context;
  const body = await readJsonBody(request);
  const room = requireRoom(rooms, roomId);

  if (body.playerId !== room.hostPlayerId) {
    sendError(response, 403, "Only the host can reorder players before Start Match.");
    return;
  }

  let nextRoom;

  try {
    nextRoom = moveWaitingRoomPlayer(room, body.targetPlayerId, body.direction);
  } catch (error) {
    sendError(response, 400, error.message);
    return;
  }

  rooms.set(roomId, nextRoom);
  scheduleRoomTimer(context, nextRoom);
  broadcastRoom(context, nextRoom);
  sendJson(response, 200, {
    room: serializeRoom(nextRoom, body.playerId)
  });
}

async function startRoomHandler(context, roomId) {
  const { request, response, rooms, rng, statsStore } = context;
  const body = await readJsonBody(request);
  const room = requireRoom(rooms, roomId);

  if (body.playerId !== room.hostPlayerId) {
    sendError(response, 403, "Only the host can start the match.");
    return;
  }

  const portalBlock = await newChampionshipBlockReason(context);

  if (portalBlock) {
    sendError(response, 403, portalBlock);
    return;
  }

  const startedRoom = startRoomMatch(room, {
    now: Date.now(),
    rng,
    settings: await statsStore.getSettings()
  });

  rooms.set(roomId, startedRoom);
  scheduleRoomTimer(context, startedRoom);
  broadcastRoom(context, startedRoom);
  sendJson(response, 200, {
    room: serializeRoom(startedRoom, body.playerId)
  });
}

async function playTileHandler(context, roomId) {
  const { request, response, rooms, rng } = context;
  const body = await readJsonBody(request);
  const room = requireRoom(rooms, roomId);
  const match = playTile(room.match, body.playerId, {
    tileId: body.tileId,
    end: body.end
  }, {
    now: Date.now(),
    rng
  });
  const nextRoom = replaceRoomMatch(room, match);

  rooms.set(roomId, nextRoom);
  scheduleRoomTimer(context, nextRoom);
  broadcastRoom(context, nextRoom);
  sendJson(response, 200, {
    room: serializeRoom(nextRoom, body.playerId)
  });
}

async function slamTileHandler(context, roomId) {
  const { request, response, rooms, rng } = context;
  const body = await readJsonBody(request);
  const room = requireRoom(rooms, roomId);
  const match = slamTile(room.match, body.playerId, {
    tileId: body.tileId,
    end: body.end
  }, {
    now: Date.now(),
    rng
  });
  const nextRoom = replaceRoomMatch(room, match);

  rooms.set(roomId, nextRoom);
  scheduleRoomTimer(context, nextRoom);
  broadcastRoom(context, nextRoom);
  sendJson(response, 200, {
    room: serializeRoom(nextRoom, body.playerId)
  });
}

async function takeDatHandler(context, roomId) {
  const { request, response, rooms } = context;
  const body = await readJsonBody(request);
  const room = requireRoom(rooms, roomId);
  const match = useTakeDat(room.match, body.playerId, {
    now: Date.now()
  });
  const nextRoom = replaceRoomMatch(room, match);

  rooms.set(roomId, nextRoom);
  broadcastRoom(context, nextRoom);
  sendJson(response, 200, {
    room: serializeRoom(nextRoom, body.playerId)
  });
}

async function reactionHandler(context, roomId) {
  const { request, response, rooms } = context;
  const body = await readJsonBody(request);
  const room = requireRoom(rooms, roomId);

  if (!room.seats.some((seat) => seat.playerId === body.playerId)) {
    sendError(response, 403, "Only joined championship players can send reactions.");
    return;
  }

  const match = setPlayerReaction(room.match, body.playerId, body.type, {
    now: Date.now()
  });
  const nextRoom = replaceRoomMatch(room, match);

  rooms.set(roomId, nextRoom);
  broadcastRoom(context, nextRoom);
  sendJson(response, 200, {
    room: serializeRoom(nextRoom, body.playerId)
  });
}

async function seedToBoardHandler(context, roomId) {
  const { request, response, rooms } = context;
  const body = await readJsonBody(request);
  const room = requireRoom(rooms, roomId);

  if (!room.match || room.match.status !== MATCH_STATUS.ACTIVE || !room.match.game) {
    sendError(response, 400, "Seed to board is only available during an active round.");
    return;
  }

  if (!room.match.playerOrder.includes(body.playerId)) {
    sendError(response, 403, "Only active players can start the next game early.");
    return;
  }

  if (room.match.game.currentPlayerId !== body.playerId) {
    sendError(response, 403, "Seed to Board is only available on your turn.");
    return;
  }

  if (room.match.game.seedToBoardUsedByPlayerId?.[body.playerId]) {
    sendError(response, 400, "This player has already used Seed to Board in this round.");
    return;
  }

  const match = useSeedToBoard(room.match, body.playerId, {
    now: Date.now()
  });
  const nextRoom = replaceRoomMatch(room, match);

  rooms.set(roomId, nextRoom);
  broadcastRoom(context, nextRoom);
  sendJson(response, 200, {
    room: serializeRoom(nextRoom, body.playerId)
  });
}

async function passTurnHandler(context, roomId) {
  const { request, response, rooms } = context;
  const body = await readJsonBody(request);
  const room = requireRoom(rooms, roomId);
  const match = passTurn(room.match, body.playerId, {
    now: Date.now()
  });
  const nextRoom = replaceRoomMatch(room, match);

  rooms.set(roomId, nextRoom);
  scheduleRoomTimer(context, nextRoom);
  broadcastRoom(context, nextRoom);
  sendJson(response, 200, {
    room: serializeRoom(nextRoom, body.playerId)
  });
}

async function chatHandler(context, roomId) {
  const { request, response, rooms, statsStore } = context;
  const body = await readJsonBody(request);
  const room = requireRoom(rooms, roomId);
  const now = Date.now();
  const seat = room.seats.find((item) => item.playerId === body.playerId);

  if (!seat) {
    sendError(response, 403, "Player is not in this championship.");
    return;
  }

  if (!room.match) {
    sendError(response, 400, "Chat is available after the match starts.");
    return;
  }

  if (Number(room.match.chatMutedUntilByPlayerId?.[body.playerId] ?? 0) > now) {
    sendError(response, 403, "This player is temporarily blocked from chat.");
    return;
  }

  if (containsLink(body.text)) {
    await statsStore.createModerationReport({
      source: "system",
      roomId,
      roomStatus: room.status,
      targetPlayerId: body.playerId,
      targetName: seat.name,
      messageText: body.text,
      reason: "Blocked link in chat",
      now
    });
    sendError(response, 400, "Links are not allowed in chat.");
    return;
  }

  if (containsOffensiveLanguage(body.text)) {
    await statsStore.createModerationReport({
      source: "system",
      roomId,
      roomStatus: room.status,
      targetPlayerId: body.playerId,
      targetName: seat.name,
      messageText: body.text,
      reason: "Blocked obscene language in chat",
      now
    });
    sendError(response, 400, "Message contains blocked language.");
    return;
  }

  const match = addChatMessage(room.match, {
    playerId: body.playerId,
    text: body.text,
    now
  });
  const nextRoom = replaceRoomMatch(room, match);

  rooms.set(roomId, nextRoom);
  broadcastRoom(context, nextRoom);
  sendJson(response, 200, {
    room: serializeRoom(nextRoom, body.playerId)
  });
}

async function reportPlayerHandler(context, roomId) {
  const { request, response, rooms, statsStore } = context;
  const body = await readJsonBody(request);
  const room = requireRoom(rooms, roomId);
  const reporter = room.seats.find((seat) => seat.playerId === body.playerId);
  const target = room.seats.find((seat) => seat.playerId === body.targetPlayerId);

  if (!reporter) {
    sendError(response, 403, "Only seated players can submit a report.");
    return;
  }

  if (!target) {
    sendError(response, 404, "Reported player is not in this championship.");
    return;
  }

  const message = room.match?.chatMessages?.find((item) => item.id === body.messageId) ?? null;
  const report = await statsStore.createModerationReport({
    source: "peer",
    roomId,
    roomStatus: room.status,
    reporterPlayerId: reporter.playerId,
    reporterName: reporter.name,
    targetPlayerId: target.playerId,
    targetName: target.name,
    messageId: message?.id ?? body.messageId ?? null,
    messageText: message?.text ?? body.messageText ?? "",
    reason: body.reason ?? "Peer report",
    now: Date.now()
  });

  sendJson(response, 200, { report });
}

async function deleteChatMessageHandler(context, roomId) {
  const { request, response, rooms } = context;
  const body = await readJsonBody(request);
  const room = requireRoom(rooms, roomId);

  if (body.playerId !== room.hostPlayerId) {
    sendError(response, 403, "Only the host can delete chat messages.");
    return;
  }

  if (!room.match) {
    sendError(response, 400, "Chat is available after the match starts.");
    return;
  }

  const match = deleteChatMessage(room.match, body.messageId);
  const nextRoom = replaceRoomMatch(room, match);

  rooms.set(roomId, nextRoom);
  broadcastRoom(context, nextRoom);
  sendJson(response, 200, {
    room: serializeRoom(nextRoom, body.playerId)
  });
}

async function blockChatPlayerHandler(context, roomId) {
  const { request, response, rooms } = context;
  const body = await readJsonBody(request);
  const room = requireRoom(rooms, roomId);

  if (body.playerId !== room.hostPlayerId) {
    sendError(response, 403, "Only the host can block players from chat.");
    return;
  }

  if (!room.match) {
    sendError(response, 400, "Chat is available after the match starts.");
    return;
  }

  const match = blockPlayerChat(room.match, body.targetPlayerId, {
    now: Date.now(),
    minutes: chatBlockMinutes(body.minutes ?? DEFAULT_CHAT_BLOCK_MINUTES)
  });
  const nextRoom = replaceRoomMatch(room, match);

  rooms.set(roomId, nextRoom);
  broadcastRoom(context, nextRoom);
  sendJson(response, 200, {
    room: serializeRoom(nextRoom, body.playerId)
  });
}

async function bathroomBreakHandler(context, roomId) {
  const { request, response, rooms } = context;
  const body = await readJsonBody(request);
  const room = requireRoom(rooms, roomId);

  if (!room.match) {
    sendError(response, 400, "Match has not started.");
    return;
  }

  if (!room.match.playerOrder.includes(body.playerId)) {
    sendError(response, 403, "Only active players can request a bathroom break.");
    return;
  }

  const match = requestBathroomBreak(room.match, body.playerId, {
    now: Date.now()
  });
  const nextRoom = replaceRoomMatch(room, match);

  rooms.set(roomId, nextRoom);
  scheduleRoomTimer(context, nextRoom);
  broadcastRoom(context, nextRoom);
  sendJson(response, 200, {
    room: serializeRoom(nextRoom, body.playerId)
  });
}

async function resumeBathroomBreakHandler(context, roomId) {
  const { request, response, rooms } = context;
  const body = await readJsonBody(request);
  const room = requireRoom(rooms, roomId);

  if (!room.match) {
    sendError(response, 400, "Match has not started.");
    return;
  }

  if (room.match.pauseReason !== "bathroomBreak") {
    sendError(response, 400, "Match is not paused for a bathroom break.");
    return;
  }

  if (body.playerId !== room.match.pausedByPlayerId) {
    sendError(response, 403, "Only the player who started the bathroom break can resume it.");
    return;
  }

  const match = resumeBathroomBreak(room.match, {
    now: Date.now()
  });
  const nextRoom = replaceRoomMatch(room, match);

  rooms.set(roomId, nextRoom);
  scheduleRoomTimer(context, nextRoom);
  broadcastRoom(context, nextRoom);
  sendJson(response, 200, {
    room: serializeRoom(nextRoom, body.playerId)
  });
}

async function connectionHandler(context, roomId, connected) {
  const { request, response, rooms } = context;
  const body = await readJsonBody(request);
  const room = requireRoom(rooms, roomId);
  const nextRoom = connected
    ? reconnectRoomPlayer(room, body.playerId, { now: Date.now() })
    : disconnectRoomPlayer(room, body.playerId, { now: Date.now() });

  rooms.set(roomId, nextRoom);
  scheduleRoomTimer(context, nextRoom);
  broadcastRoom(context, nextRoom);
  sendJson(response, 200, {
    room: serializeRoom(nextRoom, body.playerId)
  });
}

async function endSessionHandler(context, roomId) {
  const { request, response, rooms, timers, sseClients } = context;
  const body = await readJsonBody(request);
  const room = requireRoom(rooms, roomId);

  if (body.playerId !== room.hostPlayerId) {
    sendError(response, 403, "Only the host can end the session.");
    return;
  }

  if (timers.has(roomId)) {
    clearTimeout(timers.get(roomId));
    timers.delete(roomId);
  }

  const cancelledRoom = cancelRoom(room, {
    now: Date.now(),
    reason: "hostEndedSession"
  });

  rooms.set(roomId, cancelledRoom);
  broadcastRoom(context, cancelledRoom);
  closeRoomEventStreams(sseClients, roomId);
  rooms.delete(roomId);
  sendJson(response, 200, {
    room: serializeRoom(cancelledRoom, body.playerId)
  });
}

async function newMatchHandler(context, roomId) {
  const { request, response, rooms, rng, statsStore } = context;
  const body = await readJsonBody(request);
  const room = requireRoom(rooms, roomId);
  const portalBlock = await newChampionshipBlockReason(context, { creatingRoom: true });

  if (portalBlock) {
    sendError(response, 403, portalBlock);
    return;
  }

  const nextRoom = requestRoomRematch(room, body.playerId, {
    now: Date.now(),
    matchLength: Number(body.matchLength),
    rng,
    settings: await statsStore.getSettings()
  });

  rooms.set(roomId, nextRoom);
  scheduleRoomTimer(context, nextRoom);
  broadcastRoom(context, nextRoom);
  sendJson(response, 200, {
    room: serializeRoom(nextRoom, body.playerId)
  });
}

async function startNowRequestHandler(context, roomId) {
  const { request, response, rooms, rng } = context;
  const body = await readJsonBody(request);
  const room = requireRoom(rooms, roomId);

  if (!room.match || room.match.status !== MATCH_STATUS.ACTIVE || !room.match.betweenGames) {
    sendError(response, 400, "Start now vote is only available between games.");
    return;
  }

  if (!room.match.playerOrder.includes(body.playerId)) {
    sendError(response, 403, "Only active players can vote to start the next game early.");
    return;
  }

  const match = requestStartNow(room.match, body.playerId, {
    now: Date.now(),
    rng
  });
  const nextRoom = replaceRoomMatch(room, match);

  rooms.set(roomId, nextRoom);
  scheduleRoomTimer(context, nextRoom);
  broadcastRoom(context, nextRoom);
  sendJson(response, 200, {
    room: serializeRoom(nextRoom, body.playerId)
  });
}

async function startNowVoteHandler(context, roomId) {
  const { request, response, rooms, rng } = context;
  const body = await readJsonBody(request);
  const room = requireRoom(rooms, roomId);

  if (!room.match || room.match.status !== MATCH_STATUS.ACTIVE || !room.match.betweenGames) {
    sendError(response, 400, "Start now vote is only available between games.");
    return;
  }

  if (!room.match.playerOrder.includes(body.playerId)) {
    sendError(response, 403, "Only active players can vote to start the next game early.");
    return;
  }

  const match = voteStartNow(room.match, body.playerId, Boolean(body.agree), {
    now: Date.now(),
    rng
  });
  const nextRoom = replaceRoomMatch(room, match);

  rooms.set(roomId, nextRoom);
  scheduleRoomTimer(context, nextRoom);
  broadcastRoom(context, nextRoom);
  sendJson(response, 200, {
    room: serializeRoom(nextRoom, body.playerId)
  });
}

function scheduleRoomTimer(context, room) {
  const { rooms, timers, rng } = context;

  if (timers.has(room.id)) {
    clearTimeout(timers.get(room.id));
    timers.delete(room.id);
  }

  if (!room.match) {
    if (room.status === ROOM_STATUS.WAITING) {
      scheduleWaitingRoomTimer(context, room);
    }
    return;
  }

  if (room.match.status === MATCH_STATUS.PAUSED && room.match.pauseReason === "bathroomBreak") {
    scheduleBathroomBreakTimer(context, room);
    return;
  }

  if (room.match.status !== MATCH_STATUS.ACTIVE) {
    return;
  }

  if (room.match.betweenGames) {
    scheduleBetweenGamesTimer(context, room);
    return;
  }

  if (room.match.finalReview) {
    scheduleFinalReviewTimer(context, room);
    return;
  }

  if (!room.match.game) {
    return;
  }

  if (room.match.game.animationLock) {
    scheduleAnimationLockTimer(context, room);
    return;
  }

  if (isBotPlayer(room.match.playersById[room.match.game.currentPlayerId])) {
    scheduleBotTurnTimer(context, room);
    return;
  }

  const delayMs = Math.max(0, room.match.game.turnDeadlineAt - Date.now());
  const timer = setTimeout(() => {
    const latestRoom = rooms.get(room.id);

    if (latestRoom?.match?.status !== MATCH_STATUS.ACTIVE || !latestRoom.match.game) {
      return;
    }

    try {
      const match = handleTurnTimeout(latestRoom.match, {
        now: Date.now(),
        rng
      });
      const nextRoom = replaceRoomMatch(latestRoom, match);

      rooms.set(room.id, nextRoom);
      scheduleRoomTimer(context, nextRoom);
      broadcastRoom(context, nextRoom);
    } catch (error) {
      broadcastEvent(context, room.id, "error", {
        message: error.message
      });
    }
  }, delayMs);

  timers.set(room.id, timer);
}

function scheduleAnimationLockTimer(context, room) {
  const { rooms, timers } = context;
  const delayMs = Math.max(0, room.match.game.animationLock.expiresAt - Date.now());
  const timer = setTimeout(() => {
    const latestRoom = rooms.get(room.id);

    if (latestRoom?.match?.status !== MATCH_STATUS.ACTIVE || !latestRoom.match.game?.animationLock) {
      return;
    }

    try {
      const match = releaseAnimationLock(latestRoom.match, {
        now: Date.now()
      });
      const nextRoom = replaceRoomMatch(latestRoom, match);

      rooms.set(room.id, nextRoom);
      scheduleRoomTimer(context, nextRoom);
      broadcastRoom(context, nextRoom);
    } catch (error) {
      broadcastEvent(context, room.id, "error", {
        message: error.message
      });
      scheduleRoomTimer(context, latestRoom);
    }
  }, delayMs);

  timers.set(room.id, timer);
}

function scheduleWaitingRoomTimer(context, room) {
  const { rooms, timers, sseClients, waitingRoomTimeoutMs } = context;
  const timeoutAt = Number(room.createdAt ?? Date.now()) + waitingRoomTimeoutMs;
  const delayMs = Math.max(0, timeoutAt - Date.now());
  const timer = setTimeout(() => {
    const latestRoom = rooms.get(room.id);

    timers.delete(room.id);

    if (!latestRoom || latestRoom.status !== ROOM_STATUS.WAITING || latestRoom.match) {
      return;
    }

    const cancelledRoom = cancelRoom(latestRoom, {
      now: Date.now(),
      reason: WAITING_ROOM_TIMEOUT_REASON,
      message: WAITING_ROOM_TIMEOUT_MESSAGE
    });

    rooms.set(room.id, cancelledRoom);
    broadcastRoom(context, cancelledRoom);
    closeRoomEventStreams(sseClients, room.id);
  }, delayMs);

  timers.set(room.id, timer);
}

function scheduleBotTurnTimer(context, room) {
  const { rooms, timers, rng } = context;
  const timer = setTimeout(() => {
    const latestRoom = rooms.get(room.id);

    if (latestRoom?.match?.status !== MATCH_STATUS.ACTIVE || !latestRoom.match.game) {
      return;
    }

    const playerId = latestRoom.match.game.currentPlayerId;

    if (!isBotPlayer(latestRoom.match.playersById[playerId])) {
      scheduleRoomTimer(context, latestRoom);
      return;
    }

    try {
      const choice = chooseBotTurn(latestRoom.match, playerId);
      const now = Date.now();
      const match = choice.action === "pass"
        ? passTurn(latestRoom.match, playerId, { now })
        : playTile(latestRoom.match, playerId, {
          tileId: choice.move.tile.id,
          end: choice.move.end
        }, {
          now,
          rng
        });
      const nextRoom = replaceRoomMatch(latestRoom, match);

      rooms.set(room.id, nextRoom);
      scheduleRoomTimer(context, nextRoom);
      broadcastRoom(context, nextRoom);
    } catch (error) {
      broadcastEvent(context, room.id, "error", {
        message: error.message
      });
      scheduleRoomTimer(context, latestRoom);
    }
  }, BOT_TURN_DELAY_MS);

  timers.set(room.id, timer);
}

function scheduleFinalReviewTimer(context, room) {
  const { rooms, timers } = context;
  const delayMs = Math.max(0, room.match.finalReview.deadlineAt - Date.now());
  const timer = setTimeout(() => {
    void (async () => {
      const latestRoom = rooms.get(room.id);

      if (latestRoom?.match?.status !== MATCH_STATUS.ACTIVE || !latestRoom.match.finalReview) {
        return;
      }

      try {
        const match = completeMatchReview(latestRoom.match, {
          now: Date.now()
        });
        const nextRoom = replaceRoomMatch(latestRoom, match);

        rooms.set(room.id, nextRoom);
        await recordCompletedRoom(context, nextRoom).catch((error) => {
          broadcastEvent(context, room.id, "error", {
            message: error.message
          });
        });
        scheduleRoomTimer(context, nextRoom);
        broadcastRoom(context, nextRoom);
      } catch (error) {
        broadcastEvent(context, room.id, "error", {
          message: error.message
        });
      }
    })();
  }, delayMs);

  timers.set(room.id, timer);
}

function scheduleBetweenGamesTimer(context, room) {
  const { rooms, timers, rng } = context;
  const delayMs = Math.max(0, room.match.betweenGames.deadlineAt - Date.now());
  const timer = setTimeout(() => {
    const latestRoom = rooms.get(room.id);

    if (latestRoom?.match?.status !== MATCH_STATUS.ACTIVE || !latestRoom.match.betweenGames) {
      return;
    }

    try {
      const match = advanceFromGameBreak(latestRoom.match, {
        now: Date.now(),
        rng
      });
      const nextRoom = replaceRoomMatch(latestRoom, match);

      rooms.set(room.id, nextRoom);
      scheduleRoomTimer(context, nextRoom);
      broadcastRoom(context, nextRoom);
    } catch (error) {
      broadcastEvent(context, room.id, "error", {
        message: error.message
      });
    }
  }, delayMs);

  timers.set(room.id, timer);
}

function scheduleBathroomBreakTimer(context, room) {
  const { rooms, timers } = context;
  const delayMs = Math.max(0, room.match.pauseEndsAt - Date.now());
  const timer = setTimeout(() => {
    const latestRoom = rooms.get(room.id);

    if (latestRoom?.match?.status !== MATCH_STATUS.PAUSED || latestRoom.match.pauseReason !== "bathroomBreak") {
      return;
    }

    try {
      const match = resumeBathroomBreak(latestRoom.match, {
        now: Date.now()
      });
      const nextRoom = replaceRoomMatch(latestRoom, match);

      rooms.set(room.id, nextRoom);
      scheduleRoomTimer(context, nextRoom);
      broadcastRoom(context, nextRoom);
    } catch (error) {
      broadcastEvent(context, room.id, "error", {
        message: error.message
      });
    }
  }, delayMs);

  timers.set(room.id, timer);
}

function subscribeToRoomEvents(context, roomId, playerId) {
  const { request, response, rooms, sseClients } = context;
  const room = requireRoom(rooms, roomId);
  const client = {
    playerId,
    response
  };

  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });

  response.write(": connected\n\n");
  sendSse(client, "room", serializeRoom(room, playerId));

  if (!sseClients.has(roomId)) {
    sseClients.set(roomId, new Set());
  }

  sseClients.get(roomId).add(client);

  request.on("close", () => {
    sseClients.get(roomId)?.delete(client);
  });
}

function broadcastRoom(context, room) {
  broadcastEvent(context, room.id, "room", null, room);
}

function broadcastAllRooms(context, event, payload) {
  for (const roomId of context.sseClients.keys()) {
    broadcastEvent(context, roomId, event, payload);
  }
}

function broadcastEvent(context, roomId, event, payload, room = null) {
  const clients = context.sseClients.get(roomId);

  if (!clients) {
    return;
  }

  for (const client of clients) {
    sendSse(client, event, payload ?? serializeRoom(room, client.playerId));
  }
}

function sendSse(client, event, data) {
  client.response.write(`event: ${event}\n`);
  client.response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function closeRoomEventStreams(sseClients, roomId) {
  const clients = sseClients.get(roomId);

  if (!clients) {
    return;
  }

  for (const client of clients) {
    client.response.end();
  }

  sseClients.delete(roomId);
}

async function recordCompletedRoom(context, room) {
  if (room.match?.status !== MATCH_STATUS.COMPLETED) {
    return;
  }

  await context.statsStore.recordCompletedMatch(room);
}

async function newChampionshipBlockReason(context, options = {}) {
  const now = Date.now();
  const portalSettings = await context.statsStore.getPortalSettings();
  const shutdown = await context.statsStore.getActiveShutdown(now);

  if (!portalSettings.allowNewChampionships) {
    return "New championships are temporarily disabled by the portal admin.";
  }

  if (shutdown) {
    return shutdown.message || "The portal is temporarily unavailable.";
  }

  const openCount = openRoomCount(context.rooms);
  const max = portalSettings.maxConcurrentChampionships;

  if (options.creatingRoom ? openCount >= max : openCount > max) {
    return `The portal is at capacity (${max} championships). Try again soon.`;
  }

  return null;
}

function openRoomCount(rooms) {
  return [...rooms.values()].filter((room) => ["waiting", "active"].includes(room.status)).length;
}

function requirePortalAdmin(context, allowedRoles = []) {
  const token = authorizationToken(context.request);
  const session = token ? context.adminSessions.get(token) : null;

  if (!token || !session || session.scope !== "portal") {
    throw new HttpError(401, "Portal admin login required.");
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(session.role)) {
    throw new HttpError(403, "This admin role cannot perform that action.");
  }

  return {
    ...session,
    token
  };
}

function adminAuditFields(session = {}) {
  return {
    adminTokenId: session.token ?? null,
    adminUserId: session.adminUserId ?? null,
    adminName: session.adminName ?? session.email ?? session.playerId ?? "Admin",
    adminEmail: session.email ?? null,
    adminRole: session.role ?? session.adminRole ?? session.scope ?? "admin"
  };
}

function portalCapacitySnapshot(rooms, portalSettings) {
  const liveRooms = [...rooms.values()].filter(isLiveAdminRoom);
  const activeRooms = liveRooms.filter((room) => room.status === ROOM_STATUS.ACTIVE);
  const connectedPlayers = liveRooms.reduce((sum, room) => sum + connectedHumanSeats(room).length, 0);
  const activePlayersOnline = activeRooms.reduce((sum, room) => sum + connectedHumanSeats(room).length, 0);

  return {
    openChampionships: liveRooms.length,
    activeChampionships: activeRooms.length,
    waitingChampionships: liveRooms.filter((room) => room.status === ROOM_STATUS.WAITING).length,
    maxConcurrentChampionships: portalSettings.maxConcurrentChampionships,
    connectedPlayers,
    onlinePlayers: connectedPlayers,
    activePlayersOnline
  };
}

function schedulePortalShutdown(context, shutdown) {
  const delayMs = Math.max(0, shutdown.startAt - Date.now());
  const timer = setTimeout(() => {
    context.portalTimers.delete(timer);
    void applyShutdownWindow(context, shutdown);
  }, delayMs);

  context.portalTimers.add(timer);
}

async function applyShutdownWindow(context, shutdown) {
  broadcastAllRooms(context, "portal", {
    type: "shutdown",
    shutdown
  });

  if (shutdown.mode !== "forceEnd") {
    return;
  }

  for (const room of context.rooms.values()) {
    if (room.status === "cancelled" || room.status === "completed") {
      continue;
    }

    if (context.timers.has(room.id)) {
      clearTimeout(context.timers.get(room.id));
      context.timers.delete(room.id);
    }

    const cancelledRoom = cancelRoom(room, {
      now: Date.now(),
      reason: "adminShutdown"
    });

    context.rooms.set(room.id, cancelledRoom);
    broadcastRoom(context, cancelledRoom);
  }
}

function serializeAdminRoom(room) {
  const activePlayerIds = room.match?.playerOrder ?? [];
  const connectedSeats = connectedHumanSeats(room);

  return {
    id: room.id,
    status: room.status,
    hostPlayerId: room.hostPlayerId,
    hostName: room.seats.find((seat) => seat.playerId === room.hostPlayerId)?.name ?? room.hostPlayerId,
    matchLength: room.matchLength,
    players: room.seats.length,
    connectedPlayers: connectedSeats.length,
    connectedPlayerNames: connectedSeats.map((seat) => seat.name),
    activePlayers: activePlayerIds.length,
    lobbyPlayers: Math.max(0, room.seats.length - activePlayerIds.length),
    currentGameNumber: room.match?.currentGameNumber ?? null,
    flags: 0,
    createdAt: room.createdAt,
    startedAt: room.startedAt ?? null
  };
}

function serializePublicRoom(room) {
  const activePlayerIds = room.match?.playerOrder ?? [];

  return {
    id: room.id,
    status: room.status,
    hostName: room.seats.find((seat) => seat.playerId === room.hostPlayerId)?.name ?? room.hostPlayerId,
    matchLength: room.matchLength,
    players: room.seats.length,
    connectedPlayers: connectedHumanSeats(room).length,
    activePlayers: activePlayerIds.length,
    lobbyPlayers: Math.max(0, room.seats.length - activePlayerIds.length),
    currentGameNumber: room.match?.currentGameNumber ?? null,
    canJoin: room.seats.length < 7,
    startedAt: room.startedAt ?? null
  };
}

function isLiveAdminRoom(room) {
  return ["waiting", "active"].includes(room.status);
}

function connectedHumanSeats(room) {
  return room.seats.filter((seat) => seat.connected && !seat.isBot);
}

function serializeRoom(room, viewerPlayerId = null) {
  return {
    id: room.id,
    status: room.status,
    hostPlayerId: room.hostPlayerId,
    matchLength: room.matchLength,
    seats: room.seats,
    createdAt: room.createdAt,
    startedAt: room.startedAt ?? null,
    cancelledAt: room.cancelledAt ?? null,
    cancelReason: room.cancelReason ?? null,
    cancelMessage: room.cancelMessage ?? null,
    rematchRequest: room.rematchRequest ?? null,
    match: room.match ? serializeMatch(room.match, viewerPlayerId) : null
  };
}

function serializeMatch(match, viewerPlayerId) {
  return {
    id: match.id,
    status: match.status,
    matchLength: match.matchLength,
    rosterOrder: match.rosterOrder ?? match.playerOrder,
    playerOrder: match.playerOrder,
    benchPlayerIds: match.benchPlayerIds ?? [],
    players: Object.values(match.playersById),
    currentGameNumber: match.currentGameNumber,
    previousWinnerId: match.previousWinnerId,
    rawScores: match.rawScores,
    infractions: match.infractions,
    scoring: match.scoring,
    turnDurationMs: match.turnDurationMs,
    betweenGamesDurationMs: match.betweenGamesDurationMs,
    finalReviewDurationMs: match.finalReviewDurationMs,
    bathroomBreakDurationMs: match.bathroomBreakDurationMs,
    seedToBoardRevealDurationMs: match.seedToBoardRevealDurationMs,
    infractionsPerPenalty: match.infractionsPerPenalty,
    penaltyPoints: match.penaltyPoints,
    betweenGames: match.betweenGames ? serializeBetweenGames(match.betweenGames) : null,
    finalReview: match.finalReview ? serializeFinalReview(match.finalReview) : null,
    bathroomBreaksByPlayerId: match.bathroomBreaksByPlayerId,
    reactionsByPlayerId: serializeReactions(match.reactionsByPlayerId ?? {}),
    pauseReason: match.pauseReason ?? null,
    pausedAt: match.pausedAt ?? null,
    pausedByPlayerId: match.pausedByPlayerId ?? null,
    pauseEndsAt: match.pauseEndsAt ?? null,
    disconnectedPlayerIds: match.disconnectedPlayerIds ?? [],
    completedGames: match.completedGames.map((game) => ({
      number: game.number,
      completedAt: game.completedAt,
      endReason: game.endReason,
      winnerId: game.winnerId,
      lockingPlayerId: game.lockingPlayerId,
      placements: game.scoreResult.placements,
      pointsByPlayerId: game.scoreResult.pointsByPlayerId
    })),
    game: match.game ? serializeGame(match.game, viewerPlayerId) : null,
    chatMessages: match.chatMessages,
    chatMutedUntilByPlayerId: match.chatMutedUntilByPlayerId ?? {},
    finalScores: match.finalScores,
    winnerIds: match.winnerIds,
    lastRotation: match.lastRotation ?? null,
    lastAction: serializeAction(match.lastAction ?? null),
    cancelledAt: match.cancelledAt ?? null,
    cancelReason: match.cancelReason ?? null
  };
}

function serializeReactions(reactionsByPlayerId, now = Date.now()) {
  return Object.fromEntries(
    Object.entries(reactionsByPlayerId)
      .filter(([, reaction]) => reaction && Number(reaction.expiresAt ?? 0) > now)
      .map(([playerId, reaction]) => [playerId, {
        type: reaction.type,
        createdAt: reaction.createdAt,
        expiresAt: reaction.expiresAt
      }])
  );
}

function serializeBetweenGames(betweenGames) {
  return {
    previousGameNumber: betweenGames.previousGameNumber,
    nextGameNumber: betweenGames.nextGameNumber,
    startedAt: betweenGames.startedAt,
    deadlineAt: betweenGames.deadlineAt,
    durationMs: betweenGames.durationMs,
    endReason: betweenGames.endReason,
    winnerId: betweenGames.winnerId,
    lockingPlayerId: betweenGames.lockingPlayerId,
    scoresBefore: betweenGames.scoresBefore,
    scoresAfter: betweenGames.scoresAfter,
    startNowRequest: betweenGames.startNowRequest
      ? {
        initiatedByPlayerId: betweenGames.startNowRequest.initiatedByPlayerId,
        requestedAt: betweenGames.startNowRequest.requestedAt,
        votesByPlayerId: betweenGames.startNowRequest.votesByPlayerId
      }
      : null,
    rotation: betweenGames.rotation ?? null,
    scoreResult: {
      endType: betweenGames.scoreResult.endType,
      pointsByPlayerId: betweenGames.scoreResult.pointsByPlayerId,
      lockingPlayerWon: betweenGames.scoreResult.lockingPlayerWon ?? null,
      placements: betweenGames.scoreResult.placements.map((placement) => ({
        playerId: placement.playerId,
        place: placement.place,
        points: placement.points,
        pipTotal: placement.pipTotal,
        tileCount: placement.tileCount
      }))
    }
  };
}

function serializeFinalReview(finalReview) {
  return {
    gameNumber: finalReview.gameNumber,
    startedAt: finalReview.startedAt,
    deadlineAt: finalReview.deadlineAt,
    durationMs: finalReview.durationMs,
    endReason: finalReview.endReason,
    winnerId: finalReview.winnerId,
    lockingPlayerId: finalReview.lockingPlayerId,
    scoresBefore: finalReview.scoresBefore,
    scoresAfter: finalReview.scoresAfter,
    finalScores: finalReview.finalScores,
    winnerIds: finalReview.winnerIds,
    scoreResult: {
      endType: finalReview.scoreResult.endType,
      pointsByPlayerId: finalReview.scoreResult.pointsByPlayerId,
      lockingPlayerWon: finalReview.scoreResult.lockingPlayerWon ?? null,
      placements: finalReview.scoreResult.placements.map((placement) => ({
        playerId: placement.playerId,
        place: placement.place,
        points: placement.points,
        pipTotal: placement.pipTotal,
        tileCount: placement.tileCount
      }))
    }
  };
}

function serializeGame(game, viewerPlayerId) {
  return {
    number: game.number,
    board: {
      leftEnd: game.board.leftEnd,
      rightEnd: game.board.rightEnd,
      plays: game.board.plays.map((play) => ({
        tileId: play.tile.id,
        end: play.end,
        leftValue: play.leftValue,
        rightValue: play.rightValue
      }))
    },
    currentPlayerId: game.currentPlayerId,
    turnStartedAt: game.turnStartedAt,
    turnDeadlineAt: game.turnDeadlineAt,
    requiredOpeningTileId: game.requiredOpeningTileId,
    seedToBoardUsedByPlayerId: game.seedToBoardUsedByPlayerId ?? {},
    slamUsedByPlayerId: game.slamUsedByPlayerId ?? {},
    takeDatUsedByPlayerId: game.takeDatUsedByPlayerId ?? {},
    lastTakeDat: game.lastTakeDat
      ? {
        type: game.lastTakeDat.type,
        playerId: game.lastTakeDat.playerId,
        at: game.lastTakeDat.at,
        expiresAt: game.lastTakeDat.expiresAt,
        durationMs: game.lastTakeDat.durationMs
      }
      : null,
    animationLock: game.animationLock
      ? {
        type: game.animationLock.type,
        playerId: game.animationLock.playerId,
        tileId: game.animationLock.tileId,
        end: game.animationLock.end,
        startedAt: game.animationLock.startedAt,
        expiresAt: game.animationLock.expiresAt,
        durationMs: game.animationLock.durationMs
      }
      : null,
    lastSeedToBoardReveal: game.lastSeedToBoardReveal ?? null,
    lastAction: serializeAction(game.lastAction ?? null),
    lastMove: serializeMoveAction(game.lastMove ?? null),
    hand: viewerPlayerId ? serializeHand(game.hands[viewerPlayerId] ?? []) : [],
    handCounts: Object.fromEntries(
      Object.entries(game.hands).map(([playerId, hand]) => [playerId, hand.length])
    )
  };
}

function serializeAction(action) {
  if (!action) {
    return null;
  }

  return {
    type: action.type,
    playerId: action.playerId,
    at: action.at,
    effect: action.effect ?? null,
    move: serializeMove(action.move)
  };
}

function serializeMoveAction(action) {
  if (!action) {
    return null;
  }

  return {
    playerId: action.playerId,
    at: action.at,
    move: serializeMove(action.move)
  };
}

function serializeMove(move) {
  if (!move) {
    return null;
  }

  return {
    tileId: move.tileId ?? move.tile?.id ?? null,
    end: move.end,
    leftValue: move.leftValue,
    rightValue: move.rightValue,
    high: move.tile?.high ?? null,
    low: move.tile?.low ?? null
  };
}

function serializeHand(hand) {
  return hand.map((tile) => ({
    id: tile.id,
    high: tile.high,
    low: tile.low
  }));
}

function canEditSettingsForRoom(room) {
  return room.status === "waiting"
    && room.match === null;
}

function canonicalPlayerName(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase();
}

function capitalize(value) {
  const text = String(value ?? "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function requestStartNow(match, playerId, options = {}) {
  const { now = Date.now(), rng = Math.random } = options;

  if (match.status !== MATCH_STATUS.ACTIVE || !match.betweenGames) {
    throw new Error("Start now vote is only available between games.");
  }

  if (!match.playerOrder.includes(playerId)) {
    throw new Error("Only active players can start the next game early.");
  }

  const currentRequest = match.betweenGames.startNowRequest ?? null;

  if (currentRequest?.votesByPlayerId?.[playerId] === true) {
    return match;
  }

  const nextRequest = {
    initiatedByPlayerId: currentRequest?.initiatedByPlayerId ?? playerId,
    requestedAt: currentRequest?.requestedAt ?? now,
    votesByPlayerId: withBotStartNowVotes(match, {
      ...(currentRequest?.votesByPlayerId ?? {}),
      [playerId]: true
    })
  };

  const withRequest = {
    ...match,
    betweenGames: {
      ...match.betweenGames,
      startNowRequest: nextRequest
    }
  };

  const allAccepted = withRequest.playerOrder.every((id) => nextRequest.votesByPlayerId[id] === true);

  if (!allAccepted) {
    return withRequest;
  }

  return advanceFromGameBreak({
    ...withRequest,
    betweenGames: {
      ...withRequest.betweenGames,
      startNowRequest: null
    }
  }, {
    now,
    rng
  });
}

function voteStartNow(match, playerId, agree, options = {}) {
  const { now = Date.now(), rng = Math.random } = options;

  if (match.status !== MATCH_STATUS.ACTIVE || !match.betweenGames) {
    throw new Error("Start now vote is only available between games.");
  }

  if (!match.playerOrder.includes(playerId)) {
    throw new Error("Only active players can vote to start the next game early.");
  }

  const currentRequest = match.betweenGames.startNowRequest;

  if (!currentRequest) {
    throw new Error("There is no active start now vote.");
  }

  if (!agree) {
    return {
      ...match,
      betweenGames: {
        ...match.betweenGames,
        startNowRequest: null
      }
    };
  }

  const votesByPlayerId = withBotStartNowVotes(match, {
    ...currentRequest.votesByPlayerId,
    [playerId]: true
  });
  const withVotes = {
    ...match,
    betweenGames: {
      ...match.betweenGames,
      startNowRequest: {
        ...currentRequest,
        votesByPlayerId
      }
    }
  };
  const allAccepted = withVotes.playerOrder.every((id) => votesByPlayerId[id] === true);

  if (!allAccepted) {
    return withVotes;
  }

  const readyMatch = {
    ...withVotes,
    betweenGames: {
      ...withVotes.betweenGames,
      startNowRequest: null
    }
  };

  return advanceFromGameBreak(readyMatch, {
    now,
    rng
  });
}

function withBotStartNowVotes(match, votesByPlayerId) {
  const votes = { ...votesByPlayerId };

  for (const playerId of match.playerOrder) {
    if (match.playersById[playerId]?.isBot) {
      votes[playerId] = true;
    }
  }

  return votes;
}

async function serveStaticFile(pathname, response) {
  const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const normalizedPath = normalize(relativePath);

  if (normalizedPath.startsWith("..")) {
    sendError(response, 403, "Forbidden.");
    return;
  }

  try {
    const filePath = join(PUBLIC_DIR, normalizedPath);
    const content = await readFile(filePath);

    response.writeHead(200, {
      "Content-Type": contentTypeFor(filePath)
    });
    response.end(content);
  } catch {
    if (!extname(normalizedPath)) {
      try {
        const indexContent = await readFile(join(PUBLIC_DIR, "index.html"));

        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8"
        });
        response.end(indexContent);
        return;
      } catch {
        sendError(response, 404, "Not found.");
        return;
      }
    }

    sendError(response, 404, "Not found.");
  }
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function requireRoom(rooms, roomId) {
  const room = rooms.get(roomId);

  if (!room) {
    throw new HttpError(404, "Room not found.");
  }

  return room;
}

function requestOrigin(requestUrl) {
  return `${requestUrl.protocol}//${requestUrl.host}`;
}

function authorizationToken(request) {
  const header = request.headers.authorization ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  return match ? match[1] : null;
}

function createId(prefix) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json"
  });
  response.end(JSON.stringify(data));
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, {
    error: message
  });
}

function contentTypeFor(filePath) {
  const extension = extname(filePath);

  if (extension === ".html") {
    return "text/html; charset=utf-8";
  }

  if (extension === ".css") {
    return "text/css; charset=utf-8";
  }

  if (extension === ".js" || extension === ".mjs") {
    return "text/javascript; charset=utf-8";
  }

  if (extension === ".webmanifest") {
    return "application/manifest+json; charset=utf-8";
  }

  if (extension === ".svg") {
    return "image/svg+xml";
  }

  if (extension === ".ico") {
    return "image/x-icon";
  }

  return "application/octet-stream";
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}
