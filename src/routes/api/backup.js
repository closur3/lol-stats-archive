import { readArchiveIndex } from "../../core/updater/archiveIndex.js";
import { kvKeys } from "../../infrastructure/kv/keyFactory.js";
import { requireAdmin } from "./auth.js";

function assertBaseStatsSnapshot(snapshot, key, prefix) {
  const slug = key.slice(prefix.length);
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error(`Invalid snapshot: ${key}`);
  }
  if (!snapshot.tournament || snapshot.tournament.slug !== slug) {
    throw new Error(`Invalid snapshot tournament: ${key}`);
  }
  if (!Array.isArray(snapshot.rawMatches)) {
    throw new Error(`Invalid snapshot rawMatches: ${key}`);
  }
  if (!snapshot.stats || typeof snapshot.stats !== "object" || Array.isArray(snapshot.stats)) {
    throw new Error(`Invalid snapshot stats: ${key}`);
  }
  if (!snapshot.timeGrid || typeof snapshot.timeGrid !== "object" || Array.isArray(snapshot.timeGrid)) {
    throw new Error(`Invalid snapshot timeGrid: ${key}`);
  }
  if (!snapshot.teamMap || typeof snapshot.teamMap !== "object" || Array.isArray(snapshot.teamMap)) {
    throw new Error(`Invalid snapshot teamMap: ${key}`);
  }
  return slug;
}

function assertHomeSnapshot(snapshot, key) {
  const slug = assertBaseStatsSnapshot(snapshot, key, kvKeys.HOME_PREFIX);
  if (!snapshot.scheduleMap || typeof snapshot.scheduleMap !== "object" || Array.isArray(snapshot.scheduleMap)) {
    throw new Error(`Invalid HOME scheduleMap: ${key}`);
  }
  return slug;
}

function assertArchiveSnapshot(snapshot, key) {
  return assertBaseStatsSnapshot(snapshot, key, kvKeys.ARCHIVE_PREFIX);
}

async function dumpSnapshotPrefix(kv, prefix, excludedKey, assertSnapshot) {
  const allKeys = await kv.list({ prefix });
  const dataKeys = allKeys.keys
    .map(key => key.name)
    .filter(keyName => keyName !== excludedKey)
    .sort();
  const entries = await Promise.all(dataKeys.map(async key => {
    const snapshot = await kv.get(key, { type: "json" });
    const slug = assertSnapshot(snapshot, key);
    return [slug, snapshot];
  }));
  return Object.fromEntries(entries);
}

export async function handleBackup(request, env) {
  const unauthorized = requireAdmin(request, env);
  if (unauthorized) return unauthorized;

  const kv = env["lol-stats-kv"];
  const [home, archive, configArchive] = await Promise.all([
    dumpSnapshotPrefix(kv, kvKeys.HOME_PREFIX, kvKeys.homeStatic(), assertHomeSnapshot),
    dumpSnapshotPrefix(kv, kvKeys.ARCHIVE_PREFIX, kvKeys.archiveStatic(), assertArchiveSnapshot),
    readArchiveIndex(env)
  ]);

  return new Response(JSON.stringify({ home, archive, configArchive }), {
    headers: { "content-type": "application/json" }
  });
}
