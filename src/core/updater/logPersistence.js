import { kvKeys } from "../../infrastructure/kv/keyFactory.js";
import { UPDATE_CONFIG } from "./types.js";

async function readExistingLogEntries(kv, logKey) {
  const logs = await kv.get(logKey, { type: "json" });
  if (logs == null) return [];
  if (!Array.isArray(logs)) throw new Error(`LOG must be an array: ${logKey}`);
  return logs;
}

export async function appendLeagueLogs(env, leagueLogEntries) {
  if (!leagueLogEntries || typeof leagueLogEntries !== "object" || Array.isArray(leagueLogEntries)) {
    throw new Error("leagueLogEntries must be a JSON object");
  }
  const kv = env["lol-stats-kv"];
  await Promise.all(Object.entries(leagueLogEntries).map(async ([slug, entry]) => {
    if (!slug) throw new Error("LOG slug missing");
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`LOG entry must be a JSON object: ${slug}`);
    }
    const logKey = kvKeys.log(slug);
    const oldLogs = await readExistingLogEntries(kv, logKey);
    const nextLogs = [entry, ...oldLogs].slice(0, UPDATE_CONFIG.MAX_LOG_ENTRIES);
    await env["lol-stats-kv"].put(logKey, JSON.stringify(nextLogs));
  }));
}
