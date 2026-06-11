import assert from "node:assert/strict";
import test from "node:test";

import {
  loadAudioPreference,
  playTileSound,
  saveAudioPreference
} from "../public/audio.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}

test("audio preference defaults to disabled and persists enabled state", () => {
  const storage = memoryStorage();

  assert.equal(loadAudioPreference(storage), false);

  saveAudioPreference(true, storage);
  assert.equal(loadAudioPreference(storage), true);

  saveAudioPreference(false, storage);
  assert.equal(loadAudioPreference(storage), false);
});

test("playTileSound does nothing while sound is disabled", () => {
  let constructed = false;

  class FakeAudio {
    constructor() {
      constructed = true;
    }
  }

  assert.equal(playTileSound("play", {
    storage: memoryStorage(),
    AudioCtor: FakeAudio
  }), false);
  assert.equal(constructed, false);
});

test("playTileSound uses tile and slam sources without throwing on blocked playback", () => {
  const storage = memoryStorage({ "dominoes-sound-enabled": "true" });
  const calls = [];

  class FakeAudio {
    constructor(src) {
      this.src = src;
      calls.push(this);
    }

    play() {
      return Promise.reject(new Error("blocked"));
    }
  }

  assert.equal(playTileSound(null, { storage, AudioCtor: FakeAudio }), true);
  assert.equal(calls[0].src, "/audio/domino-tile.wav?v=75");
  assert.equal(calls[0].volume, 0.46);

  assert.equal(playTileSound("slam", { storage, AudioCtor: FakeAudio }), true);
  assert.equal(calls[1].src, "/audio/domino-slam.wav?v=75");
  assert.equal(calls[1].volume, 0.74);
});
