import { clearPixiBoard, renderPixiBoard } from "./pixiBoardRenderer.js?v=40";

const state = {
  room: null,
  playerId: null,
  roomId: roomIdFromPath(),
  events: null,
  selectedTile: null,
  timerInterval: null,
  stats: null,
  settings: null,
  adminToken: sessionStorage.getItem("dominoes-admin-token"),
  settingsExpanded: false,
  statsLoadedForMatchId: null,
  lastAnimatedActionKey: null
};

const CHAT_BLOCK_MINUTES = 5;
const MAX_PLAYERS_PER_ROOM = 7;
const ACTIVE_PLAYERS_PER_GAME = 4;
const PLAYER_AVATARS = Object.freeze([
  { id: "crown", label: "Crown", graphic: "♛", color: "#c98319" },
  { id: "rocket", label: "Rocket", graphic: "◆", color: "#cf4d3f" },
  { id: "star", label: "Star", graphic: "★", color: "#f0b940" },
  { id: "bolt", label: "Bolt", graphic: "ϟ", color: "#2d65b3" },
  { id: "shield", label: "Shield", graphic: "⬟", color: "#174d3f" },
  { id: "gem", label: "Gem", graphic: "◆", color: "#2e9a9b" },
  { id: "flame", label: "Flame", graphic: "▲", color: "#cf4d3f" },
  { id: "moon", label: "Moon", graphic: "◐", color: "#6f63b6" },
  { id: "sun", label: "Sun", graphic: "☀", color: "#d79817" },
  { id: "anchor", label: "Anchor", graphic: "⌾", color: "#2f6f88" }
]);

const els = {
  roomLine: document.querySelector("#roomLine"),
  sessionPill: document.querySelector("#sessionPill"),
  hostActionBar: document.querySelector("#hostActionBar"),
  topStartMatchButton: document.querySelector("#topStartMatchButton"),
  topEndSessionButton: document.querySelector("#topEndSessionButton"),
  setupPanel: document.querySelector("#setupPanel"),
  joinPanel: document.querySelector("#joinPanel"),
  tableView: document.querySelector("#tableView"),
  createRoomForm: document.querySelector("#createRoomForm"),
  openRoomForm: document.querySelector("#openRoomForm"),
  joinRoomForm: document.querySelector("#joinRoomForm"),
  hostNameInput: document.querySelector("#hostNameInput"),
  hostAvatarInput: document.querySelector("#hostAvatarInput"),
  matchLengthInput: document.querySelector("#matchLengthInput"),
  roomIdInput: document.querySelector("#roomIdInput"),
  joinNameInput: document.querySelector("#joinNameInput"),
  roomJoinNameInput: document.querySelector("#roomJoinNameInput"),
  roomJoinAvatarInput: document.querySelector("#roomJoinAvatarInput"),
  joinRoomTitle: document.querySelector("#joinRoomTitle"),
  playersList: document.querySelector("#playersList"),
  scoreList: document.querySelector("#scoreList"),
  gameCounter: document.querySelector("#gameCounter"),
  addBotButton: document.querySelector("#addBotButton"),
  startMatchButton: document.querySelector("#startMatchButton"),
  bathroomBreakButton: document.querySelector("#bathroomBreakButton"),
  resumeBreakButton: document.querySelector("#resumeBreakButton"),
  endSessionButton: document.querySelector("#endSessionButton"),
  copyInviteButton: document.querySelector("#copyInviteButton"),
  turnLabel: document.querySelector("#turnLabel"),
  statusSub: document.querySelector("#statusSub"),
  turnTimer: document.querySelector("#turnTimer"),
  board: document.querySelector("#board"),
  hand: document.querySelector("#hand"),
  seedBoardButton: document.querySelector("#seedBoardButton"),
  endChoice: document.querySelector("#endChoice"),
  passButton: document.querySelector("#passButton"),
  tablePanel: document.querySelector(".table-panel"),
  chatLog: document.querySelector("#chatLog"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput"),
  refreshStatsButton: document.querySelector("#refreshStatsButton"),
  leaderboardList: document.querySelector("#leaderboardList"),
  recordsCategory: document.querySelector("#recordsCategory"),
  recordsList: document.querySelector("#recordsList"),
  settingsPanel: document.querySelector("#settingsPanel"),
  settingsToggleButton: document.querySelector("#settingsToggleButton"),
  adminLoginForm: document.querySelector("#adminLoginForm"),
  adminPasswordInput: document.querySelector("#adminPasswordInput"),
  settingsForm: document.querySelector("#settingsForm"),
  settingFirst: document.querySelector("#settingFirst"),
  settingSecond: document.querySelector("#settingSecond"),
  settingThird: document.querySelector("#settingThird"),
  settingFourth: document.querySelector("#settingFourth"),
  settingLockWin: document.querySelector("#settingLockWin"),
  settingLockLose: document.querySelector("#settingLockLose"),
  settingTurnSeconds: document.querySelector("#settingTurnSeconds"),
  settingBetweenSeconds: document.querySelector("#settingBetweenSeconds"),
  settingFinalSeconds: document.querySelector("#settingFinalSeconds"),
  settingBreakSeconds: document.querySelector("#settingBreakSeconds"),
  settingSeedSeconds: document.querySelector("#settingSeedSeconds"),
  settingInfractions: document.querySelector("#settingInfractions"),
  settingPenalty: document.querySelector("#settingPenalty"),
  toast: document.querySelector("#toast")
};

boot();

function boot() {
  registerServiceWorker();
  bindEvents();
  renderAvatarSelect(els.hostAvatarInput, new Set(), els.hostAvatarInput.value);
  renderAvatarSelect(els.roomJoinAvatarInput, new Set(), els.roomJoinAvatarInput.value);
  loadGlobalData();

  if (state.roomId) {
    state.playerId = storedPlayerId(state.roomId);
    loadRoom(state.roomId);
    return;
  }

  render();
}

function bindEvents() {
  els.createRoomForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = {
      hostName: els.hostNameInput.value.trim() || "Host",
      avatarId: els.hostAvatarInput.value,
      matchLength: Number(els.matchLengthInput.value)
    };
    const result = await api("/api/rooms", { method: "POST", body });

    state.room = result.room;
    state.roomId = result.room.id;
    state.playerId = result.playerId;
    storePlayerId(state.roomId, state.playerId);
    history.pushState(null, "", `/rooms/${state.roomId}`);
    subscribe();
    render();
  });

  els.openRoomForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const roomId = els.roomIdInput.value.trim();

    if (!roomId) {
      return;
    }

    state.roomId = roomId;
    state.playerId = storedPlayerId(roomId);
    history.pushState(null, "", `/rooms/${roomId}`);
    loadRoom(roomId);
  });

  els.joinRoomForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = await api(`/api/rooms/${state.roomId}/join`, {
      method: "POST",
      body: {
        name: els.roomJoinNameInput.value.trim() || "Player",
        avatarId: els.roomJoinAvatarInput.value
      }
    });

    state.room = result.room;
    state.playerId = result.playerId;
    storePlayerId(state.roomId, state.playerId);
    subscribe();
    render();
  });

  els.startMatchButton.addEventListener("click", startMatch);
  els.topStartMatchButton.addEventListener("click", startMatch);

  els.addBotButton.addEventListener("click", async () => {
    const result = await api(`/api/rooms/${state.roomId}/add-bot`, {
      method: "POST",
      body: { playerId: state.playerId }
    });

    state.room = result.room;
    showToast("Bot added");
    render();
  });

  els.bathroomBreakButton.addEventListener("click", async () => {
    const result = await api(`/api/rooms/${state.roomId}/bathroom-break`, {
      method: "POST",
      body: { playerId: state.playerId }
    });

    state.room = result.room;
    showToast("Bathroom break started");
    render();
  });

  els.resumeBreakButton.addEventListener("click", async () => {
    const result = await api(`/api/rooms/${state.roomId}/resume-break`, {
      method: "POST",
      body: { playerId: state.playerId }
    });

    state.room = result.room;
    showToast("Championship resumed");
    render();
  });

  els.endSessionButton.addEventListener("click", endSession);
  els.topEndSessionButton.addEventListener("click", endSession);

  els.copyInviteButton.addEventListener("click", async () => {
    await navigator.clipboard.writeText(window.location.href);
    showToast("Invite link copied");
  });

  els.passButton.addEventListener("click", async () => {
    const result = await api(`/api/rooms/${state.roomId}/pass`, {
      method: "POST",
      body: { playerId: state.playerId }
    });

    state.room = result.room;
    render();
  });

  els.seedBoardButton.addEventListener("click", async () => {
    const result = await api(`/api/rooms/${state.roomId}/seed-to-board`, {
      method: "POST",
      body: { playerId: state.playerId }
    });

    state.room = result.room;
    render();
  });

  els.chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.room?.status === "cancelled") {
      return;
    }

    const text = els.chatInput.value.trim();

    if (!text) {
      return;
    }

    try {
      const result = await api(`/api/rooms/${state.roomId}/chat`, {
        method: "POST",
        body: {
          playerId: state.playerId,
          text
        }
      });

      els.chatInput.value = "";
      state.room = result.room;
      render();
    } catch (error) {
      showToast(error.message);
    }
  });

  els.refreshStatsButton.addEventListener("click", () => {
    loadStats();
  });

  els.recordsCategory.addEventListener("change", renderStats);
  els.settingsToggleButton.addEventListener("click", () => {
    state.settingsExpanded = !state.settingsExpanded;
    renderSettings();
  });

  els.adminLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = await api("/api/admin/login", {
      method: "POST",
      body: {
        roomId: state.roomId,
        playerId: state.playerId,
        password: els.adminPasswordInput.value
      }
    });

    state.adminToken = result.token;
    sessionStorage.setItem("dominoes-admin-token", result.token);
    state.settingsExpanded = true;
    els.adminPasswordInput.value = "";
    showToast("Admin logged in");
    renderSettings();
  });

  els.settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const settings = settingsFromForm();
    const result = await api("/api/settings", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${state.adminToken}`
      },
      body: { settings }
    });

    state.settings = result.settings;
    fillSettingsForm(result.settings);
    state.settingsExpanded = false;
    showToast("Settings saved");
    renderSettings();
  });

  window.addEventListener("popstate", () => {
    state.roomId = roomIdFromPath();
    state.playerId = state.roomId ? storedPlayerId(state.roomId) : null;
    loadRoom(state.roomId);
  });

  window.addEventListener("resize", () => {
    if (state.room?.match?.game) {
      renderTable();
    }
  });

  window.addEventListener("pagehide", sendExitSignal);
}

async function loadRoom(roomId) {
  if (!roomId) {
    state.room = null;
    render();
    return;
  }

  try {
    const query = state.playerId ? `?playerId=${encodeURIComponent(state.playerId)}` : "";
    const result = await api(`/api/rooms/${roomId}${query}`);

    state.room = result.room;

    if (state.playerId && isSeated(state.playerId)) {
      await markReconnected();
      subscribe();
    }

    render();
  } catch (error) {
    showToast(error.message);
    state.room = null;
    render();
  }
}

async function loadGlobalData() {
  await Promise.all([
    loadStats(),
    loadSettings()
  ]);
}

async function loadStats() {
  try {
    state.stats = await api("/api/stats");
    renderStats();
  } catch (error) {
    showToast(error.message);
  }
}

async function loadSettings() {
  try {
    const result = await api("/api/settings");
    state.settings = result.settings;
    fillSettingsForm(result.settings);
    renderSettings();
  } catch (error) {
    showToast(error.message);
  }
}

async function markReconnected() {
  if (!state.roomId || !state.playerId || state.room?.status === "cancelled" || state.room?.status === "completed") {
    return;
  }

  const result = await api(`/api/rooms/${state.roomId}/reconnect`, {
    method: "POST",
    body: { playerId: state.playerId }
  });

  state.room = result.room;
}

function subscribe() {
  if (!state.roomId || !state.playerId) {
    return;
  }

  if (state.events) {
    state.events.close();
  }

  state.events = new EventSource(`/api/rooms/${state.roomId}/events?playerId=${encodeURIComponent(state.playerId)}`);
  state.events.addEventListener("room", (event) => {
    state.room = JSON.parse(event.data);
    render();
  });
  state.events.addEventListener("error", () => {
    showToast("Connection interrupted");
  });
}

function render() {
  const hasRoom = Boolean(state.room);
  const seated = state.playerId && isSeated(state.playerId);

  els.setupPanel.classList.toggle("hidden", hasRoom);
  els.joinPanel.classList.toggle("hidden", !hasRoom || seated);
  els.tableView.classList.toggle("hidden", !hasRoom || !seated);

  els.roomLine.textContent = hasRoom ? `Room ${state.room.id}` : "No room selected";
  els.sessionPill.textContent = seated ? playerName(state.playerId) : "Not seated";

  if (!hasRoom) {
    clearTimer();
    return;
  }

  if (!seated) {
    els.joinRoomTitle.textContent = `Join ${state.room.id}`;
    renderAvatarSelect(els.roomJoinAvatarInput, usedAvatarIds(), els.roomJoinAvatarInput.value);
    clearTimer();
    return;
  }

  renderPlayers();
  renderScores();
  renderTable();
  renderHand();
  renderChat();
  renderStats();
  renderSettings();
  updateTimer();

  if (state.room.match?.status === "completed" && state.statsLoadedForMatchId !== state.room.match.id) {
    state.statsLoadedForMatchId = state.room.match.id;
    setTimeout(loadStats, 0);
  }
}

function renderPlayers() {
  const match = state.room.match;
  const currentPlayerId = match?.game?.currentPlayerId;

  els.playersList.innerHTML = state.room.seats.map((seat) => {
    const score = match?.rawScores?.[seat.playerId] ?? 0;
    const infractions = match?.infractions?.[seat.playerId] ?? 0;
    const handCount = match?.game?.handCounts?.[seat.playerId];
    const connected = seat.isBot ? "bot" : seat.connected ? "online" : "exited";
    const active = match?.playerOrder?.includes(seat.playerId);
    const lobby = match && !active;
    const role = match ? (active ? "active" : "lobby") : "waiting";
    const rowClasses = [
      seat.playerId === currentPlayerId ? "current" : "",
      lobby ? "lobby" : "",
      seat.connected ? "" : "exited"
    ].filter(Boolean).join(" ");

    return `
      <div class="player-row ${rowClasses}">
        ${avatarHtml(seat.avatarId, "player-row-avatar")}
        <div>
          <div class="player-name">${escapeHtml(seat.name)}</div>
          <div class="player-meta">${role} | ${connected}${handCount === undefined ? "" : ` | ${handCount} tiles`} | ${infractions} inf</div>
        </div>
        <strong>${score}</strong>
      </div>
    `;
  }).join("");

  const botCount = state.room.seats.filter((seat) => seat.isBot).length;
  const showAddBot = state.room.status === "waiting"
    && state.playerId === state.room.hostPlayerId
    && state.room.seats.length < MAX_PLAYERS_PER_ROOM
    && botCount < 3;
  els.addBotButton.classList.toggle("hidden", !showAddBot);
  els.addBotButton.disabled = !showAddBot;
  els.addBotButton.textContent = botCount >= 3 ? "Bot Limit Reached" : "Add Bot";
  const showStartMatch = state.room.status === "waiting" && state.playerId === state.room.hostPlayerId;
  const startDisabled = !showStartMatch || state.room.seats.length < ACTIVE_PLAYERS_PER_GAME;
  setButtonVisibility(els.startMatchButton, showStartMatch, startDisabled);
  setButtonVisibility(els.topStartMatchButton, showStartMatch, startDisabled);
  const breakVisible = state.room.matchLength === 10
    && Boolean(match)
    && Boolean(match.playerOrder?.includes(state.playerId))
    && state.room.status !== "cancelled"
    && state.room.status !== "completed";
  const breakUsed = Boolean(match?.bathroomBreaksByPlayerId?.[state.playerId]);
  const canResumeBreak = Boolean(
    match
    && match.status === "paused"
    && match.pauseReason === "bathroomBreak"
    && match.pausedByPlayerId === state.playerId
  );

  els.bathroomBreakButton.classList.toggle("hidden", !breakVisible);
  els.bathroomBreakButton.disabled = !breakVisible
    || breakUsed
    || match.status !== "active"
    || !match.game;
  els.bathroomBreakButton.textContent = breakUsed ? "Break Used" : "Bath Break";
  els.resumeBreakButton.classList.toggle("hidden", !canResumeBreak);
  els.resumeBreakButton.disabled = !canResumeBreak;
  const showEndSession = state.playerId === state.room.hostPlayerId;
  const endDisabled = state.room.status === "cancelled";
  setButtonVisibility(els.endSessionButton, showEndSession, endDisabled);
  setButtonVisibility(els.topEndSessionButton, showEndSession && !endDisabled, endDisabled);
  els.hostActionBar.classList.toggle("hidden", !showStartMatch && !(showEndSession && !endDisabled));
}

async function startMatch() {
  const result = await api(`/api/rooms/${state.roomId}/start`, {
    method: "POST",
    body: { playerId: state.playerId }
  });

  state.room = result.room;
  render();
}

async function endSession() {
  const confirmed = window.confirm("End this session for all players?");

  if (!confirmed) {
    return;
  }

  const result = await api(`/api/rooms/${state.roomId}/end-session`, {
    method: "POST",
    body: { playerId: state.playerId }
  });

  state.room = result.room;
  if (state.events) {
    state.events.close();
    state.events = null;
  }
  showToast("Session ended");
  render();
}

function setButtonVisibility(button, visible, disabled) {
  button.classList.toggle("hidden", !visible);
  button.disabled = disabled;
}

function renderScores() {
  const match = state.room.match;

  if (!match) {
    els.gameCounter.textContent = `${state.room.matchLength}-game championship`;
    els.scoreList.innerHTML = state.room.seats.map((seat) => `
      <div class="score-row">
        <div>
          <div class="player-name">${escapeHtml(seat.name)}</div>
          <div class="score-meta">waiting</div>
        </div>
        <div class="score-points">0</div>
      </div>
    `).join("");
    return;
  }

  els.gameCounter.textContent = match.finalReview
    ? "Championship final review"
    : match.status === "completed"
      ? "Championship complete"
      : `Round ${match.currentGameNumber} of ${match.matchLength}`;
  els.scoreList.innerHTML = [...state.room.seats]
    .sort((first, second) => (match.rawScores[second.playerId] ?? 0) - (match.rawScores[first.playerId] ?? 0))
    .map((seat) => {
      const raw = match.rawScores[seat.playerId] ?? 0;
      const infractions = match.infractions[seat.playerId] ?? 0;
      const penalty = penaltyFor(match, infractions);
      const finalScore = raw + penalty;
      const activeReview = match.betweenGames ?? match.finalReview;
      const lastRoundPoints = activeReview?.scoreResult?.pointsByPlayerId?.[seat.playerId];
      const meta = [
        lastRoundPoints === undefined ? null : `Last +${lastRoundPoints}`,
        `${raw} raw${penalty ? `, ${penalty} penalty` : ""}`
      ].filter(Boolean).join(" | ");

      return `
        <div class="score-row">
          <div>
            <div class="player-name">${escapeHtml(seat.name)}</div>
            <div class="score-meta">${meta}</div>
          </div>
          <div class="score-points">${finalScore}</div>
        </div>
      `;
    }).join("");
}

function renderTable() {
  const match = state.room.match;
  const game = match?.game;
  const selectedTile = currentSelectedTile(game);
  const reviewMode = Boolean(match?.betweenGames || match?.finalReview || match?.status === "completed");

  clearPixiBoard(els.board);
  els.tablePanel.classList.toggle("review-mode", reviewMode);

  if (state.room.status === "cancelled") {
    els.turnLabel.textContent = "Session Ended";
    els.statusSub.textContent = "The host ended this table";
    els.board.className = "board is-empty";
    els.board.innerHTML = renderEndedSessionControls();
    bindNewSessionControl();
    return;
  }

  if (!match) {
    els.turnLabel.textContent = "Waiting";
    els.statusSub.textContent = state.room.seats.length >= ACTIVE_PLAYERS_PER_GAME
      ? `${Math.min(state.room.seats.length, MAX_PLAYERS_PER_ROOM)} joined, ready`
      : `${state.room.seats.length}/${ACTIVE_PLAYERS_PER_GAME} needed`;
    els.board.className = "board is-empty";
    els.board.innerHTML = `<div class="empty-board">Table open</div>`;
    return;
  }

  if (match.status === "paused") {
    els.turnLabel.textContent = match.pauseReason === "bathroomBreak" ? "Bathroom Break" : "Paused";
    els.statusSub.textContent = match.pauseReason === "bathroomBreak"
      ? `${playerName(match.pausedByPlayerId)} paused the championship`
      : exitedPlayersText(match);
  } else if (match.status === "completed") {
    els.turnLabel.textContent = "Championship Complete";
    els.statusSub.textContent = `Winner: ${match.winnerIds.map(playerName).join(", ")}`;
  } else if (match.status === "cancelled") {
    els.turnLabel.textContent = "Session Ended";
    els.statusSub.textContent = "The host ended this table";
    els.board.className = "board is-empty";
    els.board.innerHTML = renderEndedSessionControls();
    bindNewSessionControl();
    return;
  } else if (match.finalReview) {
    els.turnLabel.textContent = "Final Round Complete";
    els.statusSub.textContent = "Final scores appear after review";
  } else if (match.betweenGames) {
    els.turnLabel.textContent = `Round ${match.betweenGames.previousGameNumber} Complete`;
    els.statusSub.textContent = "Next round starts after score review";
  } else {
    els.turnLabel.textContent = `${playerName(game.currentPlayerId)} to play`;
    els.statusSub.textContent = game.requiredOpeningTileId
      ? `Opening tile: ${game.requiredOpeningTileId}`
      : "Live";
  }

  if (match.betweenGames || match.finalReview) {
    els.board.className = "board results-board";
    els.board.innerHTML = renderBetweenGameResults(match);
    if (match.betweenGames) {
      bindBetweenGameControls();
    }
    return;
  }

  if (!game) {
    els.board.className = "board is-empty";
    els.board.innerHTML = match.status === "completed"
      ? renderFinalResults(match) + renderNewMatchControls()
      : `<div class="empty-board">Table paused</div>`;
    bindNewMatchControls();
    return;
  }

  if (!game || game.board.plays.length === 0) {
    const canPose = selectedTile && playableEnds(selectedTile, game).includes("opening");

    els.board.className = "board";
    els.board.innerHTML = renderTableSeats(match) + renderPlayAnimation(match);
    void renderPixiBoard(els.board, {
      plays: [],
      openingEnabled: canPose,
      onTarget: playSelectedTile
    });
    return;
  }

  const selectedEnds = selectedTile ? playableEnds(selectedTile, game) : [];

  els.board.className = "board";
  els.board.dataset.tileCount = String(game.board.plays.length);
  els.board.innerHTML = renderTableSeats(match) + renderSeedReveal(match) + renderPlayAnimation(match);
  void renderPixiBoard(els.board, {
    plays: game.board.plays,
    selectedEnds,
    onTarget: playSelectedTile
  });
}

function renderTableSeats(match) {
  if (!match?.game) {
    return "";
  }

  const positions = ["south", "west", "north", "east"];
  const activeSeats = match.playerOrder
    .slice(0, ACTIVE_PLAYERS_PER_GAME)
    .map((playerId, index) => ({
      playerId,
      seat: state.room.seats.find((item) => item.playerId === playerId) ?? match.players.find((item) => item.id === playerId),
      position: positions[index]
    }));

  return `
    <div class="table-player-seats" aria-hidden="true">
      ${activeSeats.map(({ playerId, seat, position }) => `
        <div class="table-player-seat seat-${position} ${match.game.currentPlayerId === playerId ? "is-turn" : ""}">
          ${avatarHtml(seat?.avatarId, "seat-avatar")}
          <span>${escapeHtml(playerName(playerId))}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderPlayAnimation(match) {
  const action = match?.lastAction ?? match?.game?.lastAction;
  const iAmLobby = Boolean(match?.game && !match.playerOrder.includes(state.playerId));

  if (!iAmLobby || !action || !["play", "timeoutAutoPlay"].includes(action.type) || !action.move) {
    return "";
  }

  const actionKey = [
    match.game.number,
    action.type,
    action.playerId,
    action.at,
    action.move.tileId,
    match.game.board.plays.length
  ].join(":");

  if (state.lastAnimatedActionKey === actionKey) {
    return "";
  }

  state.lastAnimatedActionKey = actionKey;
  const player = state.room.seats.find((seat) => seat.playerId === action.playerId);
  const tile = {
    high: Number.isFinite(action.move.high) ? action.move.high : action.move.leftValue,
    low: Number.isFinite(action.move.low) ? action.move.low : action.move.rightValue
  };

  return `
    <div class="play-animation-banner" data-action-key="${escapeHtml(actionKey)}" role="status" aria-live="polite">
      ${avatarHtml(player?.avatarId, "play-animation-avatar")}
      <div>
        <strong>${escapeHtml(playerName(action.playerId))}</strong>
        <span>${action.type === "timeoutAutoPlay" ? "auto-played" : "played"} a tile</span>
      </div>
      ${dominoHtml(tile, "horizontal", "play-animation-tile")}
    </div>
  `;
}

function renderHand() {
  const game = state.room.match?.game;
  els.tablePanel.classList.toggle("no-hand", !game);
  const myTurn = game?.currentPlayerId === state.playerId
    && state.room.match.status === "active"
    && state.room.status !== "cancelled";
  const hand = game?.hand ?? [];
  const hasPlayableTile = hand.some((tile) => playableEnds(tile, game).length > 0);
  const seedUsed = Boolean(game?.seedToBoardUsedByPlayerId?.[state.playerId]);

  els.passButton.disabled = !myTurn || hasPlayableTile;
  els.seedBoardButton.disabled = !myTurn || seedUsed;
  els.seedBoardButton.textContent = seedUsed ? "Seed Used" : "Seed to Board";

  if (state.selectedTile && !hand.some((tile) => tile.id === state.selectedTile.id)) {
    state.selectedTile = null;
  }

  if (!game) {
    els.hand.innerHTML = "";
    return;
  }

  els.hand.innerHTML = hand.map((tile) => {
    const ends = playableEnds(tile, game);
    const disabled = !myTurn || ends.length === 0 || (game.requiredOpeningTileId && tile.id !== game.requiredOpeningTileId);

    return `
      <button class="tile-button ${state.selectedTile?.id === tile.id ? "selected" : ""}" data-tile-id="${tile.id}" draggable="${disabled ? "false" : "true"}" ${disabled ? "disabled" : ""}>
        ${dominoHtml(tile)}
      </button>
    `;
  }).join("");

  els.hand.querySelectorAll(".tile-button").forEach((button) => {
    button.addEventListener("click", () => onTileClick(hand.find((tile) => tile.id === button.dataset.tileId)));
    button.addEventListener("dragstart", (event) => onTileDragStart(event, hand.find((tile) => tile.id === button.dataset.tileId)));
  });
}

function renderChat() {
  const messages = state.room.match?.chatMessages ?? [];
  const mutedUntil = Number(state.room.match?.chatMutedUntilByPlayerId?.[state.playerId] ?? 0);
  const muted = mutedUntil > Date.now();
  const hostCanModerate = Boolean(state.room.match && state.playerId === state.room.hostPlayerId);

  els.chatInput.disabled = state.room.status === "cancelled" || muted;
  els.chatInput.placeholder = muted
    ? `Chat blocked for ${Math.ceil((mutedUntil - Date.now()) / 60000)}m`
    : "";
  els.chatForm.querySelector("button").disabled = state.room.status === "cancelled" || muted;
  els.chatLog.innerHTML = messages.map((message) => `
    <div class="chat-message">
      <div class="chat-message-head">
        <div class="chat-name">${escapeHtml(playerName(message.playerId))}</div>
        ${hostCanModerate ? `
          <div class="chat-actions">
            <button class="plain-action chat-delete-button" type="button" data-message-id="${escapeHtml(message.id)}">Delete</button>
            ${message.playerId !== state.room.hostPlayerId ? `<button class="plain-action chat-block-button" type="button" data-player-id="${escapeHtml(message.playerId)}">Mute ${CHAT_BLOCK_MINUTES}m</button>` : ""}
          </div>
        ` : ""}
      </div>
      <div>${escapeHtml(message.text)}</div>
    </div>
  `).join("");
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
  bindChatModerationControls();
}

function bindChatModerationControls() {
  els.chatLog.querySelectorAll(".chat-delete-button").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const result = await api(`/api/rooms/${state.roomId}/delete-chat-message`, {
          method: "POST",
          body: {
            playerId: state.playerId,
            messageId: button.dataset.messageId
          }
        });

        state.room = result.room;
        showToast("Message deleted");
        render();
      } catch (error) {
        showToast(error.message);
      }
    });
  });

  els.chatLog.querySelectorAll(".chat-block-button").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const result = await api(`/api/rooms/${state.roomId}/block-chat-player`, {
          method: "POST",
          body: {
            playerId: state.playerId,
            targetPlayerId: button.dataset.playerId,
            minutes: CHAT_BLOCK_MINUTES
          }
        });

        state.room = result.room;
        showToast("Player muted");
        render();
      } catch (error) {
        showToast(error.message);
      }
    });
  });
}

function renderStats() {
  if (!els.leaderboardList || !els.recordsList) {
    return;
  }

  const stats = state.stats;

  if (!stats) {
    els.leaderboardList.innerHTML = `<div class="score-meta">loading</div>`;
    els.recordsList.innerHTML = "";
    return;
  }

  els.leaderboardList.innerHTML = stats.leaderboard.length
    ? stats.leaderboard.map((entry, index) => `
      <div class="stat-row">
        <strong>${index + 1}</strong>
        <span>${escapeHtml(entry.name)}</span>
        <strong>${entry.wins}</strong>
      </div>
    `).join("")
    : `<div class="score-meta">No completed matches yet</div>`;

  const category = els.recordsCategory.value;
  const records = stats.records?.[category] ?? [];

  els.recordsList.innerHTML = records.length
    ? records.map((entry, index) => `
      <div class="stat-row">
        <strong>${index + 1}</strong>
        <span>${escapeHtml(entry.name)}</span>
        <strong>${entry.value}</strong>
      </div>
    `).join("")
    : `<div class="score-meta">No records yet</div>`;
}

function renderSettings() {
  if (!els.settingsForm || !els.settingsPanel) {
    return;
  }

  const hostCanAccess = Boolean(
    state.room
    && state.playerId
    && state.room.hostPlayerId === state.playerId
    && state.room.status === "waiting"
    && state.room.seats.length >= ACTIVE_PLAYERS_PER_GAME
    && !state.room.match
  );

  if (!hostCanAccess) {
    state.settingsExpanded = false;
    els.settingsPanel.classList.add("hidden");
    return;
  }

  els.settingsPanel.classList.remove("hidden");
  const isExpanded = state.settingsExpanded;
  const isLoggedIn = Boolean(state.adminToken);

  els.settingsToggleButton.textContent = isExpanded ? "Minimize" : "Expand";
  els.adminLoginForm.classList.toggle("hidden", !isExpanded || isLoggedIn);
  els.settingsForm.classList.toggle("hidden", !isExpanded || !isLoggedIn);
}

function renderBetweenGameResults(match) {
  const review = match.betweenGames ?? match.finalReview;
  const scoreResult = review.scoreResult;
  const startNowRequest = match.betweenGames?.startNowRequest ?? null;
  const startNowVotes = startNowRequest?.votesByPlayerId ?? {};
  const readyPlayerIds = match.betweenGames
    ? match.playerOrder.filter((playerId) => startNowVotes[playerId] === true)
    : [];
  const waitingPlayerIds = match.betweenGames
    ? match.playerOrder.filter((playerId) => startNowVotes[playerId] !== true)
    : [];
  const iAmReady = match.betweenGames ? readyPlayerIds.includes(state.playerId) : false;
  const iAmActiveNext = match.betweenGames ? match.playerOrder.includes(state.playerId) : false;
  const waitingNames = waitingPlayerIds.map((playerId) => playerName(playerId));
  const rows = [...scoreResult.placements]
    .sort((first, second) => first.place - second.place)
    .map((placement) => {
      const total = review.scoresAfter[placement.playerId] ?? match.rawScores[placement.playerId] ?? 0;

      return `
        <div class="result-row">
          <strong>${ordinal(placement.place)}</strong>
          <span>${escapeHtml(playerName(placement.playerId))}</span>
          <span>${placement.pipTotal} pips, ${placement.tileCount} tiles</span>
          <strong>+${placement.points}</strong>
          <strong>${total}</strong>
        </div>
      `;
    }).join("");

  return `
    <div class="results-panel">
      <div class="results-title">
        <div>
          <h2>Last Round</h2>
          <p>${endReasonLabel(scoreResult.endType)}</p>
        </div>
        <div class="next-game-pill">${match.finalReview ? "Final standings next" : `Next: Round ${review.nextGameNumber}`}</div>
      </div>
      <div class="result-row result-head">
        <span>Place</span>
        <span>Player</span>
        <span>Tiles Left</span>
        <span>Round</span>
        <span>Total</span>
      </div>
      ${rows}
      ${match.betweenGames ? `
        <div class="start-now-panel">
          <div class="start-now-line">
            <strong>Start Now</strong>
            <span>${readyPlayerIds.length}/${match.playerOrder.length} ready</span>
          </div>
          ${waitingNames.length
            ? `<div class="start-now-line"><span>Waiting on: ${escapeHtml(waitingNames.join(", "))}</span></div>`
            : `<div class="start-now-line"><span>All players ready. Starting now...</span></div>`}
          <div class="start-now-actions">
            ${iAmActiveNext
              ? (!iAmReady ? `<button id="startNowReadyButton" type="button">Start Now</button>` : `<span class="score-meta">You are ready. Waiting for others...</span>`)
              : `<span class="score-meta">Lobby players can watch and chat while active players ready up.</span>`}
          </div>
        </div>
      ` : ""}
    </div>
  `;
}

function renderFinalResults(match) {
  const rows = Object.entries(match.finalScores ?? match.rawScores)
    .sort((first, second) => second[1] - first[1])
    .map(([playerId, score]) => `
      <div class="result-row">
        <span>${escapeHtml(playerName(playerId))}</span>
        <strong>${score}</strong>
      </div>
    `).join("");

  return `
    <div class="results-panel compact-results">
      <h2>Final Scores</h2>
      ${rows}
    </div>
  `;
}

function renderEndedSessionControls() {
  const isHost = state.playerId === state.room.hostPlayerId;

  return `
    <div class="empty-board session-ended-panel">
      <strong>Session ended</strong>
      ${isHost ? `<button id="newSessionButton" type="button">New Session</button>` : ""}
    </div>
  `;
}

function renderNewMatchControls() {
  const request = state.room.rematchRequest;
  const votes = request?.votesByPlayerId ?? {};
  const votedSeats = state.room.seats.filter((seat) => votes[seat.playerId]);
  const votedCount = votedSeats.length;
  const myVote = votes[state.playerId]?.matchLength ?? state.room.matchLength;
  const matchingVoteCount = state.room.seats.filter((seat) => votes[seat.playerId]?.matchLength === Number(myVote)).length;
  const canAddBotForRematch = state.playerId === state.room.hostPlayerId
    && matchingVoteCount === ACTIVE_PLAYERS_PER_GAME - 1
    && state.room.seats.length < MAX_PLAYERS_PER_ROOM
    && state.room.seats.filter((seat) => seat.isBot).length < 3;
  const voteRows = state.room.seats.map((seat) => {
    const vote = votes[seat.playerId];
    return `
      <div class="vote-row">
        ${avatarHtml(seat.avatarId, "player-row-avatar")}
        <span>${escapeHtml(seat.name)}</span>
        <strong>${vote ? `${vote.matchLength}-game championship` : "waiting"}</strong>
      </div>
    `;
  }).join("");

  return `
    <div class="results-panel rematch-panel">
      <div class="results-title">
        <div>
          <h2>New Championship</h2>
          <p>Any 4 or more players who vote for the same length will start the next championship.</p>
        </div>
        <div class="next-game-pill">${votedCount} voted</div>
      </div>
      <div class="rematch-controls">
        <select id="newMatchLength">
          <option value="2" ${Number(myVote) === 2 ? "selected" : ""}>2-game championship</option>
          <option value="5" ${Number(myVote) === 5 ? "selected" : ""}>5-game championship</option>
          <option value="10" ${Number(myVote) === 10 ? "selected" : ""}>10-game championship</option>
        </select>
        <button id="newMatchButton" type="button">New Championship</button>
        ${canAddBotForRematch ? `<button id="addRematchBotButton" type="button">Add Bot</button>` : ""}
      </div>
      <div class="vote-list">${voteRows}</div>
    </div>
  `;
}

function bindNewSessionControl() {
  const button = els.board.querySelector("#newSessionButton");

  if (!button) {
    return;
  }

  button.addEventListener("click", returnToStartPage);
}

function bindNewMatchControls() {
  const button = els.board.querySelector("#newMatchButton");
  const select = els.board.querySelector("#newMatchLength");

  if (!button || !select) {
    return;
  }

  button.addEventListener("click", async () => {
    const result = await api(`/api/rooms/${state.roomId}/new-match`, {
      method: "POST",
      body: {
        playerId: state.playerId,
        matchLength: Number(select.value)
      }
    });

    state.room = result.room;
    showToast("New championship vote saved");
    render();
  });

  const addBotButton = els.board.querySelector("#addRematchBotButton");

  if (addBotButton) {
    addBotButton.addEventListener("click", async () => {
      const result = await api(`/api/rooms/${state.roomId}/add-bot`, {
        method: "POST",
        body: {
          playerId: state.playerId,
          matchLength: Number(select.value)
        }
      });

      state.room = result.room;
      showToast("Bot added to new championship vote");
      render();
    });
  }
}

function returnToStartPage() {
  if (state.events) {
    state.events.close();
    state.events = null;
  }

  state.room = null;
  state.roomId = null;
  state.playerId = null;
  state.selectedTile = null;
  sessionStorage.removeItem("dominoes-admin-token");
  window.location.assign("/");
}

function bindBetweenGameControls() {
  const readyButton = els.board.querySelector("#startNowReadyButton");

  if (readyButton) {
    readyButton.addEventListener("click", async () => {
      const result = await api(`/api/rooms/${state.roomId}/start-now-request`, {
        method: "POST",
        body: {
          playerId: state.playerId
        }
      });

      state.room = result.room;
      showToast("You are marked ready");
      render();
    });
  }
}

async function onTileClick(tile) {
  const game = state.room.match?.game;
  const ends = playableEnds(tile, game);

  if (ends.length === 0) {
    return;
  }

  state.selectedTile = state.selectedTile?.id === tile.id ? null : tile;
  renderTable();
  renderHand();
}

function onTileDragStart(event, tile) {
  const game = state.room.match?.game;
  const ends = playableEnds(tile, game);

  if (ends.length === 0) {
    event.preventDefault();
    return;
  }

  state.selectedTile = tile;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", tile.id);
  renderTable();
  renderHand();
}

async function playSelectedTile(end) {
  if (!state.selectedTile) {
    return;
  }

  await playTile(state.selectedTile, end);
}

async function playTile(tile, end) {
  const result = await api(`/api/rooms/${state.roomId}/play`, {
    method: "POST",
    body: {
      playerId: state.playerId,
      tileId: tile.id,
      end
    }
  });

  state.selectedTile = null;
  state.room = result.room;
  render();
}

function updateTimer() {
  clearTimer();

  const match = state.room?.match;
  const game = match?.game;
  const targetAt = match?.status === "paused" && match.pauseReason === "bathroomBreak"
    ? match.pauseEndsAt
    : match?.status === "active" && match.betweenGames
      ? match.betweenGames.deadlineAt
      : match?.status === "active" && match.finalReview
        ? match.finalReview.deadlineAt
        : match?.status === "active" && game
          ? game.turnDeadlineAt
          : null;

  if (!targetAt) {
    els.turnTimer.textContent = "--";
    els.turnTimer.classList.remove("warning");
    return;
  }

  const tick = () => {
    const remaining = Math.max(0, Math.ceil((targetAt - Date.now()) / 1000));
    els.turnTimer.textContent = String(remaining);
    els.turnTimer.classList.toggle("warning", remaining <= 10);
  };

  tick();
  state.timerInterval = setInterval(tick, 250);
}

function clearTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function playableEnds(tile, game) {
  if (!game) {
    return [];
  }

  if (game.board.leftEnd === null || game.board.rightEnd === null) {
    if (game.requiredOpeningTileId && tile.id !== game.requiredOpeningTileId) {
      return [];
    }

    return ["opening"];
  }

  const ends = [];

  if (tile.high === game.board.leftEnd || tile.low === game.board.leftEnd) {
    ends.push("left");
  }

  if (tile.high === game.board.rightEnd || tile.low === game.board.rightEnd) {
    ends.push("right");
  }

  return ends;
}

function renderBoardChain(plays, game, selectedEnds) {
  const layout = buildSnakeLayout(plays);

  return `
    <div class="board-chain snake-chain" aria-label="Dominoes board" style="width: ${layout.width}px; height: ${layout.height}px;">
      ${boardTargetHtml("left", game.board.leftEnd, selectedEnds.includes("left"), layout.leftTarget)}
      ${plays.map((play, index) => {
        const position = layout.positions[index];
        const tileOrientation = position.forceVertical ? "vertical" : "auto";
        const isReverse = shouldReverseTileAtIndex(plays, layout.positions, index, tileOrientation, position.direction);
        return `
          <div class="snake-item" style="${positionStyle(position)}">
            ${dominoHtml({
              high: isReverse ? play.rightValue : play.leftValue,
              low: isReverse ? play.leftValue : play.rightValue
            }, tileOrientation, `board-tile-${index}`)}
          </div>
        `;
      }).join("")}
      ${boardTargetHtml("right", game.board.rightEnd, selectedEnds.includes("right"), layout.rightTarget)}
    </div>
  `;
}

function shouldReverseTileAtIndex(plays, positions, index, orientation, fallbackDirection) {
  const play = plays[index];

  if (play.leftValue === play.rightValue) {
    return false;
  }

  const current = positions[index];
  const next = positions[index + 1] ?? null;
  const previous = positions[index - 1] ?? null;
  const towardNext = next
    ? relativeDirection(current, next)
    : previous
      ? oppositeDirection(relativeDirection(previous, current))
      : (fallbackDirection === -1 ? "left" : "right");
  const isVertical = orientation === "vertical";

  if (isVertical) {
    if (towardNext === "up") {
      return true;
    }

    if (towardNext === "down") {
      return false;
    }

    return fallbackDirection === -1;
  }

  if (towardNext === "left") {
    return true;
  }

  if (towardNext === "right") {
    return false;
  }

  return fallbackDirection === -1;
}

function relativeDirection(fromPosition, toPosition) {
  const fromCenterX = fromPosition.x + fromPosition.width / 2;
  const fromCenterY = fromPosition.y + fromPosition.height / 2;
  const toCenterX = toPosition.x + toPosition.width / 2;
  const toCenterY = toPosition.y + toPosition.height / 2;
  const deltaX = toCenterX - fromCenterX;
  const deltaY = toCenterY - fromCenterY;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX >= 0 ? "right" : "left";
  }

  return deltaY >= 0 ? "down" : "up";
}

function oppositeDirection(direction) {
  if (direction === "left") {
    return "right";
  }

  if (direction === "right") {
    return "left";
  }

  if (direction === "up") {
    return "down";
  }

  return "up";
}

function boardTargetHtml(end, pip, enabled, position = null) {
  return `
    <button class="board-target snake-target ${enabled ? "is-live" : ""}" type="button" data-end="${end}" title="Play on ${end} end: ${pip}" style="${position ? positionStyle(position) : ""}" ${enabled ? "" : "disabled"}>
      ${pipFaceHtml(pip)}
    </button>
  `;
}

function renderSeedReveal(match) {
  const reveal = match?.game?.lastSeedToBoardReveal;

  if (!reveal) {
    return "";
  }

  const revealDurationMs = Math.max(10_000, Number(match?.seedToBoardRevealDurationMs ?? 10_000));
  const visibleDurationMs = revealDurationMs + 3_000;
  const ageMs = Date.now() - reveal.createdAt;

  if (ageMs > visibleDurationMs) {
    return "";
  }

  const counts = state.room.seats.map((seat) => `
      <span>${escapeHtml(seat.name)}: <strong>${reveal.handCounts?.[seat.playerId] ?? 0}</strong></span>
    `).join("");

  return `
    <div class="seed-reveal-banner" role="status" aria-live="polite" style="--seed-reveal-duration: ${visibleDurationMs}ms;">
      <div><strong>${escapeHtml(playerName(reveal.requestedByPlayerId))}</strong> used Seed to Board</div>
      <div class="seed-reveal-values">${counts}</div>
    </div>
  `;
}

function buildSnakeLayout(plays) {
  const tileLong = 96;
  const tileShort = 48;
  const gap = 4;
  const availableWidth = Math.max(320, els.board.clientWidth - 24);
  const availableHeight = Math.max(220, els.board.clientHeight - 16);
  const rowCapacity = Math.max(6, Math.min(12, Math.floor(availableWidth / tileLong)));
  const maxRowWidth = rowCapacity * tileLong;
  const turnClearance = 24;
  const positions = new Array(plays.length);
  const rows = [];
  let currentRow = {
    width: 0,
    entries: [],
    maxHeight: 0,
    top: 0,
    bottom: 0,
    direction: 1
  };
  const entryDimensions = (entry, forceVertical = false) => {
    if (forceVertical) {
      return {
        width: tileShort,
        height: tileLong
      };
    }

    return {
      width: entry.isDouble ? tileShort : tileLong,
      height: entry.isDouble ? tileLong : tileShort
    };
  };

  plays.forEach((play, index) => {
    const isDouble = play.leftValue === play.rightValue;
    const width = isDouble ? tileShort : tileLong;
    const height = isDouble ? tileLong : tileShort;

    if (currentRow.entries.length > 0 && currentRow.width + width > maxRowWidth) {
      rows.push(currentRow);
      currentRow = {
        width: 0,
        entries: [],
        maxHeight: 0,
        top: 0,
        bottom: 0,
        direction: 1
      };
    }

    currentRow.entries.push({
      index,
      isDouble,
      width,
      height
    });
    currentRow.width += width;
    currentRow.maxHeight = Math.max(currentRow.maxHeight, height);
  });

  if (currentRow.entries.length > 0) {
    rows.push(currentRow);
  }

  rows.forEach((row, rowIndex) => {
    const direction = rowIndex % 2 === 0 ? 1 : -1;
    row.direction = direction;

    if (rowIndex === 0) {
      row.top = 0;
      row.bottom = row.maxHeight;
    } else {
      const previousRow = rows[rowIndex - 1];
      row.top = previousRow.bottom + turnClearance;
      row.bottom = row.top + row.maxHeight;
    }

    // Left-edge turn: route the next 2 plays upward before returning to horizontal flow.
    if (rowIndex > 0 && rows[rowIndex - 1].direction === -1 && direction === 1 && row.entries.length > 0) {
      const first = row.entries[0];
      const second = row.entries[1] ?? null;
      const firstDims = entryDimensions(first, true);
      const secondDims = second ? entryDimensions(second, true) : null;
      const extraLift = (secondDims?.height ?? 0) + turnClearance;
      row.top += extraLift;
      row.bottom = row.top + row.maxHeight;
      let minTop = row.top;
      let maxBottom = row.bottom;
      let columnTop = row.top;

      positions[first.index] = {
        x: 0,
        y: columnTop,
        width: firstDims.width,
        height: firstDims.height,
        direction,
        forceVertical: true
      };
      minTop = Math.min(minTop, columnTop);
      maxBottom = Math.max(maxBottom, columnTop + firstDims.height);

      let columnWidth = firstDims.width;
      if (second) {
        columnTop -= secondDims.height;
        positions[second.index] = {
          x: 0,
          y: columnTop,
          width: secondDims.width,
          height: secondDims.height,
          direction,
          forceVertical: true
        };
        minTop = Math.min(minTop, columnTop);
        maxBottom = Math.max(maxBottom, columnTop + secondDims.height);
        columnWidth = Math.max(columnWidth, secondDims.width);
      }

      const horizontalBaseY = second ? columnTop : row.top;
      let cursorX = columnWidth;
      row.entries.slice(second ? 2 : 1).forEach((entry) => {
        const dims = entryDimensions(entry, false);
        const entryTop = horizontalBaseY + Math.round((tileShort - dims.height) / 2);
        positions[entry.index] = {
          x: cursorX,
          y: entryTop,
          width: dims.width,
          height: dims.height,
          direction,
          forceVertical: false
        };
        minTop = Math.min(minTop, entryTop);
        maxBottom = Math.max(maxBottom, entryTop + dims.height);
        cursorX += dims.width;
      });

      row.top = minTop;
      row.bottom = maxBottom;
      return;
    }

    if (direction === 1) {
      let cursorX = 0;
      row.entries.forEach((entry) => {
        positions[entry.index] = {
          x: cursorX,
          y: row.top + Math.round((row.maxHeight - entry.height) / 2),
          width: entry.width,
          height: entry.height,
          direction,
          forceVertical: false
        };
        cursorX += entry.width;
      });
      return;
    }

    let cursorX = maxRowWidth;
    row.entries.forEach((entry) => {
      cursorX -= entry.width;
      positions[entry.index] = {
        x: cursorX,
        y: row.top + Math.round((row.maxHeight - entry.height) / 2),
        width: entry.width,
        height: entry.height,
        direction,
        forceVertical: false
      };
    });
  });

  const firstPosition = positions[0] ?? {
    x: 0,
    y: 0,
    width: tileShort,
    height: tileLong,
    direction: 1
  };
  const lastPosition = positions[positions.length - 1] ?? firstPosition;
  const leftTarget = targetForPosition(firstPosition, "before", tileShort, tileLong, gap);
  const rightTarget = targetForPosition(lastPosition, lastPosition.direction === 1 ? "afterRight" : "afterLeft", tileShort, tileLong, gap);
  const extents = [leftTarget, rightTarget, ...positions].reduce((bounds, position) => ({
    minX: Math.min(bounds.minX, position.x),
    minY: Math.min(bounds.minY, position.y),
    maxX: Math.max(bounds.maxX, position.x + position.width),
    maxY: Math.max(bounds.maxY, position.y + position.height)
  }), {
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0
  });
  const normalized = {
    positions: positions.map((position) => normalizePosition(position, extents)),
    leftTarget: normalizePosition(leftTarget, extents),
    rightTarget: normalizePosition(rightTarget, extents),
    width: extents.maxX - extents.minX + 12,
    height: extents.maxY - extents.minY + 12
  };
  const scale = Math.min(1, availableWidth / normalized.width, availableHeight / normalized.height);

  return {
    positions: normalized.positions.map((position) => scalePosition(position, scale)),
    leftTarget: scalePosition(normalized.leftTarget, scale),
    rightTarget: scalePosition(normalized.rightTarget, scale),
    width: Math.min(availableWidth, Math.max(200, Math.floor(normalized.width * scale))),
    height: Math.min(availableHeight, Math.max(120, Math.floor(normalized.height * scale)))
  };
}

function targetForPosition(position, placement, targetWidth, targetHeight, gap) {
  const y = position.y + Math.round((position.height - targetHeight) / 2);

  if (placement === "afterRight") {
    return {
      x: position.x + position.width + gap,
      y,
      width: targetWidth,
      height: targetHeight
    };
  }

  return {
    x: position.x - targetWidth - gap,
    y,
    width: targetWidth,
    height: targetHeight
  };
}

function normalizePosition(position, bounds) {
  return {
    ...position,
    x: position.x - bounds.minX + 6,
    y: position.y - bounds.minY + 6
  };
}

function scalePosition(position, scale) {
  return {
    ...position,
    x: position.x * scale,
    y: position.y * scale,
    width: position.width * scale,
    height: position.height * scale
  };
}

function positionStyle(position) {
  return `left: ${position.x}px; top: ${position.y}px; width: ${position.width}px; height: ${position.height}px;`;
}

function bindBoardTargets() {
  els.board.querySelectorAll(".board-target").forEach((button) => {
    button.addEventListener("click", () => playSelectedTile(button.dataset.end));
    button.addEventListener("dragover", (event) => {
      if (!button.disabled) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }
    });
    button.addEventListener("drop", async (event) => {
      event.preventDefault();
      await playSelectedTile(button.dataset.end);
    });
  });
}

function currentSelectedTile(game) {
  if (!state.selectedTile || !game?.hand) {
    return null;
  }

  return game.hand.find((tile) => tile.id === state.selectedTile.id) ?? null;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
  }

  return data;
}

function fillSettingsForm(settings) {
  if (!settings) {
    return;
  }

  els.settingFirst.value = settings.scoring.first;
  els.settingSecond.value = settings.scoring.second;
  els.settingThird.value = settings.scoring.third;
  els.settingFourth.value = settings.scoring.fourth;
  els.settingLockWin.value = settings.scoring.lockWin;
  els.settingLockLose.value = settings.scoring.lockLose;
  els.settingTurnSeconds.value = Math.round(settings.turnDurationMs / 1000);
  els.settingBetweenSeconds.value = Math.round(settings.betweenGamesDurationMs / 1000);
  els.settingFinalSeconds.value = Math.round(settings.finalReviewDurationMs / 1000);
  els.settingBreakSeconds.value = Math.round(settings.bathroomBreakDurationMs / 1000);
  const seedSeconds = Math.round((settings.seedToBoardRevealDurationMs ?? 10_000) / 1000);
  els.settingSeedSeconds.value = ["10", "15", "20"].includes(String(seedSeconds)) ? String(seedSeconds) : "10";
  els.settingInfractions.value = settings.infractionsPerPenalty;
  els.settingPenalty.value = settings.penaltyPoints;
}

function settingsFromForm() {
  return {
    scoring: {
      first: Number(els.settingFirst.value),
      second: Number(els.settingSecond.value),
      third: Number(els.settingThird.value),
      fourth: Number(els.settingFourth.value),
      lockWin: Number(els.settingLockWin.value),
      lockLose: Number(els.settingLockLose.value)
    },
    turnDurationMs: Number(els.settingTurnSeconds.value) * 1000,
    betweenGamesDurationMs: Number(els.settingBetweenSeconds.value) * 1000,
    finalReviewDurationMs: Number(els.settingFinalSeconds.value) * 1000,
    bathroomBreakDurationMs: Number(els.settingBreakSeconds.value) * 1000,
    seedToBoardRevealDurationMs: Number(els.settingSeedSeconds.value) * 1000,
    infractionsPerPenalty: Number(els.settingInfractions.value),
    penaltyPoints: Number(els.settingPenalty.value)
  };
}

function sendExitSignal() {
  if (!state.roomId || !state.playerId || !state.room || !isSeated(state.playerId)) {
    return;
  }

  if (state.room.status === "cancelled" || state.room.status === "completed") {
    return;
  }

  const body = JSON.stringify({ playerId: state.playerId });
  const path = `/api/rooms/${state.roomId}/disconnect`;

  if ("sendBeacon" in navigator) {
    navigator.sendBeacon(path, new Blob([body], { type: "application/json" }));
    return;
  }

  fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body,
    keepalive: true
  }).catch(() => {});
}

function roomIdFromPath() {
  const match = window.location.pathname.match(/^\/rooms\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function storedPlayerId(roomId) {
  return localStorage.getItem(`dominoes-player-${roomId}`);
}

function storePlayerId(roomId, playerId) {
  localStorage.setItem(`dominoes-player-${roomId}`, playerId);
}

function isSeated(playerId) {
  return state.room?.seats.some((seat) => seat.playerId === playerId);
}

function playerName(playerId) {
  return state.room?.seats.find((seat) => seat.playerId === playerId)?.name ?? playerId;
}

function playerAvatar(avatarId) {
  return PLAYER_AVATARS.find((avatar) => avatar.id === avatarId) ?? PLAYER_AVATARS[0];
}

function avatarHtml(avatarId, className = "") {
  const avatar = playerAvatar(avatarId);

  return `
    <span class="${className}" style="background: ${avatar.color};" title="${escapeHtml(avatar.label)}">
      ${escapeHtml(avatar.graphic)}
    </span>
  `;
}

function usedAvatarIds() {
  return new Set((state.room?.seats ?? []).map((seat) => seat.avatarId).filter(Boolean));
}

function renderAvatarSelect(select, usedIds = new Set(), currentValue = "") {
  if (!select) {
    return;
  }

  const current = currentValue && !usedIds.has(currentValue)
    ? currentValue
    : PLAYER_AVATARS.find((avatar) => !usedIds.has(avatar.id))?.id ?? PLAYER_AVATARS[0].id;

  select.innerHTML = PLAYER_AVATARS.map((avatar) => {
    const disabled = usedIds.has(avatar.id) && avatar.id !== current;
    return `<option value="${avatar.id}" ${avatar.id === current ? "selected" : ""} ${disabled ? "disabled" : ""}>${escapeHtml(avatar.graphic)} ${escapeHtml(avatar.label)}${disabled ? " - taken" : ""}</option>`;
  }).join("");
}

function penaltyFor(match, infractions) {
  const every = Number(match.infractionsPerPenalty ?? 2);
  const penaltyPoints = Number(match.penaltyPoints ?? -1);

  if (every <= 0) {
    return 0;
  }

  return Math.floor(infractions / every) * penaltyPoints;
}

function exitedPlayersText(match) {
  const names = (match.disconnectedPlayerIds ?? []).map(playerName);

  return names.length > 0 ? `${names.join(", ")} exited` : "Waiting for reconnect";
}

function ordinal(value) {
  return `${value}${value === 1 ? "st" : value === 2 ? "nd" : value === 3 ? "rd" : "th"}`;
}

function endReasonLabel(reason) {
  const labels = {
    normalWin: "Tile-out win",
    mandatoryLock: "Mandatory lock",
    regularLock: "Regular lock"
  };

  return labels[reason] ?? reason;
}

function dominoHtml(tile, orientation = "auto", extraClass = "") {
  const isDouble = tile.high === tile.low;
  const forceVertical = orientation === "vertical";
  const forceHorizontal = orientation === "horizontal";
  const horizontal = forceHorizontal || (!forceVertical && !isDouble);
  const orientationClass = horizontal ? "horizontal" : "";

  return `
    <div class="domino ${orientationClass} ${isDouble ? "double" : ""} ${extraClass}" title="${tile.high}:${tile.low}">
      <div class="domino-half">${pipFaceHtml(tile.high)}</div>
      <div class="domino-half">${pipFaceHtml(tile.low)}</div>
    </div>
  `;
}

function pipFaceHtml(value) {
  const colorByValue = {
    0: "#2f3a39",
    1: "#c98319",
    2: "#cf4d3f",
    3: "#269c3b",
    4: "#2d65b3",
    5: "#2e9a9b",
    6: "#9a42b9"
  };
  const coordsByValue = {
    0: [],
    1: [[50, 50]],
    2: [[28, 28], [72, 72]],
    3: [[28, 28], [50, 50], [72, 72]],
    4: [[28, 28], [72, 28], [28, 72], [72, 72]],
    5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
    6: [[28, 28], [72, 28], [28, 50], [72, 50], [28, 72], [72, 72]]
  };
  const dots = coordsByValue[value] ?? [];
  const circles = dots.map(([x, y]) => `<circle class="pip-circle" cx="${x}" cy="${y}" r="5" fill="${colorByValue[value] ?? "#2f3a39"}"></circle>`).join("");

  return `
    <svg class="pip-face" viewBox="0 0 100 100" aria-label="${value}" role="img">
      ${circles}
    </svg>
  `;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.register("/sw.js?v=40").catch(() => {});
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  setTimeout(() => {
    els.toast.classList.add("hidden");
  }, 2600);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
