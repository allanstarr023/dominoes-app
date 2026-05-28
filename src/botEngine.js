import {
  LOCK_TYPES,
  applyMoveToState,
  classifyLockAfterMove,
  compareTilesLowest,
  handPipTotal,
  legalMoves,
  rankPlayersByHand,
  tileTotal
} from "./dominoesEngine.js";

export const BOT_TURN_DELAY_MS = 1_500;

export function isBotPlayer(player) {
  return Boolean(player?.isBot);
}

export function chooseBotTurn(match, playerId) {
  const game = match.game;
  const hand = game?.hands?.[playerId] ?? [];
  const moves = legalMoves(hand, game.board)
    .filter((move) => !game.requiredOpeningTileId || move.tile.id === game.requiredOpeningTileId);

  if (moves.length === 0) {
    return {
      action: "pass",
      move: null
    };
  }

  const rankedMoves = moves
    .map((move) => ({
      move,
      score: scoreBotMove(match, playerId, move)
    }))
    .sort(compareScoredMoves);

  return {
    action: "play",
    move: rankedMoves[0].move
  };
}

function scoreBotMove(match, playerId, move) {
  const state = {
    board: match.game.board,
    currentPlayerId: playerId,
    hands: match.game.hands
  };
  const lock = classifyLockAfterMove(state, move);
  const afterMove = applyMoveToState(state, move);
  const ownHand = afterMove.hands[playerId];
  const ownRank = rankPlayersByHand(afterMove.hands, match.playerOrder)
    .findIndex((rank) => rank.playerId === playerId) + 1;
  const nextPlayerId = nextPlayer(match.playerOrder, playerId);
  const nextPlayerMoves = legalMoves(afterMove.hands[nextPlayerId] ?? [], afterMove.board).length;
  const opponentMoves = match.playerOrder
    .filter((id) => id !== playerId)
    .reduce((total, id) => total + legalMoves(afterMove.hands[id] ?? [], afterMove.board).length, 0);
  const ownFutureMoves = legalMoves(ownHand, afterMove.board).length;
  const ownRemainingPips = handPipTotal(ownHand);
  const ownEndControl = countEndControl(ownHand, afterMove.board);

  return [
    endStateScore(lock.type, ownHand.length, ownRank),
    -ownRank,
    -ownHand.length,
    -ownRemainingPips,
    -nextPlayerMoves,
    -opponentMoves,
    ownFutureMoves,
    ownEndControl,
    tileTotal(move.tile)
  ];
}

function endStateScore(lockType, ownTileCount, ownRank) {
  if (ownTileCount === 0) {
    return 1_000_000;
  }

  if (lockType === LOCK_TYPES.NONE) {
    return 0;
  }

  if (lockType === LOCK_TYPES.REGULAR_LOCK) {
    return ownRank === 1 ? 900_000 : -900_000;
  }

  return ownRank === 1 ? 800_000 : -400_000 - ownRank;
}

function countEndControl(hand, board) {
  if (board.leftEnd === null || board.rightEnd === null) {
    return hand.length;
  }

  return hand.reduce((count, tile) => {
    const matchesLeft = tile.high === board.leftEnd || tile.low === board.leftEnd;
    const matchesRight = tile.high === board.rightEnd || tile.low === board.rightEnd;
    return count + (matchesLeft ? 1 : 0) + (matchesRight ? 1 : 0);
  }, 0);
}

function compareScoredMoves(first, second) {
  for (let index = 0; index < Math.max(first.score.length, second.score.length); index += 1) {
    const difference = (second.score[index] ?? 0) - (first.score[index] ?? 0);

    if (difference !== 0) {
      return difference;
    }
  }

  const tileDifference = compareTilesLowest(first.move.tile, second.move.tile);

  if (tileDifference !== 0) {
    return tileDifference;
  }

  return first.move.end.localeCompare(second.move.end);
}

function nextPlayer(playerOrder, playerId) {
  const index = playerOrder.indexOf(playerId);

  if (index === -1) {
    return playerOrder[0];
  }

  return playerOrder[(index + 1) % playerOrder.length];
}
