import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChampionshipDashboardWorkbook,
  championshipDashboardFilename,
  championshipDashboardRows
} from "../src/championshipDayExcel.js";
import {
  createChampionshipSession,
  endChampionship,
  recordRound
} from "../src/championshipDayEngine.js";

test("championship dashboard workbook maps final scores to the template fields", () => {
  const championship = completedChampionship();
  const rows = championshipDashboardRows(championship, new Date("2026-06-17T00:00:00.000Z"));
  const leader = rows[0];

  assert.equal(championshipDashboardFilename(championship, new Date("2026-06-17T00:00:00.000Z")), "championship-dashboard-17-06.26.xlsx");
  assert.equal(leader.playerName, "Player 1");
  assert.equal(leader.date, "2026-06-17");
  assert.equal(leader.placing, 1);
  assert.equal(leader.totalPoints, 25);
  assert.equal(leader.gamesPlayed, 5);
  assert.equal(leader.normalWins, 5);
  assert.equal(leader.lockWins, 0);
  assert.equal(leader.normalLosses, 0);
  assert.equal(leader.lockLoses, 0);

  const workbook = buildChampionshipDashboardWorkbook(championship, {
    now: new Date("2026-06-17T00:00:00.000Z")
  });

  assert.equal(workbook.filename, "championship-dashboard-17-06.26.xlsx");
  assert.equal(workbook.buffer.subarray(0, 2).toString("utf8"), "PK");
  assert.match(workbook.buffer.toString("utf8"), /Player Name/);
  assert.match(workbook.buffer.toString("utf8"), /Lock and Win/);
  assert.match(workbook.buffer.toString("utf8"), /Lock and Loss/);
});

test("championship dashboard counts the Excel normal losses column as all fourth-place finishes", () => {
  const championship = completedChampionshipWithLockLoss();
  const rows = championshipDashboardRows(championship, new Date("2026-06-17T00:00:00.000Z"));
  const playerFour = rows.find((row) => row.playerName === "Player 4");

  assert.equal(playerFour.normalLosses, 5);
  assert.equal(playerFour.lockLoses, 2);
  assert.equal(playerFour.gamesPlayed, 5);
});

test("championship dashboard applies requested Excel output colors", () => {
  const workbook = buildChampionshipDashboardWorkbook(completedTwelvePlayerChampionship(), {
    now: new Date("2026-06-17T00:00:00.000Z")
  });
  const xml = workbook.buffer.toString("utf8");

  assert.match(xml, /<fill><patternFill patternType="solid"><fgColor rgb="FF87CEEB"/);
  assert.match(xml, /<c r="I1" s="2"\/>\s*<c r="J1" s="2"\/>/);
  assert.match(xml, /<c r="A2" s="6" t="inlineStr">/);
  assert.match(xml, /<c r="E2" s="7" t="inlineStr">/);
  assert.match(xml, /<c r="J2" s="6" t="inlineStr">/);
  assert.match(xml, /<c r="A11" s="25" t="inlineStr">/);
  assert.match(xml, /<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"\/>/);
});

function completedChampionship() {
  const players = Array.from({ length: 8 }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`
  }));
  const started = createChampionshipSession({
    id: "excel-day",
    name: "Excel Championship",
    location: "Community Hall",
    tableCount: 2,
    players,
    startTime: "2026-06-17T14:00:00.000Z"
  });
  const scored = recordRound(started, {
    roundNumber: 1,
    tables: started.currentTables.map((table) => ({
      tableId: table.id,
      games: Array.from({ length: 5 }, (_, gameIndex) => ({
        gameNumber: gameIndex + 1,
        scores: table.playerIds.map((playerId, playerIndex) => ({
          playerId,
          points: [5, 3, 2, 1][playerIndex]
        }))
      }))
    }))
  });

  return endChampionship(scored, {
    endTime: "2026-06-17T19:00:00.000Z"
  });
}

function completedChampionshipWithLockLoss() {
  const players = Array.from({ length: 8 }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`
  }));
  const started = createChampionshipSession({
    id: "excel-day-lock-loss",
    name: "Excel Championship",
    location: "Community Hall",
    tableCount: 2,
    players,
    startTime: "2026-06-17T14:00:00.000Z"
  });
  const scored = recordRound(started, {
    roundNumber: 1,
    tables: started.currentTables.map((table) => ({
      tableId: table.id,
      games: [
        [5, 3, 2, 0],
        [5, 3, 2, 1],
        [5, 3, 2, 0],
        [5, 3, 2, 1],
        [5, 3, 2, 1]
      ].map((points, gameIndex) => ({
        gameNumber: gameIndex + 1,
        scores: table.playerIds.map((playerId, playerIndex) => ({
          playerId,
          points: points[playerIndex]
        }))
      }))
    }))
  });

  return endChampionship(scored, {
    endTime: "2026-06-17T19:00:00.000Z"
  });
}

function completedTwelvePlayerChampionship() {
  const players = Array.from({ length: 12 }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`
  }));
  const started = createChampionshipSession({
    id: "excel-day-twelve",
    name: "Excel Championship",
    location: "Community Hall",
    tableCount: 3,
    players,
    startTime: "2026-06-17T14:00:00.000Z"
  });
  const scored = recordRound(started, {
    roundNumber: 1,
    tables: started.currentTables.map((table) => ({
      tableId: table.id,
      games: Array.from({ length: 5 }, (_, gameIndex) => ({
        gameNumber: gameIndex + 1,
        scores: table.playerIds.map((playerId, playerIndex) => ({
          playerId,
          points: [5, 3, 2, 1][playerIndex]
        }))
      }))
    }))
  });

  return endChampionship(scored, {
    endTime: "2026-06-17T19:00:00.000Z"
  });
}
