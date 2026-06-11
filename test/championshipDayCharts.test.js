import assert from "node:assert/strict";
import test from "node:test";

import { buildChampionshipDayChartData } from "../public/championshipDayCharts.js";

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
