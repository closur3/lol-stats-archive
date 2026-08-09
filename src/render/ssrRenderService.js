import { renderArchiveContentFragment, renderContentFragment } from './templates/content.js';
import { renderPageShell } from './templates/page.js';
import { readTournamentConfig } from '../core/facts/tournamentConfigReader.js';
import { readActiveSnapshots, readAvailableActiveSnapshots } from '../core/updater/activeSnapshotReader.js';
import { readAvailableArchiveSnapshots } from '../core/updater/archiveSnapshotReader.js';
import { buildActiveRenderInput, readScheduleSessionsMap } from '../core/updater/activeRenderInputBuilder.js';
import { readCronInfo } from '../core/scheduler/cronInfo.js';
import { buildModalHistory } from './modalHistoryBuilder.js';
import { throwIfArtifactsUnavailable } from '../core/updater/artifactAvailability.js';
import { selectActiveSchedulesByTournament } from '../core/projection/activeScheduleSelector.js';

export async function renderActiveFromFacts(env) {
  const { active: tournaments, archive: archiveTournaments } = await readTournamentConfig(env);
  const [activeSnapshots, archiveResult] = await Promise.all([
    readActiveSnapshots(env, tournaments),
    readAvailableArchiveSnapshots(env, archiveTournaments)
  ]);
  const archiveSnapshots = archiveResult.snapshots;
  if (archiveResult.issues.length > 0) {
    console.error(`[ACTIVE:ARCHIVE] unavailable=${archiveResult.issues.map(issue => issue.artifactKey).join(",")}`);
  }

  const orderedTournaments = tournaments;
  const scheduleSessionsMap = await readScheduleSessionsMap(env, orderedTournaments);
  const renderInput = buildActiveRenderInput(activeSnapshots, orderedTournaments);
  const schedulesByTournament = selectActiveSchedulesByTournament(
    scheduleSessionsMap,
    orderedTournaments,
    new Date()
  );
  const scheduleSessionsByName = Object.fromEntries(Array.from(scheduleSessionsMap, ([tournamentName, value]) => [tournamentName, { sessions: value.sessions }]));
  const modalHistory = buildModalHistory(activeSnapshots, archiveSnapshots, [...tournaments, ...archiveTournaments], tournaments, scheduleSessionsMap);

  const activeFragment = renderContentFragment(
    renderInput.statisticsByName,
    renderInput.timeDistributionByName,
    schedulesByTournament,
    renderInput.tournaments,
    false,
    scheduleSessionsByName,
    modalHistory
  );

  const cronInfo = await readCronInfo(env);
  return renderPageShell("LoL Stats", activeFragment, "active", env.GITHUB_TIME, env.GITHUB_SHA, cronInfo);
}

export async function renderArchiveFromFacts(env) {
  const { active: activeTournaments, archive: tournaments } = await readTournamentConfig(env);

  if (!tournaments.length) {
    const cronInfo = await readCronInfo(env);
    return renderPageShell("Archive", `<div class="arch-content arch-empty-msg">No archive data available</div>`, "archive", env.GITHUB_TIME, env.GITHUB_SHA, cronInfo);
  }

  const [archiveResult, activeResult] = await Promise.all([
    readAvailableArchiveSnapshots(env, tournaments),
    readAvailableActiveSnapshots(env, activeTournaments)
  ]);
  const archiveSnapshots = archiveResult.snapshots;
  const unavailable = [...archiveResult.issues, ...activeResult.issues];
  if (unavailable.length > 0) {
    console.error(`[ARCHIVE:READ] unavailable=${unavailable.map(issue => issue.artifactKey).join(",")}`);
  }
  if (archiveSnapshots.length === 0) {
    throwIfArtifactsUnavailable("ArchiveSnapshot", archiveResult.issues);
    throw new Error("ArchiveSnapshot unavailable without schema issues");
  }
  const availableNames = new Set(archiveSnapshots.map(snapshot => snapshot.tournamentName));
  const availableTournaments = tournaments.filter(tournament => availableNames.has(tournament.name));
  const modalHistory = buildModalHistory(activeResult.activeSnapshots, archiveSnapshots, [...activeTournaments, ...tournaments], [], new Map());

  const statisticsByName = {};
  const timeDistributionByName = {};
  for (const snapshot of archiveSnapshots) {
    statisticsByName[snapshot.tournamentName] = snapshot.statistics;
    timeDistributionByName[snapshot.tournamentName] = snapshot.timeDistribution;
  }
  const combined = renderArchiveContentFragment(statisticsByName, timeDistributionByName, availableTournaments, modalHistory);

  const cronInfo = await readCronInfo(env);
  return renderPageShell("Archive", `<div class="arch-content">${combined}</div>`, "archive", env.GITHUB_TIME, env.GITHUB_SHA, cronInfo);
}
