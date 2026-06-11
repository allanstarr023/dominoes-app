import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export function createChampionshipDayStore(filePath) {
  let loaded = false;
  let cache = [];

  async function load() {
    if (loaded) {
      return cache;
    }

    try {
      cache = normalizeSessions(JSON.parse(await readFile(filePath, "utf8")));
    } catch {
      cache = [];
      await save(cache);
    }

    loaded = true;
    return cache;
  }

  async function save(sessions) {
    cache = normalizeSessions(sessions);
    loaded = true;
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  }

  return {
    async loadInto(map) {
      const sessions = await load();

      map.clear();
      for (const session of sessions) {
        map.set(session.id, session);
      }
    },

    async saveFrom(map) {
      await save([...map.values()]);
    }
  };
}

function normalizeSessions(value) {
  return Array.isArray(value) ? value.filter((session) => session && session.id) : [];
}
