import * as PIXI from "./vendor/pixi.min.mjs?v=45";
import { createBoardLayout } from "./boardLayout.js?v=45";

const instances = new WeakMap();
const pipColors = {
  0: 0x2f3a39,
  1: 0xc98319,
  2: 0xcf4d3f,
  3: 0x269c3b,
  4: 0x2d65b3,
  5: 0x2e9a9b,
  6: 0x9a42b9
};
const pipMap = {
  0: [],
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
  6: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.5], [0.72, 0.5], [0.28, 0.72], [0.72, 0.72]]
};

export async function renderPixiBoard(container, options) {
  clearPixiBoard(container);

  const token = Symbol("pixi-board-render");
  instances.set(container, { token, app: null });

  const width = Math.max(1, Math.round(container.clientWidth || 760));
  const height = Math.max(1, Math.round(container.clientHeight || 390));
  const app = new PIXI.Application();

  await app.init({
    width,
    height,
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    preference: "webgl"
  });

  const active = instances.get(container);

  if (!active || active.token !== token) {
    destroyApp(app);
    return null;
  }

  app.canvas.className = "pixi-board-canvas";
  container.prepend(app.canvas);
  instances.set(container, { token, app });

  const layout = createBoardLayout(options.plays ?? []);
  const boardLayer = new PIXI.Container();
  const scale = computeScale(layout, width, height);

  boardLayer.scale.set(scale);
  boardLayer.position.set(
    Math.round((width - layout.width * scale) / 2),
    Math.round((height - layout.height * scale) / 2)
  );

  if (layout.openingTarget) {
    drawOpeningTarget(boardLayer, layout.openingTarget, {
      enabled: Boolean(options.openingEnabled),
      label: options.openingEnabled ? "Pose selected tile" : "Select a playable tile",
      onTap: () => options.onTarget?.("opening")
    });
  } else {
    for (const tile of layout.plays) {
      drawDomino(boardLayer, tile);
    }

    drawEndTarget(boardLayer, layout.leftTarget, {
      enabled: options.selectedEnds?.includes("left"),
      onTap: () => options.onTarget?.("left")
    });
    drawEndTarget(boardLayer, layout.rightTarget, {
      enabled: options.selectedEnds?.includes("right"),
      onTap: () => options.onTarget?.("right")
    });
  }

  app.stage.addChild(boardLayer);
  container.dataset.layoutProblems = JSON.stringify(layout.problems);
  container.dataset.renderedTileCount = String(layout.plays.length);
  container.dataset.boardScale = String(scale);
  window.__dominoesLastBoardLayout = {
    width: layout.width,
    height: layout.height,
    scale,
    plays: layout.plays,
    connections: layout.connections.map((connection) => ({
      fromIndex: connection.fromIndex,
      toIndex: connection.toIndex,
      fromValue: connection.fromValue,
      toValue: connection.toValue,
      direction: connection.direction
    })),
    problems: layout.problems
  };

  return layout;
}

export function clearPixiBoard(container) {
  const existing = instances.get(container);

  if (!existing) {
    return;
  }

  instances.delete(container);

  if (existing.app) {
    destroyApp(existing.app);
  }
}

function destroyApp(app) {
  try {
    app.destroy(true);
  } catch {
    app.destroy();
  }
}

function computeScale(layout, width, height) {
  const margin = 20;
  const fitScale = Math.min(
    (width - margin * 2) / layout.width,
    (height - margin * 2) / layout.height
  );

  return Math.max(0.14, Math.min(1.18, fitScale));
}

function drawDomino(layer, tile) {
  const group = new PIXI.Container();
  group.position.set(tile.x, tile.y);

  const shadow = new PIXI.Graphics();
  shadow.roundRect(0, 4, tile.width, tile.height, 8)
    .fill({ color: 0x000000, alpha: 0.18 });
  group.addChild(shadow);

  const body = new PIXI.Graphics();
  body.roundRect(0, 0, tile.width, tile.height, 8)
    .fill(0xfffcf4)
    .stroke({ color: 0x101514, width: 1.5 });
  group.addChild(body);

  const divider = new PIXI.Graphics();
  divider
    .moveTo(tile.axis === "horizontal" ? tile.width / 2 : 6, tile.axis === "horizontal" ? 6 : tile.height / 2)
    .lineTo(tile.axis === "horizontal" ? tile.width / 2 : tile.width - 6, tile.axis === "horizontal" ? tile.height - 6 : tile.height / 2)
    .stroke({ color: 0x1d2724, width: 1, alpha: 0.22 });
  group.addChild(divider);

  const firstHalf = tile.axis === "horizontal"
    ? { x: 0, y: 0, width: tile.width / 2, height: tile.height }
    : { x: 0, y: 0, width: tile.width, height: tile.height / 2 };
  const secondHalf = tile.axis === "horizontal"
    ? { x: tile.width / 2, y: 0, width: tile.width / 2, height: tile.height }
    : { x: 0, y: tile.height / 2, width: tile.width, height: tile.height / 2 };

  drawPips(group, firstHalf, tile.displayFirst);
  drawPips(group, secondHalf, tile.displaySecond);
  layer.addChild(group);
}

function drawEndTarget(layer, target, options) {
  const group = new PIXI.Container();
  group.position.set(target.x, target.y);

  const fill = options.enabled ? 0xf0b940 : 0xe8ede8;
  const alpha = options.enabled ? 0.95 : 0.42;
  const stroke = options.enabled ? 0xf7d46f : 0xffffff;
  const body = new PIXI.Graphics();

  body.roundRect(0, 0, target.width, target.height, 8)
    .fill({ color: fill, alpha })
    .stroke({ color: stroke, width: 2, alpha: 0.92 });
  group.addChild(body);
  drawPips(group, { x: 0, y: 0, width: target.width, height: target.height }, target.value, 0.8);

  if (options.enabled) {
    group.eventMode = "static";
    group.cursor = "pointer";
    group.on("pointertap", options.onTap);
  }

  layer.addChild(group);
}

function drawOpeningTarget(layer, target, options) {
  const group = new PIXI.Container();
  group.position.set(target.x, target.y);

  const body = new PIXI.Graphics();
  body.roundRect(0, 0, target.width, target.height, 10)
    .fill({ color: options.enabled ? 0xf0b940 : 0xe8ede8, alpha: options.enabled ? 0.95 : 0.42 })
    .stroke({ color: options.enabled ? 0xf7d46f : 0xffffff, width: 2, alpha: 0.9 });
  group.addChild(body);

  const text = new PIXI.Text({
    text: options.label,
    style: {
      fill: options.enabled ? 0x101514 : 0xffffff,
      fontFamily: "Arial, sans-serif",
      fontSize: 16,
      fontWeight: "800"
    }
  });
  text.anchor.set(0.5);
  text.position.set(target.width / 2, target.height / 2);
  group.addChild(text);

  if (options.enabled) {
    group.eventMode = "static";
    group.cursor = "pointer";
    group.on("pointertap", options.onTap);
  }

  layer.addChild(group);
}

function drawPips(layer, rect, value, sizeMultiplier = 1) {
  const dots = pipMap[value] ?? [];
  const color = pipColors[value] ?? pipColors[0];
  const radius = Math.max(2.4, Math.min(rect.width, rect.height) * 0.07 * sizeMultiplier);

  for (const [xRatio, yRatio] of dots) {
    const pip = new PIXI.Graphics();
    pip.circle(rect.x + rect.width * xRatio, rect.y + rect.height * yRatio, radius)
      .fill({ color, alpha: 0.98 });
    layer.addChild(pip);
  }
}
