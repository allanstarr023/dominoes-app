import test from "node:test";
import assert from "node:assert/strict";

import {
  GAME_END_TYPES,
  LOCK_TYPES,
  applyMoveToState,
  classifyLockAfterMove,
  createDoubleSixSet,
  createEmptyBoard,
  createTile,
  dealHands,
  finalMatchScores,
  findTileHolder,
  rankPlayersByHand,
  scoreGame,
  selectAutoMove,
  shouldSquashDeal,
  timeoutPenalty
} from "../src/dominoesEngine.js";

const t = (first, second) => createTile(first, second);

test("creates a complete double-six set", () => {
  const tiles = createDoubleSixSet();
  const ids = new Set(tiles.map((tile) => tile.id));

  assert.equal(tiles.length, 28);
  assert.equal(ids.size, 28);
  assert.ok(ids.has("6:6"));
  assert.ok(ids.has("6:4"));
  assert.ok(ids.has("0:0"));
});

test("deals 7 tiles to each of 4 players", () => {
  const hands = dealHands(["p1", "p2", "p3", "p4"], createDoubleSixSet());

  assert.equal(hands.p1.length, 7);
  assert.equal(hands.p2.length, 7);
  assert.equal(hands.p3.length, 7);
  assert.equal(hands.p4.length, 7);
});

test("finds the first-game starter who holds double-six", () => {
  const hands = {
    p1: [t(1, 0)],
    p2: [t(6, 6)],
    p3: [t(3, 2)],
    p4: [t(5, 4)]
  };

  assert.equal(findTileHolder(hands, "6:6"), "p2");
});

test("squashes a deal when any player has 5 or more doubles", () => {
  const hands = {
    p1: [t(0, 0), t(1, 1), t(2, 2), t(3, 3), t(4, 4), t(6, 5), t(6, 4)],
    p2: [t(1, 0)],
    p3: [t(2, 0)],
    p4: [t(3, 0)]
  };

  assert.equal(shouldSquashDeal(hands), true);
});

test("selects the lowest matching tile on timeout", () => {
  const board = {
    ...createEmptyBoard(),
    leftEnd: 6,
    rightEnd: 1
  };
  const hand = [t(6, 5), t(6, 4), t(1, 5), t(1, 0)];

  const result = selectAutoMove(hand, board);

  assert.equal(result.action, "play");
  assert.equal(result.move.tile.id, "1:0");
  assert.equal(result.move.end, "right");
});

test("uses pip rank when timeout playable tiles have equal totals", () => {
  const board = {
    ...createEmptyBoard(),
    leftEnd: 6,
    rightEnd: 2
  };
  const hand = [t(6, 1), t(5, 2)];

  const result = selectAutoMove(hand, board);

  assert.equal(result.move.tile.id, "5:2");
});

test("auto-passes on timeout when no tile can play", () => {
  const board = {
    ...createEmptyBoard(),
    leftEnd: 6,
    rightEnd: 2
  };
  const hand = [t(5, 1), t(4, 0)];

  const result = selectAutoMove(hand, board);

  assert.equal(result.action, "pass");
  assert.equal(result.move, null);
});

test("ranks locked hands by pip total, then fewer tiles, then pip rank", () => {
  const hands = {
    p2: [t(6, 4), t(2, 0)],
    p1: [t(6, 5), t(2, 1), t(1, 0)],
    p4: [t(5, 4), t(2, 1), t(0, 0)],
    p3: [t(6, 1), t(2, 1)]
  };

  const ranked = rankPlayersByHand(hands);

  assert.deepEqual(
    ranked.map((rank) => rank.playerId),
    ["p3", "p2", "p4", "p1"]
  );
});

test("pip rank places 5:3 and 1:1 above 6:1 and 2:1 when totals tie", () => {
  const hands = {
    playerA: [t(6, 1), t(2, 1)],
    playerB: [t(5, 3), t(1, 1)]
  };

  const ranked = rankPlayersByHand(hands);

  assert.equal(ranked[0].playerId, "playerB");
});

test("classifies an unavoidable lock as mandatory", () => {
  const state = {
    board: {
      ...createEmptyBoard(),
      leftEnd: 3,
      rightEnd: 2
    },
    currentPlayerId: "p1",
    hands: {
      p1: [t(3, 2), t(6, 6)],
      p2: [t(5, 5)],
      p3: [t(4, 4)],
      p4: [t(1, 1)]
    }
  };

  const lock = classifyLockAfterMove(state, { tileId: "3:2", end: "left" });

  assert.equal(lock.type, LOCK_TYPES.MANDATORY_LOCK);
  assert.equal(lock.lockingPlayerId, "p1");
  assert.equal(lock.nonLockingAlternatives.length, 0);
});

test("classifies a lock as regular when another orientation avoids the lock", () => {
  const state = {
    board: {
      ...createEmptyBoard(),
      leftEnd: 3,
      rightEnd: 2
    },
    currentPlayerId: "p3",
    hands: {
      p1: [t(3, 0)],
      p2: [t(6, 6)],
      p3: [t(3, 2), t(0, 0)],
      p4: [t(5, 5)]
    }
  };

  const lock = classifyLockAfterMove(state, { tileId: "3:2", end: "left" });

  assert.equal(lock.type, LOCK_TYPES.REGULAR_LOCK);
  assert.equal(lock.lockingPlayerId, "p3");
  assert.equal(lock.nonLockingAlternatives.length, 1);
  assert.equal(lock.nonLockingAlternatives[0].end, "right");
});

test("does not classify a final-tile play as a lock", () => {
  const state = {
    board: {
      ...createEmptyBoard(),
      leftEnd: 3,
      rightEnd: 2
    },
    currentPlayerId: "p1",
    hands: {
      p1: [t(3, 2)],
      p2: [t(5, 5)],
      p3: [t(4, 4)],
      p4: [t(1, 1)]
    }
  };

  const lock = classifyLockAfterMove(state, { tileId: "3:2", end: "left" });

  assert.equal(lock.type, LOCK_TYPES.NONE);
});

test("scores a normal win with 5 points for the player who tiled out", () => {
  const hands = {
    p1: [],
    p2: [t(6, 1)],
    p3: [t(5, 1)],
    p4: [t(4, 1)]
  };

  const result = scoreGame({
    hands,
    endType: GAME_END_TYPES.NORMAL_WIN,
    winnerId: "p1"
  });

  assert.deepEqual(result.pointsByPlayerId, {
    p1: 5,
    p4: 3,
    p3: 2,
    p2: 1
  });
});

test("scores a mandatory lock as a 5-point first-place win", () => {
  const hands = {
    p1: [t(6, 6)],
    p2: [t(0, 0), t(1, 0)],
    p3: [t(5, 5)],
    p4: [t(4, 4)]
  };

  const result = scoreGame({
    hands,
    endType: GAME_END_TYPES.MANDATORY_LOCK
  });

  assert.deepEqual(result.pointsByPlayerId, {
    p2: 5,
    p4: 3,
    p3: 2,
    p1: 1
  });
});

test("gives 6 points when the regular locking player also ranks first", () => {
  const hands = {
    p1: [t(3, 0)],
    p2: [t(6, 6)],
    p3: [t(0, 0)],
    p4: [t(5, 5)]
  };

  const result = scoreGame({
    hands,
    endType: GAME_END_TYPES.REGULAR_LOCK,
    lockingPlayerId: "p3"
  });

  assert.equal(result.lockingPlayerWon, true);
  assert.deepEqual(result.pointsByPlayerId, {
    p3: 6,
    p1: 3,
    p4: 2,
    p2: 1
  });
});

test("gives 0 to a regular locking player who fails to rank first", () => {
  const hands = {
    p1: [t(6, 5), t(2, 1), t(1, 0)],
    p2: [t(6, 4), t(2, 0)],
    p3: [t(6, 6), t(5, 5)],
    p4: [t(5, 4), t(2, 1), t(0, 0)]
  };

  const result = scoreGame({
    hands,
    endType: GAME_END_TYPES.REGULAR_LOCK,
    lockingPlayerId: "p3"
  });

  assert.equal(result.lockingPlayerWon, false);
  assert.deepEqual(result.pointsByPlayerId, {
    p2: 5,
    p4: 3,
    p1: 2,
    p3: 0
  });
});

test("calculates timeout penalties every 2 infractions", () => {
  assert.equal(timeoutPenalty(0), 0);
  assert.equal(timeoutPenalty(1), 0);
  assert.equal(timeoutPenalty(2), -1);
  assert.equal(timeoutPenalty(3), -1);
  assert.equal(timeoutPenalty(4), -2);
});

test("subtracts timeout penalties from final match scores", () => {
  const scores = finalMatchScores(
    { p1: 22, p2: 18 },
    { p1: 4, p2: 1 }
  );

  assert.deepEqual(scores, {
    p1: 20,
    p2: 18
  });
});

test("supports configurable score and penalty values", () => {
  const result = scoreGame({
    hands: {
      p1: [],
      p2: [t(6, 1)],
      p3: [t(5, 1)],
      p4: [t(4, 1)]
    },
    endType: GAME_END_TYPES.NORMAL_WIN,
    winnerId: "p1",
    scoring: {
      first: 7,
      second: 4,
      third: 2,
      fourth: 0,
      lockWin: 8,
      lockLose: -1
    }
  });

  assert.deepEqual(result.pointsByPlayerId, {
    p1: 7,
    p4: 4,
    p3: 2,
    p2: 0
  });
  assert.equal(timeoutPenalty(3, { infractionsPerPenalty: 3, penaltyPoints: -2 }), -2);
  assert.deepEqual(
    finalMatchScores({ p1: 20 }, { p1: 3 }, { infractionsPerPenalty: 3, penaltyPoints: -2 }),
    { p1: 18 }
  );
});

test("applies a legal move and removes the tile from the player hand", () => {
  const state = {
    board: {
      ...createEmptyBoard(),
      leftEnd: 6,
      rightEnd: 1,
      plays: [
        {
          tile: t(6, 1),
          end: "opening",
          leftValue: 6,
          rightValue: 1
        }
      ]
    },
    currentPlayerId: "p1",
    hands: {
      p1: [t(1, 0), t(5, 5)],
      p2: [],
      p3: [],
      p4: []
    }
  };

  const next = applyMoveToState(state, { tileId: "1:0", end: "right" });

  assert.equal(next.board.leftEnd, 6);
  assert.equal(next.board.rightEnd, 0);
  assert.deepEqual(
    next.board.plays.map((play) => [play.tile.id, play.leftValue, play.rightValue]),
    [
      ["6:1", 6, 1],
      ["1:0", 1, 0]
    ]
  );
  assert.deepEqual(next.hands.p1.map((tile) => tile.id), ["5:5"]);
});

test("left-end plays are oriented and inserted at the left side of the board", () => {
  const state = {
    board: {
      ...createEmptyBoard(),
      leftEnd: 6,
      rightEnd: 1,
      plays: [
        {
          tile: t(6, 1),
          end: "opening",
          leftValue: 6,
          rightValue: 1
        }
      ]
    },
    currentPlayerId: "p1",
    hands: {
      p1: [t(6, 4)],
      p2: [],
      p3: [],
      p4: []
    }
  };

  const next = applyMoveToState(state, { tileId: "6:4", end: "left" });

  assert.equal(next.board.leftEnd, 4);
  assert.equal(next.board.rightEnd, 1);
  assert.deepEqual(
    next.board.plays.map((play) => [play.tile.id, play.leftValue, play.rightValue]),
    [
      ["6:4", 4, 6],
      ["6:1", 6, 1]
    ]
  );
});
