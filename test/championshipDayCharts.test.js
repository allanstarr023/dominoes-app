import assert from "node:assert/strict";
import test from "node:test";

import { buildChampionshipDayChartData, headToHeadOption } from "../public/championshipDayCharts.js";

function tableResult(tableId, playerIds, rows) {
  return {
    tableId,
    tableLabel: tableId === "table-a" ? "Table A" : "Table B",
    playerIds,
    games: rows.map((points, index) => ({
      number: index + 1,
      scores: playerIds.map((playerId, playerIndex) => ({
        playerId,
        points: points[playerIndex]
      }))
    })),
    rankings: playerIds.map((playerId, index) => ({
      playerId,
      playerName: playerId,
      place: index + 1,
      totalPoints: rows.reduce((sum, points) => sum + points[index], 0),
      normalWins: rows.filter((points) => points[index] === 5).length,
      lockWins: rows.filter((points) => points[index] === 6).length,
      secondPlaces: rows.filter((points) => points[index] === 3).length,
      thirdPlaces: rows.filter((points) => points[index] === 2).length,
      fourthPlaces: rows.filter((points) => points[index] === 1 || points[index] === 0).length,
      lockLoses: rows.filter((points) => points[index] === 0).length
    }))
  };
}

test("head-to-head chart data counts every completed game where row player placed above column player", () => {
  const championship = {
    players: [
      { id: "p1", name: "Allan" },
      { id: "p2", name: "Wick" },
      { id: "p3", name: "Chris" },
      { id: "p4", name: "Arrow" }
    ],
    rounds: [
      {
        number: 1,
        tableResults: [
          tableResult("table-a", ["p1", "p2", "p3", "p4"], [
            [5, 3, 2, 1],
            [3, 5, 2, 1],
            [2, 3, 6, 1],
            [1, 2, 3, 5],
            [6, 3, 2, 1]
          ])
        ]
      }
    ]
  };

  const data = buildChampionshipDayChartData(championship);
  const playerIndex = Object.fromEntries(data.players.map((player, index) => [player.id, index]));
  const count = (rowPlayerId, columnPlayerId) => data.headToHead[playerIndex[rowPlayerId]][playerIndex[columnPlayerId]];

  assert.equal(count("p1", "p2"), 2);
  assert.equal(count("p2", "p1"), 3);
  assert.equal(count("p3", "p4"), 4);
  assert.equal(count("p4", "p1"), 1);
  assert.equal(count("p1", "p1"), 0);
});

test("head-to-head chart data calculates row player matchup percentage", () => {
  const championship = {
    players: [
      { id: "p1", name: "Allan" },
      { id: "p2", name: "Wick" },
      { id: "p3", name: "Chris" },
      { id: "p4", name: "Arrow" }
    ],
    rounds: [
      {
        number: 1,
        tableResults: [
          tableResult("table-a", ["p1", "p2", "p3", "p4"], [
            [5, 3, 2, 1],
            [3, 5, 2, 1],
            [2, 3, 6, 1],
            [1, 2, 3, 5],
            [6, 3, 2, 1]
          ])
        ]
      }
    ]
  };

  const data = buildChampionshipDayChartData(championship);
  const allanRow = data.headToHeadRows.findIndex((player) => player.id === "p1");
  const wickColumn = data.headToHeadColumns.findIndex((player) => player.id === "p2");
  const wickRow = data.headToHeadRows.findIndex((player) => player.id === "p2");
  const allanColumn = data.headToHeadColumns.findIndex((player) => player.id === "p1");

  assert.equal(data.headToHeadCells[allanRow][wickColumn].rowWins, 2);
  assert.equal(data.headToHeadCells[allanRow][wickColumn].columnWins, 3);
  assert.equal(data.headToHeadCells[allanRow][wickColumn].total, 5);
  assert.equal(data.headToHeadCells[allanRow][wickColumn].percentage, 40);
  assert.equal(data.headToHeadCells[wickRow][allanColumn].percentage, 60);
});

test("player filter narrows all championship day chart data to one player", () => {
  const championship = {
    players: [
      { id: "p1", name: "Allan" },
      { id: "p2", name: "Wick" },
      { id: "p3", name: "Chris" },
      { id: "p4", name: "Arrow" }
    ],
    rounds: [
      {
        number: 1,
        tableResults: [
          tableResult("table-a", ["p1", "p2", "p3", "p4"], [
            [5, 3, 2, 1],
            [3, 5, 2, 1],
            [2, 3, 6, 1],
            [1, 2, 3, 5],
            [6, 3, 2, 1]
          ])
        ]
      }
    ]
  };

  const data = buildChampionshipDayChartData(championship, { playerId: "p1" });

  assert.equal(data.selectedPlayer.name, "Allan");
  assert.deepEqual(data.leaderboard.map((player) => player.id), ["p1"]);
  assert.deepEqual(data.topMomentumPlayers.map((player) => player.id), ["p1"]);
  assert.ok(data.roundBurstRows.every((row) => row.playerId === "p1"));
  assert.deepEqual(data.headToHeadRows.map((player) => player.id), ["p1"]);
  assert.deepEqual(data.headToHeadColumns.map((player) => player.id), ["p2", "p3", "p4"]);
  assert.equal(data.headToHeadCells[0][0].rowWins, 2);
  assert.equal(data.headToHeadCells[0][0].columnWins, 3);
});

test("head-to-head option colors by percentage dimension and rounds half down", () => {
  const option = headToHeadOption({
    selectedPlayer: null,
    headToHeadRows: [
      { id: "p1", name: "Allan" }
    ],
    headToHeadColumns: [
      { id: "p2", name: "Keith" },
      { id: "p3", name: "Wick" },
      { id: "p4", name: "Arrow" }
    ],
    headToHeadCells: [[
      {
        rowPlayerId: "p1",
        columnPlayerId: "p2",
        rowPlayerName: "Allan",
        columnPlayerName: "Keith",
        rowIndex: 0,
        colIndex: 0,
        rowWins: 333,
        columnWins: 667,
        total: 1000,
        percentage: 33.3
      },
      {
        rowPlayerId: "p1",
        columnPlayerId: "p3",
        rowPlayerName: "Allan",
        columnPlayerName: "Wick",
        rowIndex: 0,
        colIndex: 1,
        rowWins: 335,
        columnWins: 665,
        total: 1000,
        percentage: 33.5
      },
      {
        rowPlayerId: "p1",
        columnPlayerId: "p4",
        rowPlayerName: "Allan",
        columnPlayerName: "Arrow",
        rowIndex: 0,
        colIndex: 2,
        rowWins: 336,
        columnWins: 664,
        total: 1000,
        percentage: 33.6
      }
    ]]
  });

  assert.equal(option.visualMap.dimension, 2);
  assert.deepEqual(option.visualMap.inRange.color, ["#d65742", "#e6ae4a", "#176b54"]);
  assert.deepEqual(option.series[0].data.map((entry) => entry[2]), [33, 33, 34]);
  assert.deepEqual(option.series[0].data.map((entry) => entry[6]), [33, 33, 34]);
});
