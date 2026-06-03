const SOUND_PREFERENCE_KEY = "dominoes-sound-enabled";
const TILE_SOUND_SRC = "/audio/domino-tile.wav?v=53";
const SLAM_SOUND_SRC = "/audio/domino-slam.wav?v=53";

export function loadAudioPreference(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(SOUND_PREFERENCE_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveAudioPreference(enabled, storage = globalThis.localStorage) {
  try {
    storage?.setItem(SOUND_PREFERENCE_KEY, enabled ? "true" : "false");
  } catch {
    // Private browsing and hardened browsers can reject localStorage writes.
  }
}

export function playTileSound(effect, options = {}) {
  const {
    storage = globalThis.localStorage,
    AudioCtor = globalThis.Audio,
    tileSrc = TILE_SOUND_SRC,
    slamSrc = SLAM_SOUND_SRC
  } = options;

  if (!loadAudioPreference(storage) || typeof AudioCtor !== "function") {
    return false;
  }

  try {
    const isSlam = effect === "slam";
    const audio = new AudioCtor(isSlam ? slamSrc : tileSrc);

    audio.preload = "auto";
    audio.volume = isSlam ? 0.74 : 0.46;

    const playback = audio.play?.();

    if (playback?.catch) {
      playback.catch(() => {});
    }

    return true;
  } catch {
    return false;
  }
}
