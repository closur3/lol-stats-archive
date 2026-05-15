import { HTMLRenderer } from './htmlRenderer.js';
import { dateUtils } from '../utils/dateUtils.js';
import { readHomeEntries } from '../core/updater/homeSnapshotReader.js';
import { loadScheduleMetaBySlug, buildStaticRenderInput, pruneStaticSchedule } from '../core/updater/staticRenderInput.js';
import { kvKeys } from '../infrastructure/kv/keyFactory.js';

export async function renderHomeFromFacts(env) {
  const homeEntries = await readHomeEntries(env);

  if (homeEntries.length === 0) {
    return HTMLRenderer.renderPageShell("LoL Stats", `<div class="arch-content arch-empty-msg">No active data available</div>`, "home", env.GITHUB_TIME, env.GITHUB_SHA);
  }

  const sortedTournaments = dateUtils.sortTournamentsByDate(homeEntries.map(home => home.tournament));
  const scheduleMetaBySlug = await loadScheduleMetaBySlug(env, sortedTournaments);
  const renderInput = buildStaticRenderInput(homeEntries, sortedTournaments, scheduleMetaBySlug);
  const limitedScheduleMap = pruneStaticSchedule(renderInput.scheduleMap, renderInput.tournamentMeta);

  const homeFragment = HTMLRenderer.renderContentOnly(
    renderInput.globalStats,
    renderInput.timeGrid,
    limitedScheduleMap,
    renderInput.runtimeConfig,
    false,
    renderInput.tournamentMeta
  );

  return HTMLRenderer.renderPageShell("LoL Stats", homeFragment, "home", env.GITHUB_TIME, env.GITHUB_SHA);
}

export async function renderArchiveFromFacts(env) {
  const kv = env["lol-stats-kv"];
  const allKeys = await kv.list({ prefix: kvKeys.ARCHIVE_PREFIX });
  const dataKeys = allKeys.keys;

  if (!dataKeys.length) {
    return HTMLRenderer.renderPageShell("Archive", `<div class="arch-content arch-empty-msg">No archive data available</div>`, "archive", env.GITHUB_TIME, env.GITHUB_SHA);
  }

  const rawSnapshots = await Promise.all(dataKeys.map(key => kv.get(key.name, { type: "json" })));
  let validSnapshots = rawSnapshots.map((snapshot, index) => {
    const snapshotTournament = snapshot?.tournament;
    if (!snapshot || !snapshotTournament || !snapshotTournament.slug) {
      throw new Error(`Invalid archive snapshot: ${dataKeys[index].name}`);
    }
    if (!Array.isArray(snapshot.rawMatches)) {
      throw new Error(`Invalid archive rawMatches: ${dataKeys[index].name}`);
    }
    if (!snapshot.stats || typeof snapshot.stats !== "object" || Array.isArray(snapshot.stats)) {
      throw new Error(`Invalid archive stats: ${dataKeys[index].name}`);
    }
    if (!snapshot.timeGrid || typeof snapshot.timeGrid !== "object" || Array.isArray(snapshot.timeGrid)) {
      throw new Error(`Invalid archive timeGrid: ${dataKeys[index].name}`);
    }
    if (!snapshot.teamMap || typeof snapshot.teamMap !== "object" || Array.isArray(snapshot.teamMap)) {
      throw new Error(`Invalid archive teamMap: ${dataKeys[index].name}`);
    }
    return snapshot;
  });

  validSnapshots = dateUtils
    .sortTournamentsByDate(validSnapshots.map(snapshot => {
      const snapshotTournament = snapshot.tournament;
      return { ...snapshotTournament, __snapshot: snapshot };
    }))
    .map(tournament => tournament.__snapshot);

  const combined = validSnapshots.map(snap => {
    const snapshotTournament = snap.tournament;
    const miniConfig = { TOURNAMENTS: [{ ...snapshotTournament, teamMap: snap.teamMap }] };
    const content = HTMLRenderer.renderArchiveContentOnly(
      { [snapshotTournament.slug]: snap.stats },
      { [snapshotTournament.slug]: snap.timeGrid },
      miniConfig
    );
    return content;
  }).join("");

  return HTMLRenderer.renderPageShell("Archive", `<div class="arch-content">${combined}</div>`, "archive", env.GITHUB_TIME, env.GITHUB_SHA);
}
