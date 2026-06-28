import test from "node:test";
import assert from "node:assert/strict";

import { buildChampionshipReplayData } from "../public/championshipReplay.js";

test("championship replay data builds cumulative scores by round", () => {
  const replay = buildChampionshipReplayData(completedFiveGameMatch(), seats());

  assert.equal(replay.available, true);
  assert.equal(replay.frames.length, 5);
  assert.deepEqual(replay.frames.map((frame) => frame.label), ["Round 1", "Round 2", "Round 3", "Round 4", "Round 5"]);
  assert.deepEqual(replay.frames[0].scores, {
    p1: 5,
    p2: 3,
    p3: 2,
    p4: 1,
    p5: 0
  });
  assert.deepEqual(replay.frames[4].scores, {
    p1: 15,
    p2: 12,
    p3: 8,
    p4: 6,
    p5: 9
  });
});

test("championship replay is unavailable below five completed games", () => {
  const replay = buildChampionshipReplayData({
    ...completedFiveGameMatch(),
    matchLength: 2,
    completedGames: completedFiveGameMatch().completedGames.slice(0, 2)
  }, seats());

  assert.equal(replay.available, false);
  assert.equal(replay.reason, "Replay is not available for this championship.");
});

test("championship replay includes sack-in players who participated after the first table", () => {
  const replay = buildChampionshipReplayData(completedFiveGameMatch(), seats());

  assert.deepEqual(replay.players.map((player) => player.id), ["p1", "p2", "p3", "p4", "p5"]);
  assert.equal(replay.frames[2].scores.p5, 5);
  assert.equal(replay.finalRanking.some((player) => player.playerId === "p5"), true);
});

test("championship replay final ranking uses final match scores", () => {
  const replay = buildChampionshipReplayData({
    ...completedFiveGameMatch(),
    finalScores: {
      p1: 14,
      p2: 12,
      p3: 8,
      p4: 6,
      p5: 9
    },
    winnerIds: ["p1"]
  }, seats());

  assert.equal(replay.finalRanking[0].playerId, "p1");
  assert.equal(replay.finalRanking[0].score, 14);
  assert.equal(replay.winnerIds[0], "p1");
});

function completedFiveGameMatch() {
  return {
    matchLength: 5,
    rosterOrder: ["p1", "p2", "p3", "p4", "p5"],
    players: seats().map((seat) => ({
      id: seat.playerId,
      name: seat.name,
      avatarId: seat.avatarId
    })),
    completedGames: [
      game(1, "p1", { p1: 5, p2: 3, p3: 2, p4: 1 }),
      game(2, "p2", { p1: 3, p2: 5, p3: 2, p4: 1 }),
      game(3, "p5", { p1: 2, p2: 3, p3: 1, p5: 5 }),
      game(4, "p1", { p1: 5, p2: 1, p4: 2, p5: 3 }),
      game(5, "p2", { p1: 0, p2: 0, p3: 3, p4: 2, p5: 1 })
    ],
    finalScores: {
      p1: 15,
      p2: 12,
      p3: 8,
      p4: 6,
      p5: 9
    },
    winnerIds: ["p1"]
  };
}

function game(number, winnerId, pointsByPlayerId) {
  return {
    number,
    winnerId,
    endReason: "normalWin",
    pointsByPlayerId
  };
}

function seats() {
  return [
    { playerId: "p1", name: "Allan", avatarId: "champion" },
    { playerId: "p2", name: "Keith", avatarId: "engineer" },
    { playerId: "p3", name: "Wick", avatarId: "plumber" },
    { playerId: "p4", name: "Arrow", avatarId: "runner" },
    { playerId: "p5", name: "Roland", avatarId: "doctor" }
  ];
}
