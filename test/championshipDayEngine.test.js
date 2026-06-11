import assert from "node:assert/strict";
import test from "node:test";

import { createTile } from "../src/dominoesEngine.js";
import {
  CHAMPIONSHIP_DAY_STATUS,
  assignPlayersToStartingTables,
  calculateOverallLeaderboard,
  createChampionshipSession,
  editRound,
  endChampionship,
  rankPlayersPerTableAfterRound,
  recordRound,
  tableLabelsForCount,
  validateRoundScoreEntries
} from "../src/championshipDayEngine.js";

function players(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`
  }));
}

function tableRound(tableId, playerIds, rows) {
  return {
    tableId,
    games: rows.map((points, index) => ({
      gameNumber: index + 1,
      scores: playerIds.map((playerId, playerIndex) => ({
        playerId,
        points: points[playerIndex]
      }))
    }))
  };
}

function validTwoTableRound() {
  return {
    roundNumber: 1,
    tables: [
      tableRound("table-a", ["p1", "p2", "p3", "p4"], [
        [5, 3, 2, 1],
        [5, 3, 2, 1],
        [5, 3, 2, 1],
        [3, 2, 1, 5],
        [3, 2, 1, 5]
      ]),
      tableRound("table-b", ["p5", "p6", "p7", "p8"], [
        [5, 3, 2, 1],
        [5, 3, 2, 1],
        [3, 5, 2, 1],
        [3, 5, 2, 1],
        [2, 3, 5, 1]
      ])
    ]
  };
}

function roundWhereSeatOrderDefinesPlaces(championship) {
  return {
    roundNumber: championship.currentRoundNumber,
    tables: championship.currentTables.map((table) => tableRound(table.id, table.playerIds, [
      [5, 3, 2, 1],
      [5, 3, 2, 1],
      [5, 3, 2, 1],
      [5, 3, 2, 1],
      [5, 3, 2, 1]
    ]))
  };
}

function userExampleRound() {
  return {
    roundNumber: 1,
    tables: [
      tableRound("table-a", ["p1", "p2", "p3", "p4"], [
        [5, 3, 2, 1],
        [3, 1, 2, 5],
        [1, 2, 3, 5],
        [6, 3, 1, 2],
        [5, 2, 3, 1]
      ]),
      tableRound("table-b", ["p5", "p6", "p7", "p8"], [
        [5, 3, 2, 1],
        [3, 5, 2, 1],
        [3, 5, 1, 2],
        [1, 2, 5, 3],
        [1, 3, 2, 6]
      ])
    ]
  };
}

function cloneRound(round) {
  return JSON.parse(JSON.stringify(round));
}

test("creates 2-table, 3-table, and 4-table championship day sessions", () => {
  for (const tableCount of [2, 3, 4]) {
    const championship = createChampionshipSession({
      id: `day-${tableCount}`,
      name: `${tableCount} Table Day`,
      location: "Club House",
      tableCount,
      players: players(tableCount * 4),
      startTime: "2026-06-07T14:00:00.000Z",
      expectedEndTime: "2026-06-07T19:00:00.000Z"
    });

    assert.equal(championship.status, CHAMPIONSHIP_DAY_STATUS.ACTIVE);
    assert.equal(championship.tableCount, tableCount);
    assert.equal(championship.players.length, tableCount * 4);
    assert.equal(championship.currentTables.length, tableCount);
    assert.deepEqual(championship.currentTables.map((table) => table.label), tableLabelsForCount(tableCount));
    assert.deepEqual(championship.currentTables.map((table) => table.playerIds.length), Array(tableCount).fill(4));
    assert.equal(championship.startTime, "2026-06-07T14:00:00.000Z");
    assert.equal(championship.expectedEndTime, "2026-06-07T19:00:00.000Z");
    assert.equal(championship.endTime, null);
    assert.deepEqual(championship.rounds, []);
  }
});

test("rejects unsupported table counts and invalid player counts", () => {
  assert.throws(
    () => createChampionshipSession({ tableCount: 1, players: players(4) }),
    /supports only 2, 3, or 4 tables/
  );
  assert.throws(
    () => createChampionshipSession({ tableCount: 2, players: players(7) }),
    /Expected 8 players/
  );
  assert.throws(
    () => createChampionshipSession({
      tableCount: 2,
      players: [
        { id: "p1", name: "Allan" },
        { id: "p2", name: "allan" },
        { id: "p3", name: "Player 3" },
        { id: "p4", name: "Player 4" },
        { id: "p5", name: "Player 5" },
        { id: "p6", name: "Player 6" },
        { id: "p7", name: "Player 7" },
        { id: "p8", name: "Player 8" }
      ]
    }),
    /Player names must be unique/
  );
});

test("assigns starting tables in player entry order", () => {
  const assignments = assignPlayersToStartingTables(players(12), 3);

  assert.deepEqual(assignments.map((table) => table.label), ["Table A", "Table B", "Table C"]);
  assert.deepEqual(assignments[0].playerIds, ["p1", "p2", "p3", "p4"]);
  assert.deepEqual(assignments[1].playerIds, ["p5", "p6", "p7", "p8"]);
  assert.deepEqual(assignments[2].playerIds, ["p9", "p10", "p11", "p12"]);
});

test("preserves championship day player avatar ids", () => {
  const seededPlayers = players(8).map((player, index) => ({
    ...player,
    avatarId: index === 0 ? "electrician" : `avatar-${index + 1}`
  }));
  const championship = createChampionshipSession({
    tableCount: 2,
    players: seededPlayers
  });

  assert.equal(championship.players[0].avatarId, "electrician");
  assert.equal(championship.players[1].avatarId, "avatar-2");
});

test("validates and records a 2-table round with next round assignments", () => {
  const championship = createChampionshipSession({
    tableCount: 2,
    players: players(8),
    startTime: "2026-06-07T14:00:00.000Z"
  });
  const roundInput = validTwoTableRound();
  const validation = validateRoundScoreEntries(championship, roundInput);

  assert.equal(validation.valid, true);

  const updated = recordRound(championship, roundInput, {
    completedAt: "2026-06-07T15:00:00.000Z"
  });
  const [tableA, tableB] = updated.rounds[0].tableResults;

  assert.deepEqual(
    tableA.rankings.map((ranking) => [ranking.playerId, ranking.place, ranking.totalPoints]),
    [["p1", 1, 21], ["p4", 2, 13], ["p2", 3, 13], ["p3", 4, 8]]
  );
  assert.deepEqual(
    tableB.rankings.map((ranking) => [ranking.playerId, ranking.place, ranking.totalPoints]),
    [["p6", 1, 19], ["p5", 2, 18], ["p7", 3, 13], ["p8", 4, 5]]
  );
  assert.deepEqual(updated.currentTables[0].playerIds, ["p1", "p4", "p7", "p8"]);
  assert.deepEqual(updated.currentTables[1].playerIds, ["p6", "p5", "p2", "p3"]);
  assert.equal(updated.currentRoundNumber, 2);
});

test("rotates 2-table relegation over multiple rounds with stayers first and incoming players next", () => {
  let championship = createChampionshipSession({
    tableCount: 2,
    players: players(8)
  });

  championship = recordRound(championship, roundWhereSeatOrderDefinesPlaces(championship));

  assert.deepEqual(
    championship.currentTables.map((table) => table.playerIds),
    [
      ["p1", "p2", "p7", "p8"],
      ["p5", "p6", "p3", "p4"]
    ]
  );
  assert.deepEqual(
    championship.rounds[0].nextTables.map((table) => table.playerIds),
    championship.currentTables.map((table) => table.playerIds)
  );

  championship = recordRound(championship, roundWhereSeatOrderDefinesPlaces(championship));

  assert.deepEqual(
    championship.currentTables.map((table) => table.playerIds),
    [
      ["p1", "p2", "p3", "p4"],
      ["p5", "p6", "p7", "p8"]
    ]
  );
});

test("rotates 3-table relegation over multiple rounds in A to B to C to A order", () => {
  let championship = createChampionshipSession({
    tableCount: 3,
    players: players(12)
  });

  championship = recordRound(championship, roundWhereSeatOrderDefinesPlaces(championship));

  assert.deepEqual(
    championship.currentTables.map((table) => table.playerIds),
    [
      ["p1", "p2", "p11", "p12"],
      ["p5", "p6", "p3", "p4"],
      ["p9", "p10", "p7", "p8"]
    ]
  );

  championship = recordRound(championship, roundWhereSeatOrderDefinesPlaces(championship));

  assert.deepEqual(
    championship.currentTables.map((table) => table.playerIds),
    [
      ["p1", "p2", "p7", "p8"],
      ["p5", "p6", "p11", "p12"],
      ["p9", "p10", "p3", "p4"]
    ]
  );

  championship = recordRound(championship, roundWhereSeatOrderDefinesPlaces(championship));

  assert.deepEqual(
    championship.currentTables.map((table) => table.playerIds),
    [
      ["p1", "p2", "p3", "p4"],
      ["p5", "p6", "p7", "p8"],
      ["p9", "p10", "p11", "p12"]
    ]
  );
});

test("rotates 4-table relegation over multiple rounds in A to B to C to D to A order", () => {
  let championship = createChampionshipSession({
    tableCount: 4,
    players: players(16)
  });

  championship = recordRound(championship, roundWhereSeatOrderDefinesPlaces(championship));

  assert.deepEqual(
    championship.currentTables.map((table) => table.playerIds),
    [
      ["p1", "p2", "p15", "p16"],
      ["p5", "p6", "p3", "p4"],
      ["p9", "p10", "p7", "p8"],
      ["p13", "p14", "p11", "p12"]
    ]
  );

  championship = recordRound(championship, roundWhereSeatOrderDefinesPlaces(championship));

  assert.deepEqual(
    championship.currentTables.map((table) => table.playerIds),
    [
      ["p1", "p2", "p11", "p12"],
      ["p5", "p6", "p15", "p16"],
      ["p9", "p10", "p3", "p4"],
      ["p13", "p14", "p7", "p8"]
    ]
  );

  championship = recordRound(championship, roundWhereSeatOrderDefinesPlaces(championship));

  assert.deepEqual(
    championship.currentTables.map((table) => table.playerIds),
    [
      ["p1", "p2", "p7", "p8"],
      ["p5", "p6", "p11", "p12"],
      ["p9", "p10", "p15", "p16"],
      ["p13", "p14", "p3", "p4"]
    ]
  );

  championship = recordRound(championship, roundWhereSeatOrderDefinesPlaces(championship));

  assert.deepEqual(
    championship.currentTables.map((table) => table.playerIds),
    [
      ["p1", "p2", "p3", "p4"],
      ["p5", "p6", "p7", "p8"],
      ["p9", "p10", "p11", "p12"],
      ["p13", "p14", "p15", "p16"]
    ]
  );
});

test("editing round 1 recalculates the next table assignment and records audit history", () => {
  const championship = createChampionshipSession({
    tableCount: 2,
    players: players(8)
  });
  const recorded = recordRound(championship, validTwoTableRound(), {
    completedAt: "2026-06-07T15:00:00.000Z"
  });
  const edited = editRound(recorded, 1, roundWhereSeatOrderDefinesPlaces(championship), {
    editedAt: "2026-06-07T16:00:00.000Z",
    editedByAdmin: {
      id: "admin-1",
      email: "admin@example.com",
      role: "owner"
    }
  });

  assert.deepEqual(recorded.currentTables[0].playerIds, ["p1", "p4", "p7", "p8"]);
  assert.deepEqual(edited.currentTables[0].playerIds, ["p1", "p2", "p7", "p8"]);
  assert.deepEqual(edited.currentTables[1].playerIds, ["p5", "p6", "p3", "p4"]);
  assert.equal(edited.editHistory.length, 1);
  assert.equal(edited.editHistory[0].roundNumber, 1);
  assert.equal(edited.editHistory[0].editedByAdmin.email, "admin@example.com");
  assert.equal(edited.editHistory[0].changedLaterAssignments, true);
  assert.equal(edited.editHistory[0].previousValues.tables[0].games[0].scores[0].points, 5);
  assert.equal(edited.editHistory[0].newValues.tables[0].games[0].scores[1].points, 3);
});

test("editing a round score recalculates the overall leaderboard", () => {
  const championship = createChampionshipSession({
    tableCount: 2,
    players: players(8)
  });
  const recorded = recordRound(championship, validTwoTableRound());
  const editedRound = cloneRound(validTwoTableRound());

  editedRound.tables[1] = tableRound("table-b", ["p5", "p6", "p7", "p8"], [
    [5, 3, 2, 1],
    [5, 3, 2, 1],
    [5, 3, 2, 1],
    [5, 3, 2, 1],
    [5, 3, 2, 1]
  ]);

  const edited = editRound(recorded, 1, editedRound);
  const leaderboard = calculateOverallLeaderboard(edited);

  assert.equal(calculateOverallLeaderboard(recorded)[0].playerId, "p1");
  assert.equal(leaderboard[0].playerId, "p5");
  assert.equal(leaderboard[0].totalPoints, 25);
});

test("invalid round edits are rejected before history is changed", () => {
  const championship = createChampionshipSession({
    tableCount: 2,
    players: players(8)
  });
  const recorded = recordRound(championship, validTwoTableRound());
  const invalidEdit = cloneRound(validTwoTableRound());

  invalidEdit.tables[0].games[0].scores.find((score) => score.playerId === "p2").points = 5;

  assert.throws(
    () => editRound(recorded, 1, invalidEdit),
    /Invalid round score entries/
  );
  assert.deepEqual(recorded.editHistory, []);
});

test("validates a complete 5-game table score entry", () => {
  const championship = createChampionshipSession({
    tableCount: 2,
    players: players(8)
  });
  const validation = validateRoundScoreEntries(championship, validTwoTableRound());
  const tableA = validation.tables.find((table) => table.tableId === "table-a");

  assert.equal(validation.valid, true);
  assert.equal(tableA.valid, true);
  assert.deepEqual(tableA.errors, []);
});

test("flags a missing game with table-level row detail", () => {
  const championship = createChampionshipSession({
    tableCount: 2,
    players: players(8)
  });
  const round = cloneRound(validTwoTableRound());

  round.tables[0].games.pop();
  const validation = validateRoundScoreEntries(championship, round);
  const tableA = validation.tables.find((table) => table.tableId === "table-a");

  assert.equal(validation.valid, false);
  assert.ok(tableA.errors.some((error) => error.code === "invalidGameCount" && error.actual === 4));
  assert.match(validation.errors.join(" "), /must have exactly 5 games/);
});

test("flags a missing player score with exact game and player detail", () => {
  const championship = createChampionshipSession({
    tableCount: 2,
    players: players(8)
  });
  const round = cloneRound(validTwoTableRound());

  round.tables[0].games[1].scores = round.tables[0].games[1].scores.filter((score) => score.playerId !== "p3");
  const validation = validateRoundScoreEntries(championship, round);
  const tableA = validation.tables.find((table) => table.tableId === "table-a");

  assert.equal(validation.valid, false);
  assert.ok(tableA.errors.some((error) => (
    error.code === "missingPlayerScore"
    && error.gameNumber === 2
    && error.playerId === "p3"
  )));
});

test("flags too many wins and missing placement rows", () => {
  const championship = createChampionshipSession({
    tableCount: 2,
    players: players(8)
  });
  const round = cloneRound(validTwoTableRound());

  round.tables[0].games[0].scores.find((score) => score.playerId === "p2").points = 5;
  const validation = validateRoundScoreEntries(championship, round);
  const tableA = validation.tables.find((table) => table.tableId === "table-a");

  assert.equal(validation.valid, false);
  assert.ok(tableA.errors.some((error) => (
    error.code === "invalidGamePlacements"
    && error.gameNumber === 1
    && error.counts.first === 2
    && error.counts.second === 0
  )));
  assert.ok(tableA.errors.some((error) => (
    error.code === "invalidRoundPlacements"
    && error.counts.first === 6
    && error.counts.second === 4
  )));
});

test("flags missing 3rd and 4th placements with exact game detail", () => {
  const championship = createChampionshipSession({
    tableCount: 2,
    players: players(8)
  });
  const round = cloneRound(validTwoTableRound());

  round.tables[0].games[2].scores.find((score) => score.playerId === "p3").points = 3;
  round.tables[0].games[2].scores.find((score) => score.playerId === "p4").points = 3;
  const validation = validateRoundScoreEntries(championship, round);
  const tableA = validation.tables.find((table) => table.tableId === "table-a");

  assert.equal(validation.valid, false);
  assert.ok(tableA.errors.some((error) => (
    error.code === "invalidGamePlacements"
    && error.gameNumber === 3
    && error.counts.second === 3
    && error.counts.third === 0
    && error.counts.fourth === 0
  )));
});

test("counts lock win and lock lose as first and fourth placements", () => {
  const championship = createChampionshipSession({
    tableCount: 2,
    players: players(8)
  });
  const round = cloneRound(validTwoTableRound());

  round.tables[0].games[0].scores.find((score) => score.playerId === "p1").points = 6;
  round.tables[0].games[0].scores.find((score) => score.playerId === "p4").points = 0;
  const validation = validateRoundScoreEntries(championship, round);
  const updated = recordRound(championship, round);
  const tableA = updated.rounds[0].tableResults.find((table) => table.tableId === "table-a");
  const playerOne = tableA.rankings.find((ranking) => ranking.playerId === "p1");
  const playerFour = tableA.rankings.find((ranking) => ranking.playerId === "p4");

  assert.equal(validation.valid, true);
  assert.equal(playerOne.lockWins, 1);
  assert.equal(playerOne.wins, 3);
  assert.equal(playerFour.lockLoses, 1);
  assert.equal(playerFour.fourthPlaces, 3);
});

test("flags invalid round scores before recording", () => {
  const championship = createChampionshipSession({
    tableCount: 2,
    players: players(8)
  });
  const invalidRound = validTwoTableRound();

  invalidRound.tables[0].games[0].scores[1].points = 5;
  const validation = validateRoundScoreEntries(championship, invalidRound);

  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" "), /one 1st, one 2nd, one 3rd, and one 4th/);
  assert.throws(
    () => recordRound(championship, invalidRound),
    /Invalid round score entries/
  );
});

test("requires tie breaker pull for unresolved table placing ties", () => {
  const championship = createChampionshipSession({
    tableCount: 2,
    players: players(8)
  });
  const tiedRound = validTwoTableRound();

  tiedRound.tables[0] = tableRound("table-a", ["p1", "p2", "p3", "p4"], [
    [5, 3, 2, 1],
    [3, 5, 2, 1],
    [2, 1, 5, 3],
    [1, 2, 3, 5],
    [3, 2, 1, 5]
  ]);

  assert.throws(
    () => recordRound(championship, tiedRound),
    /Tie breaker pull required/
  );

  const resolved = recordRound(championship, tiedRound, {
    tieBreakerPulls: {
      "table-a": {
        p2: [createTile(0, 0), createTile(1, 0)],
        p3: [createTile(6, 6), createTile(5, 6)]
      }
    }
  });
  const tableA = resolved.rounds[0].tableResults[0];

  assert.equal(tableA.rankings[2].determinedBy, "tieBreakerPull");
  assert.equal(tableA.rankings[2].playerId, "p2");
});

test("ranks the user example tables and requires Table A tie breaker pull", () => {
  const championship = createChampionshipSession({
    tableCount: 2,
    players: players(8)
  });
  const tableResults = rankPlayersPerTableAfterRound(championship, userExampleRound());
  const tableA = tableResults.find((table) => table.tableId === "table-a");
  const tableB = tableResults.find((table) => table.tableId === "table-b");

  assert.deepEqual(
    tableA.rankings.map((ranking) => [
      ranking.playerId,
      ranking.totalPoints,
      ranking.place,
      ranking.normalWins,
      ranking.lockWins,
      ranking.secondPlaces,
      ranking.thirdPlaces,
      ranking.fourthPlaces,
      ranking.lockLoses,
      Boolean(ranking.requiresTieBreakerPull)
    ]),
    [
      ["p1", 20, 1, 2, 1, 1, 0, 1, 0, false],
      ["p4", 14, 2, 2, 0, 0, 1, 2, 0, false],
      ["p2", 11, 3, 0, 0, 2, 2, 1, 0, true],
      ["p3", 11, 4, 0, 0, 2, 2, 1, 0, true]
    ]
  );
  assert.deepEqual(tableA.unresolvedTieGroups, [["p2", "p3"]]);
  assert.throws(
    () => recordRound(championship, userExampleRound()),
    /Tie breaker pull required/
  );

  assert.deepEqual(
    tableB.rankings.map((ranking) => [ranking.playerId, ranking.totalPoints, ranking.place, ranking.wins, ranking.lockWins]),
    [["p6", 18, 1, 2, 0], ["p8", 13, 2, 1, 1], ["p5", 13, 3, 1, 0], ["p7", 12, 4, 1, 0]]
  );
});

test("stores tie breaker pull tiles and uses pip rule when pull totals are tied", () => {
  const championship = createChampionshipSession({
    tableCount: 2,
    players: players(8)
  });
  const updated = recordRound(championship, userExampleRound(), {
    tieBreakerPulls: {
      "table-a": {
        p2: [createTile(6, 1), createTile(2, 1)],
        p3: [createTile(5, 3), createTile(1, 1)]
      }
    }
  });
  const tableA = updated.rounds[0].tableResults.find((table) => table.tableId === "table-a");

  assert.deepEqual(
    tableA.rankings.map((ranking) => [ranking.playerId, ranking.place, ranking.determinedBy ?? null]),
    [["p1", 1, null], ["p4", 2, null], ["p3", 3, "tieBreakerPull"], ["p2", 4, "tieBreakerPull"]]
  );
  const playerThree = tableA.rankings.find((ranking) => ranking.playerId === "p3");

  assert.equal(playerThree.tieBreakerPipTotal, 10);
  assert.deepEqual(playerThree.tieBreakerTiles.map((tile) => [tile.high, tile.low]), [[5, 3], [1, 1]]);
});

test("calculates overall leaderboard and ends manually", () => {
  const championship = createChampionshipSession({
    tableCount: 2,
    players: players(8),
    startTime: "2026-06-07T14:00:00.000Z"
  });
  const updated = recordRound(championship, validTwoTableRound());
  const leaderboard = calculateOverallLeaderboard(updated);

  assert.equal(leaderboard[0].playerId, "p1");
  assert.equal(leaderboard[0].totalPoints, 21);
  assert.equal(leaderboard[0].rank, 1);

  const ended = endChampionship(updated, {
    endTime: "2026-06-07T19:00:00.000Z"
  });

  assert.equal(ended.status, CHAMPIONSHIP_DAY_STATUS.COMPLETED);
  assert.equal(ended.endTime, "2026-06-07T19:00:00.000Z");
  assert.equal(ended.finalLeaderboard[0].playerId, "p1");
  assert.throws(
    () => recordRound(ended, validTwoTableRound()),
    /Championship is not active/
  );
});
