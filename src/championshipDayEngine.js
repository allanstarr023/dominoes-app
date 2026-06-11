import {
  handPipTotal,
  rankPlayersByHand
} from "./dominoesEngine.js";

export const CHAMPIONSHIP_DAY_STATUS = Object.freeze({
  ACTIVE: "active",
  COMPLETED: "completed"
});

export const CHAMPIONSHIP_DAY_GAMES_PER_ROUND = 5;
export const CHAMPIONSHIP_DAY_PLAYERS_PER_TABLE = 4;
export const CHAMPIONSHIP_DAY_TABLE_LABELS = Object.freeze(["Table A", "Table B", "Table C", "Table D"]);
export const CHAMPIONSHIP_DAY_SUPPORTED_TABLE_COUNTS = Object.freeze([2, 3, 4]);
export const CHAMPIONSHIP_DAY_SCORE_VALUES = Object.freeze([0, 1, 2, 3, 5, 6]);

export function createChampionshipSession(input = {}) {
  const {
    id = `day-${Date.now()}`,
    name = "Championship Day",
    location = "",
    tableCount,
    players,
    startTime = new Date().toISOString(),
    expectedEndTime = null
  } = input;

  assertSupportedTableCount(tableCount);

  const normalizedPlayers = normalizePlayers(players, tableCount * CHAMPIONSHIP_DAY_PLAYERS_PER_TABLE);

  return {
    id,
    name: String(name || "Championship Day").trim(),
    location: String(location ?? "").trim(),
    tableCount,
    status: CHAMPIONSHIP_DAY_STATUS.ACTIVE,
    startTime,
    expectedEndTime,
    endTime: null,
    players: normalizedPlayers,
    currentRoundNumber: 1,
    currentTables: assignPlayersToStartingTables(normalizedPlayers, tableCount),
    rounds: [],
    editHistory: [],
    finalLeaderboard: null
  };
}

export function assignPlayersToStartingTables(players, tableCount) {
  assertSupportedTableCount(tableCount);

  const normalizedPlayers = normalizePlayers(players, tableCount * CHAMPIONSHIP_DAY_PLAYERS_PER_TABLE);

  return tableLabelsForCount(tableCount).map((label, index) => ({
    id: tableIdForLabel(label),
    label,
    playerIds: normalizedPlayers
      .slice(index * CHAMPIONSHIP_DAY_PLAYERS_PER_TABLE, (index + 1) * CHAMPIONSHIP_DAY_PLAYERS_PER_TABLE)
      .map((player) => player.id)
  }));
}

export function validateRoundScoreEntries(championship, roundInput) {
  const errors = [];
  const tables = [];
  const normalizedTables = normalizeRoundTables(roundInput);

  if (!championship || championship.status !== CHAMPIONSHIP_DAY_STATUS.ACTIVE) {
    pushValidationError(errors, tables, {
      code: "championshipInactive",
      message: "Championship is not active."
    });
  }

  for (const table of championship?.currentTables ?? []) {
    const tableEntry = normalizedTables.get(table.id);
    const tableValidation = {
      tableId: table.id,
      tableLabel: table.label,
      valid: true,
      errors: []
    };

    tables.push(tableValidation);

    if (!tableEntry) {
      pushValidationError(errors, tableValidation, {
        code: "missingTable",
        message: `${table.label} is missing from the round entry.`
      });
      continue;
    }

    validateTableEntry(table, tableEntry, errors, tableValidation);
  }

  for (const tableId of normalizedTables.keys()) {
    if (!championship?.currentTables?.some((table) => table.id === tableId)) {
      pushValidationError(errors, tables, {
        code: "unknownTable",
        tableId,
        message: `Unknown table in round entry: ${tableId}.`
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    tables
  };
}

export function recordRound(championship, roundInput, options = {}) {
  assertActiveChampionship(championship);

  const validation = validateRoundScoreEntries(championship, roundInput);

  if (!validation.valid) {
    throw new Error(`Invalid round score entries: ${validation.errors.join(" ")}`);
  }

  const roundNumber = Number(roundInput.roundNumber ?? championship.rounds.length + 1);

  if (roundNumber !== championship.rounds.length + 1) {
    throw new Error(`Expected round ${championship.rounds.length + 1}, received round ${roundNumber}.`);
  }

  const tableResults = rankPlayersPerTableAfterRound(championship, roundInput, options);
  const unresolved = tableResults.flatMap((table) => table.unresolvedTieGroups);

  if (unresolved.length > 0) {
    throw new Error("Tie breaker pull required before this round can be finalized.");
  }

  const nextTables = calculateNextRoundTableAssignments(championship, tableResults);
  const round = {
    number: roundNumber,
    completedAt: options.completedAt ?? new Date().toISOString(),
    startingTables: cloneTables(championship.currentTables),
    tableResults,
    nextTables
  };

  const rounds = [...championship.rounds, round];

  return {
    ...championship,
    currentRoundNumber: roundNumber + 1,
    currentTables: nextTables,
    rounds,
    finalLeaderboard: null
  };
}

export function editRound(championship, roundNumber, roundInput, options = {}) {
  if (!championship || !Array.isArray(championship.rounds)) {
    throw new Error("Championship is required.");
  }

  const targetRoundNumber = Number(roundNumber);
  const targetIndex = championship.rounds.findIndex((round) => round.number === targetRoundNumber);

  if (targetIndex < 0) {
    throw new Error(`Round ${targetRoundNumber} was not found.`);
  }

  const previousRound = championship.rounds[targetIndex];
  const replayInputs = championship.rounds.map((round, index) => (
    index === targetIndex
      ? normalizeRoundInputForReplay(roundInput, round.number)
      : roundInputFromRecordedRound(round)
  ));
  const replayOptions = championship.rounds.map((round, index) => (
    index === targetIndex
      ? {
          ...(options.roundOptions ?? options),
          completedAt: options.completedAt ?? round.completedAt
        }
      : {
          completedAt: round.completedAt,
          tieBreakerPulls: tieBreakerPullsFromRecordedRound(round)
        }
  ));
  let replayed = {
    ...championship,
    status: CHAMPIONSHIP_DAY_STATUS.ACTIVE,
    currentRoundNumber: 1,
    currentTables: cloneTables(championship.rounds[0]?.startingTables ?? assignPlayersToStartingTables(championship.players, championship.tableCount)),
    rounds: [],
    finalLeaderboard: null
  };

  for (let index = 0; index < replayInputs.length; index += 1) {
    replayed = recordRound(replayed, replayInputs[index], replayOptions[index]);
  }

  const changedLaterAssignments = championship.rounds
    .slice(targetIndex)
    .some((round, index) => !tablesEqual(round.nextTables, replayed.rounds[targetIndex + index]?.nextTables));
  const editEntry = {
    roundNumber: targetRoundNumber,
    editedAt: options.editedAt ?? new Date().toISOString(),
    editedByAdmin: options.editedByAdmin ?? null,
    previousValues: roundInputFromRecordedRound(previousRound),
    newValues: roundInputFromRecordedRound(replayed.rounds[targetIndex]),
    changedLaterAssignments,
    subsequentRoundsRecalculated: Math.max(0, championship.rounds.length - targetRoundNumber)
  };
  const restored = {
    ...championship,
    currentRoundNumber: replayed.currentRoundNumber,
    currentTables: replayed.currentTables,
    rounds: replayed.rounds,
    editHistory: [...(championship.editHistory ?? []), editEntry],
    finalLeaderboard: null
  };

  if (championship.status === CHAMPIONSHIP_DAY_STATUS.COMPLETED) {
    return {
      ...restored,
      status: CHAMPIONSHIP_DAY_STATUS.COMPLETED,
      endTime: championship.endTime,
      finalLeaderboard: calculateOverallLeaderboard(restored)
    };
  }

  return {
    ...restored,
    status: championship.status
  };
}

export function rankPlayersPerTableAfterRound(championship, roundInput, options = {}) {
  const normalizedTables = normalizeRoundTables(roundInput);
  const tieBreakerPulls = options.tieBreakerPulls ?? roundInput.tieBreakerPulls ?? {};

  return championship.currentTables.map((table) => {
    const tableEntry = normalizedTables.get(table.id);
    const stats = buildTableStats(table, tableEntry);
    const ranked = rankStats(stats, table, tieBreakerPulls[table.id] ?? {});

    return {
      tableId: table.id,
      tableLabel: table.label,
      playerIds: [...table.playerIds],
      games: normalizeGames(tableEntry.games),
      rankings: ranked.rankings.map((ranking) => ({
        ...ranking,
        playerName: playerName(championship, ranking.playerId)
      })),
      unresolvedTieGroups: ranked.unresolvedTieGroups
    };
  });
}

export function calculateNextRoundTableAssignments(championship, tableResults = championship.rounds.at(-1)?.tableResults) {
  if (!tableResults || tableResults.length !== championship.tableCount) {
    throw new Error("Table results are required to calculate next round assignments.");
  }

  return championship.currentTables.map((table, index) => {
    const currentResult = tableResults.find((result) => result.tableId === table.id);
    const sourceIndex = (index - 1 + championship.tableCount) % championship.tableCount;
    const sourceTable = championship.currentTables[sourceIndex];
    const sourceResult = tableResults.find((result) => result.tableId === sourceTable.id);
    const stayers = playersAtPlaces(currentResult, [1, 2]);
    const incoming = playersAtPlaces(sourceResult, [3, 4]);

    return {
      id: table.id,
      label: table.label,
      playerIds: [...stayers, ...incoming]
    };
  });
}

export function calculateOverallLeaderboard(championship) {
  const totals = new Map(championship.players.map((player) => [player.id, emptyStats(player.id)]));

  for (const round of championship.rounds) {
    for (const tableResult of round.tableResults) {
      for (const ranking of tableResult.rankings) {
        const total = totals.get(ranking.playerId) ?? emptyStats(ranking.playerId);

        addStats(total, ranking);
        total.roundsPlayed += 1;
        total.currentTableId = championship.currentTables.find((table) => table.playerIds.includes(ranking.playerId))?.id ?? null;
        total.currentTableLabel = championship.currentTables.find((table) => table.playerIds.includes(ranking.playerId))?.label ?? null;
        totals.set(ranking.playerId, total);
      }
    }
  }

  return Array.from(totals.values())
    .sort(compareStats)
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
      playerName: playerName(championship, entry.playerId)
    }));
}

export function endChampionship(championship, options = {}) {
  assertActiveChampionship(championship);

  const finalLeaderboard = calculateOverallLeaderboard(championship);

  return {
    ...championship,
    status: CHAMPIONSHIP_DAY_STATUS.COMPLETED,
    endTime: options.endTime ?? new Date().toISOString(),
    finalLeaderboard
  };
}

export function tableLabelsForCount(tableCount) {
  assertSupportedTableCount(tableCount);

  return CHAMPIONSHIP_DAY_TABLE_LABELS.slice(0, tableCount);
}

function validateTableEntry(table, tableEntry, errors, tableValidation) {
  const games = normalizeGames(tableEntry.games);

  if (games.length !== CHAMPIONSHIP_DAY_GAMES_PER_ROUND) {
    pushValidationError(errors, tableValidation, {
      code: "invalidGameCount",
      expected: CHAMPIONSHIP_DAY_GAMES_PER_ROUND,
      actual: games.length,
      message: `${table.label} must have exactly ${CHAMPIONSHIP_DAY_GAMES_PER_ROUND} games.`
    });
  }

  const roundCounts = emptyPlacementCounts();

  games.forEach((game, gameIndex) => {
    const gameNumber = game.gameNumber || gameIndex + 1;
    const gameCounts = emptyPlacementCounts();
    const seen = new Set();

    for (const score of game.scores) {
      if (seen.has(score.playerId)) {
        pushValidationError(errors, tableValidation, {
          code: "duplicatePlayerScore",
          gameNumber,
          playerId: score.playerId,
          message: `${table.label} game ${gameNumber} has duplicate score for ${score.playerId}.`
        });
      }

      seen.add(score.playerId);

      if (!table.playerIds.includes(score.playerId)) {
        pushValidationError(errors, tableValidation, {
          code: "wrongTablePlayer",
          gameNumber,
          playerId: score.playerId,
          message: `${table.label} game ${gameNumber} includes player ${score.playerId} who is not assigned to this table.`
        });
      }

      if (!CHAMPIONSHIP_DAY_SCORE_VALUES.includes(score.points)) {
        pushValidationError(errors, tableValidation, {
          code: "invalidScoreValue",
          gameNumber,
          playerId: score.playerId,
          value: score.points,
          allowedValues: [...CHAMPIONSHIP_DAY_SCORE_VALUES],
          message: `${table.label} game ${gameNumber} has invalid score ${score.points} for ${score.playerId}.`
        });
        continue;
      }

      countPlacement(gameCounts, score.points);
      countPlacement(roundCounts, score.points);
    }

    for (const playerId of table.playerIds) {
      if (!seen.has(playerId)) {
        pushValidationError(errors, tableValidation, {
          code: "missingPlayerScore",
          gameNumber,
          playerId,
          message: `${table.label} game ${gameNumber} is missing score for ${playerId}.`
        });
      }
    }

    if (game.scores.length !== CHAMPIONSHIP_DAY_PLAYERS_PER_TABLE) {
      pushValidationError(errors, tableValidation, {
        code: "invalidPlayerScoreCount",
        gameNumber,
        expected: CHAMPIONSHIP_DAY_PLAYERS_PER_TABLE,
        actual: game.scores.length,
        message: `${table.label} game ${gameNumber} must have exactly ${CHAMPIONSHIP_DAY_PLAYERS_PER_TABLE} scores.`
      });
    }

    if (!placementCountsEqual(gameCounts, { first: 1, second: 1, third: 1, fourth: 1 })) {
      pushValidationError(errors, tableValidation, {
        code: "invalidGamePlacements",
        gameNumber,
        counts: gameCounts,
        expected: { first: 1, second: 1, third: 1, fourth: 1 },
        message: `${table.label} game ${gameNumber} must contain one 1st, one 2nd, one 3rd, and one 4th place result.`
      });
    }
  });

  if (!placementCountsEqual(roundCounts, { first: 5, second: 5, third: 5, fourth: 5 })) {
    pushValidationError(errors, tableValidation, {
      code: "invalidRoundPlacements",
      counts: roundCounts,
      expected: { first: 5, second: 5, third: 5, fourth: 5 },
      message: `${table.label} round totals must contain five 1st, five 2nd, five 3rd, and five 4th place results.`
    });
  }
}

function pushValidationError(errors, target, detail) {
  errors.push(detail.message);

  if (Array.isArray(target)) {
    target.push({
      tableId: detail.tableId ?? null,
      tableLabel: detail.tableLabel ?? null,
      valid: false,
      errors: [detail]
    });
    return;
  }

  target.valid = false;
  target.errors.push(detail);
}

function buildTableStats(table, tableEntry) {
  const stats = new Map(table.playerIds.map((playerId) => [playerId, emptyStats(playerId)]));

  for (const game of normalizeGames(tableEntry.games)) {
    for (const score of game.scores) {
      const entry = stats.get(score.playerId) ?? emptyStats(score.playerId);

      applyScore(entry, score.points);
      stats.set(score.playerId, entry);
    }
  }

  return Array.from(stats.values());
}

function rankStats(stats, table, tieBreakerPulls) {
  const unresolvedTieGroups = [];
  const rankings = [];
  const sortedStats = [...stats].sort(compareStats);

  for (let index = 0; index < sortedStats.length;) {
    const tied = sortedStats
      .slice(index)
      .filter((entry) => compareStatsWithoutName(sortedStats[index], entry) === 0);

    if (tied.length === 1) {
      rankings.push({ ...sortedStats[index], place: rankings.length + 1 });
      index += 1;
      continue;
    }

    const hands = Object.fromEntries(
      tied
        .filter((entry) => Array.isArray(tieBreakerPulls[entry.playerId]))
        .map((entry) => [entry.playerId, tieBreakerPulls[entry.playerId]])
    );

    if (Object.keys(hands).length !== tied.length) {
      unresolvedTieGroups.push(tied.map((entry) => entry.playerId));

      for (const entry of tied) {
        rankings.push({
          ...entry,
          place: rankings.length + 1,
          requiresTieBreakerPull: true
        });
      }

      index += tied.length;
      continue;
    }

    const tieRanked = rankPlayersByHand(hands, tied.map((entry) => entry.playerId))
      .map((rank) => tied.find((entry) => entry.playerId === rank.playerId));

    for (const entry of tieRanked) {
      rankings.push({
        ...entry,
        place: rankings.length + 1,
        determinedBy: "tieBreakerPull",
        tieBreakerPipTotal: handPipTotal(tieBreakerPulls[entry.playerId]),
        tieBreakerTiles: tieBreakerPulls[entry.playerId]
      });
    }

    index += tied.length;
  }

  return {
    rankings: rankings.sort((first, second) => first.place - second.place)
      .map((entry) => ({
        ...entry,
        playerName: table.playerNames?.[entry.playerId] ?? entry.playerName
      })),
    unresolvedTieGroups
  };
}

function playersAtPlaces(tableResult, places) {
  if (!tableResult) {
    throw new Error("Missing table result for next round assignment.");
  }

  return places.map((place) => {
    const ranking = tableResult.rankings.find((entry) => entry.place === place);

    if (!ranking || ranking.requiresTieBreakerPull) {
      throw new Error(`Cannot assign next round because ${tableResult.tableLabel} has unresolved placing ${place}.`);
    }

    return ranking.playerId;
  });
}

function normalizePlayers(players, expectedCount) {
  if (!Array.isArray(players) || players.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} players.`);
  }

  const normalized = players.map((player, index) => {
    if (typeof player === "string") {
      return {
        id: `p${index + 1}`,
        name: player.trim() || `Player ${index + 1}`,
        avatarId: null
      };
    }

    return {
      id: String(player.id ?? `p${index + 1}`).trim(),
      name: String(player.name ?? player.id ?? `Player ${index + 1}`).trim(),
      avatarId: player.avatarId ? String(player.avatarId).trim() : null
    };
  });
  const ids = new Set(normalized.map((player) => player.id));

  if (ids.size !== normalized.length) {
    throw new Error("Player ids must be unique.");
  }

  const normalizedNames = new Set(normalized.map((player) => normalizePlayerNameForUniqueness(player.name)));

  if (normalizedNames.size !== normalized.length) {
    throw new Error("Player names must be unique.");
  }

  return normalized;
}

function normalizePlayerNameForUniqueness(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function normalizeRoundTables(roundInput = {}) {
  const tableEntries = Array.isArray(roundInput.tables)
    ? roundInput.tables
    : Object.entries(roundInput.tables ?? {}).map(([tableId, value]) => ({ tableId, ...value }));

  return new Map(tableEntries.map((table) => [table.tableId ?? table.id, table]));
}

function normalizeGames(games = []) {
  return games.map((game, index) => ({
    gameNumber: Number(game.gameNumber ?? index + 1),
    scores: normalizeScores(game.scores)
  }));
}

function normalizeScores(scores = []) {
  const scoreEntries = Array.isArray(scores)
    ? scores
    : Object.entries(scores).map(([playerId, points]) => ({ playerId, points }));

  return scoreEntries.map((score) => ({
    playerId: String(score.playerId),
    points: Number(score.points)
  }));
}

function emptyStats(playerId) {
  return {
    playerId,
    totalPoints: 0,
    wins: 0,
    normalWins: 0,
    lockWins: 0,
    secondPlaces: 0,
    thirdPlaces: 0,
    fourthPlaces: 0,
    lockLoses: 0,
    roundsPlayed: 0,
    currentTableId: null,
    currentTableLabel: null
  };
}

function applyScore(stats, points) {
  stats.totalPoints += points;

  if (points === 6) {
    stats.wins += 1;
    stats.lockWins += 1;
  } else if (points === 5) {
    stats.wins += 1;
    stats.normalWins += 1;
  } else if (points === 3) {
    stats.secondPlaces += 1;
  } else if (points === 2) {
    stats.thirdPlaces += 1;
  } else if (points === 1) {
    stats.fourthPlaces += 1;
  } else if (points === 0) {
    stats.fourthPlaces += 1;
    stats.lockLoses += 1;
  }
}

function addStats(total, stats) {
  total.totalPoints += stats.totalPoints;
  total.wins += stats.wins;
  total.normalWins += stats.normalWins;
  total.lockWins += stats.lockWins;
  total.secondPlaces += stats.secondPlaces;
  total.thirdPlaces += stats.thirdPlaces;
  total.fourthPlaces += stats.fourthPlaces;
  total.lockLoses += stats.lockLoses;
}

function compareStats(first, second) {
  const difference = compareStatsWithoutName(first, second);

  if (difference !== 0) {
    return difference;
  }

  return first.playerId.localeCompare(second.playerId);
}

function compareStatsWithoutName(first, second) {
  return (second.totalPoints - first.totalPoints)
    || (second.wins - first.wins)
    || (second.lockWins - first.lockWins)
    || (second.secondPlaces - first.secondPlaces)
    || (second.thirdPlaces - first.thirdPlaces)
    || (first.fourthPlaces - second.fourthPlaces);
}

function emptyPlacementCounts() {
  return {
    first: 0,
    second: 0,
    third: 0,
    fourth: 0
  };
}

function countPlacement(counts, points) {
  if (points === 5 || points === 6) {
    counts.first += 1;
  } else if (points === 3) {
    counts.second += 1;
  } else if (points === 2) {
    counts.third += 1;
  } else if (points === 1 || points === 0) {
    counts.fourth += 1;
  }
}

function placementCountsEqual(actual, expected) {
  return actual.first === expected.first
    && actual.second === expected.second
    && actual.third === expected.third
    && actual.fourth === expected.fourth;
}

function normalizeRoundInputForReplay(roundInput, roundNumber) {
  const tables = Array.from(normalizeRoundTables(roundInput).values());

  return {
    ...roundInput,
    roundNumber,
    tables
  };
}

function roundInputFromRecordedRound(round) {
  return {
    roundNumber: round.number,
    tables: round.tableResults.map((table) => ({
      tableId: table.tableId,
      games: table.games.map((game) => ({
        gameNumber: game.gameNumber,
        scores: game.scores.map((score) => ({
          playerId: score.playerId,
          points: score.points
        }))
      }))
    }))
  };
}

function tieBreakerPullsFromRecordedRound(round) {
  const pulls = {};

  for (const table of round.tableResults) {
    for (const ranking of table.rankings) {
      if (ranking.determinedBy === "tieBreakerPull" && Array.isArray(ranking.tieBreakerTiles)) {
        pulls[table.tableId] = pulls[table.tableId] ?? {};
        pulls[table.tableId][ranking.playerId] = ranking.tieBreakerTiles;
      }
    }
  }

  return pulls;
}

function tablesEqual(firstTables = [], secondTables = []) {
  return JSON.stringify(firstTables.map(tableComparable)) === JSON.stringify(secondTables.map(tableComparable));
}

function tableComparable(table) {
  return {
    id: table.id,
    playerIds: table.playerIds
  };
}

function tableIdForLabel(label) {
  return label.toLowerCase().replace(/\s+/g, "-");
}

function playerName(championship, playerId) {
  return championship.players.find((player) => player.id === playerId)?.name ?? playerId;
}

function cloneTables(tables) {
  return tables.map((table) => ({
    ...table,
    playerIds: [...table.playerIds]
  }));
}

function assertSupportedTableCount(tableCount) {
  if (!CHAMPIONSHIP_DAY_SUPPORTED_TABLE_COUNTS.includes(tableCount)) {
    throw new Error("Championship Day supports only 2, 3, or 4 tables.");
  }
}

function assertActiveChampionship(championship) {
  if (!championship || championship.status !== CHAMPIONSHIP_DAY_STATUS.ACTIVE) {
    throw new Error("Championship is not active.");
  }
}
