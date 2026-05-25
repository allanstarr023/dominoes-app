import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { DEFAULT_MATCH_SETTINGS } from "./matchEngine.js";

const DEFAULT_DATA = Object.freeze({
  settings: DEFAULT_MATCH_SETTINGS,
  matches: []
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

    async getSettings() {
      const data = await load();
      return data.settings;
    },

    async updateSettings(input) {
      const data = await load();
      const settings = normalizeSettings(input);

      await save({
        ...data,
        settings
      });

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
    turnDurationMs: intSetting(input.turnDurationMs, DEFAULT_MATCH_SETTINGS.turnDurationMs, 5_000, 300_000),
    betweenGamesDurationMs: intSetting(input.betweenGamesDurationMs, DEFAULT_MATCH_SETTINGS.betweenGamesDurationMs, 0, 300_000),
    finalReviewDurationMs: intSetting(input.finalReviewDurationMs, DEFAULT_MATCH_SETTINGS.finalReviewDurationMs, 0, 300_000),
    bathroomBreakDurationMs: intSetting(input.bathroomBreakDurationMs, DEFAULT_MATCH_SETTINGS.bathroomBreakDurationMs, 0, 600_000),
    seedToBoardRevealDurationMs: seedRevealDurationSetting(input.seedToBoardRevealDurationMs, DEFAULT_MATCH_SETTINGS.seedToBoardRevealDurationMs),
    infractionsPerPenalty: intSetting(input.infractionsPerPenalty, DEFAULT_MATCH_SETTINGS.infractionsPerPenalty, 1, 20),
    penaltyPoints: intSetting(input.penaltyPoints, DEFAULT_MATCH_SETTINGS.penaltyPoints, -100, 0)
  };
}

function normalizeData(data) {
  return {
    settings: normalizeSettings(data.settings ?? DEFAULT_MATCH_SETTINGS),
    matches: Array.isArray(data.matches) ? data.matches : []
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
