import { renderTournamentSection } from './content/tournamentSection.js';
import { serializeForInlineScript } from '../../utils/htmlEscape.js';

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
}

function assertTournaments(tournaments) {
  if (!Array.isArray(tournaments)) {
    throw new Error("tournaments must be an array");
  }
}

export function renderContentFragment(statisticsByName, timeDistributionByName, schedulesByTournament, tournaments, isArchive = false, scheduleSessionsByName, modalHistory) {
  assertObject(statisticsByName, "statisticsByName");
  assertObject(timeDistributionByName, "timeDistributionByName");
  assertObject(schedulesByTournament, "schedulesByTournament");
  assertTournaments(tournaments);
  if (!Array.isArray(modalHistory)) throw new Error("modalHistory must be an array");
  if (!isArchive) {
    assertObject(scheduleSessionsByName, "scheduleSessionsByName");
  }

  const injectedData = `<script>window.tournamentStatistics = Object.assign(window.tournamentStatistics ?? {}, ${serializeForInlineScript(statisticsByName)});window.gModalHistory = ${serializeForInlineScript(modalHistory)};</script>`;
  const visibleTournaments = tournaments.filter(tournament => tournament?.name);
  const tablesHtml = visibleTournaments
    .map(tournament => renderTournamentSection(
      tournament,
      statisticsByName,
      timeDistributionByName,
      schedulesByTournament[tournament.name],
      scheduleSessionsByName,
      isArchive
    ))
    .join("");
  return `${tablesHtml} ${injectedData}`;
}

export function renderArchiveContentFragment(statisticsByName, timeDistributionByName, tournaments, modalHistory) {
  return renderContentFragment(statisticsByName, timeDistributionByName, {}, tournaments, true, null, modalHistory);
}
