import * as echarts from "./vendor/echarts.esm.min.mjs?v=83";

const chartInstances = new Map();
let resizeBound = false;

export function disposeChampionshipDayVisuals() {
  for (const chart of chartInstances.values()) {
    chart.dispose();
  }

  chartInstances.clear();
}

export function renderChampionshipDayVisualAnalytics(championship, root = document, options = {}) {
  disposeChampionshipDayVisuals();

  const host = root.querySelector?.("[data-championship-day-visuals]");

  if (!host || !championship || !Array.isArray(championship.rounds) || championship.rounds.length === 0) {
    return;
  }

  const data = buildChampionshipDayChartData(championship, options);
  const chartConfigs = [
    ["momentum", leaderboardMomentumOption(data)],
    ["wins-losses", winsVsLossesOption(data)],
    ["head-to-head", headToHeadOption(data)],
    ["round-bursts", roundScoreBurstsOption(data)]
  ];

  for (const [id, option] of chartConfigs) {
    const element = host.querySelector(`[data-echart="${id}"]`);

    if (!element) {
      continue;
    }

    const chart = echarts.init(element, null, {
      renderer: "canvas",
      useDirtyRect: false
    });
    chart.setOption(option);
    chartInstances.set(id, chart);
  }

  if (!resizeBound) {
    resizeBound = true;
    window.addEventListener("resize", resizeChampionshipDayVisuals, { passive: true });
  }

  requestAnimationFrame(resizeChampionshipDayVisuals);
}

export function resizeChampionshipDayVisuals() {
  for (const chart of chartInstances.values()) {
    chart.resize();
  }
}

export function buildChampionshipDayChartData(championship, options = {}) {
  const players = (championship.players ?? []).map((player) => ({
    id: String(player.id),
    name: String(player.name ?? player.id)
  }));
  const selectedPlayerId = players.some((player) => player.id === String(options.playerId ?? ""))
    ? String(options.playerId)
    : "";
  const selectedPlayer = players.find((player) => player.id === selectedPlayerId) ?? null;
  const playerNames = Object.fromEntries(players.map((player) => [player.id, player.name]));
  const totals = new Map(players.map((player) => [player.id, emptyPlayerChartStats(player)]));
  const roundLabels = (championship.rounds ?? []).map((round) => `R${round.number}`);
  const roundTotalsByPlayer = new Map(players.map((player) => [player.id, []]));
  const roundBurstRows = [];
  const headToHead = players.map(() => players.map(() => 0));

  championship.rounds.forEach((round, roundIndex) => {
    const roundTotals = new Map(players.map((player) => [player.id, 0]));

    for (const table of round.tableResults ?? []) {
      const rankings = [...(table.rankings ?? [])].sort((first, second) => Number(first.place) - Number(second.place));

      rankings.forEach((ranking) => {
        const playerId = String(ranking.playerId);
        const stats = totals.get(playerId) ?? emptyPlayerChartStats({ id: playerId, name: playerNames[playerId] ?? playerId });
        const roundPoints = Number(ranking.totalPoints ?? 0);

        stats.totalPoints += roundPoints;
        stats.normalWins += Number(ranking.normalWins ?? 0);
        stats.lockWins += Number(ranking.lockWins ?? 0);
        stats.secondPlaces += Number(ranking.secondPlaces ?? 0);
        stats.thirdPlaces += Number(ranking.thirdPlaces ?? 0);
        stats.fourthPlaces += Number(ranking.fourthPlaces ?? 0);
        stats.lockLoses += Number(ranking.lockLoses ?? 0);
        stats.roundsPlayed += 1;
        stats.latestRoundPoints = roundPoints;
        roundTotals.set(playerId, roundPoints);
        roundBurstRows.push({
          round: roundIndex,
          roundLabel: `Round ${round.number}`,
          table: table.tableLabel ?? table.tableId,
          playerId,
          playerName: playerNames[playerId] ?? playerId,
          points: roundPoints
        });
      });

      addHeadToHeadGameCounts(headToHead, players, table);
    }

    for (const player of players) {
      const previous = roundTotalsByPlayer.get(player.id).at(-1) ?? 0;
      const next = previous + (roundTotals.get(player.id) ?? 0);
      roundTotalsByPlayer.get(player.id).push(next);
    }
  });

  const leaderboard = [...totals.values()]
    .sort((first, second) => second.totalPoints - first.totalPoints || first.name.localeCompare(second.name));
  const filteredLeaderboard = selectedPlayer
    ? leaderboard.filter((player) => player.id === selectedPlayer.id)
    : leaderboard;
  const topMomentumPlayers = selectedPlayer
    ? filteredLeaderboard
    : leaderboard.slice(0, 8);
  const filteredRoundBurstRows = selectedPlayer
    ? roundBurstRows.filter((row) => row.playerId === selectedPlayer.id)
    : roundBurstRows;
  const headToHeadRows = selectedPlayer ? [selectedPlayer] : players;
  const headToHeadColumns = selectedPlayer
    ? players.filter((player) => player.id !== selectedPlayer.id)
    : players;
  const headToHeadCells = buildHeadToHeadCells(headToHead, players, headToHeadRows, headToHeadColumns);

  return {
    players,
    selectedPlayer,
    leaderboard: filteredLeaderboard,
    topMomentumPlayers,
    roundLabels,
    roundTotalsByPlayer,
    roundBurstRows: filteredRoundBurstRows,
    headToHead,
    headToHeadRows,
    headToHeadColumns,
    headToHeadCells
  };
}

function buildHeadToHeadCells(headToHead, players, rowPlayers, columnPlayers) {
  const playerIndexes = new Map(players.map((player, index) => [player.id, index]));

  return rowPlayers.map((rowPlayer, rowIndex) => (
    columnPlayers.map((columnPlayer, colIndex) => {
      const rowPlayerIndex = playerIndexes.get(rowPlayer.id);
      const columnPlayerIndex = playerIndexes.get(columnPlayer.id);
      const rowWins = rowPlayerIndex === undefined || columnPlayerIndex === undefined || rowPlayer.id === columnPlayer.id
        ? 0
        : Number(headToHead[rowPlayerIndex]?.[columnPlayerIndex] ?? 0);
      const columnWins = rowPlayerIndex === undefined || columnPlayerIndex === undefined || rowPlayer.id === columnPlayer.id
        ? 0
        : Number(headToHead[columnPlayerIndex]?.[rowPlayerIndex] ?? 0);
      const total = rowWins + columnWins;
      const percentage = total > 0 ? (rowWins / total) * 100 : null;

      return {
        rowPlayerId: rowPlayer.id,
        columnPlayerId: columnPlayer.id,
        rowPlayerName: rowPlayer.name,
        columnPlayerName: columnPlayer.name,
        rowIndex,
        colIndex,
        rowWins,
        columnWins,
        total,
        percentage
      };
    })
  ));
}

function addHeadToHeadGameCounts(headToHead, players, table) {
  const playerIndexes = new Map(players.map((player, index) => [player.id, index]));

  for (const game of table.games ?? []) {
    const scoredPlayers = (game.scores ?? [])
      .map((score) => ({
        playerId: String(score.playerId),
        placement: scorePlacementRank(Number(score.points))
      }))
      .filter((score) => playerIndexes.has(score.playerId) && Number.isFinite(score.placement));

    for (const rowPlayer of scoredPlayers) {
      for (const columnPlayer of scoredPlayers) {
        if (rowPlayer.playerId === columnPlayer.playerId) {
          continue;
        }

        if (rowPlayer.placement < columnPlayer.placement) {
          headToHead[playerIndexes.get(rowPlayer.playerId)][playerIndexes.get(columnPlayer.playerId)] += 1;
        }
      }
    }
  }
}

function scorePlacementRank(points) {
  if (points === 5 || points === 6) {
    return 1;
  }

  if (points === 3) {
    return 2;
  }

  if (points === 2) {
    return 3;
  }

  if (points === 1 || points === 0) {
    return 4;
  }

  return Number.POSITIVE_INFINITY;
}

function emptyPlayerChartStats(player) {
  return {
    id: player.id,
    name: player.name,
    totalPoints: 0,
    normalWins: 0,
    lockWins: 0,
    secondPlaces: 0,
    thirdPlaces: 0,
    fourthPlaces: 0,
    lockLoses: 0,
    roundsPlayed: 0,
    latestRoundPoints: 0
  };
}

function leaderboardMomentumOption(data) {
  const titleSuffix = data.selectedPlayer ? ` - ${data.selectedPlayer.name}` : "";

  return {
    ...baseChartOption(),
    title: { text: `Leaderboard Momentum${titleSuffix}`, subtext: "Cumulative points after each round", left: 10, top: 8 },
    tooltip: {
      trigger: "axis",
      renderMode: "richText",
      confine: true,
      appendToBody: false,
      alwaysShowContent: false,
      hideDelay: 0,
      axisPointer: { type: "line" }
    },
    legend: {
      type: "scroll",
      top: 48,
      left: 10,
      right: 10,
      backgroundColor: "transparent",
      pageButtonGap: 5,
      pageIconColor: "#3f6e9a",
      pageIconInactiveColor: "#c8c2b3",
      pageTextStyle: { color: "#5f6863", fontWeight: 800 }
    },
    grid: { left: 42, right: 18, top: 104, bottom: 34 },
    xAxis: { type: "category", boundaryGap: false, data: data.roundLabels },
    yAxis: { type: "value", name: "Pts" },
    series: data.topMomentumPlayers.map((player) => ({
      name: player.name,
      type: "line",
      smooth: true,
      symbolSize: 8,
      emphasis: { focus: "series" },
      data: data.roundTotalsByPlayer.get(player.id)
    }))
  };
}

function winsVsLossesOption(data) {
  const players = data.leaderboard.slice(0, 12);
  const titleSuffix = data.selectedPlayer ? ` - ${data.selectedPlayer.name}` : "";

  return {
    ...baseChartOption(),
    title: { text: `Wins vs Losses${titleSuffix}`, subtext: "Stacked win and loss bars by player", left: 10, top: 8 },
    brush: {
      toolbox: ["rect", "polygon", "lineX", "lineY", "keep", "clear"],
      xAxisIndex: 0,
      brushLink: "all",
      throttleType: "debounce",
      throttleDelay: 250,
      inBrush: { opacity: 1 },
      outOfBrush: { opacity: 0.28 }
    },
    toolbox: {
      right: 10,
      top: 8,
      feature: {
        brush: { type: ["rect", "polygon", "lineX", "lineY", "keep", "clear"] },
        dataZoom: { yAxisIndex: false },
        restore: {}
      }
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      renderMode: "richText",
      confine: true
    },
    legend: { top: 48, left: 10, right: 10, type: "scroll" },
    grid: { left: 40, right: 18, top: 98, bottom: 96 },
    dataZoom: [
      { type: "inside", xAxisIndex: 0, filterMode: "none" },
      { type: "slider", xAxisIndex: 0, height: 22, bottom: 32, filterMode: "none" }
    ],
    xAxis: { type: "category", data: players.map((player) => player.name), axisLabel: { rotate: 35, interval: 0 } },
    yAxis: { type: "value", minInterval: 1 },
    series: winsVsLossesSeries(players)
  };
}

function winsVsLossesSeries(players) {
  const barMaxWidth = 28;
  const barCategoryGap = "24%";
  const barGap = "35%";

  return [
    {
      name: "Normal Wins",
      type: "bar",
      stack: "wins",
      barMaxWidth,
      barCategoryGap,
      itemStyle: { color: "#176b54" },
      emphasis: { focus: "series" },
      data: players.map((player) => player.normalWins)
    },
    {
      name: "Lock and Wins",
      type: "bar",
      stack: "wins",
      barMaxWidth,
      itemStyle: { color: "#e6ae4a" },
      emphasis: { focus: "series" },
      data: players.map((player) => player.lockWins)
    },
    {
      name: "Normal Losses",
      type: "bar",
      stack: "losses",
      barMaxWidth,
      barGap,
      itemStyle: { color: "#d67a26" },
      emphasis: { focus: "series" },
      data: players.map((player) => Math.max(0, player.fourthPlaces - player.lockLoses))
    },
    {
      name: "Lock and Losses",
      type: "bar",
      stack: "losses",
      barMaxWidth,
      itemStyle: { color: "#3f6e9a" },
      emphasis: { focus: "series" },
      data: players.map((player) => player.lockLoses)
    }
  ];
}

export function headToHeadOption(data) {
  const rowPlayers = data.headToHeadRows;
  const columnPlayers = data.headToHeadColumns;
  const heatmap = data.headToHeadCells.flatMap((row) => (
    row.map((cell) => {
      const displayPercentage = cell.percentage === null ? null : roundMatchupPercentage(cell.percentage);

      return [
        cell.colIndex,
        cell.rowIndex,
        displayPercentage ?? 50,
        cell.rowWins,
        cell.columnWins,
        cell.total,
        displayPercentage,
        cell.rowPlayerName,
        cell.columnPlayerName
      ];
    })
  ));
  const titleSuffix = data.selectedPlayer ? ` - ${data.selectedPlayer.name}` : "";

  const labelsFit = rowPlayers.length <= 4 && columnPlayers.length <= 8;

  return {
    ...baseChartOption(),
    title: { text: `Head To Head Edge${titleSuffix}`, subtext: "Color shows row player's win percentage against column player", left: 10, top: 8 },
    tooltip: {
      position: "top",
      formatter: (params) => {
        const [, , , rowWins, columnWins, total, percentage, rowPlayerName, columnPlayerName] = params.value;

        if (rowPlayerName === columnPlayerName) {
          return `${rowPlayerName}<br><strong>Same player</strong>`;
        }

        if (!total) {
          return `${rowPlayerName} vs ${columnPlayerName}<br><strong>No completed games together</strong>`;
        }

        return `${rowPlayerName} placed above ${columnPlayerName}: <strong>${rowWins} of ${total}</strong><br>${rowWins}-${columnWins} | <strong>${percentage}%</strong>`;
      }
    },
    grid: { left: data.selectedPlayer ? 88 : 90, right: 24, top: 78, bottom: 112 },
    xAxis: { type: "category", data: columnPlayers.map((player) => player.name), axisLabel: { rotate: 35, interval: 0 } },
    yAxis: { type: "category", data: rowPlayers.map((player) => player.name), inverse: true },
    visualMap: {
      dimension: 2,
      min: 0,
      max: 100,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 14,
      text: ["Winning %", "Losing %"],
      formatter: (value) => `${roundMatchupPercentage(value)}%`,
      inRange: { color: ["#d65742", "#e6ae4a", "#176b54"] }
    },
    series: [{
      name: "Head to head",
      type: "heatmap",
      data: heatmap,
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(0, 0, 0, 0.25)" } },
      label: {
        show: true,
        color: "#1d2b27",
        fontWeight: 800,
        fontSize: labelsFit ? 10 : 9,
        formatter: (params) => {
          const [, , , rowWins, columnWins, total, percentage, rowPlayerName, columnPlayerName] = params.value;

          if (rowPlayerName === columnPlayerName) {
            return "";
          }

          if (!total) {
            return "-";
          }

          return labelsFit ? `${rowWins}-${columnWins}\n${percentage}%` : `${percentage}%`;
        }
      }
    }]
  };
}

function roundMatchupPercentage(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  const base = Math.floor(numeric);
  const decimal = numeric - base;

  return decimal > 0.5 ? base + 1 : base;
}

function roundScoreBurstsOption(data) {
  const titleSuffix = data.selectedPlayer ? ` - ${data.selectedPlayer.name}` : "";

  return {
    ...baseChartOption(),
    title: { text: `Round Score Bursts${titleSuffix}`, subtext: "Every completed table result by player", left: 10, top: 8 },
    tooltip: {
      trigger: "item",
      formatter: (params) => {
        const row = data.roundBurstRows[params.dataIndex];
        return `${row.playerName}<br>${row.roundLabel} | ${row.table}<br><strong>${row.points} pts</strong>`;
      }
    },
    grid: { left: 42, right: 16, top: 76, bottom: 42 },
    xAxis: { type: "category", data: data.roundLabels },
    yAxis: { type: "value", name: "Round pts" },
    series: [{
      name: "Round score",
      type: "scatter",
      symbolSize: (value) => 8 + Number(value[1] ?? 0) * 0.9,
      data: data.roundBurstRows.map((row) => [row.round, row.points, row.playerName]),
      itemStyle: {
        color: "#d65742",
        opacity: 0.76,
        shadowBlur: 8,
        shadowColor: "rgba(214, 87, 66, 0.35)"
      }
    }]
  };
}

function baseChartOption() {
  return {
    color: ["#176b54", "#e6ae4a", "#d65742", "#3f6e9a", "#7d5fb2", "#2c9a9a", "#7a4b32", "#809c43"],
    backgroundColor: "transparent",
    textStyle: {
      color: "#1d2b27",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    },
    animationDuration: 700,
    animationEasing: "cubicOut"
  };
}
