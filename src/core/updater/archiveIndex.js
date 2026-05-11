import { kvKeys } from "../../infrastructure/kv/keyFactory.js";
import { dateUtils } from "../../utils/dateUtils.js";

function normalizeArchiveTournament(tournament) {
  if (!tournament || typeof tournament !== "object" || Array.isArray(tournament)) {
    throw new Error("Archive tournament must be object");
  }
  const slug = typeof tournament.slug === "string" ? tournament.slug.trim() : "";
  const name = typeof tournament.name === "string" ? tournament.name.trim() : "";
  const league = typeof tournament.league === "string" ? tournament.league.trim() : "";
  const startDate = typeof tournament.start_date === "string" ? tournament.start_date.trim() : "";
  const endDate = typeof tournament.end_date === "string" ? tournament.end_date.trim() : "";
  const overviewPage = Array.isArray(tournament.overview_page)
    ? tournament.overview_page.filter(page => typeof page === "string" && page.trim()).map(page => page.trim())
    : (typeof tournament.overview_page === "string" && tournament.overview_page.trim() ? [tournament.overview_page.trim()] : []);
  if (!slug || !name || !league || !startDate || !endDate || overviewPage.length === 0) {
    throw new Error(`Invalid archive tournament: ${slug || "(missing slug)"}`);
  }
  return { slug, name, league, overview_page: overviewPage, start_date: startDate, end_date: endDate };
}

function normalizeArchiveList(list) {
  if (!Array.isArray(list)) throw new Error("CONFIG_ARCHIVE must be array");
  const bySlug = new Map();
  for (const tournament of list) {
    const normalized = normalizeArchiveTournament(tournament);
    bySlug.set(normalized.slug, normalized);
  }
  return dateUtils.sortTournamentsByDate(Array.from(bySlug.values()));
}

async function readArchiveSnapshotTournaments(env) {
  const kv = env["lol-stats-kv"];
  const allKeys = await kv.list({ prefix: kvKeys.ARCHIVE_PREFIX });
  const dataKeys = allKeys.keys.filter(key => key.name !== kvKeys.archiveStatic());
  const snapshots = await Promise.all(dataKeys.map(key => kv.get(key.name, { type: "json" })));
  return snapshots.map((snapshot, index) => {
    if (!snapshot?.tournament) throw new Error(`Invalid archive snapshot: ${dataKeys[index].name}`);
    return snapshot.tournament;
  });
}

export async function loadArchiveConfig(env, githubClient) {
  const kv = env["lol-stats-kv"];
  const cached = await kv.get(kvKeys.configArchive(), { type: "json" });
  if (cached != null) return normalizeArchiveList(cached);

  const localTournaments = await readArchiveSnapshotTournaments(env);
  if (localTournaments.length > 0) return writeArchiveIndex(env, localTournaments);

  const archivedTournaments = await githubClient.fetchJson("config/archive.json");
  return normalizeArchiveList(archivedTournaments);
}

export async function readArchiveIndex(env) {
  const kv = env["lol-stats-kv"];
  const cached = await kv.get(kvKeys.configArchive(), { type: "json" });
  if (cached == null) throw new Error("CONFIG_ARCHIVE missing");
  return normalizeArchiveList(cached);
}

export async function writeArchiveIndex(env, archivedTournaments) {
  const kv = env["lol-stats-kv"];
  const normalized = normalizeArchiveList(archivedTournaments);
  await kv.put(kvKeys.configArchive(), JSON.stringify(normalized));
  return normalized;
}

export async function rebuildArchiveIndexFromSnapshots(env) {
  const localTournaments = await readArchiveSnapshotTournaments(env);
  return writeArchiveIndex(env, localTournaments);
}
