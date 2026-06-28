import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createStatsStore } from "../src/statsStore.js";

test("completed 5-game championships persist replay data for past championship history", async () => {
  const store = createStatsStore({
    filePath: join(tmpdir(), `dominoes-stats-replay-${Date.now()}-${Math.random()}.json`)
  });

  await store.recordCompletedMatch(completedRoom());

  const snapshot = await store.getSnapshot();
  const past = snapshot.pastChampionships[0];

  assert.equal(past.replayAvailable, true);
  assert.equal(past.matchLength, 5);
  assert.equal(past.replay.seats.length, 4);
  assert.equal(past.replay.match.completedGames.length, 5);
  assert.deepEqual(past.replay.match.completedGames[4].pointsByPlayerId, {
    p1: 5,
    p2: 3,
    p3: 2,
    p4: 1
  });
});

test("completed 2-game championships remain in history but are not replayable", async () => {
  const store = createStatsStore({
    filePath: join(tmpdir(), `dominoes-stats-short-${Date.now()}-${Math.random()}.json`)
  });
  const room = completedRoom({ matchLength: 2, completedGames: completedGames().slice(0, 2) });

  await store.recordCompletedMatch(room);

  const snapshot = await store.getSnapshot();
  const past = snapshot.pastChampionships[0];

  assert.equal(past.matchLength, 2);
  assert.equal(past.replayAvailable, false);
  assert.equal(past.replay, null);
});

function completedRoom(overrides = {}) {
  const matchLength = overrides.matchLength ?? 5;
  const games = overrides.completedGames ?? completedGames();

  return {
    id: `room-${matchLength}`,
    seats: [
      { playerId: "p1", name: "Allan", avatarId: "engineer" },
      { playerId: "p2", name: "Keith", avatarId: "plumber" },
      { playerId: "p3", name: "Wick", avatarId: "runner" },
      { playerId: "p4", name: "Arrow", avatarId: "doctor" }
    ],
    match: {
      id: `match-${matchLength}`,
      status: "completed",
      matchLength,
      completedAt: 123_456 + matchLength,
      rosterOrder: ["p1", "p2", "p3", "p4"],
      playerOrder: ["p1", "p2", "p3", "p4"],
      playersById: {
        p1: { id: "p1", name: "Allan", avatarId: "engineer" },
        p2: { id: "p2", name: "Keith", avatarId: "plumber" },
        p3: { id: "p3", name: "Wick", avatarId: "runner" },
        p4: { id: "p4", name: "Arrow", avatarId: "doctor" }
      },
      completedGames: games,
      finalScores: { p1: 18, p2: 14, p3: 10, p4: 7 },
      rawScores: { p1: 18, p2: 14, p3: 10, p4: 7 },
      infractions: { p1: 0, p2: 0, p3: 0, p4: 0 },
      winnerIds: ["p1"]
    }
  };
}

function completedGames() {
  return [
    game(1, "p1", { p1: 5, p2: 3, p3: 2, p4: 1 }),
    game(2, "p2", { p1: 3, p2: 5, p3: 2, p4: 1 }),
    game(3, "p1", { p1: 5, p2: 2, p3: 3, p4: 1 }),
    game(4, "p3", { p1: 3, p2: 2, p3: 5, p4: 1 }),
    game(5, "p1", { p1: 5, p2: 3, p3: 2, p4: 1 })
  ];
}

function game(number, winnerId, pointsByPlayerId) {
  return {
    number,
    completedAt: 1000 + number,
    endReason: "normalWin",
    winnerId,
    lockingPlayerId: null,
    activePlayerIds: ["p1", "p2", "p3", "p4"],
    benchPlayerIds: [],
    scoreResult: {
      pointsByPlayerId,
      placements: Object.keys(pointsByPlayerId).map((playerId, index) => ({
        playerId,
        place: index + 1
      }))
    }
  };
}
