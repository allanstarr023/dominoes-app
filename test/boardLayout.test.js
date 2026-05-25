import test from "node:test";
import assert from "node:assert/strict";

import { createBoardLayout, validateBoardLayout } from "../public/boardLayout.js";

test("right-end wrap turns down for two tiles then continues right-to-left with matching pips", () => {
  const plays = [
    play("6:6", "opening", 6, 6),
    play("6:4", "right", 6, 4),
    play("4:0", "right", 4, 0),
    play("3:0", "right", 0, 3),
    play("5:3", "right", 3, 5),
    play("5:4", "right", 5, 4),
    play("6:4", "right", 4, 6)
  ];
  const layout = createBoardLayout(plays, { rowCapacity: 2, turnTileCount: 2 });

  assert.deepEqual(validateBoardLayout(layout, plays), []);
  assert.deepEqual(layout.problems, []);

  assert.equal(layout.plays[3].direction, "down");
  assert.equal(layout.plays[4].direction, "down");
  assert.equal(layout.plays[5].direction, "left");
  assert.equal(layout.plays[6].direction, "left");
  assert.equal(layout.plays[5].displaySecond, 5);
  assert.equal(layout.plays[6].displaySecond, 4);
  assert.equal(layout.plays[4].nextValue, layout.plays[5].prevValue);
  assert.equal(layout.plays[5].nextValue, layout.plays[6].prevValue);
  assert.equal(layout.plays[5].x + layout.plays[5].width, layout.plays[4].x);
  assert.equal(layout.plays[5].y + layout.plays[5].height, layout.plays[4].y + layout.plays[4].height);
});

test("left-end wrap turns up for two tiles then continues left-to-right with matching pips", () => {
  const plays = [
    play("2:5", "left", 2, 5),
    play("5:0", "left", 5, 0),
    play("0:3", "left", 0, 3),
    play("3:4", "left", 3, 4),
    play("4:6", "left", 4, 6),
    play("6:6", "opening", 6, 6)
  ];
  const layout = createBoardLayout(plays, { rowCapacity: 2, turnTileCount: 2 });

  assert.deepEqual(validateBoardLayout(layout, plays), []);
  assert.deepEqual(layout.problems, []);

  assert.equal(layout.plays[2].direction, "up");
  assert.equal(layout.plays[1].direction, "up");
  assert.equal(layout.plays[0].direction, "right");
  assert.equal(layout.plays[0].displayFirst, 5);
  assert.equal(layout.plays[1].nextValue, layout.plays[0].prevValue);
  assert.equal(layout.plays[0].x, layout.plays[1].x + layout.plays[1].width);
  assert.equal(layout.plays[0].y, layout.plays[1].y);
});

function play(id, end, leftValue, rightValue) {
  const [high, low] = id.split(":").map(Number).sort((first, second) => second - first);

  return {
    tile: { id, high, low },
    end,
    leftValue,
    rightValue
  };
}
