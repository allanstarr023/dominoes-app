const MIN_PIP = 0;
const MAX_PIP = 6;

export const GAME_END_TYPES = Object.freeze({
  NORMAL_WIN: "normalWin",
  MANDATORY_LOCK: "mandatoryLock",
  REGULAR_LOCK: "regularLock"
});

export const LOCK_TYPES = Object.freeze({
  NONE: "none",
  MANDATORY_LOCK: "mandatoryLock",
  REGULAR_LOCK: "regularLock"
});

export const DEFAULT_SCORING = Object.freeze({
  first: 5,
  second: 3,
  third: 2,
  fourth: 1,
  lockWin: 6,
  lockLose: 0
});

export function createTile(first, second) {
  assertPip(first);
  assertPip(second);

  const high = Math.max(first, second);
  const low = Math.min(first, second);

  return Object.freeze({
    id: `${high}:${low}`,
    high,
    low
  });
}

export function createDoubleSixSet() {
  const tiles = [];

  for (let high = MIN_PIP; high <= MAX_PIP; high += 1) {
    for (let low = MIN_PIP; low <= high; low += 1) {
      tiles.push(createTile(high, low));
    }
  }

  return tiles;
}

export function tileTotal(tile) {
  return tile.high + tile.low;
}

export function isDouble(tile) {
  return tile.high === tile.low;
}

export function handPipTotal(hand) {
  return hand.reduce((total, tile) => total + tileTotal(tile), 0);
}

export function countDoubles(hand) {
  return hand.filter(isDouble).length;
}

export function findPlayersWithTooManyDoubles(handsByPlayerId, doubleLimit = 5) {
  return Object.entries(handsByPlayerId)
    .filter(([, hand]) => countDoubles(hand) >= doubleLimit)
    .map(([playerId]) => playerId);
}

export function shouldSquashDeal(handsByPlayerId, doubleLimit = 5) {
  return findPlayersWithTooManyDoubles(handsByPlayerId, doubleLimit).length > 0;
}

export function findTileHolder(handsByPlayerId, tileId) {
  for (const [playerId, hand] of Object.entries(handsByPlayerId)) {
    if (hand.some((tile) => tile.id === tileId)) {
      return playerId;
    }
  }

  return null;
}

export function shuffleTiles(tiles, rng = Math.random) {
  const shuffled = [...tiles];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export function dealHands(playerIds, deck = createDoubleSixSet()) {
  if (playerIds.length !== 4) {
    throw new Error("This ruleset requires exactly 4 players.");
  }

  if (deck.length < 28) {
    throw new Error("A double-six deal requires a full 28-tile deck.");
  }

  const hands = {};

  for (const [playerIndex, playerId] of playerIds.entries()) {
    const start = playerIndex * 7;
    hands[playerId] = deck.slice(start, start + 7);
  }

  return hands;
}

export function dealValidGame(playerIds, options = {}) {
  const {
    rng = Math.random,
    maxAttempts = 1000,
    doubleLimit = 5
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const deck = shuffleTiles(createDoubleSixSet(), rng);
    const hands = dealHands(playerIds, deck);

    if (!shouldSquashDeal(hands, doubleLimit)) {
      return { hands, attempts: attempt };
    }
  }

  throw new Error(`Unable to deal a valid game after ${maxAttempts} attempts.`);
}

export function createEmptyBoard() {
  return Object.freeze({
    leftEnd: null,
    rightEnd: null,
    plays: Object.freeze([])
  });
}

export function isBoardEmpty(board) {
  return board.leftEnd === null || board.rightEnd === null;
}

export function legalMoves(hand, board) {
  if (isBoardEmpty(board)) {
    return hand.map((tile) => makeOpeningMove(tile));
  }

  const moves = [];

  for (const tile of hand) {
    if (tileMatchesPip(tile, board.leftEnd)) {
      moves.push(makeEndMove(tile, "left", board.leftEnd, board.rightEnd));
    }

    if (tileMatchesPip(tile, board.rightEnd)) {
      moves.push(makeEndMove(tile, "right", board.rightEnd, board.leftEnd));
    }
  }

  return moves;
}

export function canPlay(hand, board) {
  return legalMoves(hand, board).length > 0;
}

export function selectAutoMove(hand, board) {
  const moves = legalMoves(hand, board);

  if (moves.length === 0) {
    return {
      action: "pass",
      move: null
    };
  }

  const [move] = [...moves].sort(compareAutoMoves);

  return {
    action: "play",
    move
  };
}

export function applyMove(board, hand, requestedMove) {
  const move = resolveLegalMove(hand, board, requestedMove);
  const nextBoard = applyLegalMoveToBoard(board, move);
  const nextHand = removeTileFromHand(hand, move.tile.id);

  return {
    board: nextBoard,
    hand: nextHand,
    move
  };
}

export function applyMoveToState(state, requestedMove) {
  const playerHand = state.hands[state.currentPlayerId];

  if (!playerHand) {
    throw new Error(`Unknown current player: ${state.currentPlayerId}`);
  }

  const result = applyMove(state.board, playerHand, requestedMove);

  return {
    ...state,
    board: result.board,
    hands: {
      ...state.hands,
      [state.currentPlayerId]: result.hand
    },
    appliedMove: result.move
  };
}

export function isGameLocked(board, handsByPlayerId) {
  if (isBoardEmpty(board)) {
    return false;
  }

  return Object.values(handsByPlayerId).every((hand) => !canPlay(hand, board));
}

export function classifyLockAfterMove(state, requestedMove) {
  const resolvedMove = resolveLegalMove(
    state.hands[state.currentPlayerId],
    state.board,
    requestedMove
  );
  const afterChosenMove = applyMoveToState(state, resolvedMove);
  const currentPlayerHand = afterChosenMove.hands[state.currentPlayerId];

  if (currentPlayerHand.length === 0 || !isGameLocked(afterChosenMove.board, afterChosenMove.hands)) {
    return {
      type: LOCK_TYPES.NONE,
      lockingPlayerId: null,
      nonLockingAlternatives: []
    };
  }

  const alternatives = legalMoves(state.hands[state.currentPlayerId], state.board)
    .filter((move) => !sameMove(move, resolvedMove));
  const nonLockingAlternatives = alternatives.filter((move) => {
    const afterAlternative = applyMoveToState(state, move);
    return !isGameLocked(afterAlternative.board, afterAlternative.hands);
  });

  return {
    type: nonLockingAlternatives.length > 0
      ? LOCK_TYPES.REGULAR_LOCK
      : LOCK_TYPES.MANDATORY_LOCK,
    lockingPlayerId: state.currentPlayerId,
    nonLockingAlternatives
  };
}

export function rankPlayersByHand(handsByPlayerId, playerIds = Object.keys(handsByPlayerId)) {
  return [...playerIds]
    .map((playerId) => ({
      playerId,
      hand: handsByPlayerId[playerId],
      pipTotal: handPipTotal(handsByPlayerId[playerId]),
      tileCount: handsByPlayerId[playerId].length,
      pipRank: handPipRank(handsByPlayerId[playerId])
    }))
    .sort(compareRankedHands);
}

export function scoreGame({ hands, endType, winnerId = null, lockingPlayerId = null, scoring = DEFAULT_SCORING }) {
  assertGameEndType(endType);
  const scoreValues = normalizeScoring(scoring);
  const placementPoints = pointsByPlacement(scoreValues);

  if (endType === GAME_END_TYPES.NORMAL_WIN) {
    if (!winnerId) {
      throw new Error("A normal win requires winnerId.");
    }

    const otherPlayerIds = Object.keys(hands).filter((playerId) => playerId !== winnerId);
    const rankedOthers = rankPlayersByHand(hands, otherPlayerIds);
    const placements = [
      makePlacement(winnerId, hands[winnerId], 1, scoreValues.first),
      ...rankedOthers.map((rank, index) => makePlacement(rank.playerId, rank.hand, index + 2, placementPoints[index + 1]))
    ];

    return buildScoreResult(endType, placements);
  }

  if (endType === GAME_END_TYPES.MANDATORY_LOCK) {
    const placements = rankPlayersByHand(hands)
      .map((rank, index) => makePlacement(rank.playerId, rank.hand, index + 1, placementPoints[index]));

    return buildScoreResult(endType, placements);
  }

  if (!lockingPlayerId) {
    throw new Error("A regular lock requires lockingPlayerId.");
  }

  const rankedPlayers = rankPlayersByHand(hands);
  const lockingPlayerWon = rankedPlayers[0].playerId === lockingPlayerId;

  if (lockingPlayerWon) {
    const placements = rankedPlayers.map((rank, index) => {
      const points = index === 0 ? scoreValues.lockWin : placementPoints[index];
      return makePlacement(rank.playerId, rank.hand, index + 1, points);
    });

    return buildScoreResult(endType, placements, {
      lockingPlayerWon: true
    });
  }

  const nonLockingRankedPlayers = rankedPlayers.filter((rank) => rank.playerId !== lockingPlayerId);
  const placements = [
    ...nonLockingRankedPlayers.map((rank, index) => makePlacement(rank.playerId, rank.hand, index + 1, placementPoints[index])),
    makePlacement(lockingPlayerId, hands[lockingPlayerId], 4, scoreValues.lockLose)
  ];

  return buildScoreResult(endType, placements, {
    lockingPlayerWon: false
  });
}

export function timeoutPenalty(infractions, options = {}) {
  const infractionsPerPenalty = Number(options.infractionsPerPenalty ?? 2);
  const penaltyPoints = Number(options.penaltyPoints ?? -1);

  if (infractionsPerPenalty <= 0) {
    return 0;
  }

  const penalty = Math.floor(infractions / infractionsPerPenalty);
  return penalty === 0 ? 0 : penalty * penaltyPoints;
}

export function finalMatchScores(rawScoresByPlayerId, infractionsByPlayerId, options = {}) {
  const scores = {};

  for (const [playerId, rawScore] of Object.entries(rawScoresByPlayerId)) {
    scores[playerId] = rawScore + timeoutPenalty(infractionsByPlayerId[playerId] ?? 0, options);
  }

  return scores;
}

export function compareTilesLowest(firstTile, secondTile) {
  const totalDifference = tileTotal(firstTile) - tileTotal(secondTile);

  if (totalDifference !== 0) {
    return totalDifference;
  }

  if (firstTile.high !== secondTile.high) {
    return firstTile.high - secondTile.high;
  }

  return firstTile.low - secondTile.low;
}

function compareAutoMoves(firstMove, secondMove) {
  const tileDifference = compareTilesLowest(firstMove.tile, secondMove.tile);

  if (tileDifference !== 0) {
    return tileDifference;
  }

  const firstLowerSideMatch = firstMove.matchValue === firstMove.tile.low ? 0 : 1;
  const secondLowerSideMatch = secondMove.matchValue === secondMove.tile.low ? 0 : 1;

  if (firstLowerSideMatch !== secondLowerSideMatch) {
    return firstLowerSideMatch - secondLowerSideMatch;
  }

  return firstMove.end.localeCompare(secondMove.end);
}

function compareRankedHands(first, second) {
  if (first.pipTotal !== second.pipTotal) {
    return first.pipTotal - second.pipTotal;
  }

  if (first.tileCount !== second.tileCount) {
    return first.tileCount - second.tileCount;
  }

  for (let index = 0; index < Math.max(first.pipRank.length, second.pipRank.length); index += 1) {
    const firstPip = first.pipRank[index] ?? -1;
    const secondPip = second.pipRank[index] ?? -1;

    if (firstPip !== secondPip) {
      return firstPip - secondPip;
    }
  }

  return first.playerId.localeCompare(second.playerId);
}

function handPipRank(hand) {
  return hand
    .flatMap((tile) => [tile.high, tile.low])
    .sort((first, second) => second - first);
}

function normalizeScoring(scoring) {
  return {
    first: Number(scoring.first ?? DEFAULT_SCORING.first),
    second: Number(scoring.second ?? DEFAULT_SCORING.second),
    third: Number(scoring.third ?? DEFAULT_SCORING.third),
    fourth: Number(scoring.fourth ?? DEFAULT_SCORING.fourth),
    lockWin: Number(scoring.lockWin ?? DEFAULT_SCORING.lockWin),
    lockLose: Number(scoring.lockLose ?? DEFAULT_SCORING.lockLose)
  };
}

function pointsByPlacement(scoring) {
  return [
    scoring.first,
    scoring.second,
    scoring.third,
    scoring.fourth
  ];
}

function makePlacement(playerId, hand, place, points) {
  return {
    playerId,
    place,
    points,
    pipTotal: handPipTotal(hand),
    tileCount: hand.length,
    hand
  };
}

function buildScoreResult(endType, placements, extra = {}) {
  return {
    endType,
    placements,
    pointsByPlayerId: Object.fromEntries(
      placements.map((placement) => [placement.playerId, placement.points])
    ),
    ...extra
  };
}

function resolveLegalMove(hand, board, requestedMove) {
  const legal = legalMoves(hand, board);
  const move = legal.find((candidate) => sameMove(candidate, requestedMove));

  if (!move) {
    throw new Error(`Illegal move: ${requestedMove.tileId ?? requestedMove.tile?.id} on ${requestedMove.end}`);
  }

  return move;
}

function sameMove(firstMove, secondMove) {
  const firstTileId = firstMove.tileId ?? firstMove.tile.id;
  const secondTileId = secondMove.tileId ?? secondMove.tile.id;

  return firstTileId === secondTileId && firstMove.end === secondMove.end;
}

function applyLegalMoveToBoard(board, move) {
  const play = Object.freeze({
    tile: move.tile,
    end: move.end,
    leftValue: move.leftValue,
    rightValue: move.rightValue
  });
  const plays = move.end === "left"
    ? [play, ...board.plays]
    : [...board.plays, play];

  return Object.freeze({
    leftEnd: move.resultingEnds.left,
    rightEnd: move.resultingEnds.right,
    plays: Object.freeze(plays)
  });
}

function removeTileFromHand(hand, tileId) {
  const tileIndex = hand.findIndex((tile) => tile.id === tileId);

  if (tileIndex === -1) {
    throw new Error(`Tile ${tileId} is not in hand.`);
  }

  return [
    ...hand.slice(0, tileIndex),
    ...hand.slice(tileIndex + 1)
  ];
}

function makeOpeningMove(tile) {
  return Object.freeze({
    tile,
    tileId: tile.id,
    end: "opening",
    matchValue: null,
    exposedValue: null,
    leftValue: tile.high,
    rightValue: tile.low,
    resultingEnds: Object.freeze({
      left: tile.high,
      right: tile.low
    })
  });
}

function makeEndMove(tile, end, matchValue, oppositeEndValue) {
  const exposedValue = otherSide(tile, matchValue);
  const leftValue = end === "left" ? exposedValue : matchValue;
  const rightValue = end === "left" ? matchValue : exposedValue;
  const resultingLeftEnd = end === "left" ? exposedValue : oppositeEndValue;
  const resultingRightEnd = end === "left" ? oppositeEndValue : exposedValue;

  return Object.freeze({
    tile,
    tileId: tile.id,
    end,
    matchValue,
    exposedValue,
    leftValue,
    rightValue,
    resultingEnds: Object.freeze({
      left: resultingLeftEnd,
      right: resultingRightEnd
    })
  });
}

function tileMatchesPip(tile, pip) {
  return tile.high === pip || tile.low === pip;
}

function otherSide(tile, matchingPip) {
  if (!tileMatchesPip(tile, matchingPip)) {
    throw new Error(`Tile ${tile.id} does not contain ${matchingPip}.`);
  }

  if (tile.high === tile.low) {
    return matchingPip;
  }

  return tile.high === matchingPip ? tile.low : tile.high;
}

function assertPip(pip) {
  if (!Number.isInteger(pip) || pip < MIN_PIP || pip > MAX_PIP) {
    throw new Error(`Invalid pip value: ${pip}`);
  }
}

function assertGameEndType(endType) {
  if (!Object.values(GAME_END_TYPES).includes(endType)) {
    throw new Error(`Unknown game end type: ${endType}`);
  }
}
