import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createAppServer } from "../src/appServer.js";

test("serves health check", async () => {
  const { server, baseUrl } = await listenToTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true });
  } finally {
    await closeTestServer(server);
  }
});

test("serves the browser client", async () => {
  const { server, baseUrl } = await listenToTestServer();

  try {
    const response = await fetch(`${baseUrl}/`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /Dominoes Table/);
  } finally {
    await closeTestServer(server);
  }
});

test("serves PWA manifest and icon assets", async () => {
  const { server, baseUrl } = await listenToTestServer();

  try {
    const manifestResponse = await fetch(`${baseUrl}/manifest.webmanifest`);
    const manifest = await manifestResponse.json();
    const iconResponse = await fetch(`${baseUrl}/icon.svg`);
    const faviconResponse = await fetch(`${baseUrl}/favicon.ico`);

    assert.equal(manifestResponse.status, 200);
    assert.equal(manifestResponse.headers.get("content-type"), "application/manifest+json; charset=utf-8");
    assert.equal(manifest.display, "standalone");
    assert.equal(iconResponse.status, 200);
    assert.equal(iconResponse.headers.get("content-type"), "image/svg+xml");
    assert.equal(faviconResponse.status, 200);
    assert.equal(faviconResponse.headers.get("content-type"), "image/x-icon");
  } finally {
    await closeTestServer(server);
  }
});

test("creates an invite room and allows 4 players to start", async () => {
  const { server, baseUrl } = await listenToTestServer();

  try {
    const created = await postJson(`${baseUrl}/api/rooms`, {
      roomId: "room-test",
      hostId: "p1",
      hostName: "Host",
      matchLength: 5
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.playerId, "p1");
    assert.equal(created.body.room.status, "waiting");
    assert.equal(created.body.inviteUrl, `${baseUrl}/rooms/room-test`);

    await postJson(`${baseUrl}/api/rooms/room-test/join`, {
      playerId: "p2",
      name: "Player 2"
    });
    await postJson(`${baseUrl}/api/rooms/room-test/join`, {
      playerId: "p3",
      name: "Player 3"
    });
    const fourthJoin = await postJson(`${baseUrl}/api/rooms/room-test/join`, {
      playerId: "p4",
      name: "Player 4"
    });

    assert.equal(fourthJoin.body.room.seats.length, 4);

    const started = await postJson(`${baseUrl}/api/rooms/room-test/start`, {
      playerId: "p1"
    });

    assert.equal(started.status, 200);
    assert.equal(started.body.room.status, "active");
    assert.equal(started.body.room.match.playerOrder.length, 4);
    assert.ok(started.body.room.match.game.currentPlayerId);
  } finally {
    await closeTestServer(server);
  }
});

test("rooms allow 7 joined players while the first 4 start on the board", async () => {
  const { server, baseUrl } = await listenToTestServer();

  try {
    await postJson(`${baseUrl}/api/rooms`, {
      roomId: "room-seven",
      hostId: "p1",
      hostName: "Host",
      matchLength: 5
    });

    for (const playerId of ["p2", "p3", "p4", "p5", "p6", "p7"]) {
      const joined = await postJson(`${baseUrl}/api/rooms/room-seven/join`, {
        playerId,
        name: `Player ${playerId.slice(1)}`
      });

      assert.equal(joined.status, 200);
    }

    const rejected = await postJson(`${baseUrl}/api/rooms/room-seven/join`, {
      playerId: "p8",
      name: "Player 8"
    });

    assert.equal(rejected.status, 400);
    assert.match(rejected.body.error, /full/);

    const started = await postJson(`${baseUrl}/api/rooms/room-seven/start`, {
      playerId: "p1"
    });

    assert.equal(started.status, 200);
    assert.deepEqual(started.body.room.match.playerOrder, ["p1", "p2", "p3", "p4"]);
    assert.deepEqual(started.body.room.match.benchPlayerIds, ["p5", "p6", "p7"]);
    assert.equal(started.body.room.match.rosterOrder.length, 7);
  } finally {
    await closeTestServer(server);
  }
});

test("players can join the lobby after a match starts and chat while benched", async () => {
  const { server, baseUrl } = await listenToTestServer();

  try {
    await postJson(`${baseUrl}/api/rooms`, {
      roomId: "room-late-join",
      hostId: "p1",
      hostName: "Host",
      matchLength: 10
    });

    for (const playerId of ["p2", "p3", "p4"]) {
      await postJson(`${baseUrl}/api/rooms/room-late-join/join`, {
        playerId,
        name: `Player ${playerId.slice(1)}`
      });
    }

    await postJson(`${baseUrl}/api/rooms/room-late-join/start`, {
      playerId: "p1"
    });

    const lateJoin = await postJson(`${baseUrl}/api/rooms/room-late-join/join`, {
      playerId: "p5",
      name: "Player 5"
    });

    assert.equal(lateJoin.status, 200);
    assert.equal(lateJoin.body.room.seats.length, 5);
    assert.deepEqual(lateJoin.body.room.match.benchPlayerIds, ["p5"]);
    assert.equal(lateJoin.body.room.match.game.hand.length, 0);

    const chat = await postJson(`${baseUrl}/api/rooms/room-late-join/chat`, {
      playerId: "p5",
      text: "Watching from the lobby"
    });

    assert.equal(chat.status, 200);
    assert.equal(chat.body.room.match.chatMessages.at(-1).text, "Watching from the lobby");

    const breakAttempt = await postJson(`${baseUrl}/api/rooms/room-late-join/bathroom-break`, {
      playerId: "p5"
    });

    assert.equal(breakAttempt.status, 403);
    assert.match(breakAttempt.body.error, /Only active players/);
  } finally {
    await closeTestServer(server);
  }
});

test("only the host can end a session and ending removes the room", async () => {
  const { server, baseUrl } = await listenToTestServer();

  try {
    await postJson(`${baseUrl}/api/rooms`, {
      roomId: "room-end",
      hostId: "p1",
      hostName: "Host",
      matchLength: 5
    });
    await postJson(`${baseUrl}/api/rooms/room-end/join`, {
      playerId: "p2",
      name: "Player 2"
    });
    await postJson(`${baseUrl}/api/rooms/room-end/join`, {
      playerId: "p3",
      name: "Player 3"
    });
    await postJson(`${baseUrl}/api/rooms/room-end/join`, {
      playerId: "p4",
      name: "Player 4"
    });
    await postJson(`${baseUrl}/api/rooms/room-end/start`, {
      playerId: "p1"
    });

    const rejected = await postJson(`${baseUrl}/api/rooms/room-end/end-session`, {
      playerId: "p2"
    });

    assert.equal(rejected.status, 403);

    const ended = await postJson(`${baseUrl}/api/rooms/room-end/end-session`, {
      playerId: "p1"
    });

    assert.equal(ended.status, 200);
    assert.equal(ended.body.room.status, "cancelled");
    assert.equal(ended.body.room.match.status, "cancelled");

    const lookup = await fetch(`${baseUrl}/api/rooms/room-end`);
    const lookupBody = await lookup.json();

    assert.equal(lookup.status, 404);
    assert.equal(lookupBody.error, "Room not found.");
  } finally {
    await closeTestServer(server);
  }
});

test("disconnect and bathroom break states are visible through the room API", async () => {
  const { server, baseUrl } = await listenToTestServer();

  try {
    await postJson(`${baseUrl}/api/rooms`, {
      roomId: "room-break",
      hostId: "p1",
      hostName: "Host",
      matchLength: 10
    });
    await postJson(`${baseUrl}/api/rooms/room-break/join`, {
      playerId: "p2",
      name: "Player 2"
    });
    await postJson(`${baseUrl}/api/rooms/room-break/join`, {
      playerId: "p3",
      name: "Player 3"
    });
    await postJson(`${baseUrl}/api/rooms/room-break/join`, {
      playerId: "p4",
      name: "Player 4"
    });
    await postJson(`${baseUrl}/api/rooms/room-break/start`, {
      playerId: "p1"
    });

    const disconnected = await postJson(`${baseUrl}/api/rooms/room-break/disconnect`, {
      playerId: "p3"
    });

    assert.equal(disconnected.status, 200);
    assert.equal(disconnected.body.room.seats.find((seat) => seat.playerId === "p3").connected, false);
    assert.equal(disconnected.body.room.match.status, "paused");
    assert.deepEqual(disconnected.body.room.match.disconnectedPlayerIds, ["p3"]);

    await postJson(`${baseUrl}/api/rooms/room-break/reconnect`, {
      playerId: "p3"
    });

    const paused = await postJson(`${baseUrl}/api/rooms/room-break/bathroom-break`, {
      playerId: "p2"
    });

    assert.equal(paused.status, 200);
    assert.equal(paused.body.room.match.status, "paused");
    assert.equal(paused.body.room.match.pauseReason, "bathroomBreak");
    assert.equal(paused.body.room.match.pausedByPlayerId, "p2");
    assert.equal(paused.body.room.match.bathroomBreaksByPlayerId.p2, true);
    assert.ok(paused.body.room.match.pauseEndsAt > Date.now());

    const rejectedResume = await postJson(`${baseUrl}/api/rooms/room-break/resume-break`, {
      playerId: "p1"
    });

    assert.equal(rejectedResume.status, 403);

    const resumed = await postJson(`${baseUrl}/api/rooms/room-break/resume-break`, {
      playerId: "p2"
    });

    assert.equal(resumed.status, 200);
    assert.equal(resumed.body.room.match.status, "active");
    assert.equal(resumed.body.room.match.pauseReason, null);
  } finally {
    await closeTestServer(server);
  }
});

test("admin can update future match settings", async () => {
  const { server, baseUrl } = await listenToTestServer();

  try {
    await postJson(`${baseUrl}/api/rooms`, {
      roomId: "room-settings",
      hostId: "p1",
      hostName: "Host",
      matchLength: 5
    });

    const defaults = await fetch(`${baseUrl}/api/settings`);
    const defaultsBody = await defaults.json();

    assert.equal(defaults.status, 200);
    assert.equal(defaultsBody.settings.scoring.first, 5);

    const beforeFullTableWrongPassword = await postJson(`${baseUrl}/api/admin/login`, {
      roomId: "room-settings",
      playerId: "p1",
      password: "wrong"
    });

    assert.equal(beforeFullTableWrongPassword.status, 401);

    const beforeFullTableLogin = await postJson(`${baseUrl}/api/admin/login`, {
      roomId: "room-settings",
      playerId: "p1",
      password: "test-admin"
    });

    assert.equal(beforeFullTableLogin.status, 200);

    await postJson(`${baseUrl}/api/rooms/room-settings/join`, {
      playerId: "p2",
      name: "Player 2"
    });
    await postJson(`${baseUrl}/api/rooms/room-settings/join`, {
      playerId: "p3",
      name: "Player 3"
    });
    await postJson(`${baseUrl}/api/rooms/room-settings/join`, {
      playerId: "p4",
      name: "Player 4"
    });

    const nonHost = await postJson(`${baseUrl}/api/admin/login`, {
      roomId: "room-settings",
      playerId: "p2",
      password: "test-admin"
    });

    assert.equal(nonHost.status, 403);

    const rejected = await postJson(`${baseUrl}/api/admin/login`, {
      roomId: "room-settings",
      playerId: "p1",
      password: "wrong"
    });

    assert.equal(rejected.status, 401);

    const login = await postJson(`${baseUrl}/api/admin/login`, {
      roomId: "room-settings",
      playerId: "p1",
      password: "test-admin"
    });

    assert.equal(login.status, 200);
    assert.ok(login.body.token);

    const updated = await putJson(`${baseUrl}/api/settings`, {
      settings: {
        ...defaultsBody.settings,
        scoring: {
          ...defaultsBody.settings.scoring,
          first: 7
        },
        turnDurationMs: 30_000
      }
    }, login.body.token);

    assert.equal(updated.status, 200);
    assert.equal(updated.body.settings.scoring.first, 7);
    assert.equal(updated.body.settings.turnDurationMs, 30_000);

    await postJson(`${baseUrl}/api/rooms/room-settings/start`, {
      playerId: "p1"
    });

    const locked = await putJson(`${baseUrl}/api/settings`, {
      settings: {
        ...defaultsBody.settings,
        turnDurationMs: 40_000
      }
    }, login.body.token);

    assert.equal(locked.status, 403);
  } finally {
    await closeTestServer(server);
  }
});

test("join rejects duplicate player names", async () => {
  const { server, baseUrl } = await listenToTestServer();

  try {
    await postJson(`${baseUrl}/api/rooms`, {
      roomId: "room-dup",
      hostId: "p1",
      hostName: "Allan",
      matchLength: 5
    });

    const duplicate = await postJson(`${baseUrl}/api/rooms/room-dup/join`, {
      playerId: "p2",
      name: " allan "
    });

    assert.equal(duplicate.status, 409);
    assert.match(duplicate.body.error, /already in use/i);
  } finally {
    await closeTestServer(server);
  }
});

test("host can add generated bots before starting", async () => {
  const { server, baseUrl } = await listenToTestServer();

  try {
    await postJson(`${baseUrl}/api/rooms`, {
      roomId: "room-bots",
      hostId: "p1",
      hostName: "Host",
      matchLength: 2
    });

    const firstBot = await postJson(`${baseUrl}/api/rooms/room-bots/add-bot`, {
      playerId: "p1"
    });
    const secondBot = await postJson(`${baseUrl}/api/rooms/room-bots/add-bot`, {
      playerId: "p1"
    });
    const thirdBot = await postJson(`${baseUrl}/api/rooms/room-bots/add-bot`, {
      playerId: "p1"
    });

    assert.equal(firstBot.status, 200);
    assert.equal(secondBot.status, 200);
    assert.equal(thirdBot.status, 200);
    assert.deepEqual(
      thirdBot.body.room.seats.map((seat) => seat.name),
      ["Host", "Bot-001", "Bot-002", "Bot-003"]
    );

    const started = await postJson(`${baseUrl}/api/rooms/room-bots/start`, {
      playerId: "p1"
    });

    assert.equal(started.status, 200);
    assert.equal(started.body.room.match.players.find((player) => player.id === "bot-001").isBot, true);
  } finally {
    await closeTestServer(server);
  }
});

test("host can delete chat and block players while offensive chat is rejected", async () => {
  const { server, baseUrl } = await listenToTestServer();

  try {
    await postJson(`${baseUrl}/api/rooms`, {
      roomId: "room-chat-mod",
      hostId: "p1",
      hostName: "Host",
      matchLength: 2
    });
    await postJson(`${baseUrl}/api/rooms/room-chat-mod/join`, {
      playerId: "p2",
      name: "Player 2"
    });
    await postJson(`${baseUrl}/api/rooms/room-chat-mod/join`, {
      playerId: "p3",
      name: "Player 3"
    });
    await postJson(`${baseUrl}/api/rooms/room-chat-mod/join`, {
      playerId: "p4",
      name: "Player 4"
    });
    await postJson(`${baseUrl}/api/rooms/room-chat-mod/start`, {
      playerId: "p1"
    });

    const clean = await postJson(`${baseUrl}/api/rooms/room-chat-mod/chat`, {
      playerId: "p2",
      text: "good round"
    });
    assert.equal(clean.status, 200);
    assert.equal(clean.body.room.match.chatMessages.length, 1);

    const blockedLanguage = await postJson(`${baseUrl}/api/rooms/room-chat-mod/chat`, {
      playerId: "p2",
      text: "badword"
    });
    assert.equal(blockedLanguage.status, 400);

    const nonHostDelete = await postJson(`${baseUrl}/api/rooms/room-chat-mod/delete-chat-message`, {
      playerId: "p2",
      messageId: "chat-1"
    });
    assert.equal(nonHostDelete.status, 403);

    const deleted = await postJson(`${baseUrl}/api/rooms/room-chat-mod/delete-chat-message`, {
      playerId: "p1",
      messageId: "chat-1"
    });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.room.match.chatMessages.length, 0);

    const muted = await postJson(`${baseUrl}/api/rooms/room-chat-mod/block-chat-player`, {
      playerId: "p1",
      targetPlayerId: "p2",
      minutes: 1
    });
    assert.equal(muted.status, 200);
    assert.ok(muted.body.room.match.chatMutedUntilByPlayerId.p2 > Date.now());

    const mutedChat = await postJson(`${baseUrl}/api/rooms/room-chat-mod/chat`, {
      playerId: "p2",
      text: "can I talk"
    });
    assert.equal(mutedChat.status, 403);
  } finally {
    await closeTestServer(server);
  }
});

test("portal admin reviews flags, mutes offenders, and removes lobby players", async () => {
  const { server, baseUrl } = await listenToTestServer();

  try {
    await postJson(`${baseUrl}/api/rooms`, {
      roomId: "room-portal-mod",
      hostId: "p1",
      hostName: "Host",
      matchLength: 5
    });

    for (const playerId of ["p2", "p3", "p4", "p5"]) {
      await postJson(`${baseUrl}/api/rooms/room-portal-mod/join`, {
        playerId,
        name: `Player ${playerId.slice(1)}`
      });
    }

    await postJson(`${baseUrl}/api/rooms/room-portal-mod/start`, {
      playerId: "p1"
    });

    const blocked = await postJson(`${baseUrl}/api/rooms/room-portal-mod/chat`, {
      playerId: "p2",
      text: "badword"
    });
    assert.equal(blocked.status, 400);

    const clean = await postJson(`${baseUrl}/api/rooms/room-portal-mod/chat`, {
      playerId: "p3",
      text: "that was not cool"
    });
    assert.equal(clean.status, 200);

    const peerReport = await postJson(`${baseUrl}/api/rooms/room-portal-mod/report-player`, {
      playerId: "p4",
      targetPlayerId: "p3",
      messageId: "chat-1",
      reason: "Peer reported chat message"
    });
    assert.equal(peerReport.status, 200);

    const login = await postJson(`${baseUrl}/api/admin/login`, {
      password: "test-admin"
    });
    assert.equal(login.status, 200);

    const portal = await getJson(`${baseUrl}/api/admin/portal`, login.body.token);
    assert.equal(portal.status, 200);
    assert.equal(portal.body.reports.length, 2);
    assert.equal(portal.body.capacity.maxConcurrentChampionships, 30);

    const systemReport = portal.body.reports.find((report) => report.source === "system");
    const muted = await postJson(`${baseUrl}/api/admin/player-action`, {
      roomId: "room-portal-mod",
      targetPlayerId: "p2",
      reportId: systemReport.id,
      action: "mute",
      minutes: 10
    }, login.body.token);
    assert.equal(muted.status, 200);
    assert.ok(muted.body.room.match.chatMutedUntilByPlayerId.p2 > Date.now());

    const removed = await postJson(`${baseUrl}/api/admin/player-action`, {
      roomId: "room-portal-mod",
      targetPlayerId: "p5",
      action: "remove"
    }, login.body.token);
    assert.equal(removed.status, 200);
    assert.equal(removed.body.room.status, "active");
    assert.equal(removed.body.room.seats.some((seat) => seat.playerId === "p5"), false);
  } finally {
    await closeTestServer(server);
  }
});

test("portal shutdown force-ends active championships and blocks new ones", async () => {
  const { server, baseUrl } = await listenToTestServer();

  try {
    await postJson(`${baseUrl}/api/rooms`, {
      roomId: "room-shutdown",
      hostId: "p1",
      hostName: "Host",
      matchLength: 5
    });

    for (const playerId of ["p2", "p3", "p4"]) {
      await postJson(`${baseUrl}/api/rooms/room-shutdown/join`, {
        playerId,
        name: `Player ${playerId.slice(1)}`
      });
    }

    await postJson(`${baseUrl}/api/rooms/room-shutdown/start`, {
      playerId: "p1"
    });

    const login = await postJson(`${baseUrl}/api/admin/login`, {
      password: "test-admin"
    });
    const now = Date.now();
    const shutdown = await postJson(`${baseUrl}/api/admin/shutdowns`, {
      mode: "forceEnd",
      startAt: now - 1_000,
      endAt: now + 60_000,
      message: "Saturday maintenance"
    }, login.body.token);
    assert.equal(shutdown.status, 200);

    const room = await fetch(`${baseUrl}/api/rooms/room-shutdown?playerId=p1`);
    const roomBody = await room.json();
    assert.equal(roomBody.room.status, "cancelled");
    assert.equal(roomBody.room.match.cancelReason, "adminShutdown");

    const rejected = await postJson(`${baseUrl}/api/rooms`, {
      roomId: "room-blocked",
      hostId: "host-blocked",
      hostName: "Host",
      matchLength: 5
    });
    assert.equal(rejected.status, 403);

    const portalStatus = await fetch(`${baseUrl}/api/portal-status`);
    const portalBody = await portalStatus.json();
    assert.equal(portalBody.activeShutdown.message, "Saturday maintenance");
  } finally {
    await closeTestServer(server);
  }
});

test("portal capacity setting limits concurrent championships", async () => {
  const { server, baseUrl } = await listenToTestServer();

  try {
    const login = await postJson(`${baseUrl}/api/admin/login`, {
      password: "test-admin"
    });
    assert.equal(login.status, 200);

    const updated = await putJson(`${baseUrl}/api/admin/portal-settings`, {
      portalSettings: {
        maxConcurrentChampionships: 1,
        allowNewChampionships: true
      }
    }, login.body.token);
    assert.equal(updated.status, 200);
    assert.equal(updated.body.portalSettings.maxConcurrentChampionships, 1);

    const first = await postJson(`${baseUrl}/api/rooms`, {
      roomId: "room-capacity-one",
      hostId: "p1",
      hostName: "Host",
      matchLength: 2
    });
    assert.equal(first.status, 201);

    const second = await postJson(`${baseUrl}/api/rooms`, {
      roomId: "room-capacity-two",
      hostId: "p2",
      hostName: "Host 2",
      matchLength: 2
    });
    assert.equal(second.status, 403);
    assert.match(second.body.error, /capacity/);
  } finally {
    await closeTestServer(server);
  }
});

test("portal dashboard only counts live rooms and connected human players", async () => {
  const { server, baseUrl } = await listenToTestServer();

  try {
    const login = await postJson(`${baseUrl}/api/admin/login`, {
      password: "test-admin"
    });
    assert.equal(login.status, 200);

    await postJson(`${baseUrl}/api/rooms`, {
      roomId: "room-live-metrics",
      hostId: "p1",
      hostName: "Host",
      matchLength: 5
    });
    for (const playerId of ["p2", "p3", "p4"]) {
      await postJson(`${baseUrl}/api/rooms/room-live-metrics/join`, {
        playerId,
        name: `Player ${playerId.slice(1)}`
      });
    }
    await postJson(`${baseUrl}/api/rooms/room-live-metrics/add-bot`, {
      playerId: "p1"
    });
    await postJson(`${baseUrl}/api/rooms/room-live-metrics/start`, {
      playerId: "p1"
    });
    await postJson(`${baseUrl}/api/rooms/room-live-metrics/disconnect`, {
      playerId: "p3"
    });

    await postJson(`${baseUrl}/api/rooms`, {
      roomId: "room-cancelled-metrics",
      hostId: "c1",
      hostName: "Cancelled Host",
      matchLength: 5
    });
    await postJson(`${baseUrl}/api/admin/player-action`, {
      roomId: "room-cancelled-metrics",
      targetPlayerId: "c1",
      action: "remove"
    }, login.body.token);

    const portal = await getJson(`${baseUrl}/api/admin/portal`, login.body.token);
    assert.equal(portal.status, 200);
    assert.equal(portal.body.rooms.some((room) => room.id === "room-cancelled-metrics"), false);
    assert.equal(portal.body.metrics.connectedPlayers, 3);
    assert.equal(portal.body.metrics.bots, 1);
    assert.deepEqual(
      portal.body.rooms.find((room) => room.id === "room-live-metrics").connectedPlayerNames.sort(),
      ["Host", "Player 2", "Player 4"].sort()
    );
  } finally {
    await closeTestServer(server);
  }
});

test("portal broadcasts expire after 60 seconds by default", async () => {
  const { server, baseUrl } = await listenToTestServer();

  try {
    const login = await postJson(`${baseUrl}/api/admin/login`, {
      password: "test-admin"
    });
    assert.equal(login.status, 200);

    const broadcast = await postJson(`${baseUrl}/api/admin/broadcasts`, {
      audience: "all",
      message: "Short portal notice"
    }, login.body.token);

    assert.equal(broadcast.status, 200);
    assert.equal(broadcast.body.broadcast.expiresAt - broadcast.body.broadcast.createdAt, 60_000);
  } finally {
    await closeTestServer(server);
  }
});

test("owner can create admins and inactive admins cannot log in", async () => {
  const { server, baseUrl } = await listenToTestServer();

  try {
    const owner = await postJson(`${baseUrl}/api/admin/login`, {
      password: "test-admin"
    });
    assert.equal(owner.status, 200);
    assert.equal(owner.body.adminUser.role, "owner");

    const created = await postJson(`${baseUrl}/api/admin/users`, {
      firstName: "Maya",
      lastName: "Mod",
      email: "maya@example.com",
      password: "strong-pass-1",
      role: "moderator",
      status: "active",
      profilePictureDataUrl: "data:image/png;base64,AA=="
    }, owner.body.token);
    assert.equal(created.status, 201);
    assert.equal(created.body.adminUser.email, "maya@example.com");
    assert.equal(created.body.adminUser.role, "moderator");
    assert.equal(created.body.adminUser.status, "active");
    assert.equal("passwordHash" in created.body.adminUser, false);

    const moderator = await postJson(`${baseUrl}/api/admin/login`, {
      email: "maya@example.com",
      password: "strong-pass-1"
    });
    assert.equal(moderator.status, 200);
    assert.equal(moderator.body.adminUser.role, "moderator");

    const inactive = await putJson(`${baseUrl}/api/admin/users/status`, {
      adminUserId: created.body.adminUser.id,
      status: "inactive"
    }, owner.body.token);
    assert.equal(inactive.status, 200);
    assert.equal(inactive.body.adminUser.status, "inactive");

    const rejected = await postJson(`${baseUrl}/api/admin/login`, {
      email: "maya@example.com",
      password: "strong-pass-1"
    });
    assert.equal(rejected.status, 401);
  } finally {
    await closeTestServer(server);
  }
});

test("supports start-now vote override between games", async () => {
  const { server, baseUrl } = await listenToTestServer();

  try {
    await postJson(`${baseUrl}/api/rooms`, {
      roomId: "room-start-now",
      hostId: "p1",
      hostName: "Host",
      matchLength: 2
    });
    await postJson(`${baseUrl}/api/rooms/room-start-now/join`, {
      playerId: "p2",
      name: "Player 2"
    });
    await postJson(`${baseUrl}/api/rooms/room-start-now/join`, {
      playerId: "p3",
      name: "Player 3"
    });
    await postJson(`${baseUrl}/api/rooms/room-start-now/join`, {
      playerId: "p4",
      name: "Player 4"
    });
    await postJson(`${baseUrl}/api/rooms/room-start-now/start`, {
      playerId: "p1"
    });

    const activeRoom = server.rooms.get("room-start-now");
    const rawScores = activeRoom.match.rawScores;
    server.rooms.set("room-start-now", {
      ...activeRoom,
      match: {
        ...activeRoom.match,
        currentGameNumber: 2,
        previousWinnerId: "p1",
        game: null,
        betweenGames: {
          previousGameNumber: 1,
          nextGameNumber: 2,
          startedAt: 10_000,
          deadlineAt: Date.now() + 30_000,
          durationMs: 30_000,
          endReason: "normalWin",
          winnerId: "p1",
          lockingPlayerId: null,
          scoresBefore: rawScores,
          scoresAfter: rawScores,
          startNowRequest: null,
          scoreResult: {
            endType: "normalWin",
            pointsByPlayerId: {
              p1: 5,
              p2: 3,
              p3: 2,
              p4: 1
            },
            lockingPlayerWon: null,
            placements: [
              { playerId: "p1", place: 1, points: 5, pipTotal: 0, tileCount: 0 },
              { playerId: "p2", place: 2, points: 3, pipTotal: 10, tileCount: 2 },
              { playerId: "p3", place: 3, points: 2, pipTotal: 11, tileCount: 3 },
              { playerId: "p4", place: 4, points: 1, pipTotal: 12, tileCount: 3 }
            ]
          }
        }
      }
    });

    const requested = await postJson(`${baseUrl}/api/rooms/room-start-now/start-now-request`, {
      playerId: "p2"
    });
    assert.equal(requested.status, 200);
    assert.equal(requested.body.room.match.betweenGames.startNowRequest.votesByPlayerId.p2, true);

    await postJson(`${baseUrl}/api/rooms/room-start-now/start-now-vote`, {
      playerId: "p3",
      agree: true
    });
    await postJson(`${baseUrl}/api/rooms/room-start-now/start-now-vote`, {
      playerId: "p4",
      agree: true
    });
    const allAccepted = await postJson(`${baseUrl}/api/rooms/room-start-now/start-now-vote`, {
      playerId: "p1",
      agree: true
    });

    assert.equal(allAccepted.status, 200);
    assert.equal(allAccepted.body.room.match.betweenGames, null);
    assert.equal(allAccepted.body.room.match.game.number, 2);
  } finally {
    await closeTestServer(server);
  }
});

test("lobby players cannot bypass the between-game timer", async () => {
  const { server, baseUrl } = await listenToTestServer();

  try {
    await postJson(`${baseUrl}/api/rooms`, {
      roomId: "room-start-now-lobby",
      hostId: "p1",
      hostName: "Host",
      matchLength: 5
    });

    for (const playerId of ["p2", "p3", "p4", "p5"]) {
      await postJson(`${baseUrl}/api/rooms/room-start-now-lobby/join`, {
        playerId,
        name: `Player ${playerId.slice(1)}`
      });
    }

    await postJson(`${baseUrl}/api/rooms/room-start-now-lobby/start`, {
      playerId: "p1"
    });

    const activeRoom = server.rooms.get("room-start-now-lobby");
    const rawScores = activeRoom.match.rawScores;
    server.rooms.set("room-start-now-lobby", {
      ...activeRoom,
      match: {
        ...activeRoom.match,
        currentGameNumber: 2,
        previousWinnerId: "p1",
        game: null,
        betweenGames: {
          previousGameNumber: 1,
          nextGameNumber: 2,
          startedAt: 10_000,
          deadlineAt: Date.now() + 30_000,
          durationMs: 30_000,
          endReason: "normalWin",
          winnerId: "p1",
          lockingPlayerId: null,
          scoresBefore: rawScores,
          scoresAfter: rawScores,
          startNowRequest: null,
          scoreResult: {
            endType: "normalWin",
            pointsByPlayerId: {
              p1: 5,
              p2: 3,
              p3: 2,
              p4: 1
            },
            lockingPlayerWon: null,
            placements: [
              { playerId: "p1", place: 1, points: 5, pipTotal: 0, tileCount: 0 },
              { playerId: "p2", place: 2, points: 3, pipTotal: 10, tileCount: 2 },
              { playerId: "p3", place: 3, points: 2, pipTotal: 11, tileCount: 3 },
              { playerId: "p4", place: 4, points: 1, pipTotal: 12, tileCount: 3 }
            ]
          }
        }
      }
    });

    const rejected = await postJson(`${baseUrl}/api/rooms/room-start-now-lobby/start-now-request`, {
      playerId: "p5"
    });

    assert.equal(rejected.status, 403);
    assert.match(rejected.body.error, /Only active players/);

    const rejectedVote = await postJson(`${baseUrl}/api/rooms/room-start-now-lobby/start-now-vote`, {
      playerId: "p5",
      agree: true
    });

    assert.equal(rejectedVote.status, 403);
    assert.match(rejectedVote.body.error, /Only active players/);
  } finally {
    await closeTestServer(server);
  }
});

test("seed to board can be used once per player per round", async () => {
  const { server, baseUrl } = await listenToTestServer();

  try {
    await postJson(`${baseUrl}/api/rooms`, {
      roomId: "room-seed",
      hostId: "p1",
      hostName: "Host",
      matchLength: 2
    });
    await postJson(`${baseUrl}/api/rooms/room-seed/join`, {
      playerId: "p2",
      name: "Player 2"
    });
    await postJson(`${baseUrl}/api/rooms/room-seed/join`, {
      playerId: "p3",
      name: "Player 3"
    });
    await postJson(`${baseUrl}/api/rooms/room-seed/join`, {
      playerId: "p4",
      name: "Player 4"
    });
    const started = await postJson(`${baseUrl}/api/rooms/room-seed/start`, {
      playerId: "p1"
    });
    const turnPlayerId = started.body.room.match.game.currentPlayerId;
    const outOfTurnPlayerId = ["p1", "p2", "p3", "p4"].find((playerId) => playerId !== turnPlayerId);

    const firstUse = await postJson(`${baseUrl}/api/rooms/room-seed/seed-to-board`, {
      playerId: turnPlayerId
    });

    assert.equal(firstUse.status, 200);
    assert.equal(firstUse.body.room.match.game.seedToBoardUsedByPlayerId[turnPlayerId], true);
    assert.equal(firstUse.body.room.match.game.lastSeedToBoardReveal.requestedByPlayerId, turnPlayerId);
    assert.equal(Object.keys(firstUse.body.room.match.game.lastSeedToBoardReveal.handCounts).length, 4);

    const outOfTurn = await postJson(`${baseUrl}/api/rooms/room-seed/seed-to-board`, {
      playerId: outOfTurnPlayerId
    });
    assert.equal(outOfTurn.status, 403);

    const secondUse = await postJson(`${baseUrl}/api/rooms/room-seed/seed-to-board`, {
      playerId: turnPlayerId
    });
    assert.equal(secondUse.status, 400);
  } finally {
    await closeTestServer(server);
  }
});

test("stats endpoint returns leaderboard shape", async () => {
  const { server, baseUrl } = await listenToTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/stats`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.leaderboard, []);
    assert.ok(body.records.mostPoints2);
    assert.ok(body.records.mostPoints5);
    assert.ok(body.records.mostLockWins2);
    assert.ok(body.records.lowestScore2);
    assert.ok(body.records.consecutiveWins2);
    assert.ok(body.historicalWinners);
  } finally {
    await closeTestServer(server);
  }
});

async function listenToTestServer() {
  const server = createAppServer({
    statsFilePath: join(tmpdir(), `dominoes-test-${Date.now()}-${Math.random()}.json`),
    adminPassword: "test-admin"
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address();

  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`
  };
}

async function closeTestServer(server) {
  server.closeApp?.();
  await new Promise((resolve) => {
    server.close(resolve);
  });
}

async function getJson(url, token = null) {
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  return {
    status: response.status,
    body: await response.json()
  };
}

async function postJson(url, body, token = null) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });

  return {
    status: response.status,
    body: await response.json()
  };
}

async function putJson(url, body, token) {
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  return {
    status: response.status,
    body: await response.json()
  };
}
