import test from "node:test";
import assert from "node:assert/strict";

import { chooseBotTurn } from "../src/botEngine.js";
import { createEmptyBoard, createTile } from "../src/dominoesEngine.js";

const t = (first, second) => createTile(first, second);

function botMatch(overrides = {}) {
  return {
    playerOrder: ["bot-001", "p2", "p3", "p4"],
    game: {
      board: createEmptyBoard(),
      hands: {
        "bot-001": [t(6, 6)],
        p2: [t(5, 5)],
        p3: [t(4, 4)],
        p4: [t(3, 3)]
      },
      requiredOpeningTileId: null,
      ...overrides.game
    },
    ...overrides
  };
}

test("bot chooses the required opening double-six", () => {
  const choice = chooseBotTurn(botMatch({
    game: {
      board: createEmptyBoard(),
      requiredOpeningTileId: "6:6",
      hands: {
        "bot-001": [t(6, 0), t(6, 6)],
        p2: [t(5, 5)],
        p3: [t(4, 4)],
        p4: [t(3, 3)]
      }
    }
  }), "bot-001");

  assert.equal(choice.action, "play");
  assert.equal(choice.move.tile.id, "6:6");
});

test("bot passes when no legal move exists", () => {
  const choice = chooseBotTurn(botMatch({
    game: {
      board: {
        ...createEmptyBoard(),
        leftEnd: 6,
        rightEnd: 2
      },
      hands: {
        "bot-001": [t(5, 1)],
        p2: [t(5, 5)],
        p3: [t(4, 4)],
        p4: [t(3, 3)]
      }
    }
  }), "bot-001");

  assert.equal(choice.action, "pass");
  assert.equal(choice.move, null);
});

test("bot prefers an immediate tile-out win", () => {
  const choice = chooseBotTurn(botMatch({
    game: {
      board: {
        ...createEmptyBoard(),
        leftEnd: 6,
        rightEnd: 1
      },
      hands: {
        "bot-001": [t(1, 0)],
        p2: [t(5, 5)],
        p3: [t(4, 4)],
        p4: [t(3, 3)]
      }
    }
  }), "bot-001");

  assert.equal(choice.action, "play");
  assert.equal(choice.move.tile.id, "1:0");
  assert.equal(choice.move.end, "right");
});
