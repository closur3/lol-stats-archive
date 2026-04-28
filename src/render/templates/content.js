import { dataUtils } from '../../utils/dataUtils.js';
import { sortPolicy } from '../../utils/sortPolicy.js';
import { buildTeamRow } from '../components/teamRow.js';
import { buildTimeTable } from '../components/timeTable.js';
import { buildScheduleRow } from '../components/scheduleRow.js';

const STYLE_EMOJI = 'style="font-size: 16px; line-height: 1; display: block; transform: translateY(-1px);"';
const STYLE_TITLE_ROW = 'style="display:flex; align-items:center; gap: 6px;"';
const STYLE_SCH_HEADER = 'style="background:#f8fafc;color:#334155"';
const STYLE_SCH_COUNT = 'style="font-size:11px;opacity:0.6"';
const STYLE_SCH_GROUP_HEADER = 'style="background:#f8fafc"';
const STYLE_SCH_GROUP_ROW = 'style="width:100%; padding:0 10px; box-sizing:border-box"';
const STYLE_SCH_GROUP_NAME = 'style="font-weight:700"';
const STYLE_SCH_GROUP_BLOCK = 'style="font-weight:700; opacity:0.7"';
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function renderContentOnly(globalStats, timeData, scheduleMap, runtimeConfig, isArchive = false, tournamentMeta = {}) {
  globalStats = globalStats ?? {};
  timeData = timeData ?? {};
  scheduleMap = scheduleMap ?? {};

  const injectedData = `<script>window.g_stats = Object.assign(window.g_stats ?? {}, ${JSON.stringify(globalStats)});</script>`;

  let tablesHtml = "";

  runtimeConfig.TOURNAMENTS.forEach((tournament) => {
    if (!tournament || !tournament.slug) return;
    const rawStats = globalStats[tournament.slug] || {};
    const stats = dataUtils.sortTeams(rawStats);
    const sortMeta = {
      bo3PriorMean: sortPolicy.getBestOfPriorMean(stats, 3),
      bo5PriorMean: sortPolicy.getBestOfPriorMean(stats, 5)
    };
    const tableId = `t_${tournament.slug.replace(/-/g, '_')}`;

    let tournamentBestOf3FullMatchCount = 0, tournamentBestOf3TotalMatchCount = 0;
    let tournamentBestOf5FullMatchCount = 0, tournamentBestOf5TotalMatchCount = 0;
    stats.forEach(teamStats => {
      tournamentBestOf3FullMatchCount += teamStats.bestOf3FullMatchCount || 0;
      tournamentBestOf3TotalMatchCount += teamStats.bestOf3TotalMatchCount || 0;
      tournamentBestOf5FullMatchCount += teamStats.bestOf5FullMatchCount || 0;
      tournamentBestOf5TotalMatchCount += teamStats.bestOf5TotalMatchCount || 0;
    });
    tournamentBestOf3FullMatchCount /= 2;
    tournamentBestOf3TotalMatchCount /= 2;
    tournamentBestOf5FullMatchCount /= 2;
    tournamentBestOf5TotalMatchCount /= 2;

    const hasNoData = (tournamentBestOf3TotalMatchCount === 0 && tournamentBestOf5TotalMatchCount === 0);

    let leagueSummaryHtml = "";
    if (tournamentBestOf3TotalMatchCount > 0 || tournamentBestOf5TotalMatchCount > 0) {
      let parts = [];
      if (tournamentBestOf3TotalMatchCount > 0) parts.push(`BO3: ${tournamentBestOf3FullMatchCount}/${tournamentBestOf3TotalMatchCount} <span style="opacity:0.7;font-weight:400;">(${dataUtils.pct(dataUtils.rate(tournamentBestOf3FullMatchCount, tournamentBestOf3TotalMatchCount))})</span>`);
      if (tournamentBestOf5TotalMatchCount > 0) parts.push(`BO5: ${tournamentBestOf5FullMatchCount}/${tournamentBestOf5TotalMatchCount} <span style="opacity:0.7;font-weight:400;">(${dataUtils.pct(dataUtils.rate(tournamentBestOf5FullMatchCount, tournamentBestOf5TotalMatchCount))})</span>`);
      leagueSummaryHtml = `<div class="league-summary">${parts.join(" <span class='summary-sep'>|</span> ")}</div>`;
    }

    const mainPage = dataUtils.getFirstOverviewPage(tournament.overview_page);
    const rows = stats.map(teamStats => buildTeamRow(teamStats, tournament.slug, sortMeta)).join("");
    const tableBody = `<table id="${tableId}" data-sort-col="2" data-sort-dir-2="asc"><thead><tr><th class="team-col" onclick="doSort(0, '${tableId}')">TEAM</th><th colspan="2" onclick="doSort(2, '${tableId}')">BO3 FULLRATE</th><th colspan="2" onclick="doSort(4, '${tableId}')">BO5 FULLRATE</th><th colspan="2" onclick="doSort(5, '${tableId}')">SERIES</th><th colspan="2" onclick="doSort(7, '${tableId}')">GAMES</th><th class="col-streak" onclick="doSort(9, '${tableId}')">STREAK</th><th class="col-last" onclick="doSort(10, '${tableId}')">LAST DATE</th></tr></thead><tbody>${rows}</tbody></table>`;

    const regionGrid = timeData[tournament.slug] || {};
    const timeTableHtml = buildTimeTable(regionGrid);

    const emojiStr = (!isArchive && tournamentMeta[tournament.slug] && tournamentMeta[tournament.slug].emoji)
      ? `<span ${STYLE_EMOJI}>${tournamentMeta[tournament.slug].emoji}</span>`
      : "";
    const pageUrl = `https://lol.fandom.com/wiki/${mainPage}`;
    const titleText = `<span class="league-title-text">${tournament.name}</span>`;
    const jumpBtn = `<a class="league-jump-btn" href="${pageUrl}" target="_blank" rel="noopener noreferrer" aria-label="Open link"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg></a>`;

    if (isArchive) {
      const headerRight = `<div class="title-right-area" style="justify-content: flex-start;">${leagueSummaryHtml}</div>`;
      tablesHtml += `<details class="home-sec archive-sec"><summary class="table-title home-sum"><div ${STYLE_TITLE_ROW}><span class="home-indicator">❯</span>${titleText}${jumpBtn}</div> ${headerRight}</summary><div class="wrapper">${tableBody}${timeTableHtml}</div></details>`;
    } else {
      const headerRight = `<div class="title-right-area" style="justify-content: flex-start;">${leagueSummaryHtml}</div>`;
      const isSleepCollapsed = tournamentMeta[tournament.slug] && tournamentMeta[tournament.slug].emoji === "🕊️";
      const openAttr = (isSleepCollapsed || hasNoData) ? "" : " open";
      tablesHtml += `<details class="home-sec"${openAttr}><summary class="table-title home-sum"><div ${STYLE_TITLE_ROW}><span class="home-indicator">❯</span>${emojiStr}${titleText}${jumpBtn}</div> ${headerRight}</summary><div class="wrapper">${tableBody}${timeTableHtml}</div></details>`;
    }
  });

  let scheduleHtml = "";
  if (!isArchive) {
    const dates = Object.keys(scheduleMap).sort();
    if (dates.length === 0) {
      scheduleHtml = `<div class="sch-empty">🕊️ NO FUTURE MATCHES SCHEDULED</div>`;
    } else {
      scheduleHtml = `<div class="sch-container">`;
      dates.forEach(scheduleDate => {
        const matches = scheduleMap[scheduleDate];
        const dateObj = new Date(scheduleDate + "T00:00:00Z");
        const dayName = WEEKDAY_NAMES[dateObj.getUTCDay()];
        let cardHtml = `<div class="sch-card"><div class="sch-header" ${STYLE_SCH_HEADER}><span>📅 <span class="utc-local date-display" data-utc="${scheduleDate}T00:00:00Z" data-format="date">${scheduleDate.slice(5)}</span> ${dayName}</span><span ${STYLE_SCH_COUNT}>${matches.length} Matches</span></div><div class="sch-body">`;
        let lastGroupKey = "";

        matches.forEach(match => {
          const tabName = match.tabName || "";
          const groupKey = `${match.league}_${tabName}`;
          if (groupKey !== lastGroupKey) {
            const blockHtml = tabName ? `<span class="spine-sep">/</span><span class="spine-r" ${STYLE_SCH_GROUP_BLOCK}>${tabName}</span>` : "";
            cardHtml += `<div class="sch-group-header" ${STYLE_SCH_GROUP_HEADER}><div class="spine-row" ${STYLE_SCH_GROUP_ROW}><span class="spine-l" ${STYLE_SCH_GROUP_NAME}>${match.league}</span>${blockHtml}</div></div>`;
            lastGroupKey = groupKey;
          }
          cardHtml += buildScheduleRow(match, globalStats);
        });

        cardHtml += `</div></div>`;
        scheduleHtml += cardHtml;
      });
      scheduleHtml += `</div>`;
    }
  }

  return `${tablesHtml} ${scheduleHtml} ${injectedData}`;
}