import { HTMLRenderer } from '../../render/htmlRenderer.js';
import { Analyzer } from '../analyzer.js';
import { dateUtils } from '../../utils/dateUtils.js';
import { kvKeys } from '../../infrastructure/kv/keyFactory.js';

export async function generateArchiveStaticHTML(env) {
  const kv = env["lol-stats-kv"];
  try {
    const allKeys = await kv.list({ prefix: kvKeys.ARCHIVE_PREFIX });
    const dataKeys = allKeys.keys.filter(key => key.name !== kvKeys.archiveStatic());

    if (!dataKeys.length) {
      return HTMLRenderer.renderPageShell("LoL Archive", `<div class="arch-content arch-empty-msg">No archive data available.</div>`, "archive", env.GITHUB_TIME, env.GITHUB_SHA);
    }

    const rawSnapshots = await Promise.all(dataKeys.map(key => env["lol-stats-kv"].get(key.name, { type: "json" })));
    let validSnapshots = rawSnapshots.filter(snapshot => {
      const snapshotTournament = snapshot?.tournament;
      return Boolean(snapshot && snapshotTournament && snapshotTournament.slug);
    });

    validSnapshots = dateUtils
      .sortTournamentsByDate(validSnapshots.map(snapshot => {
        const snapshotTournament = snapshot.tournament;
        return { ...snapshotTournament, __snapshot: snapshot };
      }))
      .map(tournament => tournament.__snapshot);

    const combined = validSnapshots.map(snap => {
      const snapshotTournament = snap.tournament;
      const tournamentWithMap = { ...snapshotTournament, teamMap: snap.teamMap || {} };
      const miniConfig = { TOURNAMENTS: [tournamentWithMap] };
      const analysis = Analyzer.runFullAnalysis({ [snapshotTournament.slug]: snap.rawMatches || [] }, miniConfig);
      const statsObj = analysis.globalStats[snapshotTournament.slug] || {};
      const timeObj = analysis.timeGrid[snapshotTournament.slug] || {};
      const content = HTMLRenderer.renderContentOnly(
        { [snapshotTournament.slug]: statsObj },
        { [snapshotTournament.slug]: timeObj },
        {}, miniConfig, true
      );
      return content;
    }).join("");

    return HTMLRenderer.renderPageShell("LoL Archive", `<div class="arch-content">${combined}</div>`, "archive", env.GITHUB_TIME, env.GITHUB_SHA);
  } catch (error) {
    return HTMLRenderer.renderPageShell("LoL Archive Error", `<div class="arch-error-msg">Error generating archive: ${error.message}</div>`, "archive", env.GITHUB_TIME, env.GITHUB_SHA);
  }
}