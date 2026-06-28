import * as echarts from "./vendor/echarts.esm.min.mjs?v=83";

export const CHAMPIONSHIP_REPLAY_STEP_MS = 5_000;

let replayChart = null;
let replayTimer = null;
let replayState = null;

export function buildChampionshipReplayData(match, seats = []) {
  const completedGames = [...(match?.completedGames ?? [])]
    .sort((first, second) => Number(first.number) - Number(second.number));
  const matchLength = Number(match?.matchLength ?? 0);

  if (!match || matchLength < 5 || completedGames.length < 5) {
    return {
      available: false,
      reason: "Replay is not available for this championship.",
      frames: [],
      players: [],
      finalRanking: []
    };
  }

  const playerIds = orderedReplayPlayerIds(match, seats, completedGames);
  const namesById = Object.fromEntries([
    ...seats.map((seat) => [String(seat.playerId), String(seat.name ?? seat.playerId)]),
    ...(match.players ?? []).map((player) => [String(player.id), String(player.name ?? player.id)])
  ]);
  const avatarById = Object.fromEntries(seats.map((seat) => [String(seat.playerId), seat.avatarId ?? null]));
  const totals = Object.fromEntries(playerIds.map((playerId) => [playerId, 0]));
  const frames = completedGames.map((game, index) => {
    for (const [playerId, points] of Object.entries(game.pointsByPlayerId ?? {})) {
      totals[playerId] = (totals[playerId] ?? 0) + Number(points ?? 0);
    }

    return {
      roundNumber: Number(game.number ?? index + 1),
      label: `Round ${Number(game.number ?? index + 1)}`,
      scores: Object.fromEntries(playerIds.map((playerId) => [playerId, totals[playerId] ?? 0])),
      leaderIds: leadersFromScores(totals, playerIds),
      winnerId: game.winnerId ?? null,
      endReason: game.endReason ?? null
    };
  });

  const finalScores = match.finalScores ?? frames.at(-1)?.scores ?? {};
  const finalRanking = playerIds
    .map((playerId) => ({
      playerId,
      name: namesById[playerId] ?? playerId,
      avatarId: avatarById[playerId] ?? null,
      score: Number(finalScores[playerId] ?? frames.at(-1)?.scores?.[playerId] ?? 0),
      winner: (match.winnerIds ?? []).includes(playerId)
    }))
    .sort((first, second) => second.score - first.score || first.name.localeCompare(second.name));

  return {
    available: true,
    matchLength,
    frames,
    players: playerIds.map((playerId) => ({
      id: playerId,
      name: namesById[playerId] ?? playerId,
      avatarId: avatarById[playerId] ?? null
    })),
    finalRanking,
    winnerIds: match.winnerIds ?? finalRanking.slice(0, 1).map((player) => player.playerId)
  };
}

export function openChampionshipReplay(options) {
  const {
    match,
    seats,
    mount = document.body,
    avatarHtml = defaultAvatarHtml,
    playerName = (playerId) => playerId,
    escapeHtml = defaultEscapeHtml
  } = options;
  const replayData = buildChampionshipReplayData(match, seats);

  closeChampionshipReplay();

  const overlay = document.createElement("section");
  overlay.className = "championship-replay-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = replayData.available
    ? replayShellHtml(replayData, { avatarHtml, escapeHtml })
    : unavailableReplayHtml(replayData.reason, escapeHtml);
  mount.appendChild(overlay);

  replayState = {
    overlay,
    data: replayData,
    currentIndex: 0,
    playing: replayData.available,
    avatarHtml,
    playerName,
    escapeHtml
  };

  bindReplayControls();

  if (!replayData.available) {
    return replayState;
  }

  const chartElement = overlay.querySelector("[data-replay-chart]");
  replayChart = echarts.init(chartElement, null, {
    renderer: "canvas",
    useDirtyRect: false
  });
  renderReplayFrame(0, { animate: false });
  replayTimer = setTimeout(advanceReplayFrame, CHAMPIONSHIP_REPLAY_STEP_MS);
  window.addEventListener("resize", resizeReplayChart, { passive: true });

  return replayState;
}

export function closeChampionshipReplay() {
  if (replayTimer) {
    clearTimeout(replayTimer);
    replayTimer = null;
  }

  if (replayChart) {
    replayChart.dispose();
    replayChart = null;
  }

  if (replayState?.overlay?.isConnected) {
    replayState.overlay.remove();
  }

  window.removeEventListener("resize", resizeReplayChart);
  replayState = null;
}

function bindReplayControls() {
  const overlay = replayState.overlay;

  overlay.querySelector("[data-replay-close]")?.addEventListener("click", closeChampionshipReplay);
  overlay.querySelector("[data-replay-play]")?.addEventListener("click", () => {
    replayState.playing = true;
    scheduleNextFrame();
    renderReplayControls();
  });
  overlay.querySelector("[data-replay-pause]")?.addEventListener("click", () => {
    replayState.playing = false;
    clearReplayTimer();
    renderReplayControls();
  });
  overlay.querySelector("[data-replay-restart]")?.addEventListener("click", () => {
    replayState.currentIndex = 0;
    replayState.playing = true;
    renderReplayFrame(0, { animate: true });
    scheduleNextFrame();
  });
}

function advanceReplayFrame() {
  if (!replayState?.playing) {
    return;
  }

  const nextIndex = replayState.currentIndex + 1;

  if (nextIndex >= replayState.data.frames.length) {
    replayState.playing = false;
    clearReplayTimer();
    renderWinnerReveal();
    renderReplayControls();
    return;
  }

  renderReplayFrame(nextIndex, { animate: true });
  scheduleNextFrame();
}

function renderReplayFrame(index, options = {}) {
  if (!replayState || !replayChart) {
    return;
  }

  replayState.currentIndex = index;
  const frame = replayState.data.frames[index];
  const frames = replayState.data.frames.slice(0, index + 1);
  const labels = replayState.data.frames.map((entry) => entry.label);
  const leaderNames = frame.leaderIds.map(replayState.playerName);
  const maxScore = Math.max(5, ...Object.values(frame.scores));

  replayState.overlay.dataset.replayFrame = String(index + 1);
  replayState.overlay.querySelector("[data-replay-round]").textContent = `${frame.label} of ${replayState.data.matchLength}`;
  replayState.overlay.querySelector("[data-replay-leader]").textContent = leaderNames.length
    ? `Leader: ${leaderNames.join(", ")}`
    : "Leader: none";
  replayState.overlay.querySelector("[data-replay-countdown]").textContent = index === replayState.data.frames.length - 1
    ? "Final reveal next"
    : "Next round in 5 seconds";
  replayState.overlay.querySelector("[data-replay-winner]").innerHTML = "<span>Final winner reveal appears after the last round.</span>";

  replayChart.setOption({
    animation: Boolean(options.animate),
    animationDuration: 850,
    animationEasing: "cubicOut",
    grid: {
      top: 42,
      right: 34,
      bottom: 46,
      left: 42,
      containLabel: true
    },
    tooltip: {
      trigger: "axis"
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: labels,
      axisLabel: {
        color: "#58635f",
        fontWeight: 800
      }
    },
    yAxis: {
      type: "value",
      min: 0,
      max: Math.ceil((maxScore + 4) / 5) * 5,
      axisLabel: {
        color: "#58635f",
        fontWeight: 800
      },
      splitLine: {
        lineStyle: {
          color: "rgba(20, 56, 47, 0.12)"
        }
      }
    },
    series: replayState.data.players.map((player, playerIndex) => {
      const data = frames.map((entry) => entry.scores[player.id] ?? 0);
      const isLeader = frame.leaderIds.includes(player.id);

      return {
        name: player.name,
        type: "line",
        smooth: true,
        showSymbol: true,
        symbolSize: isLeader ? 14 : 9,
        data,
        endLabel: {
          show: true,
          formatter: `${player.name} {score|${data.at(-1) ?? 0}}`,
          color: isLeader ? "#0d4c3b" : "#4f5a56",
          fontWeight: isLeader ? 900 : 700,
          rich: {
            score: {
              color: isLeader ? "#b98218" : "#1d2424",
              fontWeight: 900
            }
          }
        },
        lineStyle: {
          width: isLeader ? 5 : 3,
          shadowBlur: isLeader ? 10 : 0,
          shadowColor: isLeader ? "rgba(240, 185, 64, 0.62)" : "transparent"
        },
        itemStyle: {
          color: replayColor(playerIndex)
        },
        emphasis: {
          focus: "series"
        }
      };
    })
  }, true);

  renderReplayLineAvatars(frame, maxScore);
  renderReplayStandings(frame);
  renderReplayControls();
}

function renderReplayLineAvatars(frame, maxScore) {
  const layer = replayState.overlay.querySelector("[data-replay-avatar-layer]");

  if (!layer) {
    return;
  }

  const maxAxisScore = Math.ceil((maxScore + 4) / 5) * 5;
  const frameRatio = replayState.data.frames.length <= 1
    ? 0
    : replayState.currentIndex / (replayState.data.frames.length - 1);
  const plotLeft = 8;
  const plotRight = 12;
  const plotTop = 12;
  const plotBottom = 18;
  const xPercent = plotLeft + frameRatio * (100 - plotLeft - plotRight);

  layer.innerHTML = replayState.data.players.map((player, index) => {
    const score = Number(frame.scores[player.id] ?? 0);
    const yPercent = 100 - plotBottom - (score / maxAxisScore) * (100 - plotTop - plotBottom);
    const leading = frame.leaderIds.includes(player.id) ? " is-leading" : "";

    return `
      <div
        class="championship-replay-line-avatar${leading}"
        style="left: ${xPercent}%; top: ${Math.max(8, Math.min(88, yPercent + index * 0.22))}%;"
        title="${replayState.escapeHtml(player.name)} ${score} pts"
      >
        ${replayState.avatarHtml(player.avatarId, "championship-replay-line-avatar-icon")}
        <span>${score}</span>
      </div>
    `;
  }).join("");
}

function renderReplayStandings(frame) {
  const rows = replayState.data.players
    .map((player) => ({
      ...player,
      score: frame.scores[player.id] ?? 0,
      leader: frame.leaderIds.includes(player.id)
    }))
    .sort((first, second) => second.score - first.score || first.name.localeCompare(second.name))
    .map((player, index) => `
      <div class="championship-replay-row ${player.leader ? "is-leading" : ""}">
        <span>${index + 1}</span>
        ${replayState.avatarHtml(player.avatarId, "championship-replay-avatar")}
        <strong>${replayState.escapeHtml(player.name)}</strong>
        <b>${player.score}</b>
      </div>
    `).join("");

  replayState.overlay.querySelector("[data-replay-standings]").innerHTML = rows;
}

function renderWinnerReveal() {
  const winners = replayState.data.finalRanking.filter((player) => player.winner);
  const champion = winners[0] ?? replayState.data.finalRanking[0];

  replayState.overlay.querySelector("[data-replay-countdown]").textContent = "Replay complete";
  replayState.overlay.querySelector("[data-replay-winner]").innerHTML = `
    <div class="championship-replay-champion">
      ${replayState.avatarHtml(champion.avatarId, "championship-replay-champion-avatar")}
      <span>Champion</span>
      <strong>${replayState.escapeHtml(champion.name)}</strong>
      <b>${champion.score} pts</b>
    </div>
    <div class="championship-replay-medals">
      ${replayState.data.finalRanking.slice(0, 3).map((player, index) => {
        const medals = ["Gold", "Silver", "Bronze"];
        return `
          <div>
            <span>${medals[index]}</span>
            ${replayState.avatarHtml(player.avatarId, "championship-replay-medal-avatar")}
            <strong>${replayState.escapeHtml(player.name)}</strong>
            <b>${player.score}</b>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderReplayControls() {
  if (!replayState?.overlay) {
    return;
  }

  replayState.overlay.querySelector("[data-replay-play]")?.toggleAttribute("disabled", replayState.playing);
  replayState.overlay.querySelector("[data-replay-pause]")?.toggleAttribute("disabled", !replayState.playing);
}

function scheduleNextFrame() {
  clearReplayTimer();
  replayTimer = setTimeout(advanceReplayFrame, CHAMPIONSHIP_REPLAY_STEP_MS);
}

function clearReplayTimer() {
  if (replayTimer) {
    clearTimeout(replayTimer);
    replayTimer = null;
  }
}

function resizeReplayChart() {
  replayChart?.resize();
  if (replayState?.data?.frames?.length) {
    const frame = replayState.data.frames[replayState.currentIndex];
    const maxScore = Math.max(5, ...Object.values(frame.scores));

    renderReplayLineAvatars(frame, maxScore);
  }
}

function replayShellHtml(replayData, helpers) {
  return `
    <div class="championship-replay-modal">
      <div class="championship-replay-head">
        <div>
          <span>Championship Replay</span>
          <h2 data-replay-round>Round 1 of ${replayData.matchLength}</h2>
          <p data-replay-leader>Leader: none</p>
        </div>
        <button class="small-button" data-replay-close type="button">Close</button>
      </div>
      <div class="championship-replay-chart-wrap">
        <div class="championship-replay-chart" data-replay-chart></div>
        <div class="championship-replay-avatar-layer" data-replay-avatar-layer aria-hidden="true"></div>
      </div>
      <div class="championship-replay-status">
        <strong data-replay-countdown>Next round in 5 seconds</strong>
        <div class="championship-replay-controls">
          <button class="small-button" data-replay-play type="button">Play</button>
          <button class="small-button" data-replay-pause type="button">Pause</button>
          <button class="small-button" data-replay-restart type="button">Restart</button>
        </div>
      </div>
      <div class="championship-replay-body">
        <div class="championship-replay-standings" data-replay-standings></div>
        <div class="championship-replay-winner" data-replay-winner>
          <span>Final winner reveal appears after the last round.</span>
        </div>
      </div>
    </div>
  `;
}

function unavailableReplayHtml(reason, escapeHtml) {
  return `
    <div class="championship-replay-modal compact">
      <div class="championship-replay-head">
        <div>
          <span>Championship Replay</span>
          <h2>Replay unavailable</h2>
        </div>
        <button class="small-button" data-replay-close type="button">Close</button>
      </div>
      <p>${escapeHtml(reason)}</p>
    </div>
  `;
}

function orderedReplayPlayerIds(match, seats, completedGames) {
  const ids = [
    ...(match.rosterOrder ?? []),
    ...(match.players ?? []).map((player) => player.id),
    ...seats.map((seat) => seat.playerId),
    ...completedGames.flatMap((game) => Object.keys(game.pointsByPlayerId ?? {})),
    ...Object.keys(match.finalScores ?? match.rawScores ?? {})
  ].map(String);

  return [...new Set(ids)];
}

function leadersFromScores(scores, playerIds) {
  const highest = Math.max(...playerIds.map((playerId) => Number(scores[playerId] ?? 0)));

  return playerIds.filter((playerId) => Number(scores[playerId] ?? 0) === highest);
}

function replayColor(index) {
  return [
    "#176b54",
    "#cf6b2b",
    "#2d65b3",
    "#9a42b9",
    "#2e9a9b",
    "#b98218",
    "#a13f35"
  ][index % 7];
}

function defaultAvatarHtml() {
  return "";
}

function defaultEscapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
