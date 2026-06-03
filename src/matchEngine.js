import {
  DEFAULT_SCORING,
  GAME_END_TYPES,
  LOCK_TYPES,
  applyMoveToState,
  canPlay,
  classifyLockAfterMove,
  createEmptyBoard,
  dealValidGame,
  finalMatchScores,
  findTileHolder,
  legalMoves,
  scoreGame,
  selectAutoMove,
  shouldSquashDeal
} from "./dominoesEngine.js";

export const MATCH_STATUS = Object.freeze({
  ACTIVE: "active",
  PAUSED: "paused",
  COMPLETED: "completed",
  CANCELLED: "cancelled"
});

export const TURN_DURATION_MS = 30_000;
export const BETWEEN_GAMES_DURATION_MS = 60_000;
export const FINAL_REVIEW_DURATION_MS = 20_000;
export const BATHROOM_BREAK_DURATION_MS = 120_000;
export const SLAM_DURATION_MS = 5_000;
export const TAKE_DAT_DURATION_MS = 5_000;
export const REACTION_DURATION_MS = 7_000;
export const REACTION_TYPES = Object.freeze(["laughing", "angry", "serious", "sick", "confused"]);
export const ACTIVE_PLAYERS_PER_GAME = 4;
export const MAX_MATCH_PLAYERS = 7;
export const DEFAULT_MATCH_SETTINGS = Object.freeze({
  scoring: DEFAULT_SCORING,
  turnDurationMs: TURN_DURATION_MS,
  betweenGamesDurationMs: BETWEEN_GAMES_DURATION_MS,
  finalReviewDurationMs: FINAL_REVIEW_DURATION_MS,
  bathroomBreakDurationMs: BATHROOM_BREAK_DURATION_MS,
  seedToBoardRevealDurationMs: 10_000,
  infractionsPerPenalty: 2,
  penaltyPoints: -1
});

export function startMatch(options) {
  const {
    id = "match-1",
    players,
    matchLength,
    now = Date.now(),
    rng = Math.random,
    hands = null,
    settings = {}
  } = options;

  assertMatchLength(matchLength);
  const normalizedPlayers = normalizePlayers(players);
  const rosterOrder = normalizedPlayers.map((player) => player.id);
  const playerOrder = rosterOrder.slice(0, ACTIVE_PLAYERS_PER_GAME);
  const benchPlayerIds = rosterOrder.slice(ACTIVE_PLAYERS_PER_GAME);
  const matchSettings = normalizeMatchSettings(settings);

  const match = {
    id,
    status: MATCH_STATUS.ACTIVE,
    matchLength,
    rosterOrder,
    playerOrder,
    benchPlayerIds,
    playersById: Object.fromEntries(
      normalizedPlayers.map((player) => [player.id, { ...player, connected: true }])
    ),
    currentGameNumber: 1,
    previousWinnerId: null,
    rawScores: Object.fromEntries(rosterOrder.map((playerId) => [playerId, 0])),
    infractions: Object.fromEntries(rosterOrder.map((playerId) => [playerId, 0])),
    completedGames: [],
    game: null,
    betweenGames: null,
    finalReview: null,
    chatMessages: [],
    chatMutedUntilByPlayerId: Object.fromEntries(rosterOrder.map((playerId) => [playerId, null])),
    scoring: matchSettings.scoring,
    turnDurationMs: matchSettings.turnDurationMs,
    betweenGamesDurationMs: matchSettings.betweenGamesDurationMs,
    finalReviewDurationMs: matchSettings.finalReviewDurationMs,
    bathroomBreakDurationMs: matchSettings.bathroomBreakDurationMs,
    seedToBoardRevealDurationMs: matchSettings.seedToBoardRevealDurationMs,
    infractionsPerPenalty: matchSettings.infractionsPerPenalty,
    penaltyPoints: matchSettings.penaltyPoints,
    bathroomBreaksByPlayerId: Object.fromEntries(rosterOrder.map((playerId) => [playerId, false])),
    reactionsByPlayerId: Object.fromEntries(rosterOrder.map((playerId) => [playerId, null])),
    lastRotation: null,
    finalScores: null,
    winnerIds: []
  };

  return startGame(match, { now, rng, hands });
}

export function addPlayerToMatch(match, player, options = {}) {
  const { now = Date.now() } = options;

  if (match.status === MATCH_STATUS.COMPLETED || match.status === MATCH_STATUS.CANCELLED) {
    throw new Error("Completed matches cannot accept new players.");
  }

  const rosterOrder = match.rosterOrder ?? match.playerOrder;

  if (rosterOrder.length >= MAX_MATCH_PLAYERS) {
    throw new Error("Room is full.");
  }

  const normalized = normalizeSinglePlayer(player);

  if (!normalized.id) {
    throw new Error("Player requires an id.");
  }

  if (match.playersById[normalized.id]) {
    throw new Error(`Player ${normalized.id} is already in the match.`);
  }

  return {
    ...match,
    rosterOrder: [...rosterOrder, normalized.id],
    benchPlayerIds: [...(match.benchPlayerIds ?? []), normalized.id],
    playersById: {
      ...match.playersById,
      [normalized.id]: {
        ...normalized,
        connected: true,
        joinedMatchAt: now
      }
    },
    rawScores: {
      ...match.rawScores,
      [normalized.id]: 0
    },
    infractions: {
      ...match.infractions,
      [normalized.id]: 0
    },
    chatMutedUntilByPlayerId: {
      ...(match.chatMutedUntilByPlayerId ?? {}),
      [normalized.id]: null
    },
    bathroomBreaksByPlayerId: {
      ...(match.bathroomBreaksByPlayerId ?? {}),
      [normalized.id]: false
    },
    reactionsByPlayerId: {
      ...(match.reactionsByPlayerId ?? {}),
      [normalized.id]: null
    }
  };
}

export function removePlayerFromMatch(match, playerId) {
  assertKnownPlayer(match, playerId);

  if (match.playerOrder.includes(playerId)) {
    throw new Error("Active table players cannot be removed without cancelling the championship.");
  }

  const { [playerId]: removedPlayer, ...playersById } = match.playersById;
  const { [playerId]: removedRawScore, ...rawScores } = match.rawScores;
  const { [playerId]: removedInfraction, ...infractions } = match.infractions;
  const { [playerId]: removedMute, ...chatMutedUntilByPlayerId } = match.chatMutedUntilByPlayerId ?? {};
  const { [playerId]: removedBreak, ...bathroomBreaksByPlayerId } = match.bathroomBreaksByPlayerId ?? {};
  const { [playerId]: removedReaction, ...reactionsByPlayerId } = match.reactionsByPlayerId ?? {};

  return {
    ...match,
    rosterOrder: (match.rosterOrder ?? match.playerOrder).filter((id) => id !== playerId),
    benchPlayerIds: (match.benchPlayerIds ?? []).filter((id) => id !== playerId),
    playersById,
    rawScores,
    infractions,
    chatMutedUntilByPlayerId,
    bathroomBreaksByPlayerId,
    reactionsByPlayerId
  };
}

export function playTile(match, playerId, requestedMove, options = {}) {
  const { now = Date.now(), rng = Math.random, nextGameHands = null } = options;

  assertActiveTurn(match, playerId, now);
  const move = normalizeRequestedMove(match, requestedMove);

  if (match.game.requiredOpeningTileId && move.tileId !== match.game.requiredOpeningTileId) {
    throw new Error(`Opening move must be ${match.game.requiredOpeningTileId}.`);
  }

  return applyPlayableMove(match, playerId, move, { now, rng, nextGameHands });
}

export function slamTile(match, playerId, requestedMove, options = {}) {
  const {
    now = Date.now(),
    rng = Math.random,
    nextGameHands = null,
    durationMs = SLAM_DURATION_MS
  } = options;

  assertActiveTurn(match, playerId, now);

  if (match.game.slamUsedByPlayerId?.[playerId]) {
    throw new Error("This player has already used Slam in this round.");
  }

  const move = normalizeRequestedMove(match, requestedMove);

  if (match.game.requiredOpeningTileId && move.tileId !== match.game.requiredOpeningTileId) {
    throw new Error(`Opening move must be ${match.game.requiredOpeningTileId}.`);
  }

  const withSlamUsed = {
    ...match,
    game: {
      ...match.game,
      slamUsedByPlayerId: {
        ...(match.game.slamUsedByPlayerId ?? {}),
        [playerId]: true
      }
    }
  };

  return applyPlayableMove(withSlamUsed, playerId, move, {
    now,
    rng,
    nextGameHands,
    deferTurn: true,
    effect: "slam",
    animationDurationMs: durationMs
  });
}

export function useTakeDat(match, playerId, options = {}) {
  const {
    now = Date.now(),
    durationMs = TAKE_DAT_DURATION_MS
  } = options;

  assertActiveMatch(match);
  assertKnownPlayer(match, playerId);

  if (!match.playerOrder.includes(playerId)) {
    throw new Error("Only active players can use TAKE DAT.");
  }

  if (match.game.takeDatUsedByPlayerId?.[playerId]) {
    throw new Error("This player has already used TAKE DAT in this round.");
  }

  return {
    ...match,
    game: {
      ...match.game,
      takeDatUsedByPlayerId: {
        ...(match.game.takeDatUsedByPlayerId ?? {}),
        [playerId]: true
      },
      lastTakeDat: {
        type: "takeDat",
        playerId,
        at: now,
        expiresAt: now + durationMs,
        durationMs
      }
    }
  };
}

export function setPlayerReaction(match, playerId, reactionType, options = {}) {
  const {
    now = Date.now(),
    durationMs = REACTION_DURATION_MS
  } = options;
  const normalizedType = String(reactionType ?? "").trim();

  assertActiveMatch(match);
  assertKnownPlayer(match, playerId);

  if (!REACTION_TYPES.includes(normalizedType)) {
    throw new Error("Invalid reaction type.");
  }

  return {
    ...match,
    reactionsByPlayerId: {
      ...(match.reactionsByPlayerId ?? {}),
      [playerId]: {
        type: normalizedType,
        createdAt: now,
        expiresAt: now + durationMs
      }
    }
  };
}

export function passTurn(match, playerId, options = {}) {
  const { now = Date.now() } = options;

  assertActiveTurn(match, playerId, now);

  if (canPlay(match.game.hands[playerId], match.game.board)) {
    throw new Error("Cannot pass while a legal move is available.");
  }

  return advanceTurn(match, now, {
    lastAction: {
      type: "pass",
      playerId,
      at: now
    }
  });
}

export function handleTurnTimeout(match, options = {}) {
  const { now = Date.now(), rng = Math.random, nextGameHands = null } = options;

  assertActiveMatch(match);
  assertNoActiveAnimationLock(match, now);

  if (now < match.game.turnDeadlineAt) {
    throw new Error("Cannot handle timeout before the turn deadline.");
  }

  const playerId = match.game.currentPlayerId;
  const timeoutChoice = selectAutoMove(match.game.hands[playerId], match.game.board);
  const withInfraction = addInfraction(match, playerId);

  if (timeoutChoice.action === "pass") {
    return advanceTurn(withInfraction, now, {
      lastAction: {
        type: "timeoutPass",
        playerId,
        at: now
      }
    });
  }

  const afterMove = applyPlayableMove(withInfraction, playerId, timeoutChoice.move, {
    now,
    rng,
    nextGameHands
  });

  return {
    ...afterMove,
    lastAction: {
      type: "timeoutAutoPlay",
      playerId,
      move: timeoutChoice.move,
      at: now
    }
  };
}

export function setPlayerConnection(match, playerId, connected, options = {}) {
  const { now = Date.now() } = options;

  assertKnownPlayer(match, playerId);

  const playersById = {
    ...match.playersById,
    [playerId]: {
      ...match.playersById[playerId],
      connected
    }
  };
  const disconnectedPlayerIds = Object.values(playersById)
    .filter((player) => !player.connected)
    .map((player) => player.id);
  const activeDisconnectedPlayerIds = disconnectedPlayerIds.filter((id) => match.playerOrder.includes(id));
  const isActivePlayer = match.playerOrder.includes(playerId);

  if (match.status === MATCH_STATUS.COMPLETED || match.status === MATCH_STATUS.CANCELLED) {
    return {
      ...match,
      playersById,
      disconnectedPlayerIds
    };
  }

  if (!isActivePlayer) {
    return {
      ...match,
      playersById,
      disconnectedPlayerIds
    };
  }

  if (!connected && match.status === MATCH_STATUS.PAUSED) {
    return {
      ...match,
      playersById,
      disconnectedPlayerIds
    };
  }

  if (!connected) {
    return {
      ...match,
      status: MATCH_STATUS.PAUSED,
      playersById,
      disconnectedPlayerIds,
      pausedAt: now,
      pauseReason: "disconnect",
      pausedTimerRemainingMs: turnRemainingMs(match, now)
    };
  }

  if (activeDisconnectedPlayerIds.length > 0 || match.status !== MATCH_STATUS.PAUSED || match.pauseReason !== "disconnect") {
    return {
      ...match,
      playersById,
      disconnectedPlayerIds
    };
  }

  const remainingMs = match.pausedTimerRemainingMs ?? match.turnDurationMs;
  const resumedMatch = {
    ...match,
    status: MATCH_STATUS.ACTIVE,
    playersById,
    disconnectedPlayerIds,
    pausedAt: null,
    pauseReason: null,
    pausedTimerRemainingMs: null
  };

  if (match.game) {
    return {
      ...resumedMatch,
      game: {
        ...match.game,
        turnStartedAt: now,
        turnDeadlineAt: now + remainingMs
      }
    };
  }

  if (match.betweenGames) {
    return {
      ...resumedMatch,
      betweenGames: {
        ...match.betweenGames,
        resumedAt: now,
        deadlineAt: now + remainingMs
      }
    };
  }

  if (match.finalReview) {
    return {
      ...resumedMatch,
      finalReview: {
        ...match.finalReview,
        resumedAt: now,
        deadlineAt: now + remainingMs
      }
    };
  }

  return resumedMatch;
}

export function cancelMatch(match, options = {}) {
  const { now = Date.now(), reason = "cancelled" } = options;

  return {
    ...match,
    status: MATCH_STATUS.CANCELLED,
    cancelledAt: now,
    cancelReason: reason
  };
}

export function requestBathroomBreak(match, playerId, options = {}) {
  const { now = Date.now() } = options;

  assertKnownPlayer(match, playerId);

  if (!match.playerOrder.includes(playerId)) {
    throw new Error("Only active players can request a bathroom break.");
  }

  if (![5, 10].includes(match.matchLength)) {
    throw new Error("Bathroom breaks are only available in 5- and 10-game matches.");
  }

  if (match.bathroomBreaksByPlayerId[playerId]) {
    throw new Error("This player has already used their bathroom break.");
  }

  assertActiveMatch(match);

  return {
    ...match,
    status: MATCH_STATUS.PAUSED,
    pauseReason: "bathroomBreak",
    pausedAt: now,
    pausedByPlayerId: playerId,
    pauseEndsAt: now + match.bathroomBreakDurationMs,
    pausedTimerRemainingMs: turnRemainingMs(match, now),
    bathroomBreaksByPlayerId: {
      ...match.bathroomBreaksByPlayerId,
      [playerId]: true
    }
  };
}

export function resumeBathroomBreak(match, options = {}) {
  const { now = Date.now() } = options;

  if (match.status !== MATCH_STATUS.PAUSED || match.pauseReason !== "bathroomBreak") {
    throw new Error("Match is not paused for a bathroom break.");
  }

  const remainingMs = match.pausedTimerRemainingMs ?? match.turnDurationMs;

  if ((match.disconnectedPlayerIds ?? []).length > 0) {
    return {
      ...match,
      pauseReason: "disconnect",
      pausedAt: now,
      pausedByPlayerId: null,
      pauseEndsAt: null,
      pausedTimerRemainingMs: remainingMs
    };
  }

  const resumedMatch = {
    ...match,
    status: MATCH_STATUS.ACTIVE,
    pauseReason: null,
    pausedAt: null,
    pausedByPlayerId: null,
    pauseEndsAt: null,
    pausedTimerRemainingMs: null
  };

  if (match.game) {
    return {
      ...resumedMatch,
      game: {
        ...match.game,
        turnStartedAt: now,
        turnDeadlineAt: now + remainingMs
      }
    };
  }

  if (match.betweenGames) {
    return {
      ...resumedMatch,
      betweenGames: {
        ...match.betweenGames,
        resumedAt: now,
        deadlineAt: now + remainingMs
      }
    };
  }

  if (match.finalReview) {
    return {
      ...resumedMatch,
      finalReview: {
        ...match.finalReview,
        resumedAt: now,
        deadlineAt: now + remainingMs
      }
    };
  }

  return resumedMatch;
}

export function advanceFromGameBreak(match, options = {}) {
  const {
    now = Date.now(),
    rng = Math.random,
    hands = null
  } = options;

  if (match.status !== MATCH_STATUS.ACTIVE || !match.betweenGames) {
    throw new Error("Match is not between games.");
  }

  return startGame({
    ...match,
    betweenGames: null
  }, {
    now,
    rng,
    hands
  });
}

export function completeMatchReview(match, options = {}) {
  const { now = Date.now() } = options;

  if (match.status !== MATCH_STATUS.ACTIVE || !match.finalReview) {
    throw new Error("Match is not in final review.");
  }

  return {
    ...match,
    status: MATCH_STATUS.COMPLETED,
    game: null,
    betweenGames: null,
    finalReview: null,
    completedAt: now,
    finalScores: match.finalReview.finalScores,
    winnerIds: match.finalReview.winnerIds
  };
}

export function addChatMessage(match, options) {
  const {
    playerId,
    text,
    now = Date.now(),
    id = `chat-${match.chatMessages.length + 1}`
  } = options;

  assertKnownPlayer(match, playerId);

  const cleanText = String(text ?? "").trim();
  const mutedUntil = Number(match.chatMutedUntilByPlayerId?.[playerId] ?? 0);

  if (mutedUntil > now) {
    throw new Error("This player is temporarily blocked from chat.");
  }

  if (cleanText.length === 0) {
    throw new Error("Chat message cannot be empty.");
  }

  if (cleanText.length > 500) {
    throw new Error("Chat message cannot exceed 500 characters.");
  }

  return {
    ...match,
    chatMessages: [
      ...match.chatMessages,
      {
        id,
        playerId,
        text: cleanText,
        createdAt: now
      }
    ]
  };
}

export function deleteChatMessage(match, messageId) {
  const targetId = String(messageId ?? "");

  if (!targetId) {
    throw new Error("Message id is required.");
  }

  return {
    ...match,
    chatMessages: match.chatMessages.filter((message) => message.id !== targetId)
  };
}

export function blockPlayerChat(match, targetPlayerId, options = {}) {
  const {
    now = Date.now(),
    minutes = 5
  } = options;
  const durationMinutes = Math.max(1, Math.min(240, Math.round(Number(minutes) || 5)));

  assertKnownPlayer(match, targetPlayerId);

  return {
    ...match,
    chatMutedUntilByPlayerId: {
      ...(match.chatMutedUntilByPlayerId ?? {}),
      [targetPlayerId]: now + durationMinutes * 60_000
    }
  };
}

export function useSeedToBoard(match, playerId, options = {}) {
  const { now = Date.now() } = options;

  assertActiveTurn(match, playerId, now);

  if (match.game.seedToBoardUsedByPlayerId?.[playerId]) {
    throw new Error("This player has already used Seed to Board in this round.");
  }

  const handCounts = Object.fromEntries(
    match.playerOrder.map((id) => [id, match.game.hands[id]?.length ?? 0])
  );

  return {
    ...match,
    game: {
      ...match.game,
      seedToBoardUsedByPlayerId: {
        ...(match.game.seedToBoardUsedByPlayerId ?? {}),
        [playerId]: true
      },
      lastSeedToBoardReveal: {
        requestedByPlayerId: playerId,
        createdAt: now,
        handCounts
      }
    }
  };
}

export function turnRemainingMs(match, now = Date.now()) {
  if (match.status === MATCH_STATUS.COMPLETED || match.status === MATCH_STATUS.CANCELLED) {
    return 0;
  }

  if (match.pauseReason === "bathroomBreak" && match.pauseEndsAt) {
    return Math.max(0, match.pauseEndsAt - now);
  }

  if (match.game) {
    if (match.game.animationLock) {
      return Math.max(0, match.game.animationLock.expiresAt - now);
    }

    return Math.max(0, match.game.turnDeadlineAt - now);
  }

  if (match.betweenGames) {
    return Math.max(0, match.betweenGames.deadlineAt - now);
  }

  if (match.finalReview) {
    return Math.max(0, match.finalReview.deadlineAt - now);
  }

  return 0;
}

export function currentStandings(match) {
  const scores = finalMatchScores(match.rawScores, match.infractions, match);
  const rosterOrder = match.rosterOrder ?? match.playerOrder;

  return Object.entries(scores)
    .map(([playerId, score]) => ({
      playerId,
      score,
      rawScore: match.rawScores[playerId],
      infractions: match.infractions[playerId]
    }))
    .sort((first, second) => {
      if (first.score !== second.score) {
        return second.score - first.score;
      }

      return rosterOrder.indexOf(first.playerId) - rosterOrder.indexOf(second.playerId);
    });
}

function applyPlayableMove(match, playerId, requestedMove, options) {
  const {
    now,
    rng,
    nextGameHands,
    deferTurn = false,
    effect = null,
    animationDurationMs = SLAM_DURATION_MS
  } = options;
  const state = {
    board: match.game.board,
    currentPlayerId: playerId,
    hands: match.game.hands
  };
  const lock = classifyLockAfterMove(state, requestedMove);
  const nextState = applyMoveToState(state, requestedMove);
  const action = {
    type: "play",
    playerId,
    move: nextState.appliedMove,
    at: now,
    effect
  };
  const nextGame = {
    ...match.game,
    board: nextState.board,
    hands: nextState.hands,
    requiredOpeningTileId: null,
    lastMove: {
      playerId,
      move: nextState.appliedMove,
      at: now
    },
    lastAction: action
  };
  const withMove = {
    ...match,
    game: nextGame
  };

  if (nextState.hands[playerId].length === 0) {
    const scoreResult = scoreGame({
      hands: nextState.hands,
      endType: GAME_END_TYPES.NORMAL_WIN,
      winnerId: playerId,
      scoring: match.scoring
    });

    return completeGame(withMove, scoreResult, {
      now,
      rng,
      nextGameHands,
      endReason: GAME_END_TYPES.NORMAL_WIN
    });
  }

  if (lock.type === LOCK_TYPES.MANDATORY_LOCK) {
    const scoreResult = scoreGame({
      hands: nextState.hands,
      endType: GAME_END_TYPES.MANDATORY_LOCK,
      scoring: match.scoring
    });

    return completeGame(withMove, scoreResult, {
      now,
      rng,
      nextGameHands,
      endReason: GAME_END_TYPES.MANDATORY_LOCK,
      lockingPlayerId: playerId
    });
  }

  if (lock.type === LOCK_TYPES.REGULAR_LOCK) {
    const scoreResult = scoreGame({
      hands: nextState.hands,
      endType: GAME_END_TYPES.REGULAR_LOCK,
      lockingPlayerId: playerId,
      scoring: match.scoring
    });

    return completeGame(withMove, scoreResult, {
      now,
      rng,
      nextGameHands,
      endReason: GAME_END_TYPES.REGULAR_LOCK,
      lockingPlayerId: playerId
    });
  }

  if (deferTurn) {
    return {
      ...withMove,
      game: {
        ...withMove.game,
        turnStartedAt: now,
        turnDeadlineAt: now + animationDurationMs,
        animationLock: {
          type: effect ?? "animation",
          playerId,
          tileId: nextState.appliedMove.tile.id,
          end: nextState.appliedMove.end,
          startedAt: now,
          expiresAt: now + animationDurationMs,
          durationMs: animationDurationMs
        }
      }
    };
  }

  return advanceTurn(withMove, now, {
    lastAction: action
  });
}

export function releaseAnimationLock(match, options = {}) {
  const { now = Date.now() } = options;

  assertActiveMatch(match);

  if (!match.game.animationLock) {
    return match;
  }

  if (now < match.game.animationLock.expiresAt) {
    throw new Error("Animation is still playing.");
  }

  return advanceTurn({
    ...match,
    game: {
      ...match.game,
      animationLock: null
    }
  }, now, {
    lastAction: match.game.lastAction
  });
}

function completeGame(match, scoreResult, options) {
  const {
    now,
    rng,
    nextGameHands,
    endReason,
    lockingPlayerId = null
  } = options;
  const winnerId = scoreResult.placements.find((placement) => placement.place === 1).playerId;
  const rawScores = { ...match.rawScores };

  for (const [playerId, points] of Object.entries(scoreResult.pointsByPlayerId)) {
    rawScores[playerId] += points;
  }

  const completedGame = {
    number: match.currentGameNumber,
    completedAt: now,
    endReason,
    winnerId,
    lockingPlayerId,
    scoreResult,
    board: match.game.board,
    activePlayerIds: match.playerOrder,
    benchPlayerIds: match.benchPlayerIds ?? []
  };
  const completedGames = [...match.completedGames, completedGame];
  const baseMatch = {
    ...match,
    rawScores,
    completedGames,
    previousWinnerId: winnerId
  };

  if (match.currentGameNumber >= match.matchLength) {
    const finalScores = finalMatchScores(rawScores, match.infractions, match);
    const highestScore = Math.max(...Object.values(finalScores));
    const winnerIds = Object.entries(finalScores)
      .filter(([, score]) => score === highestScore)
      .map(([playerId]) => playerId);

    return {
      ...baseMatch,
      status: MATCH_STATUS.ACTIVE,
      game: null,
      betweenGames: null,
      finalReview: {
        gameNumber: match.currentGameNumber,
        startedAt: now,
        deadlineAt: now + match.finalReviewDurationMs,
        durationMs: match.finalReviewDurationMs,
        endReason,
        winnerId,
        lockingPlayerId,
        scoreResult,
        scoresBefore: match.rawScores,
        scoresAfter: rawScores,
        finalScores,
        winnerIds
      },
      finalScores,
      winnerIds
    };
  }

  const rotatedMatch = rotatePlayersForNextGame(baseMatch, scoreResult);

  return {
    ...rotatedMatch,
    currentGameNumber: match.currentGameNumber + 1,
    game: null,
    betweenGames: {
      previousGameNumber: match.currentGameNumber,
      nextGameNumber: match.currentGameNumber + 1,
      startedAt: now,
      deadlineAt: now + match.betweenGamesDurationMs,
      durationMs: match.betweenGamesDurationMs,
      startNowRequest: startNowRequestForBots(rotatedMatch, now),
      endReason,
      winnerId,
      lockingPlayerId,
      scoreResult,
      scoresBefore: match.rawScores,
      scoresAfter: rawScores,
      rotation: rotatedMatch.lastRotation
    }
  };
}

function rotatePlayersForNextGame(match, scoreResult) {
  const rosterOrder = match.rosterOrder ?? match.playerOrder;
  const benchPlayerIds = match.benchPlayerIds ?? [];
  const sackCount = Math.min(
    Math.max(0, rosterOrder.length - ACTIVE_PLAYERS_PER_GAME),
    benchPlayerIds.length,
    ACTIVE_PLAYERS_PER_GAME - 1
  );

  if (sackCount <= 0) {
    return {
      ...match,
      lastRotation: {
        sackCount: 0,
        sackedPlayerIds: [],
        incomingPlayerIds: [],
        activePlayerIds: match.playerOrder,
        benchPlayerIds
      }
    };
  }

  const sackedPlayerIds = [...scoreResult.placements]
    .sort((first, second) => second.place - first.place)
    .slice(0, sackCount)
    .map((placement) => placement.playerId);
  const incomingPlayerIds = benchPlayerIds.slice(0, sackCount);
  const remainingActiveIds = match.playerOrder.filter((playerId) => !sackedPlayerIds.includes(playerId));
  const nextPlayerOrder = [...remainingActiveIds, ...incomingPlayerIds];
  const nextBenchPlayerIds = [
    ...sackedPlayerIds,
    ...benchPlayerIds.slice(sackCount)
  ];

  return {
    ...match,
    playerOrder: nextPlayerOrder,
    benchPlayerIds: nextBenchPlayerIds,
    lastRotation: {
      sackCount,
      sackedPlayerIds,
      incomingPlayerIds,
      activePlayerIds: nextPlayerOrder,
      benchPlayerIds: nextBenchPlayerIds
    }
  };
}

function startGame(match, options) {
  const { now, rng, hands: providedHands } = options;
  const deal = providedHands
    ? { hands: providedHands, attempts: 1 }
    : dealValidGame(match.playerOrder, { rng });

  validateHands(match.playerOrder, deal.hands);

  if (shouldSquashDeal(deal.hands)) {
    throw new Error("Provided hands are a squashed deal because a player has 5 or more doubles.");
  }

  const starterId = match.currentGameNumber === 1
    ? findTileHolder(deal.hands, "6:6")
    : match.previousWinnerId;

  if (!starterId) {
    throw new Error("Unable to determine starter for the game.");
  }

  return {
    ...match,
    status: MATCH_STATUS.ACTIVE,
    betweenGames: null,
    finalReview: null,
    game: {
      number: match.currentGameNumber,
      hands: deal.hands,
      board: createEmptyBoard(),
      currentPlayerId: starterId,
      turnStartedAt: now,
      turnDeadlineAt: now + match.turnDurationMs,
      requiredOpeningTileId: match.currentGameNumber === 1 ? "6:6" : null,
      dealAttempts: deal.attempts,
      startedAt: now,
      lastAction: null,
      lastMove: null,
      seedToBoardUsedByPlayerId: Object.fromEntries(
        match.playerOrder.map((playerId) => [playerId, false])
      ),
      slamUsedByPlayerId: Object.fromEntries(
        match.playerOrder.map((playerId) => [playerId, false])
      ),
      takeDatUsedByPlayerId: Object.fromEntries(
        match.playerOrder.map((playerId) => [playerId, false])
      ),
      lastTakeDat: null,
      animationLock: null,
      lastSeedToBoardReveal: null
    }
  };
}

function startNowRequestForBots(match, now) {
  const botVotes = Object.fromEntries(
    match.playerOrder
      .filter((playerId) => match.playersById[playerId]?.isBot)
      .map((playerId) => [playerId, true])
  );

  if (Object.keys(botVotes).length === 0) {
    return null;
  }

  return {
    initiatedByPlayerId: null,
    requestedAt: now,
    votesByPlayerId: botVotes
  };
}

function advanceTurn(match, now, extra = {}) {
  const nextPlayerId = nextPlayer(match.playerOrder, match.game.currentPlayerId);

  return {
    ...match,
    game: {
      ...match.game,
      currentPlayerId: nextPlayerId,
      turnStartedAt: now,
      turnDeadlineAt: now + match.turnDurationMs,
      ...extra
    }
  };
}

function addInfraction(match, playerId) {
  return {
    ...match,
    infractions: {
      ...match.infractions,
      [playerId]: match.infractions[playerId] + 1
    }
  };
}

function normalizeRequestedMove(match, requestedMove) {
  if (!requestedMove) {
    throw new Error("A move is required.");
  }

  const tileId = requestedMove.tileId ?? requestedMove.tile?.id;

  if (!tileId) {
    throw new Error("A move requires tileId.");
  }

  return {
    ...requestedMove,
    tileId,
    end: requestedMove.end ?? (match.game.board.leftEnd === null ? "opening" : null)
  };
}

function normalizePlayers(players) {
  if (!Array.isArray(players) || players.length < ACTIVE_PLAYERS_PER_GAME || players.length > MAX_MATCH_PLAYERS) {
    throw new Error("A match requires 4 to 7 players.");
  }

  const normalized = players.map(normalizeSinglePlayer);
  const ids = new Set(normalized.map((player) => player.id));

  if (ids.size !== normalized.length || normalized.some((player) => !player.id)) {
    throw new Error("A match requires unique player ids.");
  }

  return normalized;
}

function normalizeSinglePlayer(player) {
  if (typeof player === "string") {
    return { id: player, name: player };
  }

  return {
    id: player.id,
    name: player.name ?? player.id,
    avatarId: player.avatarId ?? null,
    isBot: Boolean(player.isBot)
  };
}

function validateHands(playerOrder, hands) {
  for (const playerId of playerOrder) {
    if (!Array.isArray(hands[playerId])) {
      throw new Error(`Missing hand for player ${playerId}.`);
    }
  }
}

function nextPlayer(playerOrder, playerId) {
  const currentIndex = playerOrder.indexOf(playerId);

  if (currentIndex === -1) {
    throw new Error(`Unknown player in turn order: ${playerId}`);
  }

  return playerOrder[(currentIndex + 1) % playerOrder.length];
}

function assertMatchLength(matchLength) {
  if (![2, 5, 10].includes(matchLength)) {
    throw new Error("Match length must be 2, 5, or 10 games.");
  }
}

function normalizeMatchSettings(settings = {}) {
  const scoring = settings.scoring ?? {};

  return {
    scoring: {
      first: numberSetting(scoring.first, DEFAULT_MATCH_SETTINGS.scoring.first),
      second: numberSetting(scoring.second, DEFAULT_MATCH_SETTINGS.scoring.second),
      third: numberSetting(scoring.third, DEFAULT_MATCH_SETTINGS.scoring.third),
      fourth: numberSetting(scoring.fourth, DEFAULT_MATCH_SETTINGS.scoring.fourth),
      lockWin: numberSetting(scoring.lockWin, DEFAULT_MATCH_SETTINGS.scoring.lockWin),
      lockLose: numberSetting(scoring.lockLose, DEFAULT_MATCH_SETTINGS.scoring.lockLose)
    },
    turnDurationMs: turnDurationSetting(settings.turnDurationMs, DEFAULT_MATCH_SETTINGS.turnDurationMs),
    betweenGamesDurationMs: numberSetting(settings.betweenGamesDurationMs, DEFAULT_MATCH_SETTINGS.betweenGamesDurationMs),
    finalReviewDurationMs: numberSetting(settings.finalReviewDurationMs, DEFAULT_MATCH_SETTINGS.finalReviewDurationMs),
    bathroomBreakDurationMs: numberSetting(settings.bathroomBreakDurationMs, DEFAULT_MATCH_SETTINGS.bathroomBreakDurationMs),
    seedToBoardRevealDurationMs: numberSetting(settings.seedToBoardRevealDurationMs, DEFAULT_MATCH_SETTINGS.seedToBoardRevealDurationMs),
    infractionsPerPenalty: numberSetting(settings.infractionsPerPenalty, DEFAULT_MATCH_SETTINGS.infractionsPerPenalty),
    penaltyPoints: numberSetting(settings.penaltyPoints, DEFAULT_MATCH_SETTINGS.penaltyPoints)
  };
}

function numberSetting(value, fallback) {
  const number = Number(value ?? fallback);

  return Number.isFinite(number) ? number : fallback;
}

function turnDurationSetting(value, fallback) {
  const number = numberSetting(value, fallback);

  return [25_000, 30_000, 45_000].includes(number) ? number : fallback;
}

function assertActiveTurn(match, playerId, now = Date.now()) {
  assertActiveMatch(match);
  assertNoActiveAnimationLock(match, now);
  assertKnownPlayer(match, playerId);

  if (match.game.currentPlayerId !== playerId) {
    throw new Error(`It is not ${playerId}'s turn.`);
  }
}

function assertActiveMatch(match) {
  if (match.status !== MATCH_STATUS.ACTIVE || !match.game) {
    throw new Error("Match is not active.");
  }
}

function assertNoActiveAnimationLock(match, now = Date.now()) {
  const animationLock = match.game?.animationLock;

  if (animationLock && now < animationLock.expiresAt) {
    throw new Error("Animation is still playing.");
  }
}

function assertKnownPlayer(match, playerId) {
  if (!match.playersById[playerId]) {
    throw new Error(`Unknown player: ${playerId}`);
  }
}
