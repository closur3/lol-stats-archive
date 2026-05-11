import { HTMLRenderer } from '../../render/htmlRenderer.js';
import { dateUtils } from '../../utils/dateUtils.js';
import { kvKeys } from '../../infrastructure/kv/keyFactory.js';

export async function generateArchiveStaticHTML(env) {
  const kv = env["lol-stats-kv"];
  const allKeys = await kv.list({ prefix: kvKeys.ARCHIVE_PREFIX });
  const dataKeys = allKeys.keys.filter(key => key.name !== kvKeys.archiveStatic());

  if (!dataKeys.length) {
    return HTMLRenderer.renderPageShell("LoL Archive", `<div class="arch-content arch-empty-msg">No archive data available.</div>`, "archive", env.GITHUB_TIME, env.GITHUB_SHA);
  }

  const rawSnapshots = await Promise.all(dataKeys.map(key => env["lol-stats-kv"].get(key.name, { type: "json" })));
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
    const content = HTMLRenderer.renderContentOnly(
      { [snapshotTournament.slug]: snap.stats },
      { [snapshotTournament.slug]: snap.timeGrid },
      {}, miniConfig, true
    );
    return content;
  }).join("");

  return HTMLRenderer.renderPageShell("LoL Archive", `<div class="arch-content">${combined}</div>`, "archive", env.GITHUB_TIME, env.GITHUB_SHA);
}
