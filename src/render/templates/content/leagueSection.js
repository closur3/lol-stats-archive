import { dataUtils } from '../../../utils/dataUtils.js';
import { escapeHtml, escapeUrl } from '../../../utils/htmlEscape.js';
import { resolveHomeEmojiByPhase } from '../../../utils/leagueState.js';
import { sortPolicy } from '../../../utils/sortPolicy.js';
import { buildTeamRow } from '../../components/teamRow.js';
import { buildTimeTable } from '../../components/timeTable.js';

const STYLE_EMOJI = 'style="font-size: 16px; line-height: 1; display: block; transform: translateY(-1px);"';
const STYLE_TITLE_ROW = 'style="display:flex; align-items:center; gap: 6px;"';

function buildLeagueSummary(stats) {
  let bo3Full = 0, bo3Total = 0;
  let bo5Full = 0, bo5Total = 0;
  stats.forEach(teamStats => {
    bo3Full += teamStats.bestOf3FullMatchCount || 0;
    bo3Total += teamStats.bestOf3TotalMatchCount || 0;
    bo5Full += teamStats.bestOf5FullMatchCount || 0;
    bo5Total += teamStats.bestOf5TotalMatchCount || 0;
  });
  bo3Full /= 2;
  bo3Total /= 2;
  bo5Full /= 2;
  bo5Total /= 2;

  const hasNoData = bo3Total === 0 && bo5Total === 0;
  const parts = [];
  if (bo3Total > 0) parts.push(`BO3: ${bo3Full}/${bo3Total} <span style="opacity:0.7;font-weight:400;">(${dataUtils.pct(dataUtils.rate(bo3Full, bo3Total))})</span>`);
  if (bo5Total > 0) parts.push(`BO5: ${bo5Full}/${bo5Total} <span style="opacity:0.7;font-weight:400;">(${dataUtils.pct(dataUtils.rate(bo5Full, bo5Total))})</span>`);
  const html = parts.length ? `<div class="league-summary">${parts.join(" <span class='summary-sep'>|</span> ")}</div>` : "";
  return { html, hasNoData };
}

function readTournamentMeta(tournamentMeta, slug, isArchive) {
  if (isArchive) return null;
  const meta = tournamentMeta[slug];
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    throw new Error(`tournamentMeta missing: ${slug}`);
  }
  return meta;
}

function buildLeagueTable(tournament, stats, sortMeta) {
  const tableId = `t_${String(tournament.slug).replace(/[^A-Za-z0-9_-]/g, '_')}`;
  const rows = stats.map(teamStats => buildTeamRow(teamStats, tournament.slug, sortMeta)).join("");
  const tableBody = `<table id="${tableId}" data-sort-col="2" data-sort-dir-2="asc"><thead><tr><th class="team-col" onclick="doSort(0, '${tableId}')">TEAM</th><th colspan="2" onclick="doSort(2, '${tableId}')">BO3 FULLRATE</th><th colspan="2" onclick="doSort(4, '${tableId}')">BO5 FULLRATE</th><th colspan="2" onclick="doSort(5, '${tableId}')">SERIES</th><th colspan="2" onclick="doSort(7, '${tableId}')">GAMES</th><th class="col-streak" onclick="doSort(9, '${tableId}')">STREAK</th><th class="col-last" onclick="doSort(10, '${tableId}')">LAST DATE</th></tr></thead><tbody>${rows}</tbody></table>`;
  return tableBody;
}

export function renderLeagueSection(tournament, globalStats, timeData, tournamentMeta, isArchive) {
  const meta = readTournamentMeta(tournamentMeta, tournament.slug, isArchive);
  const rawStats = globalStats[tournament.slug];
  if (!rawStats || typeof rawStats !== "object" || Array.isArray(rawStats)) {
    throw new Error(`globalStats missing: ${tournament.slug}`);
  }
  const leagueTimeData = timeData[tournament.slug];
  if (!leagueTimeData || typeof leagueTimeData !== "object" || Array.isArray(leagueTimeData)) {
    throw new Error(`timeData missing: ${tournament.slug}`);
  }
  const stats = dataUtils.sortTeams(rawStats);
  const sortMeta = {
    bo3PriorMean: sortPolicy.getBestOfPriorMean(stats, 3),
    bo5PriorMean: sortPolicy.getBestOfPriorMean(stats, 5)
  };
  const summary = buildLeagueSummary(stats);
  const tableBody = buildLeagueTable(tournament, stats, sortMeta);
  const timeTableHtml = buildTimeTable(leagueTimeData);

  let emojiStr = "";
  if (!isArchive) {
    const displayEmoji = resolveHomeEmojiByPhase(meta);
    emojiStr = `<span ${STYLE_EMOJI}>${displayEmoji}</span>`;
  }
  const mainPage = dataUtils.getFirstOverviewPage(tournament.overview_page);
  const pageUrl = `https://lol.fandom.com/wiki/${mainPage}`;
  const titleText = `<span class="league-title-text">${escapeHtml(tournament.name)}</span>`;
  const jumpBtn = `<a class="league-jump-btn" href="${escapeUrl(pageUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open link"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg></a>`;
  const headerRight = `<div class="title-right-area" style="justify-content: flex-start;">${summary.html}</div>`;

  if (isArchive) {
    return `<details class="home-sec archive-sec"><summary class="table-title home-sum"><div ${STYLE_TITLE_ROW}><span class="home-indicator">❯</span>${titleText}${jumpBtn}</div> ${headerRight}</summary><div class="wrapper">${tableBody}${timeTableHtml}</div></details>`;
  }

  const isSleepCollapsed = resolveHomeEmojiByPhase(meta) === "🕊️";
  const openAttr = (isSleepCollapsed || summary.hasNoData) ? "" : " open";
  return `<details class="home-sec"${openAttr}><summary class="table-title home-sum"><div ${STYLE_TITLE_ROW}><span class="home-indicator">❯</span>${emojiStr}${titleText}${jumpBtn}</div> ${headerRight}</summary><div class="wrapper">${tableBody}${timeTableHtml}</div></details>`;
}
