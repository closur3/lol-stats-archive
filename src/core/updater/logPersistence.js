import { kvKeys } from "../../infrastructure/kv/keyFactory.js";
import { kvPut } from "../../utils/kvStore.js";
import { UPDATE_CONFIG } from "./types.js";

export async function appendLeagueLogs(env, leagueLogEntries = {}) {
  const kv = env["lol-stats-kv"];
  await Promise.all(Object.entries(leagueLogEntries).map(async ([slug, entry]) => {
    if (!slug || !entry) return;
    const logKey = kvKeys.log(slug);
    const oldLogs = await kv.get(logKey, { type: "json" }) || [];
    const nextLogs = [entry, ...oldLogs].slice(0, UPDATE_CONFIG.MAX_LOG_ENTRIES);
    await kvPut(env, logKey, JSON.stringify(nextLogs));
  }));
}
