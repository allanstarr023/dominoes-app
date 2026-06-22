import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { DEFAULT_MATCH_SETTINGS } from "./matchEngine.js";

const DEFAULT_DATA = Object.freeze({
  settings: DEFAULT_MATCH_SETTINGS,
  matches: [],
  admin: {
    reports: [],
    actions: [],
    shutdownWindows: [],
    broadcasts: [],
    adminUsers: [],
    portalSettings: {
      maxConcurrentChampionships: 30,
      allowNewChampionships: true
    }
  }
});

export function createStatsStore(options = {}) {
  const {
    filePath,
    adminPassword = process.env.DOMINOES_ADMIN_PASSWORD ?? "admin"
  } = options;
  let cache = null;

  async function load() {
    if (cache) {
      return cache;
    }

    try {
      const content = await readFile(filePath, "utf8");
      cache = normalizeData(JSON.parse(content));
    } catch {
      cache = normalizeData(DEFAULT_DATA);
      await save(cache);
    }

    return cache;
  }

  async function save(data) {
    cache = normalizeData(data);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  }

  return {
    verifyAdminPassword(password) {
      return String(password ?? "") === adminPassword;
    },

    async authenticatePortalAdmin(input = {}) {
      const data = await load();
      const email = canonicalEmail(input.email);

      if (email) {
        const user = data.admin.adminUsers.find((item) => item.email === email);

        if (!user || user.status !== "active" || !verifyAdminUserPassword(user, input.password)) {
          return null;
        }

        return publicAdminUser(user);
      }

      if (String(input.password ?? "") !== adminPassword) {
        return null;
      }

      const primaryUser = data.admin.adminUsers.find((user) => user.id === "admin-primary")
        ?? defaultPrimaryAdminUser();

      if (primaryUser.status !== "active") {
        return null;
      }

      return publicAdminUser(primaryUser);
    },

    async getSettings() {
      const data = await load();
      return data.settings;
    },

    async updateSettings(input, options = {}) {
      const data = await load();
      const settings = normalizeSettings(input);
      const nextData = {
        ...data,
        settings
      };

      await save(nextData);
      await appendAdminAction(nextData, {
        type: "championshipRulesUpdated",
        ...adminActionActor(options),
        roomId: options.roomId,
        summary: "Championship rules updated",
        at: options.now ?? Date.now()
      }, save);

      return settings;
    },

    async recordCompletedMatch(room) {
      if (!room.match || room.match.status !== "completed") {
        return null;
      }

      const data = await load();
      const record = buildMatchRecord(room);

      if (data.matches.some((match) => match.id === record.id)) {
        return record;
      }

      await save({
        ...data,
        matches: [
          ...data.matches,
          record
        ]
      });

      return record;
    },

    async getSnapshot() {
      const data = await load();

      return {
        leaderboard: buildLeaderboard(data.matches),
        historicalWinners: buildHistoricalWinners(data.matches),
        records: buildRecords(data.matches),
        settings: data.settings
      };
    },

    async getPortalSettings() {
      const data = await load();
      return data.admin.portalSettings;
    },

    async updatePortalSettings(input = {}, options = {}) {
      const data = await load();
      const portalSettings = normalizePortalSettings(input);
      const nextData = {
        ...data,
        admin: {
          ...data.admin,
          portalSettings
        }
      };

      await save(nextData);
      await appendAdminAction(nextData, {
        type: "portalSettingsUpdated",
        ...adminActionActor(options),
        summary: `Capacity set to ${portalSettings.maxConcurrentChampionships}, new championships ${portalSettings.allowNewChampionships ? "enabled" : "disabled"}`,
        at: options.now ?? Date.now()
      }, save);

      return portalSettings;
    },

    async createAdminUser(input = {}, options = {}) {
      const data = await load();
      const now = options.now ?? Date.now();
      const email = canonicalEmail(input.email);

      if (!email) {
        throw new Error("Admin email is required.");
      }

      if (data.admin.adminUsers.some((user) => user.email === email)) {
        throw new Error("An admin with this email already exists.");
      }

      if (String(input.password ?? "").length < 8) {
        throw new Error("Admin password must be at least 8 characters.");
      }

      const password = hashAdminPassword(input.password);
      const user = normalizeAdminUser({
        ...input,
        ...password,
        email,
        id: input.id ?? createRecordId("admin-user", now, data.admin.adminUsers.length),
        createdAt: now,
        updatedAt: now
      });
      const nextData = {
        ...data,
        admin: {
          ...data.admin,
          adminUsers: [
            user,
            ...data.admin.adminUsers
          ].slice(0, 100)
        }
      };

      await save(nextData);
      await appendAdminAction(nextData, {
        type: "adminUserCreated",
        ...adminActionActor(options),
        targetName: adminDisplayName(user),
        summary: `Created ${user.role} admin ${adminDisplayName(user)}`,
        at: now
      }, save);

      return publicAdminUser(user);
    },

    async updateAdminUserStatus(adminUserId, status, options = {}) {
      const data = await load();
      const now = options.now ?? Date.now();
      const normalizedStatus = normalizeAdminStatus(status);
      let target = null;
      const adminUsers = data.admin.adminUsers.map((user) => {
        if (user.id !== adminUserId) {
          return user;
        }

        target = normalizeAdminUser({
          ...user,
          status: normalizedStatus,
          updatedAt: now
        });
        return target;
      });

      if (!target) {
        throw new Error("Admin user not found.");
      }

      const nextData = {
        ...data,
        admin: {
          ...data.admin,
          adminUsers
        }
      };

      await save(nextData);
      await appendAdminAction(nextData, {
        type: "adminUserStatusUpdated",
        ...adminActionActor(options),
        targetName: adminDisplayName(target),
        summary: `${adminDisplayName(target)} set to ${target.status}`,
        at: now
      }, save);

      return publicAdminUser(target);
    },

    async createModerationReport(input = {}) {
      const data = await load();
      const now = input.now ?? Date.now();
      const report = normalizeReport({
        ...input,
        id: input.id ?? createRecordId("report", now, data.admin.reports.length),
        createdAt: now,
        status: "open"
      });

      await save({
        ...data,
        admin: {
          ...data.admin,
          reports: [
            report,
            ...data.admin.reports
          ].slice(0, 500)
        }
      });

      return report;
    },

    async resolveModerationReport(reportId, input = {}) {
      const data = await load();
      const now = input.now ?? Date.now();
      let target = null;
      const reports = data.admin.reports.map((report) => {
        if (report.id !== reportId) {
          return report;
        }

        target = {
          ...report,
          status: input.status ?? "reviewed",
          reviewedAt: now,
          resolution: input.resolution ?? null
        };
        return target;
      });

      if (!target) {
        throw new Error("Report not found.");
      }

      const nextData = {
        ...data,
        admin: {
          ...data.admin,
          reports
        }
      };

      await save(nextData);
      await appendAdminAction(nextData, {
        type: "reportResolved",
        ...adminActionActor(input),
        roomId: target.roomId,
        targetPlayerId: target.targetPlayerId,
        summary: `Report ${target.id} marked ${target.status}`,
        at: now
      }, save);

      return target;
    },

    async recordAdminAction(input = {}) {
      const data = await load();
      return appendAdminAction(data, input, save);
    },

    async createShutdownWindow(input = {}) {
      const data = await load();
      const now = input.now ?? Date.now();
      const shutdown = normalizeShutdown({
        ...input,
        id: input.id ?? createRecordId("shutdown", now, data.admin.shutdownWindows.length),
        createdAt: now
      });
      const nextData = {
        ...data,
        admin: {
          ...data.admin,
          shutdownWindows: [
            shutdown,
            ...data.admin.shutdownWindows
          ].slice(0, 100)
        }
      };

      await save(nextData);
      await appendAdminAction(nextData, {
        type: "shutdownScheduled",
        ...adminActionActor(input),
        summary: `${shutdown.mode} shutdown scheduled`,
        at: now
      }, save);

      return shutdown;
    },

    async getActiveShutdown(now = Date.now()) {
      const data = await load();
      return activeShutdown(data.admin.shutdownWindows, now);
    },

    async createBroadcast(input = {}) {
      const data = await load();
      const now = input.now ?? Date.now();
      const broadcast = normalizeBroadcast({
        ...input,
        id: input.id ?? createRecordId("broadcast", now, data.admin.broadcasts.length),
        createdAt: now
      });
      const nextData = {
        ...data,
        admin: {
          ...data.admin,
          broadcasts: [
            broadcast,
            ...data.admin.broadcasts
          ].slice(0, 100)
        }
      };

      await save(nextData);
      await appendAdminAction(nextData, {
        type: "broadcastSent",
        ...adminActionActor(input),
        summary: broadcast.message,
        at: now
      }, save);

      return broadcast;
    },

    async getPortalSnapshot(now = Date.now()) {
      const data = await load();
      const openReports = data.admin.reports.filter((report) => report.status === "open");

      return {
        portalSettings: data.admin.portalSettings,
        activeShutdown: activeShutdown(data.admin.shutdownWindows, now),
        reports: openReports,
        recentReports: data.admin.reports.slice(0, 50),
        shutdownWindows: data.admin.shutdownWindows.slice(0, 20),
        broadcasts: data.admin.broadcasts.slice(0, 20),
        adminUsers: data.admin.adminUsers.map(publicAdminUser),
        auditLog: data.admin.actions.slice(0, 80)
      };
    }
  };
}

export function normalizeSettings(input = {}) {
  const scoring = input.scoring ?? {};

  return {
    scoring: {
      first: intSetting(scoring.first, DEFAULT_MATCH_SETTINGS.scoring.first, 0, 100),
      second: intSetting(scoring.second, DEFAULT_MATCH_SETTINGS.scoring.second, 0, 100),
      third: intSetting(scoring.third, DEFAULT_MATCH_SETTINGS.scoring.third, 0, 100),
      fourth: intSetting(scoring.fourth, DEFAULT_MATCH_SETTINGS.scoring.fourth, 0, 100),
      lockWin: intSetting(scoring.lockWin, DEFAULT_MATCH_SETTINGS.scoring.lockWin, 0, 100),
      lockLose: intSetting(scoring.lockLose, DEFAULT_MATCH_SETTINGS.scoring.lockLose, -100, 100)
    },
    turnDurationMs: turnDurationSetting(input.turnDurationMs, DEFAULT_MATCH_SETTINGS.turnDurationMs),
    betweenGamesDurationMs: intSetting(input.betweenGamesDurationMs, DEFAULT_MATCH_SETTINGS.betweenGamesDurationMs, 0, 300_000),
    finalReviewDurationMs: intSetting(input.finalReviewDurationMs, DEFAULT_MATCH_SETTINGS.finalReviewDurationMs, 0, 300_000),
    bathroomBreakDurationMs: intSetting(input.bathroomBreakDurationMs, DEFAULT_MATCH_SETTINGS.bathroomBreakDurationMs, 0, 600_000),
    seedToBoardRevealDurationMs: seedRevealDurationSetting(input.seedToBoardRevealDurationMs, DEFAULT_MATCH_SETTINGS.seedToBoardRevealDurationMs),
    slamUsesPerGame: intSetting(input.slamUsesPerGame, DEFAULT_MATCH_SETTINGS.slamUsesPerGame, 1, 3),
    takeDatUsesPerGame: intSetting(input.takeDatUsesPerGame, DEFAULT_MATCH_SETTINGS.takeDatUsesPerGame, 1, 3),
    infractionsPerPenalty: intSetting(input.infractionsPerPenalty, DEFAULT_MATCH_SETTINGS.infractionsPerPenalty, 1, 20),
    penaltyPoints: intSetting(input.penaltyPoints, DEFAULT_MATCH_SETTINGS.penaltyPoints, -100, 0)
  };
}

function normalizeData(data) {
  return {
    settings: normalizeSettings(data.settings ?? DEFAULT_MATCH_SETTINGS),
    matches: Array.isArray(data.matches) ? data.matches : [],
    admin: normalizeAdminData(data.admin)
  };
}

function normalizeAdminData(admin = {}) {
  return {
    reports: Array.isArray(admin.reports) ? admin.reports.map(normalizeReport) : [],
    actions: Array.isArray(admin.actions) ? admin.actions.map(normalizeAdminAction) : [],
    shutdownWindows: Array.isArray(admin.shutdownWindows) ? admin.shutdownWindows.map(normalizeShutdown) : [],
    broadcasts: Array.isArray(admin.broadcasts) ? admin.broadcasts.map(normalizeBroadcast) : [],
    adminUsers: normalizeAdminUsers(admin.adminUsers),
    portalSettings: normalizePortalSettings(admin.portalSettings)
  };
}

function buildMatchRecord(room) {
  const match = room.match;
  const finalScores = match.finalScores ?? {};
  const participantOrder = match.rosterOrder ?? match.playerOrder;
  const lockWinsByPlayerId = Object.fromEntries(participantOrder.map((playerId) => [playerId, 0]));

  for (const game of match.completedGames) {
    if (game.endReason === "regularLock" && game.lockingPlayerId && game.scoreResult?.lockingPlayerWon) {
      lockWinsByPlayerId[game.lockingPlayerId] = (lockWinsByPlayerId[game.lockingPlayerId] ?? 0) + 1;
    }
  }

  const players = participantOrder.map((playerId) => ({
    playerId,
    name: playerName(room, playerId),
    score: finalScores[playerId] ?? 0,
    rawScore: match.rawScores[playerId] ?? 0,
    infractions: match.infractions[playerId] ?? 0,
    lockWins: lockWinsByPlayerId[playerId] ?? 0,
    won: match.winnerIds.includes(playerId)
  }));

  return {
    id: `${room.id}-${match.id}-${match.completedAt}`,
    roomId: room.id,
    matchId: match.id,
    matchLength: match.matchLength,
    completedAt: match.completedAt,
    winners: match.winnerIds.map((playerId) => ({
      playerId,
      name: playerName(room, playerId),
      score: finalScores[playerId] ?? 0
    })),
    players
  };
}

function buildLeaderboard(matches) {
  const totals = new Map();

  for (const match of matches) {
    for (const winner of match.winners ?? []) {
      const key = playerKey(winner.name);
      const total = totals.get(key) ?? {
        name: winner.name,
        wins: 0,
        totalWinningScore: 0,
        lastWonAt: 0
      };

      total.wins += 1;
      total.totalWinningScore += winner.score;
      total.lastWonAt = Math.max(total.lastWonAt, match.completedAt ?? 0);
      totals.set(key, total);
    }
  }

  return [...totals.values()]
    .sort((first, second) => second.wins - first.wins
      || second.totalWinningScore - first.totalWinningScore
      || second.lastWonAt - first.lastWonAt)
    .slice(0, 10);
}

function buildHistoricalWinners(matches) {
  return [...matches]
    .sort((first, second) => (second.completedAt ?? 0) - (first.completedAt ?? 0))
    .slice(0, 20)
    .map((match) => ({
      id: match.id,
      completedAt: match.completedAt,
      matchLength: match.matchLength,
      winners: match.winners
    }));
}

function buildRecords(matches) {
  return {
    mostPoints2: playerMatchEntries(matches, 2, "score").sort(descValue).slice(0, 10),
    mostPoints5: playerMatchEntries(matches, 5, "score").sort(descValue).slice(0, 10),
    mostPoints10: playerMatchEntries(matches, 10, "score").sort(descValue).slice(0, 10),
    mostLockWins2: playerMatchEntries(matches, 2, "lockWins").filter((entry) => entry.value > 0).sort(descValue).slice(0, 10),
    mostLockWins5: playerMatchEntries(matches, 5, "lockWins").filter((entry) => entry.value > 0).sort(descValue).slice(0, 10),
    mostLockWins10: playerMatchEntries(matches, 10, "lockWins").filter((entry) => entry.value > 0).sort(descValue).slice(0, 10),
    lowestScore2: playerMatchEntries(matches, 2, "score").sort(ascValue).slice(0, 10),
    lowestScore5: playerMatchEntries(matches, 5, "score").sort(ascValue).slice(0, 10),
    lowestScore10: playerMatchEntries(matches, 10, "score").sort(ascValue).slice(0, 10),
    consecutiveWins2: buildConsecutiveWins(matches, 2),
    consecutiveWins5: buildConsecutiveWins(matches, 5),
    consecutiveWins10: buildConsecutiveWins(matches, 10)
  };
}

function playerMatchEntries(matches, matchLength, field) {
  return matches
    .filter((match) => match.matchLength === matchLength)
    .flatMap((match) => match.players.map((player) => ({
      name: player.name,
      value: player[field] ?? 0,
      matchLength,
      completedAt: match.completedAt,
      matchId: match.id
    })));
}

function buildConsecutiveWins(matches, matchLength) {
  const streaks = new Map();
  const best = new Map();

  for (const match of [...matches].filter((item) => item.matchLength === matchLength).sort((first, second) => (first.completedAt ?? 0) - (second.completedAt ?? 0))) {
    for (const player of match.players) {
      const key = playerKey(player.name);
      const current = player.won ? (streaks.get(key)?.value ?? 0) + 1 : 0;
      const entry = {
        name: player.name,
        value: current,
        matchLength,
        completedAt: match.completedAt,
        matchId: match.id
      };

      streaks.set(key, entry);

      if (current > (best.get(key)?.value ?? 0)) {
        best.set(key, entry);
      }
    }
  }

  return [...best.values()]
    .filter((entry) => entry.value > 0)
    .sort(descValue)
    .slice(0, 10);
}

function descValue(first, second) {
  return second.value - first.value || (second.completedAt ?? 0) - (first.completedAt ?? 0);
}

function ascValue(first, second) {
  return first.value - second.value || (second.completedAt ?? 0) - (first.completedAt ?? 0);
}

function playerName(room, playerId) {
  return room.seats.find((seat) => seat.playerId === playerId)?.name ?? playerId;
}

function playerKey(name) {
  return String(name ?? "").trim().toLowerCase();
}

async function appendAdminAction(data, input = {}, save) {
  const now = input.at ?? input.now ?? Date.now();
  const action = normalizeAdminAction({
    ...input,
    id: input.id ?? createRecordId("action", now, data.admin.actions.length),
    at: now
  });

  await save({
    ...data,
    admin: {
      ...data.admin,
      actions: [
        action,
        ...data.admin.actions
      ].slice(0, 500)
    }
  });

  return action;
}

function normalizePortalSettings(input = {}) {
  return {
    maxConcurrentChampionships: intSetting(input.maxConcurrentChampionships, DEFAULT_DATA.admin.portalSettings.maxConcurrentChampionships, 1, 500),
    allowNewChampionships: input.allowNewChampionships !== false
  };
}

function turnDurationSetting(value, fallback) {
  const number = intSetting(value, fallback, 25_000, 45_000);

  return [25_000, 30_000, 45_000].includes(number) ? number : fallback;
}

function normalizeReport(input = {}) {
  return {
    id: String(input.id ?? ""),
    source: ["system", "peer"].includes(input.source) ? input.source : "peer",
    status: ["open", "reviewed", "dismissed", "actioned"].includes(input.status) ? input.status : "open",
    roomId: String(input.roomId ?? ""),
    roomStatus: input.roomStatus ?? null,
    reporterPlayerId: input.reporterPlayerId ? String(input.reporterPlayerId) : null,
    reporterName: input.reporterName ? String(input.reporterName).slice(0, 80) : null,
    targetPlayerId: String(input.targetPlayerId ?? input.playerId ?? ""),
    targetName: String(input.targetName ?? input.playerName ?? input.targetPlayerId ?? "").slice(0, 80),
    messageId: input.messageId ? String(input.messageId) : null,
    messageText: String(input.messageText ?? input.text ?? "").slice(0, 500),
    reason: String(input.reason ?? "Offensive language").slice(0, 160),
    createdAt: Number(input.createdAt ?? Date.now()),
    reviewedAt: input.reviewedAt ? Number(input.reviewedAt) : null,
    resolution: input.resolution ? String(input.resolution).slice(0, 200) : null
  };
}

function normalizeAdminAction(input = {}) {
  return {
    id: String(input.id ?? ""),
    type: String(input.type ?? "adminAction").slice(0, 80),
    adminTokenId: input.adminTokenId ? String(input.adminTokenId) : null,
    adminUserId: input.adminUserId ? String(input.adminUserId) : null,
    adminName: input.adminName ? String(input.adminName).slice(0, 100) : null,
    adminEmail: input.adminEmail ? canonicalEmail(input.adminEmail) : null,
    adminRole: input.adminRole ? String(input.adminRole).slice(0, 40) : null,
    roomId: input.roomId ? String(input.roomId) : null,
    targetPlayerId: input.targetPlayerId ? String(input.targetPlayerId) : null,
    targetName: input.targetName ? String(input.targetName).slice(0, 80) : null,
    summary: String(input.summary ?? "").slice(0, 300),
    at: Number(input.at ?? Date.now())
  };
}

function adminActionActor(input = {}) {
  return {
    adminTokenId: input.adminTokenId,
    adminUserId: input.adminUserId,
    adminName: input.adminName,
    adminEmail: input.adminEmail,
    adminRole: input.adminRole
  };
}

function normalizeShutdown(input = {}) {
  const rawStartAt = Number(input.startAt);
  const startAt = Number.isFinite(rawStartAt) ? rawStartAt : Date.now();
  const rawEndAt = Number(input.endAt);
  const endAt = Math.max(startAt + 60_000, Number.isFinite(rawEndAt) ? rawEndAt : startAt + 24 * 60 * 60_000);
  const mode = ["blockNew", "letActiveFinish", "forceEnd"].includes(input.mode)
    ? input.mode
    : "letActiveFinish";

  return {
    id: String(input.id ?? ""),
    mode,
    message: String(input.message ?? "The portal is temporarily unavailable.").slice(0, 220),
    startAt,
    endAt,
    createdAt: Number(input.createdAt ?? Date.now())
  };
}

function normalizeBroadcast(input = {}) {
  const audience = ["all", "activeRooms", "lobby"].includes(input.audience) ? input.audience : "all";
  const createdAt = Number(input.createdAt ?? Date.now());

  return {
    id: String(input.id ?? ""),
    audience,
    message: String(input.message ?? "").trim().slice(0, 260),
    createdAt,
    expiresAt: input.expiresAt ? Number(input.expiresAt) : createdAt + 60_000
  };
}

function normalizeAdminUsers(input = []) {
  const users = Array.isArray(input) ? input.map(normalizeAdminUser) : [];

  if (!users.some((user) => user.id === "admin-primary")) {
    users.push(defaultPrimaryAdminUser());
  }

  return users;
}

function defaultPrimaryAdminUser() {
  return normalizeAdminUser({
    id: "admin-primary",
    firstName: "Portal",
    lastName: "Admin",
    email: "admin@local",
    role: "owner",
    status: "active",
    createdAt: 0,
    updatedAt: 0
  });
}

function normalizeAdminUser(input = {}) {
  return {
    id: String(input.id ?? ""),
    firstName: String(input.firstName ?? "").trim().slice(0, 60),
    lastName: String(input.lastName ?? "").trim().slice(0, 60),
    email: canonicalEmail(input.email),
    role: normalizeAdminRole(input.role),
    status: normalizeAdminStatus(input.status),
    profilePictureDataUrl: normalizeProfilePicture(input.profilePictureDataUrl),
    passwordSalt: input.passwordSalt ? String(input.passwordSalt) : null,
    passwordHash: input.passwordHash ? String(input.passwordHash) : null,
    createdAt: Number(input.createdAt ?? Date.now()),
    updatedAt: Number(input.updatedAt ?? input.createdAt ?? Date.now())
  };
}

function publicAdminUser(user) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    status: user.status,
    profilePictureDataUrl: user.profilePictureDataUrl,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function adminDisplayName(user) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || user.id;
}

function canonicalEmail(value) {
  return String(value ?? "").trim().toLowerCase().slice(0, 160);
}

function normalizeAdminRole(role) {
  return ["owner", "manager", "moderator", "viewer"].includes(role) ? role : "moderator";
}

function normalizeAdminStatus(status) {
  return status === "inactive" ? "inactive" : "active";
}

function normalizeProfilePicture(value) {
  const text = String(value ?? "");

  if (!text.startsWith("data:image/")) {
    return "";
  }

  return text.slice(0, 250_000);
}

function hashAdminPassword(password) {
  const passwordSalt = randomBytes(16).toString("hex");
  const passwordHash = createHash("sha256")
    .update(`${passwordSalt}:${String(password ?? "")}`)
    .digest("hex");

  return { passwordSalt, passwordHash };
}

function verifyAdminUserPassword(user, password) {
  if (!user.passwordSalt || !user.passwordHash) {
    return false;
  }

  const candidate = createHash("sha256")
    .update(`${user.passwordSalt}:${String(password ?? "")}`)
    .digest("hex");
  const expected = Buffer.from(user.passwordHash, "hex");
  const actual = Buffer.from(candidate, "hex");

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function activeShutdown(windows, now) {
  return windows.find((window) => window.startAt <= now && window.endAt > now) ?? null;
}

function createRecordId(prefix, now, count) {
  return `${prefix}-${now.toString(36)}-${String(count + 1).padStart(3, "0")}`;
}

function intSetting(value, fallback, min, max) {
  const number = Number(value ?? fallback);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(number)));
}

function seedRevealDurationSetting(value, fallback) {
  const number = Number(value ?? fallback);
  const allowed = [10_000, 15_000, 20_000];

  if (!Number.isFinite(number)) {
    return fallback;
  }

  const rounded = Math.round(number / 1000) * 1000;
  if (allowed.includes(rounded)) {
    return rounded;
  }

  return rounded < 15_000 ? 10_000 : rounded < 20_000 ? 15_000 : 20_000;
}
