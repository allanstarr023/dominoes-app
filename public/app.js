import {
  loadAudioPreference,
  playTileSound,
  saveAudioPreference
} from "./audio.js?v=78";
import {
  disposeChampionshipDayVisuals,
  renderChampionshipDayVisualAnalytics
} from "./championshipDayCharts.js?v=78";
import { clearPixiBoard, renderPixiBoard } from "./pixiBoardRenderer.js?v=78";

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
  portalAdminToken: sessionStorage.getItem("dominoes-portal-admin-token"),
  portalData: null,
  championshipDayId: championshipDayIdFromPath(),
  championshipDayDetail: null,
  championshipDayLoadingId: null,
  championshipDayTieBreaker: null,
  championshipDayWizardStep: "setup",
  championshipDayScoreEntryOpen: false,
  championshipDayActiveScoreTableId: null,
  championshipDayEditingRoundNumber: null,
  championshipDayOpenRoundResults: new Set(),
  championshipDayOpenAdminSessions: new Set(),
  championshipDayChartPlayerFilter: "",
  portalStatus: null,
  adminView: isAdminPath(),
  portalRefreshInterval: null,
  portalNoticeTimer: null,
  adminProfilePictureDataUrl: "",
  sharePanelOpen: false,
  settingsExpanded: false,
  statsLoadedForMatchId: null,
  lastAnimatedActionKey: null,
  lastSoundActionKey: null,
  soundActionPrimed: false,
  soundEnabled: loadAudioPreference(),
  boardFullscreen: false,
  slamArmed: false,
  takeDatTimer: null,
  reactionTimer: null
};

const CHAT_BLOCK_MINUTES = 5;
const MAX_PLAYERS_PER_ROOM = 7;
const ACTIVE_PLAYERS_PER_GAME = 4;
const REACTION_FACES = Object.freeze({
  laughing: { label: "Laughing", face: "\uD83D\uDE02" },
  angry: { label: "Angry", face: "\uD83D\uDE20" },
  serious: { label: "Serious", face: "\uD83D\uDE10" },
  sick: { label: "Sick", face: "\uD83E\uDD22" },
  confused: { label: "Confused", face: "\uD83D\uDE15" }
});
const PLAYER_AVATARS = Object.freeze([
  { id: "electrician", label: "Electrician", graphic: "\uD83E\uDDD1\u200D\uD83D\uDD27", color: "#c98319" },
  { id: "plumber", label: "Plumber", graphic: "\uD83D\uDEE0\uFE0F", color: "#2f6f88" },
  { id: "it-pro", label: "IT Pro", graphic: "\uD83E\uDDD1\u200D\uD83D\uDCBB", color: "#2d65b3" },
  { id: "secretary", label: "Secretary", graphic: "\uD83E\uDDD1\u200D\uD83D\uDCBC", color: "#6f63b6" },
  { id: "president", label: "President", graphic: "\uD83E\uDD35", color: "#8a4f2a" },
  { id: "footballer", label: "Football Star", graphic: "\uD83C\uDFC8", color: "#174d3f" },
  { id: "basketballer", label: "Basketball Star", graphic: "\uD83C\uDFC0", color: "#cf6b2b" },
  { id: "cricketer", label: "Cricket Star", graphic: "\uD83C\uDFCF", color: "#176b54" },
  { id: "tennis-player", label: "Tennis Star", graphic: "\uD83C\uDFBE", color: "#6e8b2f" },
  { id: "sprinter", label: "Sprinter", graphic: "\uD83C\uDFC3", color: "#cf4d3f" },
  { id: "boxer", label: "Boxer", graphic: "\uD83E\uDD4A", color: "#a13f35" },
  { id: "chef", label: "Chef", graphic: "\uD83E\uDDD1\u200D\uD83C\uDF73", color: "#b98218" },
  { id: "doctor", label: "Doctor", graphic: "\uD83E\uDDD1\u200D\u2695\uFE0F", color: "#2e7d95" },
  { id: "nurse", label: "Nurse", graphic: "\uD83D\uDC69\u200D\u2695\uFE0F", color: "#cf4d78" },
  { id: "police", label: "Police", graphic: "\uD83D\uDC6E", color: "#1f4d7a" },
  { id: "firefighter", label: "Firefighter", graphic: "\uD83E\uDDD1\u200D\uD83D\uDE92", color: "#b7372f" },
  { id: "pilot", label: "Pilot", graphic: "\uD83E\uDDD1\u200D\u2708\uFE0F", color: "#276f9b" },
  { id: "teacher", label: "Teacher", graphic: "\uD83E\uDDD1\u200D\uD83C\uDFEB", color: "#6f63b6" },
  { id: "mechanic", label: "Mechanic", graphic: "\uD83D\uDC68\u200D\uD83D\uDD27", color: "#4f645d" },
  { id: "carpenter", label: "Carpenter", graphic: "\uD83E\uDDD1\u200D\uD83E\uDE9A", color: "#8a5f33" },
  { id: "farmer", label: "Farmer", graphic: "\uD83E\uDDD1\u200D\uD83C\uDF3E", color: "#648b35" },
  { id: "musician", label: "Musician", graphic: "\uD83E\uDDD1\u200D\uD83C\uDFA4", color: "#9c4f98" },
  { id: "artist", label: "Artist", graphic: "\uD83E\uDDD1\u200D\uD83C\uDFA8", color: "#2e9a9b" },
  { id: "judge", label: "Judge", graphic: "\uD83E\uDDD1\u200D\u2696\uFE0F", color: "#32383a" },
  { id: "scientist", label: "Scientist", graphic: "\uD83E\uDDD1\u200D\uD83D\uDD2C", color: "#3d7a80" },
  { id: "engineer", label: "Engineer", graphic: "\uD83E\uDDD1\u200D\uD83C\uDFED", color: "#5d6870" },
  { id: "driver", label: "Driver", graphic: "\uD83E\uDDD1\u200D\uD83D\uDE9A", color: "#425f89" },
  { id: "barber", label: "Barber", graphic: "\uD83D\uDC88", color: "#a13f35" },
  { id: "builder", label: "Builder", graphic: "\uD83D\uDC77", color: "#d79817" },
  { id: "champion", label: "Champion", graphic: "\uD83E\uDD47", color: "#176b54" },
  { id: "security", label: "Security", graphic: "\uD83D\uDEE1\uFE0F", color: "#3d4a52" },
  { id: "lawyer", label: "Lawyer", graphic: "\uD83E\uDDD1\u200D\u2696\uFE0F", color: "#4b3f35" },
  { id: "army", label: "Army", graphic: "\uD83E\uDE96", color: "#596b32" },
  { id: "gardener", label: "Gardener", graphic: "\uD83E\uDDD1\u200D\uD83C\uDF3F", color: "#3f7d35" },
  { id: "architect", label: "Architect", graphic: "\uD83D\uDCD0", color: "#496b86" },
  { id: "joiner", label: "Joiner", graphic: "\uD83E\uDE9A", color: "#8a5f33" },
  { id: "welder", label: "Welder", graphic: "\uD83E\uDDD1\u200D\uD83C\uDFED", color: "#56616b" },
  { id: "politician", label: "Politician", graphic: "\uD83D\uDDF3\uFE0F", color: "#7d4438" },
  { id: "pastor", label: "Pastor", graphic: "\u26EA", color: "#6f63b6" },
  { id: "swimmer", label: "Swimmer", graphic: "\uD83C\uDFCA", color: "#2c7f9e" },
  { id: "runner", label: "Runner", graphic: "\uD83C\uDFC3", color: "#c64f3d" },
  { id: "astronaut", label: "Astronaut", graphic: "\uD83E\uDDD1\u200D\uD83D\uDE80", color: "#48546d" }
]);

const els = {
  roomLine: document.querySelector("#roomLine"),
  sessionPill: document.querySelector("#sessionPill"),
  hostActionBar: document.querySelector("#hostActionBar"),
  topStartMatchButton: document.querySelector("#topStartMatchButton"),
  topEndSessionButton: document.querySelector("#topEndSessionButton"),
  portalNotice: document.querySelector("#portalNotice"),
  setupPanel: document.querySelector("#setupPanel"),
  portalCapacitySummary: document.querySelector("#portalCapacitySummary"),
  publicChampionshipList: document.querySelector("#publicChampionshipList"),
  refreshLobbyButton: document.querySelector("#refreshLobbyButton"),
  joinPanel: document.querySelector("#joinPanel"),
  adminPortal: document.querySelector("#adminPortal"),
  portalAdminLoginForm: document.querySelector("#portalAdminLoginForm"),
  portalAdminEmailInput: document.querySelector("#portalAdminEmailInput"),
  portalAdminPasswordInput: document.querySelector("#portalAdminPasswordInput"),
  adminDashboard: document.querySelector("#adminDashboard"),
  adminRefreshButton: document.querySelector("#adminRefreshButton"),
  adminMetrics: document.querySelector("#adminMetrics"),
  adminReportsList: document.querySelector("#adminReportsList"),
  adminRoomsList: document.querySelector("#adminRoomsList"),
  championshipDayWorkspace: document.querySelector("#championshipDayWorkspace"),
  championshipDayCreateForm: document.querySelector("#championshipDayCreateForm"),
  championshipDaySetupStep: document.querySelector("#championshipDaySetupStep"),
  championshipDayPlayersStep: document.querySelector("#championshipDayPlayersStep"),
  championshipDayEnterPlayersButton: document.querySelector("#championshipDayEnterPlayersButton"),
  championshipDayBackToSetupButton: document.querySelector("#championshipDayBackToSetupButton"),
  championshipDayPlayerCountLabel: document.querySelector("#championshipDayPlayerCountLabel"),
  championshipDayNameInput: document.querySelector("#championshipDayNameInput"),
  championshipDayLocationInput: document.querySelector("#championshipDayLocationInput"),
  championshipDayTableCountInput: document.querySelector("#championshipDayTableCountInput"),
  championshipDayStartInput: document.querySelector("#championshipDayStartInput"),
  championshipDayExpectedEndInput: document.querySelector("#championshipDayExpectedEndInput"),
  championshipDayPlayersInput: document.querySelector("#championshipDayPlayersInput"),
  championshipDayPlayersGrid: document.querySelector("#championshipDayPlayersGrid"),
  championshipDayList: document.querySelector("#championshipDayList"),
  adminShutdownForm: document.querySelector("#adminShutdownForm"),
  adminShutdownMode: document.querySelector("#adminShutdownMode"),
  adminShutdownStart: document.querySelector("#adminShutdownStart"),
  adminShutdownEnd: document.querySelector("#adminShutdownEnd"),
  adminShutdownMessage: document.querySelector("#adminShutdownMessage"),
  adminShutdownList: document.querySelector("#adminShutdownList"),
  adminBroadcastForm: document.querySelector("#adminBroadcastForm"),
  adminBroadcastAudience: document.querySelector("#adminBroadcastAudience"),
  adminBroadcastMessage: document.querySelector("#adminBroadcastMessage"),
  adminBroadcastList: document.querySelector("#adminBroadcastList"),
  adminCapacityForm: document.querySelector("#adminCapacityForm"),
  adminCapacityInput: document.querySelector("#adminCapacityInput"),
  adminAllowNewInput: document.querySelector("#adminAllowNewInput"),
  adminUserForm: document.querySelector("#adminUserForm"),
  adminUserFirstName: document.querySelector("#adminUserFirstName"),
  adminUserLastName: document.querySelector("#adminUserLastName"),
  adminUserEmail: document.querySelector("#adminUserEmail"),
  adminUserPassword: document.querySelector("#adminUserPassword"),
  adminUserRole: document.querySelector("#adminUserRole"),
  adminUserStatus: document.querySelector("#adminUserStatus"),
  adminUserProfilePicture: document.querySelector("#adminUserProfilePicture"),
  adminUsersList: document.querySelector("#adminUsersList"),
  adminAuditList: document.querySelector("#adminAuditList"),
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
  roomIdDisplay: document.querySelector("#roomIdDisplay"),
  copyInviteButton: document.querySelector("#copyInviteButton"),
  shareRoomButton: document.querySelector("#shareRoomButton"),
  sharePanel: document.querySelector("#sharePanel"),
  turnLabel: document.querySelector("#turnLabel"),
  statusSub: document.querySelector("#statusSub"),
  statusLobbyReactions: document.querySelector("#statusLobbyReactions"),
  turnTimer: document.querySelector("#turnTimer"),
  boardFullscreenButton: document.querySelector("#boardFullscreenButton"),
  board: document.querySelector("#board"),
  hand: document.querySelector("#hand"),
  seedBoardButton: document.querySelector("#seedBoardButton"),
  slamButton: document.querySelector("#slamButton"),
  takeDatButton: document.querySelector("#takeDatButton"),
  reactionSelect: document.querySelector("#reactionSelect"),
  reactionButton: document.querySelector("#reactionButton"),
  soundToggle: document.querySelector("#soundToggle"),
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
  fillDefaultShutdownWindow();
  fillDefaultChampionshipDayForm();
  loadGlobalData();

  if (state.adminView) {
    loadPortalData();
    render();
    return;
  }

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
    state.sharePanelOpen = true;
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

  els.shareRoomButton.addEventListener("click", () => {
    state.sharePanelOpen = !state.sharePanelOpen;
    renderShareControls();
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

  els.slamButton.addEventListener("click", async () => {
    await handleSlamClick();
  });

  els.takeDatButton.addEventListener("click", async () => {
    await useTakeDat();
  });

  els.reactionButton.addEventListener("click", async () => {
    await sendReaction();
  });

  els.soundToggle.addEventListener("change", () => {
    state.soundEnabled = els.soundToggle.checked;
    saveAudioPreference(state.soundEnabled);
  });

  els.refreshLobbyButton.addEventListener("click", () => {
    loadPortalStatus();
  });

  els.boardFullscreenButton.addEventListener("click", () => {
    toggleBoardFullscreen();
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
    showToast("Championship rules saved");
    renderSettings();
  });

  els.portalAdminLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = await api("/api/admin/login", {
      method: "POST",
      body: {
        email: els.portalAdminEmailInput.value.trim(),
        password: els.portalAdminPasswordInput.value
      }
    });

    state.portalAdminToken = result.token;
    sessionStorage.setItem("dominoes-portal-admin-token", result.token);
    els.portalAdminEmailInput.value = "";
    els.portalAdminPasswordInput.value = "";
    showToast("Portal admin logged in");
    await loadPortalData();
    render();
  });

  els.adminRefreshButton.addEventListener("click", () => {
    loadPortalData();
  });

  els.championshipDayTableCountInput.addEventListener("change", () => {
    fillDefaultChampionshipDayPlayers();
    renderChampionshipDayWizard();
  });

  document.querySelectorAll(".championship-day-table-option").forEach((button) => {
    button.addEventListener("click", () => {
      els.championshipDayTableCountInput.value = button.dataset.tableCount;
      fillDefaultChampionshipDayPlayers();
      renderChampionshipDayWizard();
    });
  });

  els.championshipDayEnterPlayersButton.addEventListener("click", () => {
    if (!els.championshipDayNameInput.reportValidity() || !els.championshipDayStartInput.reportValidity()) {
      return;
    }

    state.championshipDayWizardStep = "players";
    fillDefaultChampionshipDayPlayers();
    renderChampionshipDayWizard();
  });

  els.championshipDayBackToSetupButton.addEventListener("click", () => {
    state.championshipDayWizardStep = "setup";
    renderChampionshipDayWizard();
  });

  els.championshipDayCreateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const tableCount = Number(els.championshipDayTableCountInput.value);
    const startDate = new Date(els.championshipDayStartInput.value);
    const playerAssignments = readChampionshipDayPlayerAssignments(tableCount);
    const tableValidation = validateChampionshipDayPlayerAssignments(playerAssignments, tableCount);
    const id = uniqueChampionshipDayId(startDate);

    if (!tableValidation.valid) {
      showToast(tableValidation.message);
      renderChampionshipDayPlayerAssignmentWarnings(tableValidation);
      return;
    }

    const orderedPlayers = orderedChampionshipDayPlayers(playerAssignments, tableCount);

    const result = await api("/api/admin/championship-day", {
      method: "POST",
      headers: portalAdminHeaders(),
      body: {
        id,
        name: els.championshipDayNameInput.value.trim() || "Championship Day",
        location: els.championshipDayLocationInput.value.trim(),
        tableCount,
        players: orderedPlayers.map((player, index) => ({
          id: `p${index + 1}`,
          name: player.name,
          avatarId: player.avatarId
        })),
        startTime: startDate.toISOString(),
        expectedEndTime: els.championshipDayExpectedEndInput.value
          ? new Date(els.championshipDayExpectedEndInput.value).toISOString()
          : null
      }
    });

    state.championshipDayId = result.championship.id;
    state.championshipDayDetail = result.championship;
    state.championshipDayTieBreaker = null;
    state.championshipDayScoreEntryOpen = false;
    state.championshipDayActiveScoreTableId = null;
    state.championshipDayEditingRoundNumber = null;
    state.championshipDayWizardStep = "setup";
    history.pushState(null, "", `/admin/${result.championship.id}`);
    showToast("Tables assigned");
    await loadPortalData();
  });

  els.adminCapacityForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = await api("/api/admin/portal-settings", {
      method: "PUT",
      headers: portalAdminHeaders(),
      body: {
        portalSettings: {
          maxConcurrentChampionships: Number(els.adminCapacityInput.value),
          allowNewChampionships: els.adminAllowNewInput.checked
        }
      }
    });

    state.portalData = {
      ...(state.portalData ?? {}),
      portalSettings: result.portalSettings
    };
    showToast("Capacity settings saved");
    await loadPortalData();
  });

  els.adminShutdownForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await api("/api/admin/shutdowns", {
      method: "POST",
      headers: portalAdminHeaders(),
      body: {
        mode: els.adminShutdownMode.value,
        startAt: new Date(els.adminShutdownStart.value).getTime(),
        endAt: new Date(els.adminShutdownEnd.value).getTime(),
        message: els.adminShutdownMessage.value.trim()
      }
    });

    showToast("Shutdown scheduled");
    fillDefaultShutdownWindow();
    await loadPortalData();
    await loadPortalStatus();
  });

  els.adminBroadcastForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await api("/api/admin/broadcasts", {
      method: "POST",
      headers: portalAdminHeaders(),
      body: {
        audience: els.adminBroadcastAudience.value,
        message: els.adminBroadcastMessage.value.trim()
      }
    });

    els.adminBroadcastMessage.value = "";
    showToast("Broadcast sent");
    await loadPortalData();
    await loadPortalStatus();
  });

  els.adminUserProfilePicture.addEventListener("change", () => {
    readAdminProfilePicture();
  });

  els.adminUserForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await api("/api/admin/users", {
      method: "POST",
      headers: portalAdminHeaders(),
      body: {
        adminUser: {
          firstName: els.adminUserFirstName.value.trim(),
          lastName: els.adminUserLastName.value.trim(),
          email: els.adminUserEmail.value.trim(),
          password: els.adminUserPassword.value,
          role: els.adminUserRole.value,
          status: els.adminUserStatus.value,
          profilePictureDataUrl: state.adminProfilePictureDataUrl
        }
      }
    });

    els.adminUserForm.reset();
    state.adminProfilePictureDataUrl = "";
    showToast("Admin user created");
    await loadPortalData();
  });

  window.addEventListener("popstate", () => {
    state.adminView = isAdminPath();
    state.championshipDayId = championshipDayIdFromPath();
    state.championshipDayDetail = null;
    state.championshipDayTieBreaker = null;
    state.championshipDayScoreEntryOpen = false;
    state.championshipDayActiveScoreTableId = null;
    state.championshipDayEditingRoundNumber = null;
    state.roomId = roomIdFromPath();
    state.playerId = state.roomId ? storedPlayerId(state.roomId) : null;
    if (state.adminView) {
      loadPortalData();
      render();
    } else {
      loadRoom(state.roomId);
    }
  });

  window.addEventListener("resize", () => {
    if (state.room?.match?.game) {
      renderTable();
    }
  });

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && state.boardFullscreen) {
      state.boardFullscreen = false;
      document.body.classList.remove("board-fullscreen-active");
      renderFullscreenButton();
      if (state.room?.match?.game) {
        renderTable();
      }
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
    }

    if (state.room?.status === "active" || (state.playerId && isSeated(state.playerId))) {
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
    loadSettings(),
    loadPortalStatus()
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

async function loadPortalStatus() {
  try {
    state.portalStatus = await api("/api/portal-status");
    renderPortalNotice();
    renderPortalSummary();
  } catch {
    state.portalStatus = null;
    renderPortalSummary();
  }
}

async function loadPortalData(options = {}) {
  if (options.silent && isAdminFormInteractionInProgress()) {
    return;
  }

  const previousChampionshipDayId = state.championshipDayId;
  state.championshipDayId = championshipDayIdFromPath();

  if (previousChampionshipDayId !== state.championshipDayId) {
    state.championshipDayTieBreaker = null;
    state.championshipDayScoreEntryOpen = false;
    state.championshipDayActiveScoreTableId = null;
    state.championshipDayEditingRoundNumber = null;
    state.championshipDayChartPlayerFilter = "";
  }

  if (!state.portalAdminToken) {
    renderAdminPortal();
    return;
  }

  try {
    state.portalData = await api("/api/admin/portal", {
      headers: portalAdminHeaders()
    });
    if (state.championshipDayId) {
      await loadChampionshipDayDetail(state.championshipDayId, {
        renderAfter: false,
        silent: true
      });
    }
    renderAdminPortal();
  } catch (error) {
    state.portalAdminToken = null;
    state.portalData = null;
    sessionStorage.removeItem("dominoes-portal-admin-token");
    if (!options.silent) {
      showToast(error.message);
    }
    renderAdminPortal();
  }
}

function startAdminAutoRefresh() {
  if (state.portalRefreshInterval || !state.portalAdminToken) {
    return;
  }

  state.portalRefreshInterval = window.setInterval(() => {
    if (
      state.adminView
      && state.portalAdminToken
      && document.visibilityState !== "hidden"
      && !isAdminFormInteractionInProgress()
    ) {
      loadPortalData({ silent: true });
    }
  }, 10_000);
}

function isAdminFormInteractionInProgress() {
  const activeElement = document.activeElement;

  if (!state.adminView || !activeElement) {
    return false;
  }

  return Boolean(
    activeElement.closest?.("#championshipDayCreateForm")
    || activeElement.closest?.("#championshipDayScoreForm")
    || activeElement.closest?.(".championship-day-modal-backdrop")
    || state.championshipDayScoreEntryOpen
    || state.championshipDayWizardStep === "players"
  );
}

function stopAdminAutoRefresh() {
  if (!state.portalRefreshInterval) {
    return;
  }

  window.clearInterval(state.portalRefreshInterval);
  state.portalRefreshInterval = null;
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
  if (!state.roomId) {
    return;
  }

  if (state.events) {
    state.events.close();
  }

  const query = state.playerId ? `?playerId=${encodeURIComponent(state.playerId)}` : "";
  state.events = new EventSource(`/api/rooms/${state.roomId}/events${query}`);
  state.events.addEventListener("room", (event) => {
    state.room = JSON.parse(event.data);
    render();
  });
  state.events.addEventListener("broadcast", (event) => {
    state.portalStatus = {
      ...(state.portalStatus ?? {}),
      latestBroadcast: JSON.parse(event.data)
    };
    renderPortalNotice();
    showToast(state.portalStatus.latestBroadcast.message);
  });
  state.events.addEventListener("portal", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "shutdown") {
      state.portalStatus = {
        ...(state.portalStatus ?? {}),
        activeShutdown: payload.shutdown
      };
      renderPortalNotice();
      showToast(payload.shutdown.message);
    }
  });
  state.events.addEventListener("error", () => {
    showToast("Connection interrupted");
  });
}

function render() {
  renderPortalNotice();
  renderPortalSummary();

  if (state.adminView) {
    startAdminAutoRefresh();
    els.setupPanel.classList.add("hidden");
    els.joinPanel.classList.add("hidden");
    els.tableView.classList.add("hidden");
    els.adminPortal.classList.remove("hidden");
    els.roomLine.textContent = "Admin portal";
    els.sessionPill.textContent = state.portalAdminToken ? "Logged in" : "Login required";
    renderAdminPortal();
    clearTimer();
    return;
  }

  stopAdminAutoRefresh();
  els.adminPortal.classList.add("hidden");
  const hasRoom = Boolean(state.room);
  const seated = state.playerId && isSeated(state.playerId);
  const spectating = hasRoom && !seated && state.room.status === "active";

  els.setupPanel.classList.toggle("hidden", hasRoom);
  els.joinPanel.classList.toggle("hidden", !hasRoom || seated || spectating);
  els.tableView.classList.toggle("hidden", !hasRoom || (!seated && !spectating));

  els.roomLine.textContent = hasRoom ? `Room ${state.room.id}` : "No room selected";
  els.sessionPill.textContent = seated ? playerName(state.playerId) : spectating ? "Spectating" : "Not seated";

  if (!hasRoom) {
    clearTimer();
    return;
  }

  if (!seated && !spectating) {
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
  const canReportPlayers = Boolean(state.playerId && isSeated(state.playerId));

  const hostCanManageRoster = state.room.status === "waiting"
    && !match
    && state.playerId === state.room.hostPlayerId;

  els.playersList.innerHTML = state.room.seats.map((seat, index) => {
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
    const rosterControls = hostCanManageRoster
      ? `
        <div class="roster-controls">
          <button class="plain-action roster-move-button" type="button" data-player-id="${escapeHtml(seat.playerId)}" data-direction="up" ${index === 0 ? "disabled" : ""}>Up</button>
          <button class="plain-action roster-move-button" type="button" data-player-id="${escapeHtml(seat.playerId)}" data-direction="down" ${index === state.room.seats.length - 1 ? "disabled" : ""}>Down</button>
          ${seat.playerId === state.room.hostPlayerId ? "" : `<button class="plain-action roster-remove-button" type="button" data-player-id="${escapeHtml(seat.playerId)}">Remove</button>`}
        </div>
      `
      : "";

    return `
      <div class="player-row ${rowClasses}">
        ${avatarHtml(seat.avatarId, "player-row-avatar")}
        <div>
          <div class="player-name">${escapeHtml(seat.name)}</div>
          <div class="player-meta">${role} | ${connected}${handCount === undefined ? "" : ` | ${handCount} tiles`} | ${infractions} inf${hostCanManageRoster && index < ACTIVE_PLAYERS_PER_GAME ? " | starts" : ""}</div>
          ${rosterControls}
        </div>
        <strong>${score}</strong>
        ${canReportPlayers && seat.playerId !== state.playerId && !seat.isBot
          ? `<button class="plain-action player-report-button" type="button" data-player-id="${escapeHtml(seat.playerId)}">Report</button>`
          : ""}
      </div>
    `;
  }).join("");

  bindPlayerReportButtons();
  bindRosterManageButtons();

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
  const breakVisible = [5, 10].includes(state.room.matchLength)
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
    || !match.game
    || Boolean(match.game.animationLock);
  els.bathroomBreakButton.textContent = breakUsed ? "Break Used" : "Bath Break";
  els.resumeBreakButton.classList.toggle("hidden", !canResumeBreak);
  els.resumeBreakButton.disabled = !canResumeBreak;
  const showEndSession = state.playerId === state.room.hostPlayerId;
  const endDisabled = state.room.status === "cancelled";
  setButtonVisibility(els.endSessionButton, showEndSession, endDisabled);
  setButtonVisibility(els.topEndSessionButton, showEndSession && !endDisabled, endDisabled);
  els.hostActionBar.classList.toggle("hidden", !showStartMatch && !(showEndSession && !endDisabled));
  renderShareControls();
}

function bindRosterManageButtons() {
  els.playersList.querySelectorAll(".roster-move-button").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const result = await api(`/api/rooms/${state.roomId}/move-player`, {
          method: "POST",
          body: {
            playerId: state.playerId,
            targetPlayerId: button.dataset.playerId,
            direction: button.dataset.direction
          }
        });

        state.room = result.room;
        render();
      } catch (error) {
        showToast(error.message);
      }
    });
  });

  els.playersList.querySelectorAll(".roster-remove-button").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = state.room.seats.find((seat) => seat.playerId === button.dataset.playerId);
      const confirmed = window.confirm(`Remove ${target?.name ?? "this player"} from the waiting room?`);

      if (!confirmed) {
        return;
      }

      try {
        const result = await api(`/api/rooms/${state.roomId}/remove-player`, {
          method: "POST",
          body: {
            playerId: state.playerId,
            targetPlayerId: button.dataset.playerId
          }
        });

        state.room = result.room;
        showToast("Player removed");
        render();
      } catch (error) {
        showToast(error.message);
      }
    });
  });
}

function bindPlayerReportButtons() {
  els.playersList.querySelectorAll(".player-report-button").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = state.room.seats.find((seat) => seat.playerId === button.dataset.playerId);
      const reason = window.prompt(`Report ${target?.name ?? "this player"} for abuse or obscene language:`);

      if (!reason || !reason.trim()) {
        return;
      }

      await api(`/api/rooms/${state.roomId}/report-player`, {
        method: "POST",
        body: {
          playerId: state.playerId,
          targetPlayerId: button.dataset.playerId,
          reason: reason.trim()
        }
      });
      showToast("Report sent to admin");
    });
  });
}

function renderShareControls() {
  if (!state.room || !els.roomIdDisplay || !els.sharePanel) {
    return;
  }

  const inviteUrl = `${window.location.origin}/rooms/${state.room.id}`;
  const shareText = `Join my dominoes championship. Room ID: ${state.room.id}. Link: ${inviteUrl}`;
  const encodedSubject = encodeURIComponent(`Dominoes Room ${state.room.id}`);
  const encodedUrl = encodeURIComponent(inviteUrl);
  const encodedText = encodeURIComponent(shareText);
  const disabled = state.room.status === "cancelled" || state.room.status === "completed";

  els.roomIdDisplay.textContent = `Room ID: ${state.room.id}`;
  els.copyInviteButton.disabled = disabled;
  els.shareRoomButton.disabled = disabled;
  els.sharePanel.classList.toggle("hidden", disabled || !state.sharePanelOpen);

  if (disabled) {
    return;
  }

  els.sharePanel.innerHTML = `
    <a class="share-option" href="mailto:?subject=${encodedSubject}&body=${encodedText}">Email</a>
    <a class="share-option" href="https://wa.me/?text=${encodedText}" target="_blank" rel="noopener">WhatsApp</a>
    <a class="share-option" href="https://t.me/share/url?url=${encodedUrl}&text=${encodedText}" target="_blank" rel="noopener">Telegram</a>
    <button class="share-option" type="button" data-share-copy="instagram">Instagram</button>
    <a class="share-option" href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}" target="_blank" rel="noopener">Facebook</a>
    <button class="share-option" type="button" data-share-copy="room">Copy Room ID</button>
  `;

  els.sharePanel.querySelectorAll("[data-share-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const copyText = button.dataset.shareCopy === "room" ? state.room.id : shareText;
      await navigator.clipboard.writeText(copyText);
      showToast(button.dataset.shareCopy === "room" ? "Room ID copied" : "Share text copied");
    });
  });
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
      const streakBadge = playerStreakBadge(match, seat.playerId);

      return `
        <div class="score-row">
          <div>
            <div class="player-name">${escapeHtml(seat.name)}${streakBadge}</div>
            <div class="score-meta">${meta}</div>
          </div>
          <div class="score-points">${finalScore}</div>
        </div>
      `;
    }).join("");
}

function playerStreakBadge(match, playerId) {
  const games = [...(match.completedGames ?? [])].sort((first, second) => first.number - second.number);
  let winStreak = 0;
  let lossStreak = 0;

  for (const game of games) {
    if (game.winnerId === playerId) {
      winStreak += 1;
      lossStreak = 0;
      continue;
    }

    const placement = game.placements?.find((item) => item.playerId === playerId);

    if (placement?.place === ACTIVE_PLAYERS_PER_GAME) {
      lossStreak += 1;
      winStreak = 0;
      continue;
    }

    winStreak = 0;
    lossStreak = 0;
  }

  if (winStreak >= 2) {
    return `<span class="streak-badge win-streak" title="${winStreak} round winning streak" aria-label="${winStreak} round winning streak">&#128293;</span>`;
  }

  if (lossStreak >= 2) {
    return `<span class="streak-badge loss-streak" title="${lossStreak} round losing streak" aria-label="${lossStreak} round losing streak">&#128296;</span>`;
  }

  return "";
}

function renderTable() {
  const match = state.room.match;
  const game = match?.game;
  const selectedTile = currentSelectedTile(game);
  const reviewMode = Boolean(match?.betweenGames || match?.finalReview || match?.status === "completed");

  renderFullscreenButton();
  clearPixiBoard(els.board);
  els.tablePanel.classList.toggle("review-mode", reviewMode);
  els.statusLobbyReactions.innerHTML = renderLobbyReactions(match);
  scheduleTakeDatClear(match);
  scheduleReactionClear(match);
  playSoundForLatestAction(match);

  if (state.room.status === "cancelled") {
    els.turnLabel.textContent = "Session Ended";
    els.statusSub.textContent = roomCancelMessage(state.room);
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
    els.statusSub.textContent = roomCancelMessage(state.room);
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
    els.statusSub.textContent = game.animationLock?.type === "slam"
      ? `${playerName(game.animationLock.playerId)} slammed the table`
      : game.requiredOpeningTileId
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

    els.board.className = boardClassName(game);
    els.board.innerHTML = renderTableSeats(match) + renderTableReactions(match) + renderTakeDat(match) + renderPlayAnimation(match);
    void renderPixiBoard(els.board, {
      plays: [],
      openingEnabled: canPose,
      slamLock: game.animationLock,
      onTarget: playSelectedTile
    });
    return;
  }

  const selectedEnds = selectedTile ? playableEnds(selectedTile, game) : [];

  els.board.className = boardClassName(game);
  els.board.dataset.tileCount = String(game.board.plays.length);
  els.board.innerHTML = renderTableSeats(match) + renderTableReactions(match) + renderSeedReveal(match) + renderTakeDat(match) + renderPlayAnimation(match);
  void renderPixiBoard(els.board, {
    plays: game.board.plays,
    selectedEnds,
    slamLock: game.animationLock,
    onTarget: playSelectedTile
  });
}

function boardClassName(game) {
  const classes = ["board"];

  if (game?.board?.plays?.length >= 11) {
    classes.push("board-crowded");
  }

  if (game?.animationLock?.type === "slam") {
    classes.push("slam-shaking");
  }

  return classes.join(" ");
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

function renderTableReactions(match) {
  if (!match?.game) {
    return "";
  }

  const reactions = currentReactions(match);

  if (Object.keys(reactions).length === 0) {
    return "";
  }

  const positions = ["south", "west", "north", "east"];
  const activeReactionHtml = match.playerOrder
    .slice(0, ACTIVE_PLAYERS_PER_GAME)
    .map((playerId, index) => {
      const reaction = reactions[playerId];

      if (!reaction) {
        return "";
      }

      return `
        <div class="table-reaction reaction-${positions[index]}" title="${escapeHtml(playerName(playerId))} ${escapeHtml(reactionLabel(reaction.type))}">
          ${reactionFace(reaction.type)}
        </div>
      `;
    })
    .join("");

  if (!activeReactionHtml) {
    return "";
  }

  return `
    <div class="table-reactions-layer" aria-live="polite">
      ${activeReactionHtml}
    </div>
  `;
}

function renderLobbyReactions(match) {
  if (!match?.game) {
    return "";
  }

  const reactions = currentReactions(match);
  const lobbyReactionHtml = state.room.seats
    .filter((seat) => !match.playerOrder.includes(seat.playerId) && reactions[seat.playerId])
    .map((seat) => `
      <div class="lobby-reaction-chip">
        ${avatarHtml(seat.avatarId, "lobby-reaction-avatar")}
        <span>${reactionFace(reactions[seat.playerId].type)}</span>
      </div>
    `)
    .join("");

  return lobbyReactionHtml;
}

function currentReactions(match) {
  const now = Date.now();

  return Object.fromEntries(
    Object.entries(match?.reactionsByPlayerId ?? {})
      .filter(([, reaction]) => reaction && Number(reaction.expiresAt ?? 0) > now)
  );
}

function reactionFace(type) {
  return REACTION_FACES[type]?.face ?? "";
}

function reactionLabel(type) {
  return REACTION_FACES[type]?.label ?? "Reaction";
}

function renderPlayAnimation(match) {
  const action = latestVisibleAction(match);
  const player = state.room.seats.find((seat) => seat.playerId === action?.playerId);
  const iAmLobby = Boolean(match?.game && !match.playerOrder.includes(state.playerId));
  const isBotAction = Boolean(player?.isBot);

  if ((!iAmLobby && !isBotAction) || !action || !["play", "timeoutAutoPlay"].includes(action.type) || !action.move) {
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
  const tile = {
    high: Number.isFinite(action.move.high) ? action.move.high : action.move.leftValue,
    low: Number.isFinite(action.move.low) ? action.move.low : action.move.rightValue
  };

  return `
    <div class="play-animation-banner ${isBotAction ? "bot-play" : ""}" data-action-key="${escapeHtml(actionKey)}" role="status" aria-live="polite">
      ${avatarHtml(player?.avatarId, "play-animation-avatar")}
      <div>
        <strong>${escapeHtml(playerName(action.playerId))}</strong>
        <span>${action.type === "timeoutAutoPlay" ? "auto-played" : "played"} a tile</span>
      </div>
      ${dominoHtml(tile, "horizontal", "play-animation-tile")}
    </div>
  `;
}

function renderTakeDat(match) {
  const taunt = match?.game?.lastTakeDat;

  if (!taunt || Date.now() >= taunt.expiresAt) {
    return "";
  }

  const durationMs = Math.max(1000, Number(taunt.durationMs ?? 5000));

  return `
    <div class="take-dat-taunt" role="status" aria-live="polite" style="--take-dat-duration: ${durationMs}ms;">
      <span>TAKE DAT</span>
      <small>${escapeHtml(playerName(taunt.playerId))}</small>
    </div>
  `;
}

function scheduleTakeDatClear(match) {
  if (state.takeDatTimer) {
    clearTimeout(state.takeDatTimer);
    state.takeDatTimer = null;
  }

  const taunt = match?.game?.lastTakeDat;

  if (!taunt) {
    return;
  }

  const remainingMs = Number(taunt.expiresAt ?? 0) - Date.now();

  if (remainingMs <= 0) {
    return;
  }

  state.takeDatTimer = setTimeout(() => {
    const currentTaunt = state.room?.match?.game?.lastTakeDat;

    if (currentTaunt?.at === taunt.at && currentTaunt?.playerId === taunt.playerId) {
      renderTable();
    }
  }, remainingMs + 60);
}

function scheduleReactionClear(match) {
  if (state.reactionTimer) {
    clearTimeout(state.reactionTimer);
    state.reactionTimer = null;
  }

  const reactions = currentReactions(match);
  const nextExpiry = Math.min(
    ...Object.values(reactions).map((reaction) => Number(reaction.expiresAt ?? Infinity))
  );

  if (!Number.isFinite(nextExpiry)) {
    return;
  }

  const remainingMs = nextExpiry - Date.now();

  if (remainingMs <= 0) {
    return;
  }

  state.reactionTimer = setTimeout(() => {
    if (state.room?.match?.game) {
      renderTable();
    }
  }, remainingMs + 60);
}

function latestVisibleAction(match) {
  const candidates = [match?.lastAction, match?.game?.lastAction]
    .filter((action) => action && ["play", "timeoutAutoPlay"].includes(action.type) && action.move);

  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort((first, second) => {
    if ((second.at ?? 0) !== (first.at ?? 0)) {
      return (second.at ?? 0) - (first.at ?? 0);
    }

    return second.type === "timeoutAutoPlay" ? 1 : -1;
  })[0];
}

function playSoundForLatestAction(match) {
  const action = latestVisibleAction(match);

  if (!action) {
    state.soundActionPrimed = true;
    state.lastSoundActionKey = null;
    return;
  }

  const actionKey = [
    match?.game?.number ?? match?.currentGameNumber ?? "",
    action.type,
    action.playerId,
    action.at,
    action.move?.tileId,
    action.effect ?? ""
  ].join(":");

  if (!state.soundActionPrimed) {
    state.soundActionPrimed = true;
    state.lastSoundActionKey = actionKey;
    return;
  }

  if (state.lastSoundActionKey === actionKey) {
    return;
  }

  state.lastSoundActionKey = actionKey;

  if (!state.soundEnabled) {
    return;
  }

  playTileSound(action.effect);
}

function renderHand() {
  const game = state.room.match?.game;
  const canSeeHand = Boolean(game && state.playerId && isSeated(state.playerId));
  els.tablePanel.classList.toggle("no-hand", !canSeeHand);
  const inputLocked = Boolean(game?.animationLock);
  const myTurn = game?.currentPlayerId === state.playerId
    && state.room.match.status === "active"
    && state.room.status !== "cancelled"
    && !inputLocked;
  const hand = canSeeHand ? game.hand ?? [] : [];
  const hasPlayableTile = hand.some((tile) => playableEnds(tile, game).length > 0);
  const seedUsed = Boolean(game?.seedToBoardUsedByPlayerId?.[state.playerId]);
  const slamUsed = Boolean(game?.slamUsedByPlayerId?.[state.playerId]);
  const takeDatUsed = Boolean(game?.takeDatUsedByPlayerId?.[state.playerId]);
  const selectedTile = currentSelectedTile(game);
  const selectedEnds = selectedTile ? playableEnds(selectedTile, game) : [];
  const canUseTakeDat = Boolean(game)
    && state.room.match.status === "active"
    && state.room.status !== "cancelled"
    && state.room.match.playerOrder.includes(state.playerId)
    && !inputLocked;
  const canSendReaction = Boolean(game)
    && state.room.match.status === "active"
    && state.room.status !== "cancelled"
    && isSeated(state.playerId)
    && !inputLocked;

  els.passButton.disabled = !myTurn || hasPlayableTile;
  els.seedBoardButton.disabled = !myTurn || seedUsed;
  els.seedBoardButton.textContent = seedUsed ? "Seed Used" : "Seed to Board";
  els.slamButton.disabled = !myTurn || !selectedTile || selectedEnds.length === 0 || slamUsed;
  els.slamButton.textContent = slamUsed ? "Slam Used" : state.slamArmed ? "Pick End" : "Slam";
  els.takeDatButton.disabled = !canUseTakeDat || takeDatUsed;
  els.takeDatButton.textContent = takeDatUsed ? "DAT Used" : "Take DAT";
  els.reactionSelect.disabled = !canSendReaction;
  els.reactionButton.disabled = !canSendReaction;
  els.soundToggle.checked = state.soundEnabled;

  if (state.selectedTile && !hand.some((tile) => tile.id === state.selectedTile.id)) {
    state.selectedTile = null;
    state.slamArmed = false;
  }

  if (!canSeeHand) {
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
  const canChat = Boolean(state.playerId && isSeated(state.playerId) && state.room.match);

  els.chatInput.disabled = !canChat || state.room.status === "cancelled" || muted;
  els.chatInput.placeholder = muted
    ? `Chat blocked for ${Math.ceil((mutedUntil - Date.now()) / 60000)}m`
    : canChat
      ? "No links or obscenities"
      : "Join the championship lobby to chat";
  els.chatForm.querySelector("button").disabled = !canChat || state.room.status === "cancelled" || muted;
  els.chatLog.innerHTML = messages.map((message) => `
    <div class="chat-message">
      <div class="chat-message-head">
        <div class="chat-name">${escapeHtml(playerName(message.playerId))}</div>
        <div class="chat-actions">
          ${canChat && message.playerId !== state.playerId ? `<button class="plain-action chat-report-button" type="button" data-message-id="${escapeHtml(message.id)}" data-player-id="${escapeHtml(message.playerId)}">Report</button>` : ""}
          ${hostCanModerate ? `
            <button class="plain-action chat-delete-button" type="button" data-message-id="${escapeHtml(message.id)}">Delete</button>
            ${message.playerId !== state.room.hostPlayerId ? `<button class="plain-action chat-block-button" type="button" data-player-id="${escapeHtml(message.playerId)}">Mute ${CHAT_BLOCK_MINUTES}m</button>` : ""}
          ` : ""}
        </div>
      </div>
      <div>${escapeHtml(message.text)}</div>
    </div>
  `).join("");
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
  bindChatModerationControls();
}

function bindChatModerationControls() {
  els.chatLog.querySelectorAll(".chat-report-button").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`/api/rooms/${state.roomId}/report-player`, {
          method: "POST",
          body: {
            playerId: state.playerId,
            targetPlayerId: button.dataset.playerId,
            messageId: button.dataset.messageId,
            reason: "Peer reported chat message"
          }
        });

        showToast("Report sent to admin");
      } catch (error) {
        showToast(error.message);
      }
    });
  });

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

function renderPortalNotice() {
  if (!els.portalNotice) {
    return;
  }

  if (state.portalNoticeTimer) {
    window.clearTimeout(state.portalNoticeTimer);
    state.portalNoticeTimer = null;
  }

  const shutdown = state.portalStatus?.activeShutdown;
  let broadcast = state.portalStatus?.latestBroadcast;

  if (broadcast && Number(broadcast.expiresAt ?? 0) <= Date.now()) {
    broadcast = null;
    state.portalStatus = {
      ...(state.portalStatus ?? {}),
      latestBroadcast: null
    };
  }

  const notice = shutdown
    ? `Portal maintenance: ${shutdown.message} Ends ${formatDateTime(shutdown.endAt)}`
    : broadcast?.message ?? "";

  els.portalNotice.classList.toggle("hidden", !notice);
  els.portalNotice.textContent = notice;

  if (broadcast?.expiresAt) {
    state.portalNoticeTimer = window.setTimeout(() => {
      state.portalStatus = {
        ...(state.portalStatus ?? {}),
        latestBroadcast: null
      };
      renderPortalNotice();
    }, Math.max(0, Number(broadcast.expiresAt) - Date.now()));
  }
}

function renderPortalSummary() {
  if (!els.portalCapacitySummary || !els.publicChampionshipList) {
    return;
  }

  const capacity = state.portalStatus?.capacity;
  const max = capacity?.maxConcurrentChampionships ?? state.portalStatus?.portalSettings?.maxConcurrentChampionships ?? 30;
  const active = capacity?.activeChampionships ?? 0;
  const online = capacity?.onlinePlayers ?? 0;
  const open = capacity?.openChampionships ?? state.portalStatus?.openChampionships ?? 0;

  els.portalCapacitySummary.innerHTML = `
    <span>Portal capacity</span>
    <strong>${active} of ${max} championships in progress</strong>
    <small>${open} open | ${online} players online</small>
  `;

  const rooms = state.portalStatus?.viewableChampionships ?? [];
  els.publicChampionshipList.innerHTML = rooms.length
    ? rooms.map((room) => `
      <article class="public-championship-row">
        <div>
          <strong>Room ${escapeHtml(room.id)}</strong>
          <span>Host ${escapeHtml(room.hostName)} | Round ${room.currentGameNumber ?? 1} | ${room.players} joined</span>
        </div>
        <button class="small-button watch-championship-button" type="button" data-room-id="${escapeHtml(room.id)}">View</button>
      </article>
    `).join("")
    : `<div class="score-meta">No live championships are in progress.</div>`;

  els.publicChampionshipList.querySelectorAll(".watch-championship-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.roomId = button.dataset.roomId;
      state.playerId = storedPlayerId(state.roomId);
      history.pushState(null, "", `/rooms/${state.roomId}`);
      loadRoom(state.roomId);
    });
  });
}

function renderAdminPortal() {
  if (!els.adminPortal) {
    return;
  }

  state.championshipDayId = championshipDayIdFromPath();
  const loggedIn = Boolean(state.portalAdminToken && state.portalData);
  els.portalAdminLoginForm.classList.toggle("hidden", loggedIn);
  els.adminDashboard.classList.toggle("hidden", !loggedIn);

  if (!loggedIn) {
    return;
  }

  els.adminDashboard.classList.toggle("day-workspace-active", Boolean(state.championshipDayId));
  renderChampionshipDayWorkspace();
  renderAdminMetrics();
  renderAdminReports();
  renderAdminRooms();
  renderChampionshipDayWizard();
  renderAdminChampionshipDay();
  renderAdminShutdowns();
  renderAdminBroadcasts();
  renderAdminCapacity();
  renderAdminUsers();
  renderAdminAudit();
}

function renderChampionshipDayWorkspace() {
  if (!els.championshipDayWorkspace) {
    return;
  }

  const sessionId = state.championshipDayId;
  els.championshipDayWorkspace.classList.toggle("hidden", !sessionId);

  if (!sessionId) {
    els.championshipDayWorkspace.innerHTML = "";
    disposeChampionshipDayVisuals();
    return;
  }

  const championship = state.championshipDayDetail;

  if (!championship) {
    els.championshipDayWorkspace.innerHTML = `
      <div class="championship-day-hero">
        <div>
          <span class="championship-day-kicker">Admin workspace</span>
          <h2>${escapeHtml(sessionId)}</h2>
          <p>Loading Championship Day details.</p>
        </div>
      </div>
    `;
    disposeChampionshipDayVisuals();
    return;
  }

  els.championshipDayWorkspace.innerHTML = `
    <div class="championship-day-hero">
      <div>
        <span class="championship-day-kicker">Physical Championship Day</span>
        <h2>${escapeHtml(championship.name)}</h2>
        <p>${escapeHtml(championship.location || "No location set")} | ${championship.tableCount} tables | ${championship.players.length} players</p>
      </div>
      <div class="championship-day-hero-actions">
        <button class="small-button" id="championshipDayBackButton" type="button">Dashboard</button>
        ${championship.status === "active" ? `<button class="small-button danger-button" id="championshipDayEndButton" type="button">End Championship</button>` : ""}
        ${championship.status === "completed" ? `<button class="small-button" id="championshipDayReopenButton" type="button">Reopen Scores</button>` : ""}
        ${championship.status === "completed" ? `<button class="small-button championship-day-export-excel" id="championshipDayExportExcelButton" type="button">Export to Excel</button>` : ""}
      </div>
    </div>
    <div class="championship-day-stat-grid">
      ${championshipDayStat("Round", championship.currentRoundNumber)}
      ${championshipDayStat("Completed", championship.rounds.length)}
      ${championshipDayStat("Leader", championship.rounds.length ? championshipDayLeaderboard(championship)[0]?.playerName ?? "None" : "None")}
      ${championshipDayStat("Status", championship.status)}
    </div>
    ${renderChampionshipDayCharts(championship)}
    ${renderChampionshipDayStatLeaders(championship)}
    ${renderChampionshipDayVisualsPanel(championship)}
    ${renderChampionshipDayHistory(championship)}
    ${renderChampionshipDayAssignments(championship)}
    ${renderChampionshipDayEditHistory(championship)}
    ${championship.status === "active" ? renderChampionshipDayRoundControls(championship) : renderChampionshipDayFinal(championship)}
  `;

  bindChampionshipDayWorkspace();
  renderChampionshipDayVisualAnalytics(championship, els.championshipDayWorkspace, {
    playerId: state.championshipDayChartPlayerFilter
  });
}

function championshipDayStat(label, value) {
  return `
    <article class="championship-day-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function renderChampionshipDayCharts(championship) {
  const leaderboard = championshipDayLeaderboard(championship);
  const maxPoints = Math.max(1, ...leaderboard.map((player) => player.totalPoints));
  const hotPlayers = championshipDayHotRoundPlayers(championship);

  return `
    <section class="championship-day-panel">
      <div class="championship-day-panel-head">
        <h3>Overall Scoreboard</h3>
        <span>All players start at 0 for every new championship</span>
      </div>
      <div class="championship-day-bars">
        ${leaderboard.map((player, index) => {
          const rank = player.currentRank ?? player.rank ?? index + 1;
          const isTopThree = rank <= 3;
          const isHot = hotPlayers.has(player.playerId);
          const progress = Math.round((player.totalPoints / maxPoints) * 100);

          return `
          <div class="championship-day-bar-row ${isTopThree ? "is-top-three" : ""}">
            <span class="championship-day-bar-player">
              <span>${escapeHtml(ordinal(rank))} ${escapeHtml(player.playerName)}${isHot ? championshipDayFlameHtml("20+ points last round") : ""}</span>
              <small>${escapeHtml(player.currentTableLabel ?? "No table")} | ${escapeHtml(player.roundsPlayed)} rounds</small>
            </span>
            <div class="championship-day-bar-track">
              <div class="championship-day-bar-fill" style="width: ${progress}%"></div>
              ${avatarHtml(player.avatarId, "championship-day-progress-avatar", `left: clamp(13px, ${progress}%, calc(100% - 13px));`)}
            </div>
            <strong>${escapeHtml(player.totalPoints)}</strong>
            <small class="championship-day-bar-meta">
              NW ${escapeHtml(player.normalWins)} | LW ${escapeHtml(player.lockWins)} | 2nd ${escapeHtml(player.secondPlaces)} | 3rd ${escapeHtml(player.thirdPlaces)} | 4th ${escapeHtml(player.fourthPlaces)} | LL ${escapeHtml(player.lockLoses)} | Avg ${escapeHtml(player.averagePoints.toFixed(1))}
            </small>
          </div>
        `;
        }).join("")}
      </div>
    </section>
  `;
}

function championshipDayHotRoundPlayers(championship) {
  const lastRound = championship.rounds?.at(-1);

  if (!lastRound) {
    return new Set();
  }

  return new Set(
    lastRound.tableResults
      .flatMap((table) => table.rankings)
      .filter((ranking) => Number(ranking.totalPoints) >= 20)
      .map((ranking) => ranking.playerId)
  );
}

function championshipDayFlameHtml(title = "20+ points this round") {
  return ` <span class="championship-day-flame" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">&#128293;</span>`;
}

function renderChampionshipDayVisualsPanel(championship) {
  const hasRounds = Number(championship.rounds?.length ?? 0) > 0;
  const playerIds = new Set((championship.players ?? []).map((player) => String(player.id)));
  const selectedPlayerId = playerIds.has(state.championshipDayChartPlayerFilter)
    ? state.championshipDayChartPlayerFilter
    : "";

  if (state.championshipDayChartPlayerFilter !== selectedPlayerId) {
    state.championshipDayChartPlayerFilter = selectedPlayerId;
  }

  return `
    <section class="championship-day-panel championship-day-visual-panel" data-championship-day-visuals>
      <div class="championship-day-panel-head">
        <h3>Visual Analytics</h3>
        <span>Completed rounds, head-to-head, wins, losses, and scoring bursts</span>
      </div>
      ${hasRounds ? `
        <div class="championship-day-chart-filter">
          <label for="championshipDayChartPlayerFilter">Filter charts by player</label>
          <select id="championshipDayChartPlayerFilter">
            <option value="">All players</option>
            ${(championship.players ?? []).map((player) => `
              <option value="${escapeHtml(player.id)}" ${String(player.id) === selectedPlayerId ? "selected" : ""}>${escapeHtml(player.name)}</option>
            `).join("")}
          </select>
        </div>
        <div class="championship-day-visual-grid">
          ${championshipDayVisualCard("momentum", "Momentum")}
          ${championshipDayVisualCard("wins-losses", "Wins vs Losses")}
          ${championshipDayVisualCard("head-to-head", "Head To Head")}
          ${championshipDayVisualCard("round-bursts", "Round Bursts")}
        </div>
      ` : `
        <div class="championship-day-empty-state">
          <strong>No completed rounds yet.</strong>
          <span>Finalize the first round to unlock ECharts visuals.</span>
        </div>
      `}
    </section>
  `;
}

function championshipDayVisualCard(id, label) {
  return `
    <article class="championship-day-visual-card ${id === "head-to-head" ? "championship-day-head-to-head-card" : ""}">
      <div class="championship-day-visual-title">${escapeHtml(label)}</div>
      <div class="championship-day-echart" data-echart="${escapeHtml(id)}" role="img" aria-label="${escapeHtml(label)} chart"></div>
    </article>
  `;
}

function championshipDayPlayerById(championship, playerId) {
  return championship?.players?.find((player) => player.id === playerId) ?? null;
}

function championshipDayAvatarIdForPlayer(championship, playerId) {
  const playerIndex = Math.max(0, championship?.players?.findIndex((player) => player.id === playerId) ?? 0);
  const player = championshipDayPlayerById(championship, playerId);

  return player?.avatarId || defaultChampionshipDayAvatarId(playerIndex);
}

function renderChampionshipDayStatLeaders(championship) {
  const leaders = championshipDayStatLeaders(championship);

  return `
    <section class="championship-day-panel">
      <div class="championship-day-panel-head">
        <h3>Live Stat Leaders</h3>
        <span>Updates after every finalized or edited round</span>
      </div>
      <div class="championship-day-leader-grid">
        ${leaders.map((leader) => `
          <article class="championship-day-leader-card">
            <span>${escapeHtml(leader.label)}</span>
            <strong>${escapeHtml(leader.name)}</strong>
            <small>${escapeHtml(leader.value)}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function championshipDayStatLeaders(championship) {
  const leaderboard = championshipDayLeaderboard(championship);
  const topBy = (selector, format) => {
    const leader = leaderboard
      .filter((player) => selector(player) > 0)
      .sort((first, second) => selector(second) - selector(first) || first.currentRank - second.currentRank)[0];

    return leader ? { name: leader.playerName, value: format(selector(leader), leader) } : { name: "None", value: "0" };
  };
  const highestRound = highestChampionshipDaySingleRoundScore(championship);
  const bestAverage = topBy((player) => player.averagePoints, (value) => `${value.toFixed(1)} pts / round`);

  return [
    {
      label: "Overall Leader",
      name: leaderboard[0]?.playerName ?? "None",
      value: leaderboard[0] ? `${leaderboard[0].totalPoints} pts` : "0 pts"
    },
    { label: "Most Normal Wins", ...topBy((player) => player.normalWins, (value) => `${value} NW`) },
    { label: "Most Lock Wins", ...topBy((player) => player.lockWins, (value) => `${value} LW`) },
    { label: "Most Last Places", ...topBy((player) => player.fourthPlaces, (value) => `${value} fourths`) },
    {
      label: "Highest Single-Round Table Score",
      name: highestRound?.playerName ?? "None",
      value: highestRound ? `${highestRound.totalPoints} pts | Round ${highestRound.roundNumber} ${highestRound.tableLabel}` : "0 pts"
    },
    { label: "Best Average Points", ...bestAverage }
  ];
}

function highestChampionshipDaySingleRoundScore(championship) {
  return (championship.rounds ?? [])
    .flatMap((round) => (round.tableResults ?? []).flatMap((table) => (
      (table.rankings ?? []).map((ranking) => ({
        roundNumber: round.number,
        tableLabel: table.tableLabel,
        playerName: ranking.playerName,
        totalPoints: ranking.totalPoints
      }))
    )))
    .sort((first, second) => second.totalPoints - first.totalPoints || first.playerName.localeCompare(second.playerName))[0] ?? null;
}

function renderChampionshipDayHistory(championship) {
  if (!championship.rounds.length) {
    return `
      <section class="championship-day-panel">
        <div class="championship-day-empty-state">
          <h3>No round scores yet</h3>
          <p>Enter the first completed 5-game round below. Every player is currently on 0.</p>
        </div>
      </section>
    `;
  }

  return championship.rounds.map((round) => {
    const historyKey = championshipDayRoundHistoryKey(championship.id, round.number);
    const isOpen = state.championshipDayOpenRoundResults.has(historyKey);

    return `
    <section class="championship-day-panel championship-day-history-panel" data-round-history="${escapeHtml(round.number)}">
      <div class="championship-day-panel-head">
        <h3>Round ${escapeHtml(round.number)} Results</h3>
        <span>${escapeHtml(formatDateTime(round.completedAt))}</span>
        <button class="small-button championship-day-toggle-round" type="button" data-round-toggle="${escapeHtml(round.number)}" aria-expanded="${isOpen ? "true" : "false"}">${isOpen ? "Hide" : "View"}</button>
        ${championship.status === "active" ? `<button class="small-button championship-day-edit-round" type="button" data-edit-round-number="${escapeHtml(round.number)}">Edit Scores</button>` : ""}
      </div>
      <div class="championship-day-table-results ${isOpen ? "" : "hidden"}" data-round-history-body="${escapeHtml(round.number)}">
        ${round.tableResults.map((table) => `
          <article class="championship-day-table-card">
            <h4>${escapeHtml(table.tableLabel)}</h4>
            ${table.rankings.map((ranking) => championshipDayRankingRow(ranking, championship)).join("")}
          </article>
        `).join("")}
      </div>
    </section>
  `;
  }).join("");
}

function championshipDayRoundHistoryKey(sessionId, roundNumber) {
  return `${sessionId}:${roundNumber}`;
}

function renderChampionshipDayEditHistory(championship) {
  const edits = championship.editHistory ?? [];

  if (!edits.length) {
    return "";
  }

  return `
    <section class="championship-day-panel">
      <div class="championship-day-panel-head">
        <h3>Score Edit Audit</h3>
        <span>${escapeHtml(edits.length)} edit${edits.length === 1 ? "" : "s"}</span>
      </div>
      <div class="championship-day-edit-audit-list">
        ${edits.slice().reverse().map((edit) => `
          <article class="championship-day-edit-audit-row">
            <strong>Round ${escapeHtml(edit.roundNumber)}</strong>
            <span>${escapeHtml(formatDateTime(edit.editedAt))}</span>
            <small>
              ${escapeHtml(edit.editedByAdmin?.email ?? edit.editedByAdmin?.name ?? "Admin")}
              ${edit.changedLaterAssignments ? " | later assignments recalculated" : ""}
            </small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderChampionshipDayAssignments(championship) {
  const title = championship.rounds.length ? "Next-Round Table Assignments" : "Initial Table Assignments";
  const subtitle = championship.rounds.length
    ? "1st and 2nd stay, incoming 3rd and 4th are seated next"
    : "Assigned from the player list before the first round";

  return `
    <section class="championship-day-panel">
      <div class="championship-day-panel-head">
        <h3>${title}</h3>
        <span>${subtitle}</span>
      </div>
      <div class="championship-day-assignment-grid">
        ${championship.currentTables.map((table) => `
          <article class="championship-day-assignment-card">
            <h4>${escapeHtml(table.label)}</h4>
            ${table.playerIds.map((playerId, index) => `
              <div class="championship-day-seat-row">
                <strong>${index + 1}</strong>
                <span>
                  ${avatarHtml(championshipDayAvatarIdForPlayer(championship, playerId), "championship-day-player-avatar")}
                  ${escapeHtml(championshipDayPlayerById(championship, playerId)?.name ?? playerId)}
                </span>
              </div>
            `).join("")}
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function championshipDayRankingRow(ranking, championship) {
  const earnedFlame = Number(ranking.totalPoints) >= 20;

  return `
    <div class="championship-day-ranking-row">
      <strong>
        ${escapeHtml(ordinal(ranking.place))}
        ${avatarHtml(championshipDayAvatarIdForPlayer(championship, ranking.playerId), "championship-day-rank-avatar")}
      </strong>
      <span>${escapeHtml(ranking.playerName)}${earnedFlame ? championshipDayFlameHtml("20+ points this round") : ""}</span>
      <span>${escapeHtml(ranking.totalPoints)} pts</span>
      <small>
        NW ${escapeHtml(ranking.normalWins)} | LW ${escapeHtml(ranking.lockWins)} | 2nd ${escapeHtml(ranking.secondPlaces)} | 3rd ${escapeHtml(ranking.thirdPlaces)} | 4th ${escapeHtml(ranking.fourthPlaces)} | LL ${escapeHtml(ranking.lockLoses)}
        ${ranking.determinedBy === "tieBreakerPull" ? ` | Pull ${escapeHtml(ranking.tieBreakerPipTotal)} pips` : ""}
      </small>
    </div>
  `;
}

function renderChampionshipDayRoundControls(championship) {
  if (!state.championshipDayScoreEntryOpen) {
    return `
      <section class="championship-day-panel championship-day-round-start">
        <div>
          <h3>Add New Round Scores</h3>
          <p>Enter the completed five games for Round ${escapeHtml(championship.currentRoundNumber)} when every table has finished.</p>
        </div>
        <button id="championshipDayAddRoundButton" type="button">Add New Round Scores</button>
      </section>
    `;
  }

  return renderChampionshipDayScoreEntry(championship);
}

function renderChampionshipDayScoreEntry(championship) {
  const context = championshipDayScoreContext(championship);
  const activeTableId = context.tables.some((table) => table.id === state.championshipDayActiveScoreTableId)
    ? state.championshipDayActiveScoreTableId
    : context.tables[0]?.id;
  state.championshipDayActiveScoreTableId = activeTableId;

  return `
    <form class="championship-day-score-form" id="championshipDayScoreForm">
      <section class="championship-day-panel">
        <div class="championship-day-panel-head">
          <h3>${escapeHtml(context.title)}</h3>
          <span>${context.mode === "edit" ? "Editing saved scores" : "Five games per table"}</span>
        </div>
        ${context.warning ? `<div class="championship-day-edit-warning">${escapeHtml(context.warning)}</div>` : ""}
        <div class="championship-day-table-tabs" role="tablist" aria-label="Round score tables">
          ${context.tables.map((table) => `
            <button
              class="championship-day-table-tab ${table.id === activeTableId ? "active" : ""}"
              type="button"
              data-score-table-tab="${escapeHtml(table.id)}"
              role="tab"
              aria-selected="${table.id === activeTableId ? "true" : "false"}"
            >
              ${escapeHtml(table.label)}
              <span class="championship-day-table-warning hidden" data-table-warning="${escapeHtml(table.id)}">!</span>
            </button>
          `).join("")}
        </div>
        <div class="championship-day-score-grid">
          ${context.tables.map((table) => renderChampionshipDayTableEntry(championship, context, table, activeTableId)).join("")}
        </div>
      </section>
      ${renderChampionshipDayTieBreakerPanel(championship)}
      <div class="championship-day-submit-bar">
        <button type="submit">${escapeHtml(context.submitLabel)}</button>
        ${context.mode === "edit" ? `<button class="small-button" id="championshipDayCancelEditButton" type="button">Cancel Edit</button>` : ""}
      </div>
    </form>
  `;
}

function championshipDayScoreContext(championship) {
  const editingRoundNumber = Number(state.championshipDayEditingRoundNumber);
  const editingRound = championship.rounds.find((round) => round.number === editingRoundNumber);
  const pendingTieBreakerRound = state.championshipDayTieBreaker?.sessionId === championship.id
    ? state.championshipDayTieBreaker.round
    : null;

  if (editingRound) {
    return {
      mode: "edit",
      roundNumber: editingRound.number,
      title: `Edit Round ${editingRound.number} Scores`,
      submitLabel: `Save Round ${editingRound.number}`,
      warning: editingRound.number < championship.rounds.length
        ? "Changing this round will recalculate later table assignments and leaderboard."
        : null,
      tables: editingRound.startingTables,
      scoreValues: scoreValuesFromRound(editingRound),
      tiedPlayersByTable: new Map()
    };
  }

  return {
    mode: "new",
    roundNumber: championship.currentRoundNumber,
    title: `Round ${championship.currentRoundNumber} Score Entry`,
    submitLabel: `Finalize Round ${championship.currentRoundNumber}`,
    warning: null,
    tables: championship.currentTables,
    scoreValues: pendingTieBreakerRound?.roundNumber === championship.currentRoundNumber
      ? scoreValuesFromRoundPayload(pendingTieBreakerRound)
      : new Map(),
    tiedPlayersByTable: championshipDayTieBreakerPlayersByTable(championship)
  };
}

function scoreValuesFromRound(round) {
  const values = new Map();

  for (const table of round.tableResults ?? []) {
    for (const game of table.games ?? []) {
      for (const score of game.scores ?? []) {
        values.set(`${table.tableId}-${game.gameNumber}-${score.playerId}`, String(score.points));
      }
    }
  }

  return values;
}

function scoreValuesFromRoundPayload(round) {
  const values = new Map();

  for (const table of round.tables ?? []) {
    for (const game of table.games ?? []) {
      for (const score of game.scores ?? []) {
        values.set(`${table.tableId}-${game.gameNumber}-${score.playerId}`, String(score.points));
      }
    }
  }

  return values;
}

function championshipDayTieBreakerPlayersByTable(championship) {
  const tieBreaker = state.championshipDayTieBreaker;
  const playersByTable = new Map();

  if (!tieBreaker || tieBreaker.sessionId !== championship.id) {
    return playersByTable;
  }

  for (const table of tieBreaker.tables ?? []) {
    const tiedPlayers = new Set((table.unresolvedTieGroups ?? []).flat());

    if (tiedPlayers.size) {
      playersByTable.set(table.tableId, tiedPlayers);
    }
  }

  return playersByTable;
}

function renderChampionshipDayTableEntry(championship, context, table, activeTableId) {
  const players = table.playerIds.map((playerId) => championship.players.find((player) => player.id === playerId));
  const tiedPlayers = context.tiedPlayersByTable?.get(table.id) ?? new Set();

  return `
    <article class="championship-day-entry-table ${table.id === activeTableId ? "" : "hidden"}" data-score-table-panel="${escapeHtml(table.id)}">
      <h4>${escapeHtml(table.label)}</h4>
      <div class="championship-day-score-column-heads">
        <span>Game</span>
        ${players.map((player) => `<strong class="${tiedPlayers.has(player.id) ? "tie-breaker-needed" : ""}">${escapeHtml(player.name)}</strong>`).join("")}
      </div>
      ${Array.from({ length: 5 }, (_, gameIndex) => `
        <div class="championship-day-game-entry" data-game-index="${gameIndex + 1}">
          <div class="championship-day-game-title">Game ${gameIndex + 1}</div>
          ${players.map((player) => `
            ${championshipDayPlayerScoreCell(context, table, gameIndex + 1, player)}
          `).join("")}
        </div>
      `).join("")}
      <div class="championship-day-round-total-row" data-round-total-row="${escapeHtml(table.id)}">
        <strong>Total</strong>
        ${players.map((player) => `
          <span class="${tiedPlayers.has(player.id) ? "tie-breaker-needed" : ""}" data-round-total="${escapeHtml(table.id)}-${escapeHtml(player.id)}">0</span>
        `).join("")}
      </div>
    </article>
  `;
}

function championshipDayPlayerScoreCell(context, table, gameNumber, player) {
  const selectedValue = context.scoreValues.get(`${table.id}-${gameNumber}-${player.id}`) ?? "";
  const tiedPlayers = context.tiedPlayersByTable?.get(table.id) ?? new Set();

  return `
            <div class="championship-day-player-score ${tiedPlayers.has(player.id) ? "tie-breaker-needed" : ""}" data-score-cell="${escapeHtml(table.id)}-${gameNumber}-${escapeHtml(player.id)}">
              <span class="championship-day-score-player-name">${escapeHtml(player.name)}</span>
              <select
                class="championship-day-score-value"
                data-table-id="${escapeHtml(table.id)}"
                data-game-number="${gameNumber}"
                data-player-id="${escapeHtml(player.id)}"
                aria-label="${escapeHtml(player.name)} game ${gameNumber} score"
              >
                ${championshipDayScoreOptions(selectedValue)}
              </select>
            </div>
  `;
}

function championshipDayScoreOptions(selectedValue = "") {
  const options = [
    { value: "", label: "Select" },
    { value: "6", label: "6" },
    { value: "5", label: "5" },
    { value: "3", label: "3" },
    { value: "2", label: "2" },
    { value: "1", label: "1" },
    { value: "0", label: "0" }
  ];

  return options.map((option) => `
    <option value="${escapeHtml(option.value)}" ${String(option.value) === String(selectedValue) ? "selected" : ""}>${escapeHtml(option.label)}</option>
  `).join("");
}

function renderChampionshipDayTieBreakerPanel(championship) {
  const tieBreaker = state.championshipDayTieBreaker;

  if (!tieBreaker || tieBreaker.sessionId !== championship.id) {
    return "";
  }

  return `
    <section class="championship-day-panel tie-breaker-panel">
      <div class="championship-day-panel-head">
        <h3>Tie Breaker Pull Required</h3>
        <span>Each tied player draws 2 tiles</span>
      </div>
      ${tieBreaker.tables.map((table) => `
        <article class="championship-day-table-card">
          <h4>${escapeHtml(table.tableLabel)}</h4>
          ${table.unresolvedTieGroups.map((group, groupIndex) => `
            <div class="championship-day-pull-group">
              ${group.map((playerId) => `
                <label>
                  <span>${escapeHtml(championship.players.find((player) => player.id === playerId)?.name ?? playerId)}</span>
                  <input data-pull-table-id="${escapeHtml(table.tableId)}" data-pull-group="${groupIndex}" data-pull-player-id="${escapeHtml(playerId)}" placeholder="6:1, 2:1" required>
                </label>
              `).join("")}
            </div>
          `).join("")}
        </article>
      `).join("")}
    </section>
  `;
}

function renderChampionshipDayFinal(championship) {
  return `
    <section class="championship-day-panel">
      <div class="championship-day-panel-head">
        <h3>Final Ranking</h3>
        <span>${escapeHtml(formatDateTime(championship.endTime))}</span>
      </div>
      ${championshipDayLeaderboard(championship).map((ranking) => championshipDayFinalRankingRow(ranking, championship)).join("")}
    </section>
  `;
}

function championshipDayFinalRankingRow(ranking, championship) {
  const medals = {
    1: "🥇 Gold",
    2: "🥈 Silver",
    3: "🥉 Bronze"
  };

  const rank = ranking.currentRank ?? ranking.rank ?? ranking.place;

  return `
    <div class="championship-day-ranking-row championship-day-final-row ${rank <= 3 ? "is-top-three" : ""}">
      <strong>${medals[rank] ? escapeHtml(medals[rank]) : escapeHtml(ordinal(rank))} ${avatarHtml(championshipDayAvatarIdForPlayer(championship, ranking.playerId), "championship-day-rank-avatar")}</strong>
      <span>${escapeHtml(ranking.playerName)}</span>
      <span>${escapeHtml(ranking.totalPoints)} pts</span>
      <small>
        Rank ${escapeHtml(rank)} | NW ${escapeHtml(ranking.normalWins)} | LW ${escapeHtml(ranking.lockWins)} | 2nd ${escapeHtml(ranking.secondPlaces)} | 3rd ${escapeHtml(ranking.thirdPlaces)} | 4th ${escapeHtml(ranking.fourthPlaces)} | LL ${escapeHtml(ranking.lockLoses)} | Avg ${escapeHtml(ranking.averagePoints.toFixed(1))}
      </small>
    </div>
  `;
}

function bindChampionshipDayWorkspace() {
  document.querySelector("#championshipDayBackButton")?.addEventListener("click", () => {
    state.championshipDayId = null;
    state.championshipDayDetail = null;
    state.championshipDayTieBreaker = null;
    state.championshipDayScoreEntryOpen = false;
    state.championshipDayActiveScoreTableId = null;
    state.championshipDayEditingRoundNumber = null;
    state.championshipDayChartPlayerFilter = "";
    history.pushState(null, "", "/admin/");
    renderAdminPortal();
  });

  document.querySelector("#championshipDayEndButton")?.addEventListener("click", async () => {
    await endChampionshipDayWithConfirmation(state.championshipDayDetail);
  });

  document.querySelector("#championshipDayReopenButton")?.addEventListener("click", async () => {
    await api(`/api/admin/championship-day/${state.championshipDayDetail.id}/reopen`, {
      method: "POST",
      headers: portalAdminHeaders()
    });
    state.championshipDayTieBreaker = null;
    state.championshipDayScoreEntryOpen = false;
    state.championshipDayActiveScoreTableId = null;
    state.championshipDayEditingRoundNumber = null;
    showToast("Championship Day reopened");
    await loadPortalData();
  });

  document.querySelector("#championshipDayExportExcelButton")?.addEventListener("click", async () => {
    await exportChampionshipDayExcel(state.championshipDayDetail.id);
  });

  document.querySelector("#championshipDayChartPlayerFilter")?.addEventListener("change", (event) => {
    state.championshipDayChartPlayerFilter = event.target.value;
    renderAdminPortal();
  });

  document.querySelector("#championshipDayAddRoundButton")?.addEventListener("click", () => {
    state.championshipDayScoreEntryOpen = true;
    state.championshipDayEditingRoundNumber = null;
    state.championshipDayActiveScoreTableId = state.championshipDayDetail?.currentTables?.[0]?.id ?? null;
    renderAdminPortal();
  });

  document.querySelectorAll("[data-edit-round-number]").forEach((button) => {
    button.addEventListener("click", () => {
      state.championshipDayScoreEntryOpen = true;
      state.championshipDayEditingRoundNumber = Number(button.dataset.editRoundNumber);
      const round = state.championshipDayDetail?.rounds.find((entry) => entry.number === state.championshipDayEditingRoundNumber);
      state.championshipDayActiveScoreTableId = round?.startingTables?.[0]?.id ?? null;
      renderAdminPortal();
    });
  });

  document.querySelectorAll("[data-round-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const roundNumber = button.dataset.roundToggle;
      const historyKey = championshipDayRoundHistoryKey(state.championshipDayDetail?.id ?? "", roundNumber);
      const body = document.querySelector(`[data-round-history-body="${cssEscape(roundNumber)}"]`);
      const isOpen = !body?.classList.contains("hidden");

      body?.classList.toggle("hidden", isOpen);
      button.textContent = isOpen ? "View" : "Hide";
      button.setAttribute("aria-expanded", isOpen ? "false" : "true");

      if (isOpen) {
        state.championshipDayOpenRoundResults.delete(historyKey);
      } else {
        state.championshipDayOpenRoundResults.add(historyKey);
      }
    });
  });

  document.querySelector("#championshipDayCancelEditButton")?.addEventListener("click", () => {
    state.championshipDayScoreEntryOpen = false;
    state.championshipDayEditingRoundNumber = null;
    state.championshipDayActiveScoreTableId = null;
    renderAdminPortal();
  });

  document.querySelectorAll("[data-score-table-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.championshipDayActiveScoreTableId = button.dataset.scoreTableTab;
      renderChampionshipDayScoreTabs();
    });
  });

  document.querySelectorAll(".championship-day-score-value").forEach((select) => {
    select.addEventListener("change", () => {
      selectChampionshipDayScoreValue(select);
    });
  });

  updateChampionshipDayScoreEntryState();

  document.querySelector("#championshipDayScoreForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitChampionshipDayWorkspaceRound();
  });
}

async function exportChampionshipDayExcel(championshipId) {
  const response = await fetch(`/api/admin/championship-day/${encodeURIComponent(championshipId)}/export?format=xlsx`, {
    headers: portalAdminHeaders()
  });

  if (!response.ok) {
    let message = "Excel export failed";

    try {
      const data = await response.json();
      message = data.error ?? message;
    } catch {
      // Binary endpoints may not return JSON when a server error occurs.
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "championship-dashboard.xlsx";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Excel dashboard exported");
}

function renderChampionshipDayScoreTabs() {
  document.querySelectorAll("[data-score-table-tab]").forEach((button) => {
    const isActive = button.dataset.scoreTableTab === state.championshipDayActiveScoreTableId;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  document.querySelectorAll("[data-score-table-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.scoreTablePanel !== state.championshipDayActiveScoreTableId);
  });
}

function selectChampionshipDayScoreValue(select) {
  const { tableId, gameNumber, playerId } = select.dataset;

  document.querySelector(`[data-score-cell="${cssEscape(`${tableId}-${gameNumber}-${playerId}`)}"]`)?.classList.remove("score-missing");
  updateChampionshipDayScoreEntryState();
}

async function submitChampionshipDayWorkspaceRound() {
  const championship = state.championshipDayDetail;
  const context = championshipDayScoreContext(championship);
  const scoreState = updateChampionshipDayScoreEntryState();

  if (!scoreState.canFinalize) {
    renderChampionshipDayWorkspaceValidation({
      errors: scoreState.errors.length ? scoreState.errors : ["Complete every score with no flagged game rows before finalizing."]
    });
    showToast("Fix score entry flags before finalizing");
    return;
  }

  const missingScores = missingChampionshipDayScores(championship, context);

  if (missingScores.length) {
    renderChampionshipDayMissingScoreValidation(missingScores);
    showToast("Complete every score chip before finalizing");
    return;
  }

  const round = championshipDayRoundFromWorkspace(championship, context);
  const options = state.championshipDayTieBreaker?.sessionId === championship.id
    ? { tieBreakerPulls: championshipDayTieBreakerPullsFromWorkspace() }
    : {};
  const isEdit = context.mode === "edit";
  const response = await fetch(`/api/admin/championship-day/${championship.id}/rounds${isEdit ? `/${context.roundNumber}` : ""}`, {
    method: isEdit ? "PUT" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...portalAdminHeaders()
    },
    body: JSON.stringify({ round, options })
  });
  const result = await response.json();

  if (response.status === 409) {
    state.championshipDayTieBreaker = {
      sessionId: championship.id,
      round,
      tables: result.tieBreaker?.tables ?? []
    };
    showToast("Tie breaker pull required");
    renderAdminPortal();
    return;
  }

  if (!response.ok) {
    renderChampionshipDayWorkspaceValidation(result.validation ?? {
      errors: [result.error ?? "Round could not be finalized."]
    });
    showToast(result.error ?? "Round could not be finalized");
    return;
  }

  state.championshipDayDetail = result.championship;
  state.championshipDayTieBreaker = null;
  state.championshipDayScoreEntryOpen = false;
  state.championshipDayActiveScoreTableId = null;
  state.championshipDayEditingRoundNumber = null;
  showToast(result.warning ?? (isEdit ? "Round updated" : "Round finalized"));
  await loadPortalData();
}

function updateChampionshipDayScoreEntryState() {
  const championship = state.championshipDayDetail;

  if (!championship || !document.querySelector("#championshipDayScoreForm")) {
    return { canFinalize: false, errors: [] };
  }

  const context = championshipDayScoreContext(championship);
  const errors = [];
  let allComplete = true;
  let allValid = true;

  document.querySelectorAll(".championship-day-game-entry").forEach((row) => {
    row.classList.remove("has-score-error", "is-incomplete");
    row.removeAttribute("title");
  });
  document.querySelectorAll("[data-table-warning]").forEach((badge) => {
    badge.classList.add("hidden");
  });

  for (const table of context.tables) {
    updateChampionshipDayTableTotals(table);

    for (let gameNumber = 1; gameNumber <= 5; gameNumber += 1) {
      const gameState = championshipDayGameScoreState(table, gameNumber);
      const row = document.querySelector(`[data-score-table-panel="${cssEscape(table.id)}"] .championship-day-game-entry[data-game-index="${gameNumber}"]`);

      applyChampionshipDayScoreOptionRules(table, gameNumber, gameState);

      if (!gameState.complete) {
        allComplete = false;
        row?.classList.add("is-incomplete");
      }

      if (gameState.errors.length) {
        allValid = false;
        row?.classList.add("has-score-error");
        row?.setAttribute("title", gameState.errors.join(" "));
        document.querySelector(`[data-table-warning="${cssEscape(table.id)}"]`)?.classList.remove("hidden");
        errors.push(`${table.label} Game ${gameNumber}: ${gameState.errors.join(" ")}`);
      }
    }
  }

  document.querySelector("#championshipDayScoreForm button[type='submit']")?.toggleAttribute("disabled", !(allComplete && allValid));

  return {
    canFinalize: allComplete && allValid,
    errors
  };
}

function championshipDayGameScoreState(table, gameNumber) {
  const selects = championshipDayGameScoreSelects(table.id, gameNumber);
  const values = selects.map((select) => select.value).filter((value) => value !== "");
  const counts = {
    first: values.filter((value) => ["5", "6"].includes(value)).length,
    lockWin: values.filter((value) => value === "6").length,
    normalWin: values.filter((value) => value === "5").length,
    second: values.filter((value) => value === "3").length,
    third: values.filter((value) => value === "2").length,
    fourth: values.filter((value) => ["1", "0"].includes(value)).length,
    normalLoss: values.filter((value) => value === "1").length,
    lockLoss: values.filter((value) => value === "0").length
  };
  const errors = [];
  const complete = selects.length === 4 && values.length === 4;

  if (counts.first > 1) errors.push("Only one 1st place is allowed.");
  if (counts.second > 1) errors.push("Only one 2nd place is allowed.");
  if (counts.third > 1) errors.push("Only one 3rd place is allowed.");
  if (counts.fourth > 1) errors.push("Only one 4th place is allowed.");
  if (counts.lockWin && counts.normalWin) errors.push("Lock Win and Normal Win cannot both be selected.");
  if (counts.lockLoss && counts.normalLoss) errors.push("Lock Loss and Normal Loss cannot both be selected.");
  if (counts.lockWin && counts.lockLoss) errors.push("Lock Win requires Normal Loss for 4th place.");

  if (complete) {
    if (counts.first !== 1) errors.push("Select exactly one 1st place.");
    if (counts.second !== 1) errors.push("Select exactly one 2nd place.");
    if (counts.third !== 1) errors.push("Select exactly one 3rd place.");
    if (counts.fourth !== 1) errors.push("Select exactly one 4th place.");
  }

  return {
    selects,
    values,
    counts,
    complete,
    errors
  };
}

function applyChampionshipDayScoreOptionRules(table, gameNumber, gameState) {
  for (const select of gameState.selects) {
    const currentValue = select.value;
    const otherValues = gameState.selects
      .filter((candidate) => candidate !== select)
      .map((candidate) => candidate.value)
      .filter(Boolean);
    const otherHasFirst = otherValues.some((value) => ["5", "6"].includes(value));
    const otherHasFourth = otherValues.some((value) => ["1", "0"].includes(value));
    const anyHasLockWin = gameState.values.includes("6");
    const anyHasNormalWin = gameState.values.includes("5");
    const anyHasLockLoss = gameState.values.includes("0");
    const anyHasNormalLoss = gameState.values.includes("1");

    Array.from(select.options).forEach((option) => {
      const value = option.value;
      let disabled = false;

      if (value === "5") {
        disabled = otherHasFirst || anyHasLockWin;
      } else if (value === "6") {
        disabled = otherHasFirst || anyHasNormalWin;
      } else if (value === "3") {
        disabled = otherValues.includes("3");
      } else if (value === "2") {
        disabled = otherValues.includes("2");
      } else if (value === "1") {
        disabled = otherHasFourth || anyHasLockLoss;
      } else if (value === "0") {
        disabled = otherHasFourth || anyHasNormalLoss || anyHasLockWin;
      }

      option.disabled = value !== currentValue && disabled;
    });
  }
}

function updateChampionshipDayTableTotals(table) {
  const totals = new Map(table.playerIds.map((playerId) => [playerId, 0]));

  for (let gameNumber = 1; gameNumber <= 5; gameNumber += 1) {
    championshipDayGameScoreSelects(table.id, gameNumber).forEach((select) => {
      totals.set(select.dataset.playerId, (totals.get(select.dataset.playerId) ?? 0) + (Number(select.value) || 0));
    });
  }

  for (const [playerId, total] of totals.entries()) {
    const target = document.querySelector(`[data-round-total="${cssEscape(`${table.id}-${playerId}`)}"]`);

    if (target) {
      target.textContent = String(total);
    }
  }
}

function championshipDayGameScoreSelects(tableId, gameNumber) {
  return Array.from(document.querySelectorAll(`.championship-day-score-value[data-table-id="${cssEscape(tableId)}"][data-game-number="${gameNumber}"]`));
}

function missingChampionshipDayScores(championship, context) {
  const missing = [];

  for (const table of context.tables) {
    for (let gameIndex = 0; gameIndex < 5; gameIndex += 1) {
      for (const playerId of table.playerIds) {
        const input = document.querySelector(`.championship-day-score-value[data-table-id="${cssEscape(table.id)}"][data-game-number="${gameIndex + 1}"][data-player-id="${cssEscape(playerId)}"]`);

        if (!input?.value) {
          missing.push({
            tableId: table.id,
            tableLabel: table.label,
            gameNumber: gameIndex + 1,
            playerId,
            playerName: championship.players.find((player) => player.id === playerId)?.name ?? playerId
          });
        }
      }
    }
  }

  return missing;
}

function renderChampionshipDayMissingScoreValidation(missingScores) {
  document.querySelectorAll(".score-missing").forEach((element) => {
    element.classList.remove("score-missing");
  });

  const tables = new Map();

  for (const missing of missingScores) {
    tables.set(missing.tableId, missing.tableLabel);
    document.querySelector(`[data-score-cell="${cssEscape(`${missing.tableId}-${missing.gameNumber}-${missing.playerId}`)}"]`)?.classList.add("score-missing");
  }

  renderChampionshipDayWorkspaceValidation({
    errors: [...tables.values()].map((tableLabel) => `${tableLabel} has missing score chips.`)
  });

  for (const tableId of tables.keys()) {
    document.querySelector(`[data-table-warning="${cssEscape(tableId)}"]`)?.classList.remove("hidden");
  }

  const firstMissing = missingScores[0];
  state.championshipDayActiveScoreTableId = firstMissing?.tableId ?? state.championshipDayActiveScoreTableId;
  renderChampionshipDayScoreTabs();
}

function championshipDayRoundFromWorkspace(championship, context = championshipDayScoreContext(championship)) {
  return {
    roundNumber: context.roundNumber,
    tables: context.tables.map((table) => ({
      tableId: table.id,
      games: Array.from({ length: 5 }, (_, gameIndex) => ({
        gameNumber: gameIndex + 1,
        scores: table.playerIds.map((playerId) => {
          const input = document.querySelector(`.championship-day-score-value[data-table-id="${cssEscape(table.id)}"][data-game-number="${gameIndex + 1}"][data-player-id="${cssEscape(playerId)}"]`);

          return {
            playerId,
            points: Number(input?.value)
          };
        })
      }))
    }))
  };
}

function championshipDayTieBreakerPullsFromWorkspace() {
  const pulls = {};

  document.querySelectorAll("[data-pull-player-id]").forEach((input) => {
    const tableId = input.dataset.pullTableId;
    const playerId = input.dataset.pullPlayerId;
    const tiles = String(input.value)
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map(parsePulledTile);

    pulls[tableId] = pulls[tableId] ?? {};
    pulls[tableId][playerId] = tiles;
  });

  return pulls;
}

function parsePulledTile(value) {
  const match = value.match(/^([0-6])\s*:\s*([0-6])$/);

  if (!match) {
    return {
      id: "0:0",
      high: 0,
      low: 0
    };
  }

  const first = Number(match[1]);
  const second = Number(match[2]);
  const high = Math.max(first, second);
  const low = Math.min(first, second);

  return {
    id: `${high}:${low}`,
    high,
    low
  };
}

function renderChampionshipDayWorkspaceValidation(validation) {
  const firstPanel = els.championshipDayWorkspace.querySelector(".championship-day-panel");

  if (!firstPanel) {
    return;
  }

  document.querySelectorAll("[data-table-warning]").forEach((badge) => {
    badge.classList.add("hidden");
  });

  (validation.tables ?? []).forEach((table) => {
    if (table.errors?.length) {
      document.querySelector(`[data-table-warning="${cssEscape(table.tableId)}"]`)?.classList.remove("hidden");
    }
  });

  const old = els.championshipDayWorkspace.querySelector(".championship-day-validation-box");
  old?.remove();
  firstPanel.insertAdjacentHTML("afterend", `
    <div class="championship-day-validation-box">
      <strong>Score entry needs attention</strong>
      ${(validation.errors ?? ["Check the round entries."]).map((message) => `<div class="admin-meta">${escapeHtml(message)}</div>`).join("")}
    </div>
  `);
}

function championshipDayLeaderboard(championship) {
  const totals = new Map(championship.players.map((player) => [player.id, {
    playerId: player.id,
    playerName: player.name,
    avatarId: championshipDayAvatarIdForPlayer(championship, player.id),
    totalPoints: 0,
    wins: 0,
    normalWins: 0,
    lockWins: 0,
    secondPlaces: 0,
    thirdPlaces: 0,
    fourthPlaces: 0,
    lockLoses: 0,
    roundsPlayed: 0,
    currentTableId: null,
    currentTableLabel: null,
    averagePoints: 0,
    currentRank: 0
  }]));

  for (const round of championship.rounds ?? []) {
    for (const table of round.tableResults ?? []) {
      for (const ranking of table.rankings ?? []) {
        const total = totals.get(ranking.playerId);

        total.totalPoints += ranking.totalPoints;
        total.wins += ranking.wins;
        total.normalWins += ranking.normalWins;
        total.lockWins += ranking.lockWins;
        total.secondPlaces += ranking.secondPlaces;
        total.thirdPlaces += ranking.thirdPlaces;
        total.fourthPlaces += ranking.fourthPlaces;
        total.lockLoses += ranking.lockLoses;
        total.roundsPlayed += 1;
      }
    }
  }

  for (const table of championship.currentTables ?? []) {
    for (const playerId of table.playerIds ?? []) {
      const total = totals.get(playerId);

      if (total) {
        total.currentTableId = table.id;
        total.currentTableLabel = table.label;
      }
    }
  }

  return [...totals.values()]
    .map((player) => ({
      ...player,
      averagePoints: player.roundsPlayed ? player.totalPoints / player.roundsPlayed : 0
    }))
    .sort((first, second) => (
      second.totalPoints - first.totalPoints
      || second.wins - first.wins
      || second.lockWins - first.lockWins
      || second.secondPlaces - first.secondPlaces
      || second.thirdPlaces - first.thirdPlaces
      || first.fourthPlaces - second.fourthPlaces
      || first.playerName.localeCompare(second.playerName)
    ))
    .map((player, index) => ({
      ...player,
      place: index + 1,
      currentRank: index + 1
    }));
}

function renderAdminMetrics() {
  const data = state.portalData;
  const openReports = data.reports?.length ?? 0;
  const rooms = data.rooms ?? [];
  const activeRooms = data.metrics?.activeChampionships ?? rooms.filter((room) => room.status === "active").length;
  const connectedUsers = data.metrics?.connectedPlayers
    ?? rooms.reduce((sum, room) => sum + Number(room.connectedPlayers ?? 0), 0);
  const capacity = data.capacity ?? {};

  els.adminMetrics.innerHTML = [
    ["Active", activeRooms],
    ["Connected", connectedUsers],
    ["Flags", openReports],
    ["Capacity", `${capacity.openChampionships ?? 0}/${capacity.maxConcurrentChampionships ?? 30}`]
  ].map(([label, value]) => `
    <div class="admin-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join("");
}

function renderAdminReports() {
  const reports = state.portalData?.reports ?? [];

  els.adminReportsList.innerHTML = reports.length
    ? reports.map((report) => `
      <article class="admin-card">
        <div class="admin-card-head">
          <strong>${escapeHtml(report.targetName || report.targetPlayerId)}</strong>
          <span>${escapeHtml(report.source)} | ${formatDateTime(report.createdAt)}</span>
        </div>
        <p>${escapeHtml(report.reason)}</p>
        ${report.messageText ? `<blockquote>${escapeHtml(report.messageText)}</blockquote>` : ""}
        <div class="admin-meta">Room ${escapeHtml(report.roomId)}${report.reporterName ? ` | Reported by ${escapeHtml(report.reporterName)}` : ""}</div>
        <div class="admin-actions">
          <button class="small-button admin-report-action" type="button" data-report-id="${escapeHtml(report.id)}" data-action="dismiss">Dismiss</button>
          <button class="small-button admin-player-action" type="button" data-report-id="${escapeHtml(report.id)}" data-room-id="${escapeHtml(report.roomId)}" data-player-id="${escapeHtml(report.targetPlayerId)}" data-action="warn">Warn</button>
          <button class="small-button admin-player-action" type="button" data-report-id="${escapeHtml(report.id)}" data-room-id="${escapeHtml(report.roomId)}" data-player-id="${escapeHtml(report.targetPlayerId)}" data-action="mute">Mute 10m</button>
          <button class="small-button danger-button admin-player-action" type="button" data-report-id="${escapeHtml(report.id)}" data-room-id="${escapeHtml(report.roomId)}" data-player-id="${escapeHtml(report.targetPlayerId)}" data-action="remove">Remove</button>
        </div>
      </article>
    `).join("")
    : `<div class="admin-empty">No open reports.</div>`;

  bindAdminActionButtons();
}

function renderAdminRooms() {
  const rooms = state.portalData?.rooms ?? [];

  els.adminRoomsList.innerHTML = rooms.length
    ? rooms.map((room) => `
      <article class="admin-card">
        <div class="admin-card-head">
          <strong>Room ${escapeHtml(room.id)}</strong>
          <span>${escapeHtml(room.status)}</span>
        </div>
        <div class="admin-meta">Host ${escapeHtml(room.hostName)} | ${room.players} joined | ${room.activePlayers} active | ${room.lobbyPlayers} lobby</div>
        <div class="admin-meta">Connected: ${(room.connectedPlayerNames ?? []).map(escapeHtml).join(", ") || "none"}</div>
        <div class="admin-meta">${room.currentGameNumber ? `Round ${room.currentGameNumber}` : `${room.matchLength}-game championship`}</div>
        <div class="admin-actions">
          <button class="small-button danger-button admin-room-end" type="button" data-room-id="${escapeHtml(room.id)}">End Championship</button>
        </div>
      </article>
    `).join("")
    : `<div class="admin-empty">No live championships.</div>`;

  bindAdminActionButtons();
}

function renderChampionshipDayWizard() {
  if (!els.championshipDayCreateForm) {
    return;
  }

  const tableCount = Number(els.championshipDayTableCountInput.value || 2);
  const expectedPlayers = tableCount * 4;
  const showPlayers = state.championshipDayWizardStep === "players";

  els.championshipDaySetupStep?.classList.toggle("hidden", showPlayers);
  els.championshipDayPlayersStep?.classList.toggle("hidden", !showPlayers);

  document.querySelectorAll(".championship-day-table-option").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.tableCount) === tableCount);
  });

  if (els.championshipDayPlayerCountLabel) {
    els.championshipDayPlayerCountLabel.textContent = `${expectedPlayers} players required`;
  }

  renderChampionshipDayPlayerBuilder(tableCount, expectedPlayers);
}

function renderChampionshipDayPlayerBuilder(tableCount, expectedPlayers) {
  if (!els.championshipDayPlayersGrid) {
    return;
  }

  const assignments = normalizeChampionshipDayPlayerAssignments(
    readChampionshipDayPlayerAssignments(tableCount),
    tableCount,
    expectedPlayers
  );
  const tableOptions = Array.from({ length: tableCount }, (_, index) => ({
    value: String(index),
    label: `Table ${String.fromCharCode(65 + index)}`
  }));

  els.championshipDayPlayersGrid.innerHTML = `
    <div class="championship-day-player-builder-head">
      <div>
        <strong>Assign Players By Table</strong>
        <span>Each table must have exactly 4 players before tables can be assigned.</span>
      </div>
      <span class="championship-day-builder-pill">${expectedPlayers} seats</span>
    </div>
    <div class="championship-day-player-table-grid">
      ${Array.from({ length: tableCount }, (_, tableIndex) => {
        const tablePlayers = assignments.filter((player) => player.tableIndex === tableIndex);

        return `
          <section class="championship-day-player-table-card" data-builder-table="${tableIndex}">
            <div class="championship-day-player-table-head">
              <strong>Table ${String.fromCharCode(65 + tableIndex)}</strong>
              <span data-builder-table-count="${tableIndex}">${tablePlayers.length}/4</span>
            </div>
            <small class="championship-day-player-table-warning ${tablePlayers.length === 4 ? "hidden" : ""}" data-builder-table-warning="${tableIndex}">
              Table ${String.fromCharCode(65 + tableIndex)} must have exactly 4 players.
            </small>
            <div class="championship-day-player-table-slots">
              ${tablePlayers.map((player) => championshipDayPlayerBuilderRow(player, tableOptions)).join("")}
            </div>
          </section>
        `;
      }).join("")}
    </div>
  `;

  els.championshipDayPlayersGrid.querySelectorAll("[data-player-builder-name], [data-player-builder-table], [data-player-builder-avatar]").forEach((control) => {
    control.addEventListener("input", syncChampionshipDayPlayerBuilder);
    control.addEventListener("change", () => {
      if (control.matches("[data-player-builder-table]")) {
        renderChampionshipDayPlayerBuilder(tableCount, expectedPlayers);
        return;
      }

      syncChampionshipDayPlayerBuilder();
    });
  });
  updateChampionshipDayPlayerBuilderCounts();
  syncChampionshipDayPlayersTextarea();
}

function championshipDayPlayerBuilderRow(player, tableOptions) {
  return `
    <label class="championship-day-player-builder-row" data-player-builder-row="${escapeHtml(player.key)}">
      <span>Seat ${escapeHtml(player.displayIndex)}</span>
      <input data-player-builder-name="${escapeHtml(player.key)}" value="${escapeHtml(player.name)}" maxlength="40" placeholder="Player name" required>
      <select data-player-builder-table="${escapeHtml(player.key)}" aria-label="${escapeHtml(player.name)} table">
        ${tableOptions.map((option) => `
          <option value="${escapeHtml(option.value)}" ${Number(option.value) === player.tableIndex ? "selected" : ""}>${escapeHtml(option.label)}</option>
        `).join("")}
      </select>
      <select data-player-builder-avatar="${escapeHtml(player.key)}" aria-label="${escapeHtml(player.name)} icon">
        ${PLAYER_AVATARS.map((avatar) => `
          <option value="${escapeHtml(avatar.id)}" ${avatar.id === player.avatarId ? "selected" : ""}>${escapeHtml(avatar.graphic)} ${escapeHtml(avatar.label)}</option>
        `).join("")}
      </select>
    </label>
  `;
}

function renderAdminChampionshipDay() {
  const sessions = state.portalData?.championshipDaySessions ?? [];

  els.championshipDayList.innerHTML = sessions.length
    ? sessions.map((session) => `
      <article class="admin-card championship-day-card">
        <div class="admin-card-head">
          <strong>${escapeHtml(session.name || session.id)}</strong>
          <span>${escapeHtml(session.status)}</span>
        </div>
        <div class="admin-meta">
          ${session.tableCount} tables | ${session.playerCount} players | Round ${session.currentRoundNumber} | ${session.completedRounds} completed
        </div>
        <div class="admin-meta">
          Started ${escapeHtml(formatDateTime(session.startTime))}
          ${session.endTime ? ` | Ended ${escapeHtml(formatDateTime(session.endTime))}` : ""}
        </div>
        <div class="championship-day-summary-tables">
          ${(session.currentTables ?? []).map((table) => `
            <div>
              <strong>${escapeHtml(table.label)}</strong>
              <span class="championship-day-summary-player-list">
                ${(table.players ?? []).map((player) => `
                  <span class="championship-day-summary-player">
                    ${avatarHtml(player.avatarId, "championship-day-rank-avatar")}
                    ${escapeHtml(player.playerName)}
                  </span>
                `).join("")}
              </span>
            </div>
          `).join("")}
        </div>
        ${session.location ? `<div class="admin-meta">${escapeHtml(session.location)}</div>` : ""}
        ${renderChampionshipDayRankings(session)}
        <div class="admin-actions">
          <button class="small-button championship-day-open" type="button" data-session-id="${escapeHtml(session.id)}">Open Workspace</button>
          ${session.status === "active" ? `<button class="small-button danger-button championship-day-end" type="button" data-session-id="${escapeHtml(session.id)}">End</button>` : ""}
          ${session.status === "completed" ? `<button class="small-button championship-day-reopen" type="button" data-session-id="${escapeHtml(session.id)}">Reopen Scores</button>` : ""}
        </div>
      </article>
    `).join("")
    : `<div class="admin-empty">No physical Championship Day sessions yet.</div>`;

  bindChampionshipDayButtons();
}

function renderChampionshipDayRankings(session) {
  const lastRoundResults = session?.lastRoundResults;

  if (!lastRoundResults?.tables?.length) {
    return "";
  }

  const isOpen = state.championshipDayOpenAdminSessions.has(session.id);

  return `
    <div class="championship-day-rankings">
      <div class="championship-day-rankings-head">
        <strong>Round ${escapeHtml(lastRoundResults.number)} Table Rankings</strong>
        <button class="small-button championship-day-admin-results-toggle" type="button" data-session-results-toggle="${escapeHtml(session.id)}" aria-expanded="${isOpen ? "true" : "false"}">${isOpen ? "Hide" : "View"}</button>
      </div>
      <div class="championship-day-admin-results ${isOpen ? "" : "hidden"}" data-session-results-body="${escapeHtml(session.id)}">
        ${lastRoundResults.tables.map((table) => `
          <div class="championship-day-table-result">
            <div class="admin-meta">${escapeHtml(table.tableLabel)}</div>
            ${table.rankings.map((ranking) => `
              <div class="championship-day-ranking-row">
                <strong>${escapeHtml(ordinal(ranking.place))} ${avatarHtml(ranking.avatarId, "championship-day-rank-avatar")}</strong>
                <span>${escapeHtml(ranking.playerName)}</span>
                <span>${escapeHtml(ranking.totalPoints)} pts</span>
                <small>
                  NW ${escapeHtml(ranking.normalWins)} | LW ${escapeHtml(ranking.lockWins)} | 2nd ${escapeHtml(ranking.secondPlaces)} | 3rd ${escapeHtml(ranking.thirdPlaces)} | 4th ${escapeHtml(ranking.fourthPlaces)} | LL ${escapeHtml(ranking.lockLoses)}
                  ${ranking.determinedBy === "tieBreakerPull" ? ` | Pull ${escapeHtml(ranking.tieBreakerPipTotal)} pips` : ""}
                </small>
              </div>
            `).join("")}
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function bindChampionshipDayButtons() {
  els.championshipDayList.querySelectorAll(".championship-day-open").forEach((button) => {
    button.addEventListener("click", async () => {
      state.championshipDayId = button.dataset.sessionId;
      state.championshipDayTieBreaker = null;
      state.championshipDayScoreEntryOpen = false;
      state.championshipDayActiveScoreTableId = null;
      state.championshipDayEditingRoundNumber = null;
      history.pushState(null, "", `/admin/${state.championshipDayId}`);
      await loadPortalData();
    });
  });

  els.championshipDayList.querySelectorAll(".championship-day-end").forEach((button) => {
    button.addEventListener("click", async () => {
      const session = (state.portalData?.championshipDaySessions ?? []).find((entry) => entry.id === button.dataset.sessionId);
      await endChampionshipDayWithConfirmation(session);
    });
  });

  els.championshipDayList.querySelectorAll(".championship-day-reopen").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/admin/championship-day/${button.dataset.sessionId}/reopen`, {
        method: "POST",
        headers: portalAdminHeaders()
      });
      showToast("Championship Day reopened");
      await loadPortalData();
    });
  });

  els.championshipDayList.querySelectorAll("[data-session-results-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const sessionId = button.dataset.sessionResultsToggle;
      const body = els.championshipDayList.querySelector(`[data-session-results-body="${cssEscape(sessionId)}"]`);
      const isOpen = !body?.classList.contains("hidden");

      body?.classList.toggle("hidden", isOpen);
      button.textContent = isOpen ? "View" : "Hide";
      button.setAttribute("aria-expanded", isOpen ? "false" : "true");

      if (isOpen) {
        state.championshipDayOpenAdminSessions.delete(sessionId);
      } else {
        state.championshipDayOpenAdminSessions.add(sessionId);
      }
    });
  });
}

async function endChampionshipDayWithConfirmation(championship) {
  if (!championship) {
    return;
  }

  const completedRounds = Number(championship.rounds?.length ?? championship.completedRounds ?? 0);
  const confirmed = await confirmChampionshipDayEnd(championship, completedRounds);

  if (!confirmed) {
    return;
  }

  await api(`/api/admin/championship-day/${championship.id}/end`, {
    method: "POST",
    headers: portalAdminHeaders(),
    body: {
      endTime: new Date().toISOString(),
      confirmedCompletedRounds: completedRounds
    }
  });
  state.championshipDayTieBreaker = null;
  state.championshipDayScoreEntryOpen = false;
  state.championshipDayActiveScoreTableId = null;
  state.championshipDayEditingRoundNumber = null;
  showToast("Championship Day ended");
  await loadPortalData();
}

function confirmChampionshipDayEnd(championship, completedRounds) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "championship-day-modal-backdrop";
    overlay.innerHTML = `
      <section class="championship-day-modal" role="dialog" aria-modal="true" aria-labelledby="championshipDayEndTitle">
        <div class="championship-day-modal-icon">🏆</div>
        <h2 id="championshipDayEndTitle">End Championship</h2>
        <p class="championship-day-modal-count">This championship currently has ${escapeHtml(completedRounds)} completed round${completedRounds === 1 ? "" : "s"}.</p>
        <p>Are you sure you want to end it?</p>
        <small>${escapeHtml(championship.name ?? "Championship Day")} will be locked from further score entry and final rankings will be calculated.</small>
        <div class="championship-day-modal-actions">
          <button class="small-button" type="button" data-modal-cancel>Cancel</button>
          <button class="small-button danger-button" type="button" data-modal-confirm>End Championship</button>
        </div>
      </section>
    `;
    const cleanup = (value) => {
      overlay.remove();
      document.removeEventListener("keydown", onKeydown);
      resolve(value);
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") {
        cleanup(false);
      }
    };

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target.closest("[data-modal-cancel]")) {
        cleanup(false);
      }

      if (event.target.closest("[data-modal-confirm]")) {
        cleanup(true);
      }
    });
    document.addEventListener("keydown", onKeydown);
    document.body.append(overlay);
    overlay.querySelector("[data-modal-confirm]")?.focus();
  });
}

async function loadChampionshipDaySession(sessionId) {
  const result = await api(`/api/admin/championship-day/${sessionId}`, {
    headers: portalAdminHeaders()
  });

  return result.championship;
}

async function loadChampionshipDayDetail(sessionId, options = {}) {
  if (!sessionId || state.championshipDayLoadingId === sessionId) {
    return;
  }

  state.championshipDayLoadingId = sessionId;

  try {
    state.championshipDayDetail = await loadChampionshipDaySession(sessionId);
  } catch (error) {
    state.championshipDayDetail = null;
    if (!options.silent) {
      showToast(error.message);
    }
  } finally {
    state.championshipDayLoadingId = null;
  }

  if (options.renderAfter !== false) {
    renderAdminPortal();
  }
}

function championshipDayRoundInput(sessionId) {
  return els.championshipDayList.querySelector(`.championship-day-round-input[data-session-id="${cssEscape(sessionId)}"]`);
}

async function submitChampionshipDayRound(sessionId) {
  const input = championshipDayRoundInput(sessionId);
  let round;

  try {
    round = JSON.parse(input.value);
  } catch {
    renderChampionshipDayValidation(sessionId, {
      valid: false,
      errors: ["Round payload must be valid JSON."],
      tables: []
    });
    return;
  }

  const response = await fetch(`/api/admin/championship-day/${sessionId}/rounds`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...portalAdminHeaders()
    },
    body: JSON.stringify({ round })
  });
  const result = await response.json();

  if (!response.ok) {
    renderChampionshipDayValidation(sessionId, result.validation ?? {
      valid: false,
      errors: [result.error ?? "Round score validation failed."],
      tables: []
    });
    showToast(result.error ?? "Round score validation failed");
    return;
  }

  clearChampionshipDayValidation(sessionId);
  showToast("Round finalized");
  await loadPortalData();
}

function championshipDayRoundTemplate(session) {
  return {
    roundNumber: session.currentRoundNumber,
    tables: session.currentTables.map((table) => ({
      tableId: table.id,
      games: Array.from({ length: 5 }, (_, gameIndex) => ({
        gameNumber: gameIndex + 1,
        scores: table.playerIds.map((playerId, playerIndex) => ({
          playerId,
          points: [5, 3, 2, 1][playerIndex]
        }))
      }))
    }))
  };
}

function renderChampionshipDayValidation(sessionId, validation) {
  const container = els.championshipDayList.querySelector(`.championship-day-validation[data-validation-for="${cssEscape(sessionId)}"]`);

  if (!container) {
    return;
  }

  const tableRows = (validation.tables ?? [])
    .filter((table) => table.errors?.length)
    .map((table) => `
      <div class="championship-day-error-table">
        <strong>${escapeHtml(table.tableLabel ?? table.tableId ?? "Round")}</strong>
        ${table.errors.map((error) => `
          <div class="admin-meta">
            ${error.gameNumber ? `Game ${escapeHtml(error.gameNumber)} | ` : ""}
            ${error.playerId ? `Player ${escapeHtml(error.playerId)} | ` : ""}
            ${escapeHtml(error.message)}
          </div>
        `).join("")}
      </div>
    `).join("");

  container.innerHTML = `
    <div class="championship-day-validation-box">
      <strong>Validation failed</strong>
      ${tableRows || (validation.errors ?? []).map((message) => `<div class="admin-meta">${escapeHtml(message)}</div>`).join("")}
    </div>
  `;
}

function clearChampionshipDayValidation(sessionId) {
  const container = els.championshipDayList.querySelector(`.championship-day-validation[data-validation-for="${cssEscape(sessionId)}"]`);

  if (container) {
    container.innerHTML = "";
  }
}

function renderAdminShutdowns() {
  const shutdowns = state.portalData?.shutdownWindows ?? [];

  els.adminShutdownList.innerHTML = shutdowns.length
    ? shutdowns.slice(0, 6).map((shutdown) => `
      <div class="admin-list-row">
        <strong>${escapeHtml(shutdown.mode)}</strong>
        <span>${formatDateTime(shutdown.startAt)} - ${formatDateTime(shutdown.endAt)}</span>
      </div>
    `).join("")
    : `<div class="admin-empty">No shutdowns scheduled.</div>`;
}

function renderAdminBroadcasts() {
  const broadcasts = state.portalData?.broadcasts ?? [];

  els.adminBroadcastList.innerHTML = broadcasts.length
    ? broadcasts.slice(0, 6).map((broadcast) => `
      <div class="admin-list-row">
        <strong>${escapeHtml(broadcast.audience)}</strong>
        <span>${escapeHtml(broadcast.message)}</span>
      </div>
    `).join("")
    : `<div class="admin-empty">No recent broadcasts.</div>`;
}

function renderAdminCapacity() {
  const settings = state.portalData?.portalSettings;

  if (!settings) {
    return;
  }

  els.adminCapacityInput.value = settings.maxConcurrentChampionships;
  els.adminAllowNewInput.checked = settings.allowNewChampionships;
}

function renderAdminUsers() {
  const users = state.portalData?.adminUsers ?? [];

  els.adminUsersList.innerHTML = users.length
    ? users.map((user) => `
      <article class="admin-card admin-user-card">
        <div class="admin-card-head">
          <div class="admin-user-head">
            ${user.profilePictureDataUrl
              ? `<img class="admin-avatar" alt="" src="${escapeHtml(user.profilePictureDataUrl)}">`
              : `<span class="admin-avatar admin-avatar-fallback">${escapeHtml((user.firstName?.[0] ?? "A").toUpperCase())}</span>`}
            <div>
              <strong>${escapeHtml([user.firstName, user.lastName].filter(Boolean).join(" ") || user.email)}</strong>
              <div class="admin-meta">${escapeHtml(user.email)} | ${escapeHtml(user.role)}</div>
            </div>
          </div>
          <span>${escapeHtml(user.status)}</span>
        </div>
        <div class="admin-actions">
          <button class="small-button admin-user-status" type="button" data-admin-user-id="${escapeHtml(user.id)}" data-status="${user.status === "active" ? "inactive" : "active"}">
            Set ${user.status === "active" ? "Inactive" : "Active"}
          </button>
        </div>
      </article>
    `).join("")
    : `<div class="admin-empty">No admin users yet.</div>`;

  bindAdminUserButtons();
}

function renderAdminAudit() {
  const actions = state.portalData?.auditLog ?? [];

  els.adminAuditList.innerHTML = actions.length
    ? actions.map((action) => {
      const actor = action.adminName || action.adminEmail || action.adminRole || "Admin";

      return `
        <div class="admin-list-row">
          <strong>${escapeHtml(action.type)}</strong>
          <span>${escapeHtml(actor)} | ${escapeHtml(action.summary)} | ${formatDateTime(action.at)}</span>
        </div>
      `;
    }).join("")
    : `<div class="admin-empty">No admin actions yet.</div>`;
}

function bindAdminUserButtons() {
  els.adminUsersList.querySelectorAll(".admin-user-status").forEach((button) => {
    button.addEventListener("click", async () => {
      await api("/api/admin/users/status", {
        method: "PUT",
        headers: portalAdminHeaders(),
        body: {
          adminUserId: button.dataset.adminUserId,
          status: button.dataset.status
        }
      });
      showToast("Admin status updated");
      await loadPortalData();
    });
  });
}

function bindAdminActionButtons() {
  els.adminReportsList.querySelectorAll(".admin-report-action").forEach((button) => {
    button.addEventListener("click", async () => {
      await api("/api/admin/reports/action", {
        method: "POST",
        headers: portalAdminHeaders(),
        body: {
          reportId: button.dataset.reportId,
          status: button.dataset.action === "dismiss" ? "dismissed" : "reviewed",
          resolution: button.dataset.action
        }
      });
      showToast("Report updated");
      await loadPortalData();
    });
  });

  document.querySelectorAll(".admin-player-action").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.action;
      const confirmed = action === "remove"
        ? window.confirm("Remove this player? Active table removals cancel that championship.")
        : true;

      if (!confirmed) {
        return;
      }

      await api("/api/admin/player-action", {
        method: "POST",
        headers: portalAdminHeaders(),
        body: {
          roomId: button.dataset.roomId,
          targetPlayerId: button.dataset.playerId,
          reportId: button.dataset.reportId,
          action,
          minutes: 10,
          reason: "Portal moderation"
        }
      });
      showToast("Admin action applied");
      await loadPortalData();
    });
  });

  els.adminRoomsList.querySelectorAll(".admin-room-end").forEach((button) => {
    button.addEventListener("click", async () => {
      await api("/api/admin/player-action", {
        method: "POST",
        headers: portalAdminHeaders(),
        body: {
          roomId: button.dataset.roomId,
          targetPlayerId: state.portalData.rooms.find((room) => room.id === button.dataset.roomId)?.hostPlayerId,
          action: "remove",
          reason: "Admin ended championship"
        }
      });
      showToast("Championship ended");
      await loadPortalData();
    });
  });
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
      <p>${escapeHtml(roomCancelMessage(state.room))}</p>
      ${isHost ? `<button class="new-session-button" id="newSessionButton" type="button">New Session</button>` : ""}
    </div>
  `;
}

function roomCancelMessage(room) {
  if (room?.cancelMessage) {
    return room.cancelMessage;
  }

  const labels = {
    hostEndedSession: "The host ended this table.",
    waitingRoomInactivity: "Championship cancelled due to inactivity. Please ensure all 4 players are ready before starting a new championship.",
    adminShutdown: "The portal admin ended this championship.",
    adminRemovedPlayer: "A player was removed and the championship was cancelled."
  };

  return labels[room?.cancelReason] ?? "This championship was cancelled.";
}

function renderFullscreenButton() {
  if (!els.boardFullscreenButton) {
    return;
  }

  const canUse = Boolean(state.room?.match?.game);
  els.boardFullscreenButton.classList.toggle("hidden", !canUse);
  els.boardFullscreenButton.textContent = state.boardFullscreen ? "\u00d7" : "\u26f6";
  els.boardFullscreenButton.title = state.boardFullscreen ? "Exit full screen board" : "Full screen board";
  els.boardFullscreenButton.setAttribute("aria-label", els.boardFullscreenButton.title);
}

async function toggleBoardFullscreen() {
  if (state.boardFullscreen) {
    await exitBoardFullscreen();
    return;
  }

  await enterBoardFullscreen();
}

async function enterBoardFullscreen() {
  state.boardFullscreen = true;
  document.body.classList.add("board-fullscreen-active");
  renderFullscreenButton();

  try {
    if (els.tablePanel.requestFullscreen && !document.fullscreenElement) {
      await els.tablePanel.requestFullscreen();
    }
  } catch {
    // CSS fallback still rotates the table panel when fullscreen is unavailable.
  }

  try {
    await screen.orientation?.lock?.("landscape");
  } catch {
    // Some mobile browsers only allow orientation lock in installed PWA/fullscreen mode.
  }

  window.setTimeout(() => {
    if (state.room?.match?.game) {
      renderTable();
    }
  }, 150);
}

async function exitBoardFullscreen() {
  state.boardFullscreen = false;
  document.body.classList.remove("board-fullscreen-active");

  try {
    screen.orientation?.unlock?.();
  } catch {
    // Orientation unlock is not supported on every browser.
  }

  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch {
    // Exiting CSS fallback mode is enough if the browser fullscreen call fails.
  }

  renderFullscreenButton();
  if (state.room?.match?.game) {
    renderTable();
  }
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

  if (game?.animationLock) {
    return;
  }

  const ends = playableEnds(tile, game);

  if (ends.length === 0) {
    return;
  }

  state.selectedTile = state.selectedTile?.id === tile.id ? null : tile;
  state.slamArmed = false;
  renderTable();
  renderHand();
}

function onTileDragStart(event, tile) {
  const game = state.room.match?.game;

  if (game?.animationLock) {
    event.preventDefault();
    return;
  }

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

  const tile = state.selectedTile;
  const useSlam = state.slamArmed;

  state.slamArmed = false;

  if (useSlam) {
    await slamTile(tile, end);
    return;
  }

  await playTile(tile, end);
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

async function handleSlamClick() {
  const game = state.room.match?.game;
  const tile = currentSelectedTile(game);
  const ends = tile ? playableEnds(tile, game) : [];

  if (!tile || ends.length === 0 || game?.animationLock) {
    return;
  }

  if (ends.length === 1) {
    await slamTile(tile, ends[0]);
    return;
  }

  state.slamArmed = true;
  showToast("Choose the board end for Slam");
  renderTable();
  renderHand();
}

async function slamTile(tile, end) {
  const result = await api(`/api/rooms/${state.roomId}/slam`, {
    method: "POST",
    body: {
      playerId: state.playerId,
      tileId: tile.id,
      end
    }
  });

  state.selectedTile = null;
  state.slamArmed = false;
  state.room = result.room;
  render();
}

async function useTakeDat() {
  const result = await api(`/api/rooms/${state.roomId}/take-dat`, {
    method: "POST",
    body: {
      playerId: state.playerId
    }
  });

  state.room = result.room;
  render();
}

async function sendReaction() {
  const result = await api(`/api/rooms/${state.roomId}/reaction`, {
    method: "POST",
    body: {
      playerId: state.playerId,
      type: els.reactionSelect.value
    }
  });

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
          ? game.animationLock?.expiresAt ?? game.turnDeadlineAt
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

function portalAdminHeaders() {
  return {
    Authorization: `Bearer ${state.portalAdminToken}`
  };
}

function fillDefaultShutdownWindow() {
  if (!els.adminShutdownStart || !els.adminShutdownEnd) {
    return;
  }

  const start = new Date(Date.now() + 10 * 60_000);
  const end = new Date(start.getTime() + 24 * 60 * 60_000);
  els.adminShutdownStart.value = localDateTimeValue(start);
  els.adminShutdownEnd.value = localDateTimeValue(end);
}

function fillDefaultChampionshipDayForm() {
  if (!els.championshipDayStartInput || !els.championshipDayExpectedEndInput) {
    return;
  }

  const start = new Date();
  const end = new Date(start.getTime() + 5 * 60 * 60_000);
  els.championshipDayStartInput.value = localDateTimeValue(start);
  els.championshipDayExpectedEndInput.value = localDateTimeValue(end);
  fillDefaultChampionshipDayPlayers();
}

function fillDefaultChampionshipDayPlayers() {
  if (!els.championshipDayPlayersInput || !els.championshipDayTableCountInput) {
    return;
  }

  const expectedPlayers = Number(els.championshipDayTableCountInput.value) * 4;
  const existingNames = readChampionshipDayPlayerAssignments(Number(els.championshipDayTableCountInput.value))
    .map((player) => player.name)
    .filter(Boolean);

  els.championshipDayPlayersInput.value = Array.from({ length: expectedPlayers }, (_, index) => (
    existingNames[index] || `Player ${index + 1}`
  )).join("\n");
}

function readChampionshipDayPlayerAssignments(tableCount) {
  const rows = Array.from(els.championshipDayPlayersGrid?.querySelectorAll("[data-player-builder-row]") ?? []);

  if (rows.length) {
    return rows.map((row, index) => {
      const key = row.dataset.playerBuilderRow ?? `player-${index}`;
      const name = row.querySelector(`[data-player-builder-name="${cssEscape(key)}"]`)?.value?.trim() || "";
      const tableIndex = Number(row.querySelector(`[data-player-builder-table="${cssEscape(key)}"]`)?.value ?? Math.floor(index / 4));
      const avatarId = row.querySelector(`[data-player-builder-avatar="${cssEscape(key)}"]`)?.value || defaultChampionshipDayAvatarId(index);

      return {
        key,
        displayIndex: index + 1,
        name,
        avatarId,
        tableIndex: clampTableIndex(tableIndex, tableCount)
      };
    });
  }

  return String(els.championshipDayPlayersInput?.value ?? "")
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name, index) => ({
      key: `player-${index + 1}`,
      displayIndex: index + 1,
      name,
      avatarId: defaultChampionshipDayAvatarId(index),
      tableIndex: clampTableIndex(Math.floor(index / 4), tableCount)
    }));
}

function normalizeChampionshipDayPlayerAssignments(assignments, tableCount, expectedPlayers) {
  const normalized = assignments.slice(0, expectedPlayers).map((player, index) => ({
    key: player.key ?? `player-${index + 1}`,
    displayIndex: index + 1,
    name: player.name || `Player ${index + 1}`,
    avatarId: player.avatarId || defaultChampionshipDayAvatarId(index),
    tableIndex: clampTableIndex(player.tableIndex, tableCount)
  }));

  while (normalized.length < expectedPlayers) {
    const index = normalized.length;
    normalized.push({
      key: `player-${index + 1}`,
      displayIndex: index + 1,
      name: `Player ${index + 1}`,
      avatarId: defaultChampionshipDayAvatarId(index),
      tableIndex: clampTableIndex(Math.floor(index / 4), tableCount)
    });
  }

  return normalized;
}

function defaultChampionshipDayAvatarId(index) {
  return PLAYER_AVATARS[index % PLAYER_AVATARS.length]?.id ?? PLAYER_AVATARS[0].id;
}

function validateChampionshipDayPlayerAssignments(assignments, tableCount) {
  const expectedPlayers = tableCount * 4;
  const normalizedNames = assignments.map((player) => player.name.trim()).filter(Boolean);

  if (normalizedNames.length !== expectedPlayers) {
    return {
      valid: false,
      message: `Enter exactly ${expectedPlayers} player names.`,
      tableCounts: championshipDayTableCounts(assignments, tableCount)
    };
  }

  const duplicateName = firstDuplicateChampionshipDayPlayerName(normalizedNames);

  if (duplicateName) {
    return {
      valid: false,
      message: `Player name "${duplicateName}" is already used. Enter a unique variation.`,
      tableCounts: championshipDayTableCounts(assignments, tableCount)
    };
  }

  const tableCounts = championshipDayTableCounts(assignments, tableCount);
  const invalidTableIndex = tableCounts.findIndex((count) => count !== 4);

  if (invalidTableIndex >= 0) {
    return {
      valid: false,
      message: `Table ${String.fromCharCode(65 + invalidTableIndex)} must have exactly 4 players.`,
      tableCounts
    };
  }

  return {
    valid: true,
    message: "",
    tableCounts
  };
}

function firstDuplicateChampionshipDayPlayerName(names) {
  const seen = new Map();

  for (const name of names) {
    const normalized = name.trim().replace(/\s+/g, " ").toLocaleLowerCase();

    if (seen.has(normalized)) {
      return name;
    }

    seen.set(normalized, name);
  }

  return null;
}

function orderedChampionshipDayPlayers(assignments, tableCount) {
  return Array.from({ length: tableCount }, (_, tableIndex) => (
    assignments.filter((player) => player.tableIndex === tableIndex)
  )).flat();
}

function championshipDayTableCounts(assignments, tableCount) {
  return Array.from({ length: tableCount }, (_, tableIndex) => (
    assignments.filter((player) => player.name.trim() && player.tableIndex === tableIndex).length
  ));
}

function renderChampionshipDayPlayerAssignmentWarnings(validation) {
  updateChampionshipDayPlayerBuilderCounts(validation.tableCounts);
}

function syncChampionshipDayPlayerBuilder() {
  syncChampionshipDayPlayersTextarea();
  updateChampionshipDayPlayerBuilderCounts();
}

function syncChampionshipDayPlayersTextarea() {
  if (!els.championshipDayPlayersInput) {
    return;
  }

  els.championshipDayPlayersInput.value = readChampionshipDayPlayerAssignments(Number(els.championshipDayTableCountInput.value))
    .map((player) => player.name || `Player ${player.displayIndex}`)
    .join("\n");
}

function updateChampionshipDayPlayerBuilderCounts(counts = null) {
  const tableCount = Number(els.championshipDayTableCountInput?.value || 2);
  const tableCounts = counts ?? championshipDayTableCounts(readChampionshipDayPlayerAssignments(tableCount), tableCount);

  tableCounts.forEach((count, tableIndex) => {
    const label = els.championshipDayPlayersGrid?.querySelector(`[data-builder-table-count="${tableIndex}"]`);
    const card = els.championshipDayPlayersGrid?.querySelector(`[data-builder-table="${tableIndex}"]`);

    if (label) {
      label.textContent = `${count}/4`;
    }

    card?.classList.toggle("is-warning", count !== 4);
    card?.querySelector(`[data-builder-table-warning="${tableIndex}"]`)?.classList.toggle("hidden", count === 4);
  });
}

function clampTableIndex(value, tableCount) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.max(0, Math.min(tableCount - 1, number));
}

function readAdminProfilePicture() {
  const file = els.adminUserProfilePicture.files?.[0];

  if (!file) {
    state.adminProfilePictureDataUrl = "";
    return;
  }

  if (!file.type.startsWith("image/") || file.size > 180_000) {
    els.adminUserProfilePicture.value = "";
    state.adminProfilePictureDataUrl = "";
    showToast("Use an image under 180 KB");
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    state.adminProfilePictureDataUrl = String(reader.result ?? "");
  });
  reader.readAsDataURL(file);
}

function localDateTimeValue(date) {
  const pad = (value) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateTime(value) {
  const numeric = Number(value);
  const date = Number.isFinite(numeric) && String(value).trim() !== ""
    ? new Date(numeric)
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "not set";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
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

function championshipDayIdFromPath() {
  const match = window.location.pathname.match(/^\/admin\/([^/]+)/);

  if (!match || match[1] === "") {
    return null;
  }

  return decodeURIComponent(match[1]);
}

function isAdminPath() {
  return window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/");
}

function championshipDayDateSlug(date) {
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const day = safeDate.getDate();
  const month = String(safeDate.getMonth() + 1).padStart(2, "0");

  return `${day}${month}${safeDate.getFullYear()}`;
}

function uniqueChampionshipDayId(date) {
  const base = `new-championship-${championshipDayDateSlug(date)}`;
  const existingIds = new Set((state.portalData?.championshipDaySessions ?? []).map((session) => session.id));

  if (!existingIds.has(base)) {
    return base;
  }

  for (let index = 2; index < 100; index += 1) {
    const candidate = `${base}-${index}`;

    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }

  return `${base}-${Date.now()}`;
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

function avatarHtml(avatarId, className = "", extraStyle = "") {
  const avatar = playerAvatar(avatarId);

  return `
    <span class="${className}" style="background: ${avatar.color}; ${escapeHtml(extraStyle)}" title="${escapeHtml(avatar.label)}">
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

    navigator.serviceWorker.register("/sw.js?v=78").catch(() => {});
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

function cssEscape(value) {
  if (window.CSS?.escape) {
    return window.CSS.escape(String(value));
  }

  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
