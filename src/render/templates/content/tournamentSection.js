import { getOverviewPageLabel, getOverviewPageNames } from '../../../utils/data/overviewPages.js';
import { sortTeams } from '../../../utils/data/teamSort.js';
import { escapeHtml, escapeUrl } from '../../../utils/htmlEscape.js';
import { resolveSchedulePhase } from '../../../core/scheduler/scheduleDay.js';
import { sortPolicy } from '../../../utils/sortPolicy.js';
import { summarizeFullRate } from '../../../core/analysis/fullRateSummary.js';
import { renderTeamRow } from '../../components/teamRow.js';
import { renderTimeTable } from '../../components/timeTable.js';
import { renderSchedulePhaseIcon } from '../../components/schedulePhaseIcon.js';
import { buildParticipantGroups } from '../../../core/projection/participantGroups.js';
import { renderScheduleSection } from './scheduleSection.js';

function renderTournamentSummary(stats) {
  const summary = summarizeFullRate(stats);
  const parts = summary.parts.map(part => `${part.label}: ${part.fullMatchCount}/${part.totalMatchCount} <span class="tournament-summary-rate">(${part.percentText})</span>`);
  return parts.length ? `<div class="tournament-summary">${parts.join('<span class="heading-meta-divider summary-sep" aria-hidden="true"></span>')}</div>` : "";
}

function readScheduleSessions(scheduleSessionsByName, tournamentName, isArchive) {
  if (isArchive) return null;
  const scheduleSessions = scheduleSessionsByName[tournamentName];
  if (!scheduleSessions || typeof scheduleSessions !== "object" || Array.isArray(scheduleSessions)) {
    throw new Error(`scheduleSessionsByName missing: ${tournamentName}`);
  }
  return scheduleSessions;
}

function buildSortMeta(stats) {
  return {
    bo3PriorMean: sortPolicy.getBestOfPriorMean(stats, 3),
    bo5PriorMean: sortPolicy.getBestOfPriorMean(stats, 5),
    comebackPriorMean: sortPolicy.getRatePriorMean(stats, "comebackCount", "seriesTrailedCount"),
    lostLeadPriorMean: sortPolicy.getRatePriorMean(stats, "lostLeadCount", "seriesLedCount")
  };
}

function normalizeId(value) {
  return String(value).replace(/[^A-Za-z0-9_-]/g, '_');
}

function renderStatisticsBody(tournament, section, scope, sectionIndex, isArchive) {
  const sortMeta = buildSortMeta(section.stats);
  const rows = section.stats
    .map(teamStats => renderTeamRow(teamStats, tournament.name, scope, sortMeta, Boolean(section.groupDisplay), isArchive))
    .join("");
  if (!section.groupDisplay) return `<tbody>${rows}</tbody>`;
  return `<tbody class="stats-group-body stats-group-color-${sectionIndex % 4}">${rows}</tbody>`;
}

function buildTournamentTable(tournament, sections, scope, tableSuffix, isArchive) {
  const tableId = `t_${normalizeId(tournament.name)}_${normalizeId(tableSuffix)}`;
  const bodies = sections
    .map((section, sectionIndex) => renderStatisticsBody(tournament, section, scope, sectionIndex, isArchive))
    .join("");
  const columnWidths = `<colgroup><col class="width-team"><col span="12" class="width-stat"><col class="width-streak"><col class="width-last"></colgroup>`;
  return `<table id="${tableId}" class="stats-table" data-sort-col="2" data-sort-dir-2="asc">${columnWidths}<thead><tr><th class="team-col" onclick="doSort(0, '${tableId}')">TEAM</th><th colspan="2" onclick="doSort(2, '${tableId}')">BO3 FULLRATE</th><th colspan="2" onclick="doSort(4, '${tableId}')">BO5 FULLRATE</th><th colspan="2" onclick="doSort(5, '${tableId}')">SERIES</th><th colspan="2" onclick="doSort(7, '${tableId}')">GAMES</th><th colspan="2" onclick="doSort(10, '${tableId}')">COME BACK</th><th colspan="2" onclick="doSort(12, '${tableId}')">LOST LEAD</th><th class="col-streak" onclick="doSort(13, '${tableId}')">STREAK</th><th class="col-last" onclick="doSort(14, '${tableId}')">LAST DATE</th></tr></thead>${bodies}</table>`;
}

function readStatisticsSections(tournament, page) {
  const visibleStats = sortTeams(page.stats);
  if (visibleStats.length === 0) return [];
  const groups = buildParticipantGroups(tournament, page.overviewPage, page.stats);
  if (groups.length === 0) {
    return [{ groupDisplay: null, stats: visibleStats }];
  }

  return groups.flatMap(group => {
    const groupTeams = new Set(group.teams);
    const groupStats = visibleStats.filter(teamStats => groupTeams.has(teamStats.name));
    return groupStats.length === 0
      ? []
      : [{ groupDisplay: group.groupDisplay, stats: groupStats }];
  });
}

function formatGroupDisplay(groupDisplay) {
  return groupDisplay.replace(/\bgroup\b/gi, "").replace(/\s+/g, " ").trim();
}

function renderGroupLegend(tournament, page) {
  const sections = readStatisticsSections(tournament, page).filter(section => section.groupDisplay);
  if (sections.length === 0) return "";
  const entries = sections.map((section, sectionIndex) => (
    `<span class="stats-group-legend-item stats-group-color-${sectionIndex % 4}"><span class="stats-group-legend-mark" aria-hidden="true"></span><span class="stats-group-legend-name">${escapeHtml(formatGroupDisplay(section.groupDisplay))}</span><span class="stats-group-legend-count" aria-label="${section.stats.length} teams">${section.stats.length}</span></span>`
  )).join("");
  return `<div class="stats-group-legend" aria-label="Participant groups">${entries}</div>`;
}

function renderStatisticsView(tournament, page, tablePrefix, statisticsScope = page.overviewPage, isArchive = false) {
  const sections = readStatisticsSections(tournament, page);
  return sections.length > 0
    ? buildTournamentTable(tournament, sections, statisticsScope, tablePrefix, isArchive)
    : `<div class="stats-view-empty">NO SCHEDULED TEAMS</div>`;
}

function renderExternalLinkIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`;
}

function assertStatistics(tournament, statistics) {
  const overviewPages = getOverviewPageNames(tournament.overviewPages);
  if (!statistics || typeof statistics !== "object" || Array.isArray(statistics)) {
    throw new Error(`statistics missing: ${tournament.name}`);
  }
  if (!statistics.combined || typeof statistics.combined !== "object" || Array.isArray(statistics.combined)) {
    throw new Error(`statistics.combined missing: ${tournament.name}`);
  }
  const expectedPageCount = overviewPages.length === 1 ? 0 : overviewPages.length;
  if (!Array.isArray(statistics.pages) || statistics.pages.length !== expectedPageCount) {
    throw new Error(`statistics.pages mismatch: ${tournament.name}`);
  }
  statistics.pages.forEach((page, index) => {
    if (
      !page
      || page.overviewPage !== overviewPages[index]
      || !page.stats
      || typeof page.stats !== "object"
      || Array.isArray(page.stats)
    ) {
      throw new Error(`statistics.pages[${index}] invalid: ${tournament.name}`);
    }
  });
}

function renderTournamentInfo(tournament) {
  const panelId = `tournament_info_${normalizeId(tournament.name)}`;
  const links = [...tournament.overviewPages].reverse().map(source => {
    const label = getOverviewPageLabel(source.overviewPage);
    const sourceDates = `<span class="tournament-info-source-meta">${escapeHtml(source.startDate)} → ${escapeHtml(source.endDate)}</span>`;
    return `<a class="tournament-info-source" href="${escapeUrl(`https://lol.fandom.com/wiki/${source.overviewPage}`)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation(); closeTournamentInfoPanels()"><span class="tournament-info-source-main"><span class="tournament-info-source-name">${escapeHtml(label)}</span><span class="tournament-info-source-side"><span class="tournament-info-source-count" aria-label="${source.participantCount} teams">${source.participantCount}</span>${renderExternalLinkIcon()}</span></span>${sourceDates}</a>`;
  }).join("");
  return `<span class="tournament-info"><button type="button" class="tournament-title-short tournament-info-trigger" aria-label="Tournament information" aria-haspopup="dialog" aria-expanded="false" aria-controls="${panelId}" onclick="event.stopPropagation(); toggleTournamentInfoPanel(this)">${escapeHtml(tournament.leagueShort)}</button><span id="${panelId}" class="tournament-info-panel" role="dialog" aria-label="${escapeHtml(tournament.name)} information" aria-hidden="true" onclick="event.stopPropagation()"><span class="tournament-info-header"><span class="tournament-info-name">${escapeHtml(tournament.name)}</span><span class="tournament-title-short tournament-info-league">${escapeHtml(tournament.leagueShort)}</span></span><span class="tournament-info-dates"><time datetime="${escapeHtml(tournament.startDate)}">${escapeHtml(tournament.startDate)}</time><span aria-hidden="true">→</span><time datetime="${escapeHtml(tournament.endDate)}">${escapeHtml(tournament.endDate)}</time></span><span class="tournament-info-source-section"><span class="tournament-info-label">FANDOM SOURCES</span><span class="tournament-info-sources">${links}</span></span></span></span>`;
}

function renderScopeSummary(scope, stats, isActive) {
  const hiddenClass = isActive ? "" : " is-hidden";
  return `<div class="statistics-scope-summary${hiddenClass}" data-statistics-scope-summary="${scope}" aria-hidden="${String(!isActive)}">${renderTournamentSummary(sortTeams(stats))}</div>`;
}

function renderScopeLegend(tournament, scope, page, isActive) {
  const hiddenClass = isActive ? "" : " is-hidden";
  return `<div class="statistics-scope-legend${hiddenClass}" data-statistics-scope-legend="${scope}" aria-hidden="${String(!isActive)}">${page ? renderGroupLegend(tournament, page) : ""}</div>`;
}

function renderScopeContent(scope, content, isActive) {
  const hiddenClass = isActive ? "" : " is-hidden";
  return `<div class="statistics-scope-content${hiddenClass}" data-statistics-scope-content="${scope}" aria-hidden="${String(!isActive)}">${content}</div>`;
}

function renderScopeSchedule(scope, schedule, isActive) {
  const hiddenClass = isActive ? "" : " is-hidden";
  return `<div class="statistics-scope-schedule${hiddenClass}" data-statistics-scope-schedule="${scope}" aria-hidden="${String(!isActive)}">${schedule}</div>`;
}

function renderScopeSelect(scopes, defaultScope) {
  const options = scopes.map(scope => {
    const isSelected = scope === defaultScope;
    return `<button type="button" class="compact-menu-option${isSelected ? " is-selected" : ""}" role="option" aria-selected="${String(isSelected)}" data-statistics-scope-value="${escapeHtml(scope.key)}" data-statistics-scope-label="${escapeHtml(scope.label)}" onclick="event.stopPropagation(); setStatisticsScope(this)">${escapeHtml(scope.label)}</button>`;
  }).join("");
  return `<div class="statistics-scope-select compact-menu" data-statistics-scope-select><button type="button" class="statistics-scope-trigger compact-menu-trigger" aria-label="Statistics scope" aria-expanded="false" onclick="event.stopPropagation(); toggleCompactMenu(this)"><span class="compact-menu-value">${escapeHtml(defaultScope.label)}</span></button><div class="statistics-scope-menu compact-menu-popup" role="listbox" aria-hidden="true">${options}</div></div>`;
}

function readSchedules(tournament, schedules, isArchive) {
  if (isArchive) return new Map();
  if (!Array.isArray(schedules) || schedules.length !== tournament.overviewPages.length) {
    throw new Error(`schedules mismatch: ${tournament.name}`);
  }
  return new Map(schedules.map((schedule, index) => {
    const overviewPage = tournament.overviewPages[index].overviewPage;
    if (
      !schedule
      || schedule.overviewPage !== overviewPage
      || !["past", "current", "future"].includes(schedule.status)
      || !Array.isArray(schedule.sessions)
    ) {
      throw new Error(`schedules[${index}] invalid: ${tournament.name}`);
    }
    return [overviewPage, schedule];
  }));
}

function hasDisplayableSchedule(schedule) {
  return schedule.sessions.some(session => session.matches.some(match => (
    match.team1Name !== "TBD" || match.team2Name !== "TBD"
  )));
}

function hasReachedDefaultScopeProgress(schedule) {
  const matches = schedule.sessions.flatMap(session => session.matches);
  if (matches.length === 0) return false;
  const completedCount = matches.filter(match => match.isFinished).length;
  return completedCount * 10 >= matches.length * 3;
}

function selectDefaultScope(scopes, schedulesByOverviewPage, isArchive) {
  const overallScope = scopes[0];
  if (isArchive) return overallScope;
  const currentSchedules = [...schedulesByOverviewPage.values()].filter(schedule => schedule.status === "current");
  if (currentSchedules.length !== 1 || !hasReachedDefaultScopeProgress(currentSchedules[0])) return overallScope;
  const currentScope = scopes.find(scope => scope.page?.overviewPage === currentSchedules[0].overviewPage);
  if (!currentScope) throw new Error(`Current statistics scope missing: ${currentSchedules[0].overviewPage}`);
  return currentScope;
}

function renderScheduleForScope(schedule, combinedStatsByName) {
  if (!schedule || !hasDisplayableSchedule(schedule)) return "";
  return renderScheduleSection(schedule, combinedStatsByName);
}

function selectOverallSchedule(schedules) {
  return schedules.find(schedule => schedule.status === "current")
    || schedules.find(schedule => schedule.status === "future");
}

function renderStatistics(tournament, statistics, timeTables, schedules, isArchive) {
  assertStatistics(tournament, statistics);
  const schedulesByOverviewPage = readSchedules(tournament, schedules, isArchive);
  const combinedStatsByName = { [tournament.name]: statistics.combined };
  const overviewPages = getOverviewPageNames(tournament.overviewPages);
  if (overviewPages.length === 1) {
    const page = { overviewPage: overviewPages[0], stats: statistics.combined };
    return {
      content: `${renderStatisticsView(tournament, page, "single", "combined", isArchive)}${timeTables.combined}`,
      schedule: isArchive ? "" : renderScheduleForScope(selectOverallSchedule(schedules), combinedStatsByName),
      summary: renderTournamentSummary(sortTeams(statistics.combined)),
      legend: renderGroupLegend(tournament, page),
      select: "",
      hasScopes: false
    };
  }

  const combined = renderStatisticsView(
    tournament,
    { overviewPage: "combined", stats: statistics.combined },
    "combined",
    undefined,
    isArchive
  );
  const scopes = [
    {
      key: "overall",
      label: "Overall",
      stats: statistics.combined,
      page: null,
      content: `${combined}${timeTables.combined}`,
      schedule: isArchive ? "" : renderScheduleForScope(selectOverallSchedule(schedules), combinedStatsByName)
    },
    ...statistics.pages
      .map((page, index) => ({ page, index }))
      .filter(({ page }) => {
        if (sortTeams(page.stats).length > 0) return true;
        return !isArchive && hasDisplayableSchedule(schedulesByOverviewPage.get(page.overviewPage));
      })
      .reverse()
      .map(({ page, index }) => ({
      key: `page-${index}`,
      label: getOverviewPageLabel(page.overviewPage),
      stats: page.stats,
      page,
      content: `${renderStatisticsView(tournament, page, `p${index}`, undefined, isArchive)}${timeTables.pages.get(page.overviewPage)}`,
      schedule: isArchive ? "" : renderScheduleForScope(schedulesByOverviewPage.get(page.overviewPage), combinedStatsByName)
      }))
  ];
  const defaultScope = selectDefaultScope(scopes, schedulesByOverviewPage, isArchive);
  const summaries = scopes.map(scope => renderScopeSummary(scope.key, scope.stats, scope === defaultScope)).join("");
  const legends = scopes.map(scope => renderScopeLegend(tournament, scope.key, scope.page, scope === defaultScope)).join("");
  const contents = scopes.map(scope => renderScopeContent(scope.key, scope.content, scope === defaultScope)).join("");
  const scheduleContents = isArchive ? "" : scopes.map(scope => renderScopeSchedule(scope.key, scope.schedule, scope === defaultScope)).join("");
  return {
    content: contents,
    schedule: scheduleContents,
    summary: summaries,
    legend: legends,
    select: renderScopeSelect(scopes, defaultScope),
    hasScopes: true,
    defaultScope: defaultScope.key
  };
}

export function renderTournamentSection(tournament, statisticsByName, timeDistributionByName, schedules, scheduleSessionsByName, isArchive) {
  const overviewPages = getOverviewPageNames(tournament.overviewPages);
  const scheduleSessions = readScheduleSessions(scheduleSessionsByName, tournament.name, isArchive);
  const statistics = statisticsByName[tournament.name];
  assertStatistics(tournament, statistics);
  const timeDistribution = timeDistributionByName[tournament.name];
  if (!Array.isArray(timeDistribution)) {
    throw new Error(`timeDistribution missing: ${tournament.name}`);
  }
  const artifactKey = `${isArchive ? "ArchiveSnapshot" : "ActiveSnapshot"}_${tournament.name}`;
  const timeTables = {
    combined: renderTimeTable(timeDistribution, artifactKey),
    pages: new Map(overviewPages.map(overviewPage => [
      overviewPage,
      renderTimeTable(
        timeDistribution.filter(match => match.overviewPage === overviewPage),
        `${artifactKey}_${normalizeId(overviewPage)}`
      )
    ]))
  };
  const statisticsLayout = renderStatistics(tournament, statistics, timeTables, schedules, isArchive);

  const phaseIcon = isArchive ? "" : renderSchedulePhaseIcon(resolveSchedulePhase(scheduleSessions));
  const titleText = `<span class="tournament-title-text">${escapeHtml(tournament.name)}</span>`;
  const tournamentInfo = renderTournamentInfo(tournament);
  const hasHeadingDetails = Boolean(statisticsLayout.select || statisticsLayout.legend);
  const divider = hasHeadingDetails ? `<span class="heading-meta-divider statistics-heading-divider" aria-hidden="true"></span>` : "";
  const scopeClass = statisticsLayout.select ? " has-scope-select" : "";
  const headerStatistics = `<div class="statistics-heading-meta${scopeClass}">${statisticsLayout.summary}${divider}${statisticsLayout.select}${statisticsLayout.legend}</div>`;
  const headerRight = `<div class="title-right-area">${headerStatistics}</div>`;
  const scheduleBody = statisticsLayout.schedule ? `<div class="schedule-root">${statisticsLayout.schedule}</div>` : "";
  const sectionBody = `<div class="wrapper">${statisticsLayout.content}</div>`;
  const statisticsRoot = statisticsLayout.hasScopes
    ? ` id="statistics_${normalizeId(tournament.name)}" data-statistics-scope="${escapeHtml(statisticsLayout.defaultScope)}"`
    : "";
  const rootClass = statisticsLayout.hasScopes ? "tournament-block statistics-root" : "tournament-block";
  const tableSection = `<section class="active-sec" aria-label="${escapeHtml(tournament.name)}"><div class="table-title"><div class="tournament-title-row">${phaseIcon}${tournamentInfo}${titleText}</div>${headerRight}</div>${sectionBody}</section>`;
  return `<div class="${rootClass}"${statisticsRoot}>${tableSection}${scheduleBody}</div>`;
}
