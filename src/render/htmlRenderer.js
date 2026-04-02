import { dateUtils } from '../utils/dateUtils.js';
import { dataUtils } from '../utils/dataUtils.js';
import { ICONS, TABLE_COLUMNS, GITHUB_COMMIT_BASE } from '../utils/constants.js';
import { PYTHON_STYLE, TOOLS_PAGE_STYLE, LOG_PAGE_STYLE, BUILD_FOOTER_STYLE } from './styles.js';

/**
 * HTML渲染器
 */
export class HTMLRenderer {
  /**
   * 渲染主要内容
   */
  static renderContentOnly(globalStats, timeData, scheduleMap, runtimeConfig, isArchive = false, tournMeta = {}) {
    globalStats = globalStats || {};
    timeData = timeData || {};
    scheduleMap = scheduleMap || {};

    const injectedData = `<script>window.g_stats = Object.assign(window.g_stats || {}, ${JSON.stringify(globalStats)});</script>`;
    const STYLE_MUTED_DASH = 'style="color:#cbd5e1"';
    const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const TIME_TABLE_COLUMNS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Total"];
    const STYLE_RATE_HINT = 'style="font-weight:400;color:#94a3b8;font-size:11px;margin:0 2px"';
    const STYLE_SPINE_BOLD = 'style="font-weight:700"';
    const STYLE_SPINE_SEP = 'style="opacity:0.4;"';
    const STYLE_EMOJI = 'style="font-size: 16px; line-height: 1; display: block; transform: translateY(-1px);"';
    const STYLE_TITLE_ROW = 'style="display:flex; align-items:center; gap: 6px;"';
    const STYLE_SCH_HEADER = 'style="background:#f8fafc;color:#334155"';
    const STYLE_SCH_COUNT = 'style="font-size:11px;opacity:0.6"';
    const STYLE_SCORE_SEP = 'style="opacity:0.4; margin:0 1px;"';
    const STYLE_VS_TEXT = 'style="color:#94a3b8;font-size:13px;font-weight:700;margin:0 2px;"';
    const STYLE_SCH_GROUP_HEADER = 'style="background:#f8fafc"';
    const STYLE_SCH_GROUP_ROW = 'style="width:100%; padding:0 10px; box-sizing:border-box"';
    const STYLE_SCH_GROUP_NAME = 'style="font-weight:700"';
    const STYLE_SCH_GROUP_BLOCK = 'style="font-weight:700; opacity:0.7"';
    const STYLE_SCH_MID_CELL = 'style="display:flex;justify-content:center;align-items:center;width:34px;transition:background 0.2s;"';
    const STYLE_TBD_TEAM = 'style="color:#9ca3af"';

    const mkSpine = (val, sep) => {
        if (!val || val === "-") return `<span ${STYLE_MUTED_DASH}>-</span>`;
        const parts = val.split(sep);
        if (parts.length !== 2) return val;
        return `<div class="spine-row"><span class="spine-l" ${STYLE_SPINE_BOLD}>${parts[0]}</span><span class="spine-sep" ${STYLE_SPINE_SEP}>${sep}</span><span class="spine-r" ${STYLE_SPINE_BOLD}>${parts[1]}</span></div>`;
    };

    const getRateHtml = (teamName, slug, bestOf) => {
        const teamStats = globalStats[slug];
        if (!teamStats || !teamStats[teamName]) return "";
        const teamData = teamStats[teamName];
        let winRate = null;
        if (bestOf === 5) winRate = dataUtils.rate(teamData.bo5_f, teamData.bo5_t);
        else if (bestOf === 3) winRate = dataUtils.rate(teamData.bo3_f, teamData.bo3_t);
        if (winRate === null) return "";
        return `<span ${STYLE_RATE_HINT}>(${Math.round(winRate * 100)}%)</span>`;
    };

    const buildTeamRow = (teamStats, slug) => {
        const bo3Rate = dataUtils.rate(teamStats.bo3_f, teamStats.bo3_t);
        const bo5Rate = dataUtils.rate(teamStats.bo5_f, teamStats.bo5_t);
        const winRate = dataUtils.rate(teamStats.s_w, teamStats.s_t);
        const gameRate = dataUtils.rate(teamStats.g_w, teamStats.g_t);
        const bo3Text = teamStats.bo3_t ? mkSpine(`${teamStats.bo3_f}/${teamStats.bo3_t}`, '/') : "-";
        const bo5Text = teamStats.bo5_t ? mkSpine(`${teamStats.bo5_f}/${teamStats.bo5_t}`, '/') : "-";
        const seriesText = teamStats.s_t ? mkSpine(`${teamStats.s_w}-${teamStats.s_t - teamStats.s_w}`, '-') : "-";
        const gameText = teamStats.g_t ? mkSpine(`${teamStats.g_w}-${teamStats.g_t - teamStats.g_w}`, '-') : "-";
        const streak = teamStats.strk_w > 0
            ? `<span class='badge' style='background:#10b981'>${teamStats.strk_w}W</span>`
            : (teamStats.strk_l > 0 ? `<span class='badge' style='background:#f43f5e'>${teamStats.strk_l}L</span>` : "-");
        const lastMatch = teamStats.last ? dateUtils.fmtDate(teamStats.last) : "-";
        const lastMatchColor = dateUtils.colorDate(teamStats.last);

        const emptyBackground = '#f1f5f9', emptyColor = '#cbd5e1';
        const getClass = (baseClass, count) => count > 0 ? `${baseClass} team-clickable` : baseClass;
        const getClickHandler = (name, type, count) => count > 0 ? `onclick="openStats('${slug}', '${name}', '${type}')"` : "";
        const statStyle = (count) => `style="background:${count === 0 ? emptyBackground : 'transparent'};color:${count === 0 ? emptyColor : 'inherit'}"`;
        const percentStyle = (rate, strong = false) => `style="background:${dataUtils.color(rate, strong)};color:${rate !== null ? 'white' : emptyColor};font-weight:bold"`;
        const lastStyle = `style="background:${!teamStats.last ? emptyBackground : 'transparent'};color:${!teamStats.last ? emptyColor : lastMatchColor};font-weight:700"`;
        const streakEmpty = teamStats.strk_w === 0 && teamStats.strk_l === 0;
        const streakStyle = `style="background:${streakEmpty ? emptyBackground : 'transparent'};color:${streakEmpty ? emptyColor : 'inherit'}"`;

        return `<tr><td class="team-col team-clickable" onclick="openTeam('${slug}', '${teamStats.name}')">${teamStats.name}</td>` +
               `<td class="${getClass('col-bo3', teamStats.bo3_t)}" ${getClickHandler(teamStats.name, 'bo3', teamStats.bo3_t)} ${statStyle(teamStats.bo3_t)}>${bo3Text}</td>` +
               `<td class="col-bo3-pct" ${percentStyle(bo3Rate, true)}>${dataUtils.pct(bo3Rate)}</td>` +
               `<td class="${getClass('col-bo5', teamStats.bo5_t)}" ${getClickHandler(teamStats.name, 'bo5', teamStats.bo5_t)} ${statStyle(teamStats.bo5_t)}>${bo5Text}</td>` +
               `<td class="col-bo5-pct" ${percentStyle(bo5Rate, true)}>${dataUtils.pct(bo5Rate)}</td>` +
               `<td class="${getClass('col-series', teamStats.s_t)}" ${getClickHandler(teamStats.name, 'series', teamStats.s_t)} ${statStyle(teamStats.s_t)}>${seriesText}</td>` +
               `<td class="col-series-wr" ${percentStyle(winRate)}>${dataUtils.pct(winRate)}</td>` +
               `<td class="col-game" ${statStyle(teamStats.g_t)}>${gameText}</td>` +
               `<td class="col-game-wr" ${percentStyle(gameRate)}>${dataUtils.pct(gameRate)}</td>` +
               `<td class="col-streak" ${streakStyle}>${streak}</td>` +
               `<td class="col-last" ${lastStyle}><span class="utc-local" data-utc="${teamStats.last || ''}" data-format="datetime">${lastMatch}</span></td></tr>`;
    };

    const buildTimeTable = (regionGrid) => {
        const hours = Object.keys(regionGrid).filter(key => key !== "Total" && !isNaN(key)).map(Number).sort((a, b) => a - b);
        if (hours.length === 0 && !regionGrid["Total"]) return "";

        let html = `<div style="border-top: 1px solid #f1f5f9; width:100%;"></div><table style="font-variant-numeric:tabular-nums; border-top:none;"><thead><tr style="border-bottom:none;"><th class="team-col" style="cursor:default; pointer-events:none;">TIME</th>`;
        TIME_TABLE_COLUMNS.forEach(dayName => { html += `<th style="cursor:default; pointer-events:none;">${dayName}</th>`; });
        html += "</tr></thead><tbody>";

        [...hours, "Total"].forEach(hour => {
            if (!regionGrid[hour]) return;
            const isTotal = hour === "Total";
            const label = isTotal ? "Total" : `${String(hour).padStart(2,'0')}:00`;
            const hourAttr = isTotal ? '' : ` utc-local" data-utc="2026-01-01T${String(hour).padStart(2,'0')}:00:00Z" data-format="hour`;
            html += `<tr style="${isTotal ? 'font-weight:bold; background:#f8fafc;' : ''}"><td class="team-col ${hourAttr}" style="${isTotal ? 'background:#f1f5f9;' : ''}">${label}</td>`;

            for (let dayIndex = 0; dayIndex < 8; dayIndex++) {
                const cellData = regionGrid[hour][dayIndex] || { total: 0 };
                if (cellData.total === 0) {
                    html += "<td style='background:#f1f5f9; color:#cbd5e1'>-</td>";
                } else {
                    const fullRate = cellData.full / cellData.total;
                    const matches = JSON.stringify(cellData.matches).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
                    html += `<td style='background:${dataUtils.color(fullRate, true)}; color:white; font-weight:bold; cursor:pointer;' onclick='showPopup("${label}", ${dayIndex}, ${matches})'><div class="t-cell"><span class="t-val">${cellData.full}<span ${STYLE_SCORE_SEP}>/</span>${cellData.total}</span><span class="t-pct">(${Math.round(fullRate * 100)}%)</span></div></td>`;
                }
            }

            html += "</tr>";
        });

        html += "</tbody></table>";
        return html;
    };

    const buildScheduleRow = (match) => {
        const boLabel = match.bo ? `BO${match.bo}` : "";
        const boClass = match.bo === 5 ? "sch-pill gold" : "sch-pill";
        const isTbd1 = match.t1 === "TBD", isTbd2 = match.t2 === "TBD";
        const t1Click = isTbd1 ? "" : `onclick="openTeam('${match.slug}', '${match.t1}')"`;
        const t2Click = isTbd2 ? "" : `onclick="openTeam('${match.slug}', '${match.t2}')"`;
        const r1 = getRateHtml(match.t1, match.slug, match.bo), r2 = getRateHtml(match.t2, match.slug, match.bo);

        let midContent = `<span ${STYLE_VS_TEXT}>vs</span>`;
        if (match.is_finished) {
            const s1Style = match.s1 > match.s2 ? "color:#0f172a" : "color:#94a3b8";
            const s2Style = match.s2 > match.s1 ? "color:#0f172a" : "color:#94a3b8";
            midContent = `<span class="sch-fin-score"><span style="${s1Style}">${match.s1}</span><span ${STYLE_SCORE_SEP}>-</span><span style="${s2Style}">${match.s2}</span></span>`;
        } else if (match.is_live) {
            midContent = `<span class="sch-live-score">${match.s1}<span ${STYLE_SCORE_SEP}>-</span>${match.s2}</span>`;
        }

        const h2hClass = (!isTbd1 && !isTbd2) ? "spine-sep clickable" : "spine-sep";
        const h2hClick = (!isTbd1 && !isTbd2) ? `onclick="openH2H('${match.slug}', '${match.t1}', '${match.t2}')"` : "";

        return `<div class="sch-row"><span class="sch-time"><span class="utc-local" data-utc="${match.iso || ''}" data-format="time">${match.time}</span></span><div class="sch-vs-container"><div class="spine-row"><span class="${isTbd1 ? "spine-l" : "spine-l clickable"}" ${t1Click} ${isTbd1 ? STYLE_TBD_TEAM : ""}>${r1}${match.t1}</span><span class="${h2hClass}" ${h2hClick} ${STYLE_SCH_MID_CELL}>${midContent}</span><span class="${isTbd2 ? "spine-r" : "spine-r clickable"}" ${t2Click} ${isTbd2 ? STYLE_TBD_TEAM : ""}>${match.t2}${r2}</span></div></div><div class="sch-tag-col"><span class="${boClass}">${boLabel}</span></div></div>`;
    };

    let tablesHtml = "";

    runtimeConfig.TOURNAMENTS.forEach((tournament) => {
        if (!tournament || !tournament.slug) return;
        const rawStats = globalStats[tournament.slug] || {};
        const stats = dataUtils.sortTeams(rawStats);
        const tableId = `t_${tournament.slug.replace(/-/g, '_')}`;

        // 计算联赛总打满量
        let t_bo3_f = 0, t_bo3_t = 0, t_bo5_f = 0, t_bo5_t = 0;
        stats.forEach(s => {
            t_bo3_f += s.bo3_f || 0; t_bo3_t += s.bo3_t || 0;
            t_bo5_f += s.bo5_f || 0; t_bo5_t += s.bo5_t || 0;
        });
        t_bo3_f /= 2; t_bo3_t /= 2; t_bo5_f /= 2; t_bo5_t /= 2;

        if (t_bo3_t === 0 && t_bo5_t === 0) return;

        let leagueSummaryHtml = "";
        if (t_bo3_t > 0 || t_bo5_t > 0) {
            let parts = [];
            if (t_bo3_t > 0) parts.push(`BO3: ${t_bo3_f}/${t_bo3_t} <span style="opacity:0.7;font-weight:400;">(${dataUtils.pct(dataUtils.rate(t_bo3_f, t_bo3_t))})</span>`);
            if (t_bo5_t > 0) parts.push(`BO5: ${t_bo5_f}/${t_bo5_t} <span style="opacity:0.7;font-weight:400;">(${dataUtils.pct(dataUtils.rate(t_bo5_f, t_bo5_t))})</span>`);

            leagueSummaryHtml = `<div class="league-summary">${parts.join(" <span class='summary-sep'>|</span> ")}</div>`;
        }

        const mainPage = Array.isArray(tournament.overview_page) ? tournament.overview_page[0] : tournament.overview_page;
        const rows = stats.map(s => buildTeamRow(s, tournament.slug)).join("");
        const tableBody = `<table id="${tableId}" data-sort-col="2" data-sort-dir-2="asc"><thead><tr><th class="team-col" onclick="doSort(0, '${tableId}')">TEAM</th><th colspan="2" onclick="doSort(2, '${tableId}')">BO3 FULLRATE</th><th colspan="2" onclick="doSort(4, '${tableId}')">BO5 FULLRATE</th><th colspan="2" onclick="doSort(5, '${tableId}')">SERIES</th><th colspan="2" onclick="doSort(7, '${tableId}')">GAMES</th><th class="col-streak" onclick="doSort(9, '${tableId}')">STREAK</th><th class="col-last" onclick="doSort(10, '${tableId}')">LAST DATE</th></tr></thead><tbody>${rows}</tbody></table>`;

        const regionGrid = timeData[tournament.slug] || {};
        const timeTableHtml = buildTimeTable(regionGrid);

        const emojiStr = (!isArchive && tournMeta[tournament.slug] && tournMeta[tournament.slug].emoji)
            ? `<span ${STYLE_EMOJI}>${tournMeta[tournament.slug].emoji}</span>`
            : "";
        const pageUrl = `https://lol.fandom.com/wiki/${mainPage}`;
        const titleText = `<span class="league-title-text">${tournament.name}</span>`;
        const jumpBtn = `<a class="league-jump-btn" href="${pageUrl}" target="_blank" rel="noopener noreferrer">↗ Jump</a>`;

        if (isArchive) {
            const headerRight = `<div class="title-right-area" style="justify-content: flex-start;">${leagueSummaryHtml}${jumpBtn}</div>`;
            tablesHtml += `<details class="home-sec archive-sec"><summary class="table-title home-sum"><div ${STYLE_TITLE_ROW}><span class="home-indicator">❯</span>${titleText}</div> ${headerRight}</summary><div class="wrapper">${tableBody}${timeTableHtml}</div></details>`;
        } else {
            const headerRight = `<div class="title-right-area" style="justify-content: flex-start;">${leagueSummaryHtml}${jumpBtn}</div>`;
            const isSleepCollapsed = tournMeta[tournament.slug] && tournMeta[tournament.slug].emoji === "💤";
            const openAttr = isSleepCollapsed ? "" : " open";
            tablesHtml += `<details class="home-sec"${openAttr}><summary class="table-title home-sum"><div ${STYLE_TITLE_ROW}><span class="home-indicator">❯</span>${emojiStr}${titleText}</div> ${headerRight}</summary><div class="wrapper">${tableBody}${timeTableHtml}</div></details>`;
        }
    });

    let scheduleHtml = "";
    if (!isArchive) {
        const dates = Object.keys(scheduleMap).sort();
        if (dates.length === 0) {
            scheduleHtml = `<div class="sch-empty">💤 NO FUTURE MATCHES SCHEDULED</div>`;
        } else {
            scheduleHtml = `<div class="sch-container">`;
            dates.forEach(d => {
                const matches = scheduleMap[d];
                const dateObj = new Date(d + "T00:00:00Z");
                const dayName = WEEKDAY_NAMES[dateObj.getUTCDay()];
                let cardHtml = `<div class="sch-card"><div class="sch-header" ${STYLE_SCH_HEADER}><span>📅 <span class="utc-local date-display" data-utc="${d}T00:00:00Z" data-format="date">${d.slice(5)}</span> ${dayName}</span><span ${STYLE_SCH_COUNT}>${matches.length} Matches</span></div><div class="sch-body">`;
                let lastGroupKey = "";

                matches.forEach(match => {
                    const tabName = match.tabName || "";
                    const groupKey = `${match.league}_${tabName}`;
                    if (groupKey !== lastGroupKey) {
                        const blockHtml = tabName ? `<span class="spine-sep">/</span><span class="spine-r" ${STYLE_SCH_GROUP_BLOCK}>${tabName}</span>` : "";
                        cardHtml += `<div class="sch-group-header" ${STYLE_SCH_GROUP_HEADER}><div class="spine-row" ${STYLE_SCH_GROUP_ROW}><span class="spine-l" ${STYLE_SCH_GROUP_NAME}>${match.league}</span>${blockHtml}</div></div>`;
                        lastGroupKey = groupKey;
                    }
                    cardHtml += buildScheduleRow(match);
                });

                cardHtml += `</div></div>`;
                scheduleHtml += cardHtml;
            });
            scheduleHtml += `</div>`;
        }
    }

    return `${tablesHtml} ${scheduleHtml} ${injectedData}`;
  }
  /**
   * 渲染动作按钮
   */
  static renderActionBtn(href, icon, text) {
    return `<a href="${href}" class="action-btn"><span class="btn-icon">${icon}</span> <span class="btn-text">${text}</span></a>`;
  }

  static renderFontLinks() {
    return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">`;
  }

  /**
   * 渲染页面外壳
   */
  static renderPageShell(title, bodyContent, navMode = "home") {
    let navBtn = "";
    const logoIcon = navMode === "archive" ? "📦" : "🥇";
    if (navMode === "home") navBtn = HTMLRenderer.renderActionBtn("/archive", "📦", "Archive");
    else if (navMode === "archive") navBtn = HTMLRenderer.renderActionBtn("/", "🏠", "Home");

    const toolsBtn = (navMode !== "home" && navMode !== "archive")
        ? HTMLRenderer.renderActionBtn("/tools", "🧰", "Tools")
        : "";

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>${HTMLRenderer.renderFontLinks()}<style>${PYTHON_STYLE}</style><link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text x='50' y='.9em' font-size='85' text-anchor='middle'>${logoIcon}</text></svg>"></head><body><header class="main-header"><div class="header-left"><span class="header-logo">${logoIcon}</span><h1 class="header-title">${title}</h1></div><div class="header-right">${navBtn}${toolsBtn}${HTMLRenderer.renderActionBtn("/logs", "📜", "Logs")}</div></header><div class="container">${bodyContent}</div><div id="matchModal" class="modal"><div class="modal-content"><h3 id="modalTitle">Match History</h3><div id="modalList" class="match-list"></div></div></div>${HTMLRenderer.renderPythonJS()}</body></html>`;
  }

  /**
   * 渲染页脚
   */
  static renderBuildFooter(time, sha) {
    const shortSha = (sha || "").slice(0, 7) || "unknown";
    return `<div class="build-footer"><span class="footer-label">deployed:</span> <span class="footer-time">${time || "N/A"}</span> <a href="${GITHUB_COMMIT_BASE}${sha}" target="_blank"><span class="footer-sha">@${shortSha}</span></a></div>`;
  }

  /**
   * 渲染Python JS脚本
   */
  static renderPythonJS() {
    return `
    <script>
    const COL_TEAM=0, COL_BO3=1, COL_BO3_PCT=2, COL_BO5=3, COL_BO5_PCT=4, COL_SERIES=5, COL_SERIES_WR=6, COL_GAME=7, COL_GAME_WR=8, COL_STREAK=9, COL_LAST_DATE=10;
    const RESULT_ICON_MAP = { 
      'W': '✔', 
      'L': '❌', 
      'LIV': '🔵', 
      'N': '🕒' 
    };
    const STYLE_DATE_TIME = 'style="font-weight:700;color:#475569"';
    const STYLE_SCORE_DASH = 'style="opacity:0.4;margin:0 1px"';
    const STYLE_TEAM_LEFT_PAD = 'style="padding-right:5px;"';
    const STYLE_TEAM_RIGHT_PAD = 'style="padding-left:5px;"';
    const STYLE_SCORE_WRAP = 'style="width:52px;flex-shrink:0;display:flex;align-items:center;justify-content:center"';
    const STYLE_MODAL_EMPTY = 'style="text-align:center;color:#999;padding:20px"';
    const STYLE_BO_SMALL = 'style="font-size:9px; padding:2px 4px;"';
    const STYLE_H2H_SUMMARY = 'style="color:#94a3b8;font-size:14px"';
    const STYLE_H2H_DASH = 'style="margin:0 1px"';
    const STYLE_MUTED_DASH = 'style="color:#cbd5e1"';

    function doSort(columnIndex, tableId) {
        const table = document.getElementById(tableId);
        const tbody = table.tBodies[0];
        const rows = Array.from(tbody.rows);
        const sortDirKey = 'data-sort-dir-' + columnIndex;
        const currentDir = table.getAttribute(sortDirKey);
        const defaultAscCols = [COL_TEAM, COL_BO3_PCT, COL_BO5_PCT];
        const nextDir = (!currentDir) ? (defaultAscCols.includes(columnIndex) ? 'asc' : 'desc') : (currentDir === 'desc' ? 'asc' : 'desc');

        rows.sort((rowA, rowB) => {
            const rawA = (rowA.cells[columnIndex].innerText || "").replace(/\\s+/g, "");
            const rawB = (rowB.cells[columnIndex].innerText || "").replace(/\\s+/g, "");
            const isMissingA = rawA === "-";
            const isMissingB = rawB === "-";
            // Missing values should always stay at the bottom, regardless of sort direction.
            if (isMissingA !== isMissingB) return isMissingA ? 1 : -1;

            const compareTeamName = () => {
                const teamA = (rowA.cells[COL_TEAM].innerText || "").toLowerCase();
                const teamB = (rowB.cells[COL_TEAM].innerText || "").toLowerCase();
                if (teamA === teamB) return 0;
                return teamA > teamB ? 1 : -1;
            };

            if (columnIndex === COL_SERIES) {
                const parseSeriesRecord = (text) => {
                    if (text === "-" || !text.includes("-")) return { w: -1, l: 9999, wr: -1 };
                    const parts = text.split("-");
                    const w = parseFloat(parts[0]) || 0;
                    const l = parseFloat(parts[1]) || 0;
                    const total = w + l;
                    return { w, l, wr: total > 0 ? (w / total) : -1 };
                };

                const recA = parseSeriesRecord(rowA.cells[COL_SERIES].innerText);
                const recB = parseSeriesRecord(rowB.cells[COL_SERIES].innerText);

                if (recA.w !== recB.w) return nextDir === 'asc' ? (recA.w - recB.w) : (recB.w - recA.w);
                if (recA.l !== recB.l) return nextDir === 'asc' ? (recB.l - recA.l) : (recA.l - recB.l);
                if (recA.wr !== recB.wr) return nextDir === 'asc' ? (recA.wr - recB.wr) : (recB.wr - recA.wr);

                const gameA = parseValue(rowA.cells[COL_GAME_WR].innerText);
                const gameB = parseValue(rowB.cells[COL_GAME_WR].innerText);
                if (gameA !== gameB) return nextDir === 'asc' ? (gameA - gameB) : (gameB - gameA);
                return compareTeamName();
            }

            let valueA = rowA.cells[columnIndex].innerText;
            let valueB = rowB.cells[columnIndex].innerText;
            
            if (columnIndex === COL_LAST_DATE) { 
              valueA = valueA === "-" ? "" : valueA; 
              valueB = valueB === "-" ? "" : valueB; 
            } else if (columnIndex === COL_STREAK) { 
              const parseStreak = (streak) => streak === "-" ? 0 : (streak.includes('W') ? parseInt(streak) : -parseInt(streak)); 
              valueA = parseStreak(valueA); 
              valueB = parseStreak(valueB); 
            } else { 
              valueA = parseValue(valueA); 
              valueB = parseValue(valueB); 
            }

            if (valueA !== valueB) return nextDir === 'asc' ? (valueA > valueB ? 1 : -1) : (valueA < valueB ? 1 : -1);
            
            if (columnIndex === COL_BO3_PCT || columnIndex === COL_BO5_PCT) { 
              const parseSampleSize = (text) => {
                if (!text || text === "-" || !text.includes("/")) return 0;
                const parts = text.split("/");
                return parseFloat(parts[1]) || 0;
              };
              const sampleCol = columnIndex === COL_BO3_PCT ? COL_BO3 : COL_BO5;
              const sampleA = parseSampleSize(rowA.cells[sampleCol].innerText);
              const sampleB = parseSampleSize(rowB.cells[sampleCol].innerText);
              if (sampleA !== sampleB) return nextDir === 'asc' ? (sampleA - sampleB) : (sampleB - sampleA);

              const seriesA = parseValue(rowA.cells[COL_SERIES_WR].innerText);
              const seriesB = parseValue(rowB.cells[COL_SERIES_WR].innerText);
              if (seriesA !== seriesB) return seriesB - seriesA;

              const gameA = parseValue(rowA.cells[COL_GAME_WR].innerText);
              const gameB = parseValue(rowB.cells[COL_GAME_WR].innerText);
              if (gameA !== gameB) return gameB - gameA;
            }
            
            if (columnIndex === COL_SERIES_WR) {
                // 系列赛胜率次级排序：按游戏胜率降序
                const gameA = parseValue(rowA.cells[COL_GAME_WR].innerText);
                const gameB = parseValue(rowB.cells[COL_GAME_WR].innerText);
                if (gameA !== gameB) return gameB - gameA;
            } else if (columnIndex === COL_GAME) {
                // 游戏胜负记录次级排序：按净胜场降序
                const getGameNet = (cell) => {
                    const text = cell.innerText;
                    if (text === "-" || !text.includes("-")) return 0;
                    const parts = text.split("-");
                    if (parts.length === 2) {
                        const wins = parseFloat(parts[0]) || 0;
                        const losses = parseFloat(parts[1]) || 0;
                        return wins - losses;
                    }
                    return 0;
                };
                const netA = getGameNet(rowA.cells[COL_GAME]);
                const netB = getGameNet(rowB.cells[COL_GAME]);
                if (netA !== netB) return netB - netA;
            }
            return compareTeamName();
        });

        table.setAttribute(sortDirKey, nextDir);
        rows.forEach(row => tbody.appendChild(row));
    }

    function parseValue(value) {
        if(value === "-") return Number.POSITIVE_INFINITY; 
        if(value.includes('%')) return parseFloat(value);
        if(value.includes('/')) {
          const parts = value.split('/');
          return parts[1] === '-' ? Number.POSITIVE_INFINITY : parseFloat(parts[0]) / parseFloat(parts[1]);
        }
        if(value.includes('-') && value.split('-').length === 2) {
          return parseFloat(value.split('-')[0]);
        }
        const num = parseFloat(value); 
        return isNaN(num) ? value.toLowerCase() : num;
    }

    function renderMatchItem(mode, date, resTag, team1, team2, isFull, score, resStatus, isoString) {
        const dateParts = (date || '').split(' ');
        const dateHtml = dateParts.length === 2 
          ? dateParts[0] + '<br><span ' + STYLE_DATE_TIME + ' class="utc-local" data-utc="' + (isoString || '') + '" data-format="time">' + dateParts[1] + '</span>' 
          : (date || '');

        // 根据比赛结果添加边框样式类
        let matchItemClass = 'match-item';
        if (mode === 'history') {
            if (resStatus === 'W') {
                matchItemClass += ' match-win';
            } else if (resStatus === 'L') {
                matchItemClass += ' match-loss';
            }
        }

        let scoreContent = '', scoreClass = 'score-text';
        if (resStatus === 'LIV') scoreClass += ' live';
        if (resStatus === 'N') { 
          scoreContent = '<span class="score-text vs">VS</span>'; 
        } else { 
          const formattedScore = (score || '').toString().replace('-', '<span ' + STYLE_SCORE_DASH + '>-</span>'); 
          scoreContent = '<span class="' + scoreClass + '">' + formattedScore + '</span>'; 
        }
        const boxClass = isFull ? 'score-box is-full' : 'score-box';
        const team1Style = team1 === 'TBD' ? 'style="padding-right:5px;color:#9ca3af !important;"' : 'style="padding-right:5px;"';
        const team2Style = team2 === 'TBD' ? 'style="padding-left:5px;color:#9ca3af !important;"' : 'style="padding-left:5px;"';

        return '<div class="' + matchItemClass + '">' +
               '<div class="col-date">' + dateHtml + '</div>' +
               '<div class="modal-divider"></div>' +
               '<div class="col-vs-area"><div class="spine-row">' +
               '<span class="spine-l" ' + team1Style + '>' + team1 + '</span>' +
               '<div ' + STYLE_SCORE_WRAP + '><div class="' + boxClass + '">' + scoreContent + '</div></div>' +
               '<span class="spine-r" ' + team2Style + '>' + team2 + '</span>' +
               '</div></div>' +
               '<div class="modal-divider"></div>' +
               '<div class="col-res">' + resTag + '</div>' +
               '</div>';
    }

    function renderListHTML(htmlArray) {
        const modalList = document.getElementById('modalList');
        if(!htmlArray || htmlArray.length === 0) {
          modalList.innerHTML = "<div " + STYLE_MODAL_EMPTY + ">No matches found</div>";
        } else {
          modalList.innerHTML = htmlArray.join("");
        }
        // 渲染完成后更新模态框中的日期为本地时区
        document.querySelectorAll('#modalList .utc-local[data-utc]').forEach(convertUtcToLocal);
    }

    function showPopup(title, dayIndex, matches) {
        const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Total"];
        
        // 将UTC时间转换为本地时间
        let localTime = title;
        if (title !== "Total") {
            // 假设title是"HH:00"格式的UTC时间
            const hour = parseInt(title.split(':')[0]);
            if (!isNaN(hour)) {
                // 创建UTC日期对象（使用固定日期，只关心时间）
                const utcDate = new Date(Date.UTC(2026, 0, 1, hour, 0, 0));
                // 获取本地小时和分钟
                const localHour = utcDate.getHours();
                const localMinute = utcDate.getMinutes();
                // 格式化为HH:MM
                localTime = pad(localHour) + ':' + pad(localMinute);
            }
        }
        
        document.getElementById('modalTitle').innerText = localTime + " - " + dayNames[dayIndex];
        const sortedMatches = [...matches].sort((matchA, matchB) => (matchB.ts || 0) - (matchA.ts || 0) || matchB.d.localeCompare(matchA.d));
        const listHtml = sortedMatches.map(match => {
            let boTag = '<span ' + STYLE_MUTED_DASH + '>-</span>';
            if (match.bo === 5) boTag = '<span class="sch-pill gold">BO5</span>';
            else if (match.bo === 3) boTag = '<span class="sch-pill">BO3</span>';
            else if (match.bo === 1) boTag = '<span class="sch-pill">BO1</span>';
            return renderMatchItem('distribution', match.d, boTag, match.t1, match.t2, match.f, match.s, null, match.iso);
        });
        renderListHTML(listHtml);
        document.getElementById('matchModal').style.display = "block";
    }

    function openTeam(slug, teamName) {
        if (!window.g_stats || !window.g_stats[slug] || !window.g_stats[slug][teamName]) return;
        const data = window.g_stats[slug][teamName];
        document.getElementById('modalTitle').innerText = teamName + " - Schedule";
        
        const history = data.history || [];
        
        // 分离已结束（W/L）和未开始（N）的比赛
        const finished = history.filter(m => m.res === 'W' || m.res === 'L');
        const upcoming = history.filter(m => m.res === 'N' || m.res === 'LIV');
        
        // 已结束：按timestamp降序（新到旧），如果ts相同则按日期字符串排序
        finished.sort((a, b) => (b.ts || 0) - (a.ts || 0) || b.d.localeCompare(a.d));
        // 未开始：按timestamp升序（旧到新），如果ts相同则按日期字符串排序
        upcoming.sort((a, b) => (a.ts || 0) - (b.ts || 0) || a.d.localeCompare(b.d));
        
        let listHtml = [];
        
        // 已结束比赛
        finished.forEach(match => {
            const icon = RESULT_ICON_MAP[match.res] || RESULT_ICON_MAP['N'];
            const resultTag = \`<span class="\${(match.res === 'W' || match.res === 'L') ? '' : 'hist-icon'}">\${icon}</span>\`;
            listHtml.push(renderMatchItem('history', match.d, resultTag, teamName, match.vs, match.full, match.s, match.res, match.iso));
        });
        
        // 未开始比赛区域（蓝色分隔线）
        if (upcoming.length > 0) {
            const marginTop = finished.length > 0 ? 'margin-top:16px;' : '';
            listHtml.push('<div style="border-top:2px solid #3b82f6;margin:8px 0;' + marginTop + '"></div>');
            upcoming.forEach(match => {
                const icon = RESULT_ICON_MAP[match.res] || RESULT_ICON_MAP['N'];
                const resultTag = \`<span class="\${(match.res === 'W' || match.res === 'L') ? '' : 'hist-icon'}">\${icon}</span>\`;
                listHtml.push(renderMatchItem('history', match.d, resultTag, teamName, match.vs, match.full, match.s, match.res, match.iso));
            });
        }
        
        renderListHTML(listHtml);
        document.getElementById('matchModal').style.display="block";
    }

    function openStats(slug, teamName, type) {
        if (!window.g_stats || !window.g_stats[slug] || !window.g_stats[slug][teamName]) return;
        const data = window.g_stats[slug][teamName];
        let history = data.history || [];
        let titleSuffix = "";
        if (type === 'bo3') { history = history.filter(match => match.bo === 3); titleSuffix = " - BO3"; }
        else if (type === 'bo5') { history = history.filter(match => match.bo === 5); titleSuffix = " - BO5"; }
        else { titleSuffix = " - Series"; }
        document.getElementById('modalTitle').innerText = teamName + titleSuffix;
        
        // 分离已结束（W/L）和未开始（N）的比赛
        const finished = history.filter(m => m.res === 'W' || m.res === 'L');
        const upcoming = history.filter(m => m.res === 'N' || m.res === 'LIV');
        
        // 已结束：按timestamp降序（新到旧），如果ts相同则按日期字符串排序
        finished.sort((a, b) => (b.ts || 0) - (a.ts || 0) || b.d.localeCompare(a.d));
        // 未开始：按timestamp升序（旧到新），如果ts相同则按日期字符串排序
        upcoming.sort((a, b) => (a.ts || 0) - (b.ts || 0) || a.d.localeCompare(b.d));
        
        let listHtml = [];
        
        // 已结束比赛
        finished.forEach(match => {
            const icon = RESULT_ICON_MAP[match.res] || RESULT_ICON_MAP['N'];
            const resultTag = \`<span class="\${(match.res === 'W' || match.res === 'L') ? '' : 'hist-icon'}">\${icon}</span>\`;
            listHtml.push(renderMatchItem('history', match.d, resultTag, teamName, match.vs, match.full, match.s, match.res, match.iso));
        });
        
        // 未开始比赛区域（蓝色分隔线）
        if (upcoming.length > 0) {
            const marginTop = finished.length > 0 ? 'margin-top:16px;' : '';
            listHtml.push('<div style="border-top:2px solid #3b82f6;margin:8px 0;' + marginTop + '"></div>');
            upcoming.forEach(match => {
                const icon = RESULT_ICON_MAP[match.res] || RESULT_ICON_MAP['N'];
                const resultTag = \`<span class="\${(match.res === 'W' || match.res === 'L') ? '' : 'hist-icon'}">\${icon}</span>\`;
                listHtml.push(renderMatchItem('history', match.d, resultTag, teamName, match.vs, match.full, match.s, match.res, match.iso));
            });
        }
        
        renderListHTML(listHtml);
        document.getElementById('matchModal').style.display="block";
    }

    function openH2H(slug, team1Name, team2Name) {
        if (!window.g_stats || !window.g_stats[slug] || !window.g_stats[slug][team1Name]) return;
        const data = window.g_stats[slug][team1Name];
        const h2hHistory = (data.history || []).filter(match => match.vs === team2Name);
        let team1Wins = 0, team2Wins = 0;
        h2hHistory.forEach(match => { if(match.res === 'W') team1Wins++; else if(match.res === 'L') team2Wins++; });
        const summary = h2hHistory.length > 0 ? ' <span ' + STYLE_H2H_SUMMARY + '>(' + team1Wins + '<span ' + STYLE_H2H_DASH + '>-</span>' + team2Wins + ')</span>' : "";
        document.getElementById('modalTitle').innerHTML = team1Name + " vs " + team2Name + summary;
        const listHtml = h2hHistory.map(match => {
            const icon = RESULT_ICON_MAP[match.res] || RESULT_ICON_MAP['N'];
            const resultTag = '<span class="' + ((match.res === 'W' || match.res === 'L') ? '' : 'hist-icon') + '">' + icon + '</span>';
            return renderMatchItem('history', match.d, resultTag, team1Name, match.vs, match.full, match.s, match.res, match.iso);
        });
        renderListHTML(listHtml);
        document.getElementById('matchModal').style.display="block";
    }

    function closePopup(){document.getElementById('matchModal').style.display="none";}
    window.onclick=function(e){if(e.target==document.getElementById('matchModal'))closePopup();}

    // ============ 统一时区转换系统 ============
    function pad(n) { return n < 10 ? '0' + n : n; }

    // 解析各种UTC时间格式
    function parseUtcString(utc) {
        if (!utc) return null;
        // 时间戳
        var num = Number(utc);
        if (!isNaN(num) && num > 0) return new Date(num);
        // 完整ISO格式 "2026-03-26T11:33:29.000Z" (四位数年份)
        if (/^\\d{4}-\\d{2}-\\d{2}T/.test(utc)) {
            var d = new Date(utc.includes('Z') ? utc : utc + 'Z');
            if (!isNaN(d.getTime())) return d;
        }
        // 短格式 "26-03-26T11:33:08" 或 "26-03-26 11:33:08" (UTC时间)
        var clean = utc.replace('T', ' ');
        var parts = clean.match(/(\\d{2})-(\\d{2})-(\\d{2})\\s+(\\d{2}):(\\d{2})(?::(\\d{2}))?/);
        if (parts) {
            // 创建UTC时间的Date对象
            return new Date(Date.UTC(2000 + parseInt(parts[1]), parseInt(parts[2]) - 1, parseInt(parts[3]), parseInt(parts[4]), parseInt(parts[5]), parseInt(parts[6] || 0)));
        }
        return null;
    }

    // 统一的时间转换函数：处理所有带 utc-local 类的元素
    function convertUtcToLocal(el) {
        var utc = el.getAttribute('data-utc');
        if (!utc) return;
        
        var date = parseUtcString(utc);
        if (!date) return;
        
        // 根据 data-format 属性决定输出格式
        var format = el.getAttribute('data-format') || 'datetime';
        var year = String(date.getFullYear()).slice(2);
        var month = pad(date.getMonth() + 1);
        var day = pad(date.getDate());
        var hour = pad(date.getHours());
        var minute = pad(date.getMinutes());
        var second = pad(date.getSeconds());
        
        if (format === 'time') {
            el.textContent = hour + ":" + minute;
        } else if (format === 'date') {
            el.textContent = month + "-" + day;
        } else if (format === 'hour') {
            el.textContent = hour + ":00";
        } else if (format === 'datetime') {
            el.textContent = year + "-" + month + "-" + day + " " + hour + ":" + minute;
        } else {
            // 默认带秒
            el.textContent = year + "-" + month + "-" + day + " " + hour + ":" + minute + ":" + second;
        }
    }

    // 批量转换所有 utc-local 元素
    function convertAllUtcElements() {
        document.querySelectorAll('.utc-local[data-utc]').forEach(convertUtcToLocal);
    }

    // MutationObserver：自动处理动态添加的元素
    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === 1) {
                    if (node.classList && node.classList.contains('utc-local')) {
                        convertUtcToLocal(node);
                    }
                    node.querySelectorAll && node.querySelectorAll('.utc-local[data-utc]').forEach(convertUtcToLocal);
                }
            });
        });
    });

    // 初始化
    document.addEventListener('DOMContentLoaded', function() {
        convertAllUtcElements();
        observer.observe(document.body, { childList: true, subtree: true });
    });
    </script>
    `;
  }

  /**
   * 渲染工具页面
   */
  static renderToolsPage(time, sha, existingArchives = []) {
    const buildFooter = HTMLRenderer.renderBuildFooter(time, sha);

    let archiveListHtml = existingArchives.map(t => {
        const overviewStr = Array.isArray(t.overview_page) ? JSON.stringify(t.overview_page) : JSON.stringify([t.overview_page]);
        const startDate = t.start_date || '';
        const endDate = t.end_date || '';
        return `
        <div class="item">
            <label class="item-left">
                <input type="checkbox" class="item-chk qr-chk-archived" value="${t.slug}" data-name="${t.name}" data-overview='${overviewStr}' data-league="${t.league}" data-start="${startDate}" data-end="${endDate}">
                <span class="item-name">${t.name}</span>
            </label>
            <div class="item-right">
                <button class="icon-btn icon-btn-fill" onclick="fillArchive('${t.slug}')" title="Fill">📋</button>
                <button class="icon-btn icon-btn-del" onclick="deleteArchive('${t.slug}', '${t.name}')" title="Delete">🗑️</button>
            </div>
        </div>`;
    }).join("");
    if (!archiveListHtml) archiveListHtml = "<div style='text-align:center; padding:12px 0; color:#94a3b8; font-size:12px;'>No archives</div>";

    return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Tools</title>
        ${HTMLRenderer.renderFontLinks()}
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text x='50' y='.9em' font-size='85' text-anchor='middle'>🧰</text></svg>">
        <style>
            ${TOOLS_PAGE_STYLE}
        </style>
    </head>
    <body>
        <div id="toast-container"></div>
        <div id="auth-overlay">
            <div class="auth-card">
                <div class="auth-icon">🔐</div>
                <input type="password" id="auth-pwd" class="form-input auth-input" placeholder="Password" onkeypress="if(event.key==='Enter') unlockTools()">
                <button class="primary-btn auth-btn" onclick="unlockTools()">Unlock</button>
            </div>
        </div>

        <header class="main-header">
            <div class="header-left">
                <span class="header-logo">🧰</span>
                <h1 class="header-title">Tools</h1>
            </div>
            <div class="header-right">
                ${HTMLRenderer.renderActionBtn("/", "🏠", "Home")}
                ${HTMLRenderer.renderActionBtn("/logs", "📜", "Logs")}
            </div>
        </header>

        <div class="container">

            <div class="wrapper">
                <div class="table-title"><span>⚙️ Operations</span></div>
                <div class="section-body ops-body">

                    <div class="group-header">
                        <input type="checkbox" class="group-chk" id="chk-active-all">
                        <span class="group-label">Active</span>
                    </div>
                    <div id="active-list" class="list">
                        <div style="text-align:center; padding:12px 0; color:#94a3b8; font-size:12px;">Loading...</div>
                    </div>
                    <div class="ops-actions">
                        <button class="secondary-btn" onclick="runTask('/refresh-ui', this, 'Refreshing...')">Refresh UI</button>
                        <button class="primary-btn" onclick="saveModeOverrides()">Save Modes</button>
                        <button class="primary-btn" onclick="forceSelected()">Force Update</button>
                    </div>

                    <div class="item-sep"></div>

                    <div class="group-header">
                        <input type="checkbox" class="group-chk" id="chk-archived-all">
                        <span class="group-label">Archived</span>
                    </div>
                    <div class="list">
                        ${archiveListHtml}
                    </div>
                    <div class="ops-actions">
                        <button class="primary-btn" onclick="rebuildSelected()">Rebuild</button>
                    </div>

                </div>
            </div>

            <div class="wrapper">
                <div class="table-title">📦 Manual Archive</div>
                <div class="section-body">
                    <div class="form-grid">
                        <div class="form-group">
                            <label class="tool-label">Slug</label>
                            <input type="text" id="ma-slug" placeholder="lpl-2026-split-1" class="form-input">
                        </div>
                        <div class="form-group">
                            <label class="tool-label">Name</label>
                            <input type="text" id="ma-name" placeholder="LPL 2026 Split 1" class="form-input">
                        </div>
                        <div class="form-group">
                            <label class="tool-label">Overview Page</label>
                            <input type="text" id="ma-overview" placeholder="LPL/2026 Season/Split 1" class="form-input">
                        </div>
                        <div class="form-group">
                            <label class="tool-label">League</label>
                            <input type="text" id="ma-league" placeholder="LPL" class="form-input">
                        </div>
                        <div class="form-group">
                            <label class="tool-label">Start Date</label>
                            <input type="text" id="ma-start" placeholder="YYYY-MM-DD" class="form-input">
                        </div>
                        <div class="form-group">
                            <label class="tool-label">End Date</label>
                            <input type="text" id="ma-end" placeholder="YYYY-MM-DD" class="form-input">
                        </div>
                    </div>
                    <div class="actions-row-end">
                        <button class="primary-btn" onclick="submitManualArchive()">Save Metadata</button>
                    </div>
                </div>
            </div>
        </div>
        ${buildFooter}

        <script>
            var authOverlay = document.getElementById("auth-overlay");
            var authPwdInput = document.getElementById("auth-pwd");
            var toastContainer = document.getElementById("toast-container");
            var TOAST_DURATION_MS = 3000;
            var REDIRECT_DELAY_MS = 1500;
            var AUTH_ERROR_MSG = "Session expired or incorrect password.";
            var NETWORK_ERROR_MSG = "❌ Network connection failed";
            var adminToken = sessionStorage.getItem("admin_pwd") || "";
            if (adminToken) authOverlay.style.display = "none";

            document.getElementById('chk-active-all').addEventListener('change', function() {
                document.querySelectorAll('#active-list .item-chk').forEach(function(c) { c.checked = this.checked; }.bind(this));
            });
            document.getElementById('chk-archived-all').addEventListener('change', function() {
                document.querySelectorAll('.qr-chk-archived').forEach(function(c) { c.checked = this.checked; }.bind(this));
            });

            function setAuthOverlayVisible(v) { authOverlay.style.display = v ? "flex" : "none"; }
            function clearAuth() { sessionStorage.removeItem("admin_pwd"); adminToken = ""; authPwdInput.value = ""; setAuthOverlayVisible(true); }
            function showToast(msg, type) {
                type = type || 'success';
                var toast = document.createElement('div');
                toast.className = 'toast ' + type; toast.innerText = msg;
                toastContainer.appendChild(toast); void toast.offsetWidth; toast.classList.add('show');
                setTimeout(function() { toast.classList.remove('show'); setTimeout(function() { toast.remove(); }, 300); }, TOAST_DURATION_MS);
            }
            function unlockTools() { var pwd = authPwdInput.value.trim(); if (pwd) { adminToken = pwd; sessionStorage.setItem('admin_pwd', pwd); setAuthOverlayVisible(false); } }
            function checkAuthError(status) { if (status === 401) { showToast(AUTH_ERROR_MSG, "error"); clearAuth(); return true; } return false; }
            function requireAuth() { if (adminToken) return true; setAuthOverlayVisible(true); return false; }
            function getAuthHeaders(extra) { return Object.assign({ 'Authorization': 'Bearer ' + adminToken }, extra || {}); }
            function setButtonBusy(btn, busyText) {
                var originalText = btn.innerHTML; btn.innerHTML = busyText; btn.style.pointerEvents = 'none'; btn.style.opacity = '0.7';
                return function() { btn.innerHTML = originalText; btn.style.pointerEvents = 'auto'; btn.style.opacity = '1'; };
            }
            function sendAuthorizedPost(url, extraHeaders, body) {
                return fetch(url, { method: 'POST', headers: getAuthHeaders(extraHeaders), body: body });
            }
            function showResult(ok, text) { showToast(text, ok ? 'success' : 'error'); }

            function runTask(url, btnEl, busyText) {
                if (!requireAuth()) return;
                var restore = setButtonBusy(btnEl, busyText || '...');
                fetch(url, { method: 'POST', headers: getAuthHeaders() }).then(function(res) {
                    if (checkAuthError(res.status)) return;
                    showResult(res.ok, res.ok ? '✅ Done' : '❌ Failed: ' + res.status);
                }).catch(function() { showResult(false, NETWORK_ERROR_MSG); }).then(restore);
            }

            function loadModeOverrides() {
                fetch('/mode-overrides').then(function(res) { if (!res.ok) return; return res.json(); }).then(function(data) {
                    if (!data) return;
                    var container = document.getElementById('active-list');
                    var tournaments = data.tournaments || [];
                    if (tournaments.length === 0) { container.innerHTML = '<div style="text-align:center; padding:12px 0; color:#94a3b8; font-size:12px;">No active tournaments</div>'; return; }
                    container.innerHTML = tournaments.map(function(t) {
                        var modeIcon = t.currentMode === 'fast' ? '⚡' : '🐌';
                        var slug = t.slug, name = t.name.replace(/'/g, '&apos;');
                        return '<div class="item">' +
                            '<label class="item-left">' +
                            '<input type="checkbox" class="item-chk" value="' + slug + '">' +
                            '<span class="item-name">' + t.name + ' ' + modeIcon + '</span>' +
                            '</label>' +
                            '<div class="item-right">' +
                            '<select class="mode-select" data-slug="' + slug + '">' +
                            '<option value="auto"' + (t.override === 'auto' ? ' selected' : '') + '>AUTO</option>' +
                            '<option value="fast"' + (t.override === 'fast' ? ' selected' : '') + '>FAST</option>' +
                            '<option value="slow"' + (t.override === 'slow' ? ' selected' : '') + '>SLOW</option>' +
                            '</select>' +
                            '<button class="icon-btn" onclick="forceOne(&apos;' + slug + '&apos;, this)" title="Force">🔄</button>' +
                            '<button class="icon-btn icon-btn-fill" onclick="fillArchive(&apos;' + slug + '&apos;)" title="Fill">📋</button>' +
                            '<button class="icon-btn icon-btn-del" onclick="deleteArchive(&apos;' + slug + '&apos;, &apos;' + name + '&apos;)" title="Delete">🗑️</button>' +
                            '</div>' +
                            '</div>';
                    }).join('');
                    var activeSlugs = tournaments.map(function(t) { return t.slug; });
                    document.querySelectorAll('.qr-chk-archived').forEach(function(c) {
                        if (activeSlugs.indexOf(c.value) >= 0) c.closest('.item').style.display = 'none';
                    });
                }).catch(function() {});
            }

            function saveModeOverrides() {
                if (!requireAuth()) return;
                var selects = document.querySelectorAll('#active-list select[data-slug]');
                var overrides = {};
                selects.forEach(function(s) { overrides[s.dataset.slug] = s.value; });
                sendAuthorizedPost('/mode-overrides', { 'Content-Type': 'application/json' }, JSON.stringify(overrides)).then(function(res) {
                    if (checkAuthError(res.status)) return;
                    showResult(res.ok, res.ok ? '✅ Saved' : '❌ Failed');
                    if (res.ok) loadModeOverrides();
                }).catch(function() { showResult(false, NETWORK_ERROR_MSG); });
            }

            function forceSelected() {
                if (!requireAuth()) return;
                var checked = document.querySelectorAll('#active-list .item-chk:checked');
                if (checked.length === 0) { showToast("No active selected", "error"); return; }
                var slugs = Array.from(checked).map(function(c) { return c.value; });
                var btn = event.target;
                var restore = setButtonBusy(btn, 'Running...');
                sendAuthorizedPost('/force', { 'Content-Type': 'application/json' }, JSON.stringify({ slugs: slugs })).then(function(res) {
                    if (checkAuthError(res.status)) return;
                    showResult(res.ok, res.ok ? '✅ Done' : '❌ Failed: ' + res.status);
                }).catch(function() { showResult(false, NETWORK_ERROR_MSG); }).then(restore);
            }

            function forceOne(slug, btnEl) {
                if (!requireAuth()) return;
                var restore = setButtonBusy(btnEl, '🔄');
                sendAuthorizedPost('/force', { 'Content-Type': 'application/json' }, JSON.stringify({ slugs: [slug] })).then(function(res) {
                    if (checkAuthError(res.status)) return;
                    showResult(res.ok, res.ok ? '✅ Done' : '❌ Failed: ' + res.status);
                }).catch(function() { showResult(false, NETWORK_ERROR_MSG); }).then(restore);
            }

            function rebuildSelected() {
                if (!requireAuth()) return;
                var checked = document.querySelectorAll('.qr-chk-archived:checked');
                if (checked.length === 0) { showToast("No archives selected", "error"); return; }
                var selected = Array.from(checked).map(function(c) { return { slug: c.value, name: c.dataset.name, overview: c.dataset.overview, league: c.dataset.league, start_date: c.dataset.start, end_date: c.dataset.end }; });
                var btn = event.target;
                var restore = setButtonBusy(btn, 'Rebuilding...');
                var success = 0, fail = 0;
                var promises = selected.map(function(s) {
                    return sendAuthorizedPost('/rebuild-archive', { 'Content-Type': 'application/json' }, JSON.stringify(s)).then(function(res) { if (res.ok) success++; else { fail++; if (checkAuthError(res.status)) return; } }).catch(function() { fail++; });
                });
                Promise.all(promises).then(function() { restore(); showResult(fail === 0, success + '/' + (success + fail) + ' rebuilt'); });
            }

            function fillArchive(slug) {
                var chk = document.querySelector('.qr-chk-archived[value="' + slug + '"]');
                if (!chk) return;
                document.getElementById('ma-slug').value = chk.value;
                document.getElementById('ma-name').value = chk.dataset.name || '';
                document.getElementById('ma-overview').value = chk.dataset.overview || '';
                document.getElementById('ma-league').value = chk.dataset.league || '';
                document.getElementById('ma-start').value = chk.dataset.start || '';
                document.getElementById('ma-end').value = chk.dataset.end || '';
            }

            function deleteArchive(slug, name) {
                if (!requireAuth()) return;
                if (!confirm('Delete ' + name + '?')) return;
                sendAuthorizedPost('/delete-archive', { 'Content-Type': 'application/json' }, JSON.stringify({ slug: slug, name: name })).then(function(res) {
                    if (checkAuthError(res.status)) return;
                    showResult(res.ok, res.ok ? '🗑️ Deleted' : '❌ Failed');
                    if (res.ok) location.reload();
                }).catch(function() { showResult(false, NETWORK_ERROR_MSG); });
            }

            function submitManualArchive() {
                if (!requireAuth()) return;
                var payload = {
                    slug: document.getElementById('ma-slug').value.trim(),
                    name: document.getElementById('ma-name').value.trim(),
                    overview: document.getElementById('ma-overview').value.trim(),
                    league: document.getElementById('ma-league').value.trim(),
                    start_date: document.getElementById('ma-start').value.trim(),
                    end_date: document.getElementById('ma-end').value.trim()
                };
                if (!payload.slug || !payload.name || !payload.overview || !payload.league) { showToast("⚠️ Slug, Name, Overview, League required", "error"); return; }
                sendAuthorizedPost('/manual-archive', { 'Content-Type': 'application/json' }, JSON.stringify(payload)).then(function(res) {
                    if (checkAuthError(res.status)) return;
                    showResult(res.ok, res.ok ? '📦 Saved' : '❌ Failed');
                    if (res.ok) setTimeout(function() { location.reload(); }, REDIRECT_DELAY_MS);
                }).catch(function() { showResult(false, NETWORK_ERROR_MSG); });
            }

            loadModeOverrides();
        </script>
    </body>
    </html>`;
  }
  static renderLogPage(leagueLogs, time, sha, options = {}) {
    if (!leagueLogs) leagueLogs = [];
    const slowThresholdMinutes = Number(options.slowThresholdMinutes) || 60;
    const cronIntervalMinutes = Number(options.cronIntervalMinutes) || 3;

    function extractLeaguePart(msg, league) {
      const sections = msg.split(/\s*\|\s*/);
      const kept = [];
      for (const sec of sections) {
        if (sec.includes("⚙️")) continue;
        const items = sec.match(/(?:❌|🚧)?\s*[A-Za-z0-9]+(?:\s[A-Za-z0-9]+)*\s*(?:(?:\+\d+(?:~\d+)?)|(?:~\d+)|±0)?\s*\([^)]*\)/g);
        if (!items) { kept.push(sec); continue; }
        const matched = items.filter(i => i.includes(league));
        if (matched.length > 0) kept.push(sec.replace(/(?:❌|🚧)?\s*[A-Za-z0-9]+(?:\s[A-Za-z0-9]+)*\s*(?:(?:\+\d+(?:~\d+)?)|(?:~\d+)|±0)?\s*\([^)]*\)(?:,\s*)?/g, "").trim() + " " + matched.join(", "));
      }
      return kept.join(" | ").replace(/\s+/g, " ").trim();
    }

    const leagueItems = Array.isArray(leagueLogs)
      ? leagueLogs
      : Object.keys(leagueLogs).map(name => ({ name, ...(leagueLogs[name] || {}) }));

    const cardsHtml = leagueItems.map(item => {
      const name = item.name || "";
      const entries = (item.logs || []).map(e => ({ ...e, m: extractLeaguePart(e.m || "", name) }));
      const lastEntry = entries[0];
      const last = lastEntry.m || "";
      const isSlow = item.mode === "slow";
      const hasErr = last.includes("❌") || last.includes("🚧");
      const hasSync = entries.some(e => e.m.includes("🔄"));
      const dotCls = hasErr ? "dot-red" : hasSync ? "dot-green" : "dot-gray";
      const modeCls = isSlow ? "mode-slow" : "mode-fast";

      const syncCount = entries.filter(e => e.m.includes("🔄")).length;
      const errCount = entries.filter(e => e.m.includes("❌") || e.m.includes("🚧")).length;
      const totalCount = Number.isFinite(item.totalMatches) ? item.totalMatches : null;
      const lastTime = lastEntry.t || "";
      const lastUtcIso = lastTime.length >= 16 ? `20${lastTime.slice(0,8)}T${lastTime.slice(9)}:00Z` : "";

      const bars = entries.slice(-10).reverse().map(e => {
        const cls = e.m.includes("🔄") ? "bar-sync" : e.m.includes("❌") ? "bar-err" : "bar-idle";
        const h = e.m.includes("🔄") ? "100%" : e.m.includes("❌") ? "70%" : "30%";
        return `<div class="bar ${cls}" style="height:${h}"></div>`;
      }).join("");

      const rows = entries.slice(-10).map(e => {
        const t = e.t || "";
        const utcIso = t.length >= 16 ? `20${t.slice(0,8)}T${t.slice(9)}:00Z` : "";
        const msg = e.m.replace(/(\+\d+(?:~\d+)?|~\d+|±0)/g, '<span class="hl">$1</span>');
        return `<div class="log-mini-row"><span class="log-mini-time utc-local" data-utc="${utcIso}" data-format="datetime">${t}</span><span class="log-mini-msg">${msg}</span></div>`;
      }).join("");

      return `<div class="league-card">
        <div class="league-card-header"><div class="league-card-title"><span class="league-card-name">${name}</span>${totalCount == null ? '' : `<span class="league-total-pill">${totalCount}</span>`}</div><div class="league-card-status"><span class="mode-tag ${modeCls}">${isSlow?`🐌${slowThresholdMinutes}m`:`⚡${cronIntervalMinutes}m`}</span><div class="status-dot ${dotCls}"></div></div></div>
        <div class="card-stats"><span>SYNC <span class="stat-val">${syncCount}</span></span><span>ERR <span class="stat-val">${errCount}</span></span><span>LAST <span class="stat-val utc-local" data-utc="${lastUtcIso}" data-format="datetime">${lastTime}</span></span></div>
        <div class="timeline">${bars}</div>
        <div class="league-card-logs">${rows}</div>
      </div>`;
    }).join("");

    const buildFooter = HTMLRenderer.renderBuildFooter(time, sha);

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Logs</title>
    ${HTMLRenderer.renderFontLinks()}
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text x='50' y='.9em' font-size='85' text-anchor='middle'>📜</text></svg>">
    <style>
        ${LOG_PAGE_STYLE}
    </style>
</head>
<body>
    <header class="main-header">
        <div class="header-left"><span class="header-logo">📜</span><h1 class="header-title">Logs</h1></div>
        <div class="header-right">
            ${HTMLRenderer.renderActionBtn("/", "🏠", "Home")}
            ${HTMLRenderer.renderActionBtn("/tools", "🧰", "Tools")}
        </div>
    </header>
    <div class="logs-cards-container">
        ${cardsHtml || '<div class="empty-logs">No logs found</div>'}
    </div>
    ${buildFooter}
    ${HTMLRenderer.renderPythonJS()}
</body>
</html>`;
  }

  /**
   * 生成完整率字符串
   */
  static generateFullRateString(t_bo3_f, t_bo3_t, t_bo5_f, t_bo5_t) {
    if (t_bo3_t === 0 && t_bo5_t === 0) return "";
    
    let parts = [];
    if (t_bo3_t > 0) {
      parts.push(`BO3: **${t_bo3_f}/${t_bo3_t}** (${dataUtils.pct(dataUtils.rate(t_bo3_f, t_bo3_t))})`);
    }
    if (t_bo5_t > 0) {
      parts.push(`BO5: **${t_bo5_f}/${t_bo5_t}** (${dataUtils.pct(dataUtils.rate(t_bo5_f, t_bo5_t))})`);
    }
    return `📊 **Fullrate**: ${parts.join(" | ")}\n\n`;
  }

  /**
   * 生成Markdown表格
   */
  static generateMarkdown(tournament, stats, timeGrid) {
    const sorted = dataUtils.sortTeams(stats);

    // 计算联赛总打满量
    let bo3FullMatches = 0, bo3TotalMatches = 0, bo5FullMatches = 0, bo5TotalMatches = 0;
    sorted.forEach(s => {
      bo3FullMatches += s.bo3_f || 0; bo3TotalMatches += s.bo3_t || 0;
      bo5FullMatches += s.bo5_f || 0; bo5TotalMatches += s.bo5_t || 0;
    });
    // 比赛双向记录，总数需除以 2
    bo3FullMatches /= 2; bo3TotalMatches /= 2; bo5FullMatches /= 2; bo5TotalMatches /= 2;

    let fullRateStr = HTMLRenderer.generateFullRateString(bo3FullMatches, bo3TotalMatches, bo5FullMatches, bo5TotalMatches);

    let md = `# ${tournament.name}\n\n${fullRateStr}| TEAM | BO3 FULL | BO3% | BO5 FULL | BO5% | SERIES | SERIES WR | GAMES | GAME WR | STREAK | LAST DATE |\n| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;

    if (sorted.length === 0) {
      md += "| - | - | - | - | - | - | - | - | - | - | - |\n";
    } else {
      sorted.forEach(s => {
        const bo3Txt = s.bo3_t ? `${s.bo3_f}/${s.bo3_t}` : "-";
        const bo3Pct = dataUtils.pct(dataUtils.rate(s.bo3_f, s.bo3_t));
        const bo5Txt = s.bo5_t ? `${s.bo5_f}/${s.bo5_t}` : "-";
        const bo5Pct = dataUtils.pct(dataUtils.rate(s.bo5_f, s.bo5_t));
        const serTxt = s.s_t ? `${s.s_w}-${s.s_t - s.s_w}` : "-";
        const serWR = dataUtils.pct(dataUtils.rate(s.s_w, s.s_t));
        const gamTxt = s.g_t ? `${s.g_w}-${s.g_t - s.g_w}` : "-";
        const gamWR = dataUtils.pct(dataUtils.rate(s.g_w, s.g_t));
        const strk = s.strk_w > 0 ? `${s.strk_w}W` : (s.strk_l > 0 ? `${s.strk_l}L` : "-");
        const last = s.last ? dateUtils.fmtDate(s.last) : "-";
        md += `| ${s.name} | ${bo3Txt} | ${bo3Pct} | ${bo5Txt} | ${bo5Pct} | ${serTxt} | ${serWR} | ${gamTxt} | ${gamWR} | ${strk} | ${last} |\n`;
      });
    }

    md += `\n## \n📅 **Time Slot Distribution**\n\n| Time Slot | Mon | Tue | Wed | Thu | Fri | Sat | Sun | Total |\n| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;

    const regionGrid = timeGrid[tournament.slug] || {};
    const hours = Object.keys(regionGrid).filter(k => k !== "Total" && !isNaN(k)).map(Number).sort((a, b) => a - b);

    [...hours, "Total"].forEach(h => {
      if (!regionGrid[h]) return;
          const label = h === "Total" ? `**Total**` : `**${String(h).padStart(2,'0')}:00**`;
      let line = `| ${label} |`;
      for (let w = 0; w < 8; w++) {
        const cell = regionGrid[h][w];
        if (!cell || cell.total === 0) line += " - |";
        else {
          const rate = Math.round((cell.full / cell.total) * 100);
          line += ` ${cell.full}/${cell.total} (${rate}%) |`;
        }
      }
      md += line + "\n";
    });

    return md;
  }
}
