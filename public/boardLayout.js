const DEFAULT_TILE_LONG = 96;
const DEFAULT_TILE_SHORT = 48;
const DEFAULT_ROW_CAPACITY = 6;
const DEFAULT_TURN_TILE_COUNT = 2;
const BOARD_MARGIN = 8;

export function createBoardLayout(plays, options = {}) {
  const tileLong = Number(options.tileLong ?? DEFAULT_TILE_LONG);
  const tileShort = Number(options.tileShort ?? DEFAULT_TILE_SHORT);
  const rowCapacity = Math.max(1, Number(options.rowCapacity ?? DEFAULT_ROW_CAPACITY));
  const turnTileCount = Math.max(1, Number(options.turnTileCount ?? DEFAULT_TURN_TILE_COUNT));

  if (!plays.length) {
    const width = tileLong * 3;
    const height = tileLong * 2;
    return {
      plays: [],
      connections: [],
      leftTarget: null,
      rightTarget: null,
      openingTarget: {
        x: (width - tileLong * 2.2) / 2,
        y: (height - tileShort * 1.25) / 2,
        width: tileLong * 2.2,
        height: tileShort * 1.25,
        value: null,
        end: "opening",
        axis: "horizontal",
        direction: "right"
      },
      bounds: { minX: 0, minY: 0, maxX: width, maxY: height },
      width,
      height,
      problems: []
    };
  }

  const openingIndex = findOpeningIndex(plays);
  const positions = new Array(plays.length);
  const connections = [];
  const openingPlay = plays[openingIndex];
  const openingAxis = openingPlay.leftValue === openingPlay.rightValue ? "vertical" : "horizontal";
  const openingDimensions = dimensionsForAxis(openingAxis, tileLong, tileShort);
  const openingTile = makeLayoutTile({
    play: openingPlay,
    index: openingIndex,
    x: -Math.round(openingDimensions.width / 2),
    y: -Math.round(openingDimensions.height / 2),
    width: openingDimensions.width,
    height: openingDimensions.height,
    axis: openingAxis,
    direction: "right",
    prevValue: openingPlay.leftValue,
    nextValue: openingPlay.rightValue,
    displayFirst: openingPlay.leftValue,
    displaySecond: openingPlay.rightValue,
    side: "opening"
  });

  positions[openingIndex] = openingTile;

  const leftArm = createArmLayout({
    side: "left",
    anchor: openingTile,
    plays: plays.slice(0, openingIndex).reverse().map((play, offset) => ({
      play,
      index: openingIndex - offset - 1
    })),
    initialDirection: "left",
    turnDirection: "up",
    openingValue: openingPlay.leftValue,
    tileLong,
    tileShort,
    rowCapacity,
    turnTileCount
  });

  const rightArm = createArmLayout({
    side: "right",
    anchor: openingTile,
    plays: plays.slice(openingIndex + 1).map((play, offset) => ({
      play,
      index: openingIndex + offset + 1
    })),
    initialDirection: "right",
    turnDirection: "down",
    openingValue: openingPlay.rightValue,
    tileLong,
    tileShort,
    rowCapacity,
    turnTileCount
  });

  for (const tile of leftArm.tiles) {
    positions[tile.index] = tile;
  }

  for (const tile of rightArm.tiles) {
    positions[tile.index] = tile;
  }

  connections.push(...leftArm.connections, ...rightArm.connections);

  const leftTarget = makeTargetFromArm(leftArm, "left", plays[0].leftValue, tileLong, tileShort);
  const rightTarget = makeTargetFromArm(rightArm, "right", plays[plays.length - 1].rightValue, tileLong, tileShort);
  const bounds = normalizeLayout(positions, [leftTarget, rightTarget]);
  const normalizedPositions = positions.map((position) => shiftPosition(position, bounds));
  const normalizedLeftTarget = shiftPosition(leftTarget, bounds);
  const normalizedRightTarget = shiftPosition(rightTarget, bounds);
  const normalizedConnections = connections.map((connection) => ({
    ...connection,
    from: normalizedPositions[connection.fromIndex],
    to: normalizedPositions[connection.toIndex]
  }));
  const width = bounds.maxX - bounds.minX + BOARD_MARGIN * 2;
  const height = bounds.maxY - bounds.minY + BOARD_MARGIN * 2;
  const layout = {
    plays: normalizedPositions,
    connections: normalizedConnections,
    leftTarget: normalizedLeftTarget,
    rightTarget: normalizedRightTarget,
    openingTarget: null,
    bounds: { minX: 0, minY: 0, maxX: width, maxY: height },
    width,
    height,
    problems: []
  };

  layout.problems = validateBoardLayout(layout, plays);
  return layout;
}

export function validateBoardLayout(layout, originalPlays = []) {
  const problems = [];

  for (let index = 0; index < originalPlays.length - 1; index += 1) {
    const current = originalPlays[index];
    const next = originalPlays[index + 1];

    if (current.rightValue !== next.leftValue) {
      problems.push({
        type: "canonical-pip-mismatch",
        index,
        expected: current.rightValue,
        actual: next.leftValue
      });
    }
  }

  for (const connection of layout.connections) {
    if (connection.fromValue !== connection.toValue) {
      problems.push({
        type: "render-pip-mismatch",
        fromIndex: connection.fromIndex,
        toIndex: connection.toIndex,
        expected: connection.fromValue,
        actual: connection.toValue
      });
    }

    if (!boxesTouch(connection.from, connection.to, connection.direction)) {
      problems.push({
        type: "connection-gap",
        fromIndex: connection.fromIndex,
        toIndex: connection.toIndex,
        direction: connection.direction
      });
    }
  }

  for (let firstIndex = 0; firstIndex < layout.plays.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < layout.plays.length; secondIndex += 1) {
      if (boxesOverlap(layout.plays[firstIndex], layout.plays[secondIndex])) {
        problems.push({
          type: "tile-overlap",
          firstIndex,
          secondIndex
        });
      }
    }
  }

  return problems;
}

function createArmLayout(options) {
  const {
    side,
    anchor,
    plays,
    initialDirection,
    turnDirection,
    openingValue,
    tileLong,
    tileShort,
    rowCapacity,
    turnTileCount
  } = options;
  const tiles = [];
  const connections = [];
  const state = {
    phase: "horizontal",
    horizontalDirection: initialDirection,
    horizontalCount: 0,
    verticalCount: 0,
    turnDirection,
    rowCapacity,
    turnTileCount
  };
  let previous = anchor;
  let previousValue = openingValue;

  for (const entry of plays) {
    const step = nextStep(state);
    const prevValue = side === "left" ? entry.play.rightValue : entry.play.leftValue;
    const nextValue = side === "left" ? entry.play.leftValue : entry.play.rightValue;

    if (previousValue !== prevValue) {
      connections.push({
        fromIndex: previous.index,
        toIndex: entry.index,
        fromValue: previousValue,
        toValue: prevValue,
        direction: step.direction,
        invalid: true
      });
    }

    const axis = step.phase === "vertical" || entry.play.leftValue === entry.play.rightValue
      ? "vertical"
      : "horizontal";
    const dimensions = dimensionsForAxis(axis, tileLong, tileShort);
    const point = placeAdjacent(previous, dimensions, step.direction);
    const display = displayValuesForDirection(prevValue, nextValue, step.direction);
    const tile = makeLayoutTile({
      play: entry.play,
      index: entry.index,
      x: point.x,
      y: point.y,
      width: dimensions.width,
      height: dimensions.height,
      axis,
      direction: step.direction,
      prevValue,
      nextValue,
      displayFirst: display.first,
      displaySecond: display.second,
      side
    });

    tiles.push(tile);
    connections.push({
      fromIndex: previous.index,
      toIndex: entry.index,
      fromValue: previousValue,
      toValue: prevValue,
      direction: step.direction
    });
    previous = tile;
    previousValue = nextValue;
    consumeStep(state, step);
  }

  return {
    side,
    tiles,
    connections,
    lastTile: previous,
    nextValue: previousValue,
    state
  };
}

function nextStep(state) {
  if (state.phase === "horizontal" && state.horizontalCount >= state.rowCapacity) {
    state.phase = "vertical";
    state.verticalCount = 0;
  }

  if (state.phase === "vertical" && state.verticalCount >= state.turnTileCount) {
    state.phase = "horizontal";
    state.horizontalDirection = oppositeHorizontal(state.horizontalDirection);
    state.horizontalCount = 0;
  }

  return {
    phase: state.phase,
    direction: state.phase === "horizontal" ? state.horizontalDirection : state.turnDirection
  };
}

function consumeStep(state, step) {
  if (step.phase === "horizontal") {
    state.horizontalCount += 1;
    return;
  }

  state.verticalCount += 1;
}

function makeTargetFromArm(arm, end, value, tileLong, tileShort) {
  const step = nextStep({ ...arm.state });
  const dimensions = dimensionsForAxis(step.phase === "vertical" ? "vertical" : "horizontal", tileLong, tileShort);
  const point = placeAdjacent(arm.lastTile, dimensions, step.direction);

  return {
    ...point,
    ...dimensions,
    end,
    value,
    axis: step.phase === "vertical" ? "vertical" : "horizontal",
    direction: step.direction
  };
}

function makeLayoutTile(options) {
  const {
    play,
    index,
    x,
    y,
    width,
    height,
    axis,
    direction,
    prevValue,
    nextValue,
    displayFirst,
    displaySecond,
    side
  } = options;

  return {
    index,
    id: play.tile?.id ?? `${play.leftValue}:${play.rightValue}`,
    leftValue: play.leftValue,
    rightValue: play.rightValue,
    x,
    y,
    width,
    height,
    axis,
    direction,
    prevValue,
    nextValue,
    displayFirst,
    displaySecond,
    isDouble: play.leftValue === play.rightValue,
    side
  };
}

function dimensionsForAxis(axis, tileLong, tileShort) {
  return axis === "vertical"
    ? { width: tileShort, height: tileLong }
    : { width: tileLong, height: tileShort };
}

function displayValuesForDirection(prevValue, nextValue, direction) {
  if (direction === "left" || direction === "up") {
    return {
      first: nextValue,
      second: prevValue
    };
  }

  return {
    first: prevValue,
    second: nextValue
  };
}

function placeAdjacent(previous, dimensions, direction) {
  const centeredX = Math.round(previous.x + previous.width / 2 - dimensions.width / 2);
  const centeredY = Math.round(previous.y + previous.height / 2 - dimensions.height / 2);

  if (direction === "right") {
    return {
      x: previous.x + previous.width,
      y: previous.direction === "up" ? previous.y : previous.direction === "down" ? previous.y + previous.height - dimensions.height : centeredY
    };
  }

  if (direction === "left") {
    return {
      x: previous.x - dimensions.width,
      y: previous.direction === "down" ? previous.y + previous.height - dimensions.height : previous.direction === "up" ? previous.y : centeredY
    };
  }

  if (direction === "down") {
    return {
      x: previous.direction === "right" ? previous.x + previous.width - dimensions.width : previous.direction === "left" ? previous.x : centeredX,
      y: previous.y + previous.height
    };
  }

  return {
    x: previous.direction === "left" ? previous.x : previous.direction === "right" ? previous.x + previous.width - dimensions.width : centeredX,
    y: previous.y - dimensions.height
  };
}

function normalizeLayout(positions, targets) {
  return [...positions, ...targets].reduce((bounds, position) => ({
    minX: Math.min(bounds.minX, position.x),
    minY: Math.min(bounds.minY, position.y),
    maxX: Math.max(bounds.maxX, position.x + position.width),
    maxY: Math.max(bounds.maxY, position.y + position.height)
  }), {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  });
}

function shiftPosition(position, bounds) {
  return {
    ...position,
    x: position.x - bounds.minX + BOARD_MARGIN,
    y: position.y - bounds.minY + BOARD_MARGIN
  };
}

function boxesTouch(from, to, direction) {
  if (direction === "right") {
    return sameCoordinate(to.x, from.x + from.width) && rangesOverlap(from.y, from.y + from.height, to.y, to.y + to.height);
  }

  if (direction === "left") {
    return sameCoordinate(to.x + to.width, from.x) && rangesOverlap(from.y, from.y + from.height, to.y, to.y + to.height);
  }

  if (direction === "down") {
    return sameCoordinate(to.y, from.y + from.height) && rangesOverlap(from.x, from.x + from.width, to.x, to.x + to.width);
  }

  return sameCoordinate(to.y + to.height, from.y) && rangesOverlap(from.x, from.x + from.width, to.x, to.x + to.width);
}

function boxesOverlap(first, second) {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}

function rangesOverlap(firstStart, firstEnd, secondStart, secondEnd) {
  return Math.max(firstStart, secondStart) < Math.min(firstEnd, secondEnd);
}

function sameCoordinate(first, second) {
  return Math.abs(first - second) < 0.001;
}

function oppositeHorizontal(direction) {
  return direction === "right" ? "left" : "right";
}

function findOpeningIndex(plays) {
  const index = plays.findIndex((play) => play.end === "opening");
  return index === -1 ? Math.floor(plays.length / 2) : index;
}
