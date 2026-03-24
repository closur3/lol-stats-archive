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
    const STYLE_ARCHIVE_INNER = 'style="margin-bottom:0; box-shadow:none; border:none; border-top:1px solid #f1f5f9; border-radius:0;"';
    const STYLE_TITLE_ROW = 'style="display:flex; align-items:center; gap: 6px;"';
    const STYLE_SCH_HEADER = 'style="background:#f8fafc;color:#334155"';
    const STYLE_SCH_COUNT = 'style="font-size:11px;opacity:0.6"';
    const STYLE_SCORE_SEP = 'style="opacity:0.4; margin:0 1px;"';
    const STYLE_VS_TEXT = 'style="color:#94a3b8;font-size:13px;font-weight:700;margin:0 2px;"';
    const STYLE_SCH_GROUP_HEADER = 'style="background:#f8fafc"';
    const STYLE_SCH_GROUP_ROW = 'style="width:100%; padding:0 10px; box-sizing:border-box"';
    const STYLE_SCH_GROUP_NAME = 'style="font-weight:800"';
    const STYLE_SCH_GROUP_BLOCK = 'style="font-weight:800; opacity:0.7"';
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
               `<td class="col-last" ${lastStyle}>${lastMatch}</td></tr>`;
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
            html += `<tr style="${isTotal ? 'font-weight:bold; background:#f8fafc;' : ''}"><td class="team-col" style="${isTotal ? 'background:#f1f5f9;' : ''}">${label}</td>`;

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

        return `<div class="sch-row"><span class="sch-time">${match.time}</span><div class="sch-vs-container"><div class="spine-row"><span class="${isTbd1 ? "spine-l" : "spine-l clickable"}" ${t1Click} ${isTbd1 ? STYLE_TBD_TEAM : ""}>${r1}${match.t1}</span><span class="${h2hClass}" ${h2hClick} ${STYLE_SCH_MID_CELL}>${midContent}</span><span class="${isTbd2 ? "spine-r" : "spine-r clickable"}" ${t2Click} ${isTbd2 ? STYLE_TBD_TEAM : ""}>${match.t2}${r2}</span></div></div><div class="sch-tag-col"><span class="${boClass}">${boLabel}</span></div></div>`;
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
        const tableBody = `<table id="${tableId}"><thead><tr><th class="team-col" onclick="doSort(0, '${tableId}')">TEAM</th><th colspan="2" onclick="doSort(2, '${tableId}')">BO3 FULLRATE</th><th colspan="2" onclick="doSort(4, '${tableId}')">BO5 FULLRATE</th><th colspan="2" onclick="doSort(5, '${tableId}')">SERIES</th><th colspan="2" onclick="doSort(7, '${tableId}')">GAMES</th><th class="col-streak" onclick="doSort(9, '${tableId}')">STREAK</th><th class="col-last" onclick="doSort(10, '${tableId}')">LAST DATE</th></tr></thead><tbody>${rows}</tbody></table>`;

        const regionGrid = timeData[tournament.slug] || {};
        const timeTableHtml = buildTimeTable(regionGrid);

        const emojiStr = (!isArchive && tournMeta[tournament.slug] && tournMeta[tournament.slug].emoji)
            ? `<span ${STYLE_EMOJI}>${tournMeta[tournament.slug].emoji}</span>`
            : "";
        const titleLink = `<a href="https://lol.fandom.com/wiki/${mainPage}" target="_blank">${tournament.name}</a>`;

        if (isArchive) {
            const headerRight = `<div class="title-right-area" style="justify-content: flex-start;">${leagueSummaryHtml}</div>`;
            const headerContent = `<div class="arch-title-wrapper"><span class="arch-indicator">❯</span> ${titleLink}</div> ${headerRight}`;
            tablesHtml += `<details class="arch-sec"><summary class="arch-sum">${headerContent}</summary><div class="wrapper" ${STYLE_ARCHIVE_INNER}>${tableBody}${timeTableHtml}</div></details>`;
        } else {
            const headerRight = `<div class="title-right-area" style="justify-content: flex-start;">${leagueSummaryHtml}</div>`;
            tablesHtml += `<div class="wrapper"><div class="table-title"><div ${STYLE_TITLE_ROW}>${emojiStr}${titleLink}</div> ${headerRight}</div>${tableBody}${timeTableHtml}</div>`;
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
                let cardHtml = `<div class="sch-card"><div class="sch-header" ${STYLE_SCH_HEADER}><span>📅 ${d.slice(5)} ${dayName}</span><span ${STYLE_SCH_COUNT}>${matches.length} Matches</span></div><div class="sch-body">`;
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

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title><style>${PYTHON_STYLE}</style><link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text x='50' y='.9em' font-size='85' text-anchor='middle'>${logoIcon}</text></svg>"></head><body><header class="main-header"><div class="header-left"><span class="header-logo">${logoIcon}</span><h1 class="header-title">${title}</h1></div><div class="header-right">${navBtn}${toolsBtn}${HTMLRenderer.renderActionBtn("/logs", "📜", "Logs")}</div></header><div class="container">${bodyContent}</div><div id="matchModal" class="modal"><div class="modal-content"><h3 id="modalTitle">Match History</h3><div id="modalList" class="match-list"></div></div></div>${HTMLRenderer.renderPythonJS()}</body></html>`;
  }

  /**
   * 渲染页脚
   */
  static renderBuildFooter(time, sha) {
    const shortSha = (sha || "").slice(0, 7) || "unknown";
    return `<div class="build-footer"><code class="footer-label">deployed:</code> <code class="footer-time">${time || "N/A"}</code> <a href="${GITHUB_COMMIT_BASE}${sha}" target="_blank"><code class="footer-sha">@${shortSha}</code></a></div>`;
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
              const seriesA = parseValue(rowA.cells[COL_SERIES_WR].innerText); 
              const seriesB = parseValue(rowB.cells[COL_SERIES_WR].innerText); 
              if (seriesA !== seriesB) return seriesB - seriesA; 
            }
            
            if (columnIndex === COL_SERIES) {
                // 胜负记录次级排序：按小场净胜场降序
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
            } else if (columnIndex === COL_SERIES_WR) {
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
            return 0;
        });

        table.setAttribute(sortDirKey, nextDir);
        rows.forEach(row => tbody.appendChild(row));
    }

    function parseValue(value) {
        if(value === "-") return -1; 
        if(value.includes('%')) return parseFloat(value);
        if(value.includes('/')) {
          const parts = value.split('/');
          return parts[1] === '-' ? -1 : parseFloat(parts[0]) / parseFloat(parts[1]);
        }
        if(value.includes('-') && value.split('-').length === 2) {
          return parseFloat(value.split('-')[0]);
        }
        const num = parseFloat(value); 
        return isNaN(num) ? value.toLowerCase() : num;
    }

    function renderMatchItem(mode, date, resTag, team1, team2, isFull, score, resStatus) {
        const dateParts = (date || '').split(' ');
        const dateHtml = dateParts.length === 2 
          ? dateParts[0] + '<br><span ' + STYLE_DATE_TIME + '>' + dateParts[1] + '</span>' 
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
    }

    function showPopup(title, dayIndex, matches) {
        const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Total"];
        document.getElementById('modalTitle').innerText = title + " - " + dayNames[dayIndex];
        const sortedMatches = [...matches].sort((matchA, matchB) => matchB.d.localeCompare(matchA.d));
        const listHtml = sortedMatches.map(match => {
            let boTag = '<span ' + STYLE_MUTED_DASH + '>-</span>';
            if (match.bo === 5) boTag = '<span class="sch-pill gold">BO5</span>';
            else if (match.bo === 3) boTag = '<span class="sch-pill">BO3</span>';
            else if (match.bo === 1) boTag = '<span class="sch-pill">BO1</span>';
            return renderMatchItem('distribution', match.d, boTag, match.t1, match.t2, match.f, match.s);
        });
        renderListHTML(listHtml);
        document.getElementById('matchModal').style.display = "block";
    }

    function openTeam(slug, teamName) {
        if (!window.g_stats || !window.g_stats[slug] || !window.g_stats[slug][teamName]) return;
        const data = window.g_stats[slug][teamName];
        document.getElementById('modalTitle').innerText = teamName + " - Schedule";
        const listHtml = (data.history || []).map(match => {
            const icon = RESULT_ICON_MAP[match.res] || RESULT_ICON_MAP['N'];
            const resultTag = \`<span class="\${(match.res === 'W' || match.res === 'L') ? '' : 'hist-icon'}">\${icon}</span>\`;
            return renderMatchItem('history', match.d, resultTag, teamName, match.vs, match.full, match.s, match.res);
        });
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
        const listHtml = history.map(match => {
            const icon = RESULT_ICON_MAP[match.res] || RESULT_ICON_MAP['N'];
            const resultTag = \`<span class="\${(match.res === 'W' || match.res === 'L') ? '' : 'hist-icon'}">\${icon}</span>\`;
            return renderMatchItem('history', match.d, resultTag, teamName, match.vs, match.full, match.s, match.res);
        });
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
            return renderMatchItem('history', match.d, resultTag, team1Name, match.vs, match.full, match.s, match.res);
        });
        renderListHTML(listHtml);
        document.getElementById('matchModal').style.display="block";
    }

    function closePopup(){document.getElementById('matchModal').style.display="none";}
    window.onclick=function(e){if(e.target==document.getElementById('matchModal'))closePopup();}
    </script>
    `;
  }

  /**
   * 渲染工具页面
   */
  static renderToolsPage(time, sha, existingArchives = []) {
    const buildFooter = HTMLRenderer.renderBuildFooter(time, sha);
    const renderTaskCard = (panelTitle, actionTitle, actionDesc, btnId, endpoint, btnText) => `
            <div class="wrapper">
                <div class="table-title">${panelTitle}</div>
                <div class="section-body section-body-compact flex-row">
                    <div>
                        <div class="tool-info-title">${actionTitle}</div>
                        <div class="tool-info-desc">${actionDesc}</div>
                    </div>
                    <button class="primary-btn" id="${btnId}" onclick="runTask('${endpoint}', '${btnId}')">${btnText}</button>
                </div>
            </div>`;

    // 构建复选框列表（带删除和填充按钮）
    let archiveListHtml = existingArchives.map(t => {
        const overviewStr = Array.isArray(t.overview_page) ? JSON.stringify(t.overview_page) : JSON.stringify([t.overview_page]);
        const startDate = t.start_date || '';
        const endDate = t.end_date || '';
        return `
        <div class="qr-item">
            <label class="qr-label">
                <input type="checkbox" class="qr-chk form-checkbox" value="${t.slug}" data-name="${t.name}" data-overview='${overviewStr}' data-league="${t.league}" data-start="${startDate}" data-end="${endDate}">
                <span class="qr-league">${t.league || 'UNKN'}</span>
                <span class="qr-name">${t.name}</span>
            </label>
            <div class="qr-actions">
                <button class="fill-btn" onclick="fillArchive('${t.slug}')" title="Fill to Manual Archive">📋</button>
                <button class="delete-btn" onclick="deleteArchive('${t.slug}', '${t.name}')" title="Delete">🗑️</button>
            </div>
        </div>
    `}).join("");
    if (!archiveListHtml) archiveListHtml = "<div class='tool-info-desc' style='text-align:center; padding: 20px 0;'>No existing archives found.</div>";

    return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Tools</title>
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
                <div class="auth-title">Admin Authentication</div>
                <div class="auth-subtitle">Please verify your identity to access tools.</div>
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
            ${renderTaskCard("🎨 UI Customization", "Local UI Refresh", "Regenerate static HTML using existing cached data. No API calls.", "btn-refresh", "/refresh-ui", "Refresh HTML")}

            ${renderTaskCard("⚡ Synchronization", "Force Update", "Trigger a full manual sync for all active tournaments.", "btn-force", "/force", "Refresh API")}

            <div class="wrapper">
                <div class="table-title">🗃️ Quick Rebuild</div>
                <div class="section-body">
                    <div class="tool-info-desc tool-info-desc-spaced">Select existing archives below to quickly refresh their data from Fandom.</div>
                    <div class="qr-list-container">
                        ${archiveListHtml}
                    </div>
                    <div class="actions-row-end" style="gap: 12px; margin-top: 15px;">
                        <button class="secondary-btn" onclick="toggleSelectAllArchives()">Select All</button>
                        <button class="primary-btn" id="btn-quick-rebuild" onclick="rebuildSelected()">Rebuild</button>
                    </div>
                </div>
            </div>

            <div class="wrapper">
                <div class="table-title">📦 Manual Archive</div>
                <div class="section-body">
                    <div class="tool-info-desc tool-info-desc-spaced">Manually add tournament metadata. This only stores configuration without fetching data from Fandom.</div>

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
                            <input type="text" id="ma-overview" placeholder='LPL/2026 Season/Split 1 or ["Page1", "Page2"]' class="form-input">
                            <span style="font-size:11px; color:#64748b; margin-top:4px;">Comma-separated or JSON array</span>
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
                        <button class="primary-btn" id="btn-manual-archive" onclick="submitManualArchive()">Save Metadata</button>
                    </div>
                </div>
            </div>
        </div>
        ${buildFooter}

        <script>
            const authOverlay = document.getElementById("auth-overlay");
            const authPwdInput = document.getElementById("auth-pwd");
            const toastContainer = document.getElementById("toast-container");
            const rebuildInputIds = ["slug", "name", "overview", "league"];
            const rebuildInputs = Object.fromEntries(
                rebuildInputIds.map((key) => [key, document.getElementById("rb-" + key)])
            );
            const TOAST_DURATION_MS = 3000;
            const REDIRECT_DELAY_MS = 1500;
            const AUTH_ERROR_MSG = "Session expired or incorrect password.";
            const NETWORK_ERROR_MSG = "❌ Network connection failed";
            const REBUILD_REQUIRED_MSG = "⚠️ Please fill in all 4 fields.";
            let adminToken = sessionStorage.getItem("admin_pwd") || "";
            if (adminToken) authOverlay.style.display = "none";

            function setAuthOverlayVisible(visible) {
                authOverlay.style.display = visible ? "flex" : "none";
            }

            function clearAuth() {
                sessionStorage.removeItem("admin_pwd");
                adminToken = "";
                authPwdInput.value = "";
                setAuthOverlayVisible(true);
            }
            function getRebuildPayload() {
                return {
                    slug: rebuildInputs.slug.value.trim(),
                    name: rebuildInputs.name.value.trim(),
                    overview: rebuildInputs.overview.value.trim(),
                    league: rebuildInputs.league.value.trim()
                };
            }

            function showToast(msg, type = 'success') {
                const toast = document.createElement('div');
                toast.className = 'toast ' + type;
                toast.innerText = msg;
                toastContainer.appendChild(toast);
                void toast.offsetWidth;
                toast.classList.add('show');
                setTimeout(() => {
                    toast.classList.remove('show');
                    setTimeout(() => toast.remove(), 300);
                }, TOAST_DURATION_MS);
            }

            function unlockTools() {
                const pwd = authPwdInput.value.trim();
                if (pwd) {
                    adminToken = pwd;
                    sessionStorage.setItem('admin_pwd', pwd);
                    setAuthOverlayVisible(false);
                }
            }

            function checkAuthError(status) {
                if (status === 401) {
                    showToast(AUTH_ERROR_MSG, "error");
                    clearAuth();
                    return true;
                }
                return false;
            }

            function requireAuth() {
                if (adminToken) return true;
                setAuthOverlayVisible(true);
                return false;
            }

            function getAuthHeaders(extra = {}) {
                return { 'Authorization': 'Bearer ' + adminToken, ...extra };
            }

            function setButtonBusy(btn, busyText) {
                const originalText = btn.innerHTML;
                btn.innerHTML = busyText;
                btn.style.pointerEvents = 'none';
                btn.style.opacity = '0.7';
                return () => {
                    btn.innerHTML = originalText;
                    btn.style.pointerEvents = 'auto';
                    btn.style.opacity = '1';
                };
            }

            async function sendAuthorizedPost(url, extraHeaders = {}, body) {
                const options = {
                    method: 'POST',
                    headers: getAuthHeaders(extraHeaders)
                };
                if (body !== undefined) options.body = body;
                return fetch(url, options);
            }

            async function handleTaskResponse(res, okMsg, redirectTo, errPrefix = "⚠️ Server Error: ") {
                if (checkAuthError(res.status)) return;
                if (res.ok) {
                    showToast(okMsg);
                    setTimeout(() => window.location.href = redirectTo, REDIRECT_DELAY_MS);
                    return;
                }
                const errText = await res.text();
                showToast(errPrefix + errText, "error");
            }

            async function runTask(endpoint, btnId) {
                if (!requireAuth()) return;
                const btn = document.getElementById(btnId);
                const restoreBtn = setButtonBusy(btn, '⏳ Processing...');

                try {
                    const res = await sendAuthorizedPost(endpoint);
                    await handleTaskResponse(res, "✅ Task completed successfully!", "/");
                } catch (e) {
                    showToast(NETWORK_ERROR_MSG, "error");
                } finally {
                    restoreBtn();
                }
            }

            async function submitRebuild() {
                if (!requireAuth()) return;
                const payload = getRebuildPayload();

                if (!payload.slug || !payload.name || !payload.overview || !payload.league) {
                    showToast(REBUILD_REQUIRED_MSG, "error");
                    return;
                }

                const btn = document.getElementById('btn-rebuild');
                const restoreBtn = setButtonBusy(btn, '⏳ Rebuilding...');

                try {
                    const body = JSON.stringify({ slug: payload.slug, name: payload.name, overview_page: payload.overview, league: payload.league });
                    const res = await sendAuthorizedPost('/rebuild-archive', { 'Content-Type': 'application/json' }, body);
                    await handleTaskResponse(res, "✅ Archive reconstructed!", "/archive", "⚠️ Error: ");
                } catch (e) {
                    showToast(NETWORK_ERROR_MSG, "error");
                } finally {
                    restoreBtn();
                }
            }

            // 手动存档功能（仅存储元数据）
            async function submitManualArchive() {
                if (!requireAuth()) return;

                const payload = {
                    slug: document.getElementById('ma-slug').value.trim(),
                    name: document.getElementById('ma-name').value.trim(),
                    overview: document.getElementById('ma-overview').value.trim(),
                    league: document.getElementById('ma-league').value.trim(),
                    start_date: document.getElementById('ma-start').value,
                    end_date: document.getElementById('ma-end').value
                };

                if (!payload.slug || !payload.name || !payload.overview || !payload.league) {
                    showToast("⚠️ Please fill in all required fields (Slug, Name, Overview Page, League).", "error");
                    return;
                }

                const btn = document.getElementById('btn-manual-archive');
                const restoreBtn = setButtonBusy(btn, '⏳ Saving...');

                try {
                    const body = JSON.stringify({
                        slug: payload.slug,
                        name: payload.name,
                        overview_page: payload.overview,
                        league: payload.league,
                        start_date: payload.start_date,
                        end_date: payload.end_date
                    });
                    const res = await sendAuthorizedPost('/manual-archive', { 'Content-Type': 'application/json' }, body);
                    await handleTaskResponse(res, "✅ Tournament metadata saved!", "/tools", "⚠️ Error: ");
                } catch (e) {
                    showToast(NETWORK_ERROR_MSG, "error");
                } finally {
                    restoreBtn();
                }
            }

            // 新增：快速重构的全选逻辑
            function toggleSelectAllArchives() {
                const checkboxes = document.querySelectorAll('.qr-chk');
                const allChecked = Array.from(checkboxes).every(c => c.checked);
                checkboxes.forEach(c => c.checked = !allChecked);
            }

            // 新增：批量循环发送重构请求
            async function rebuildSelected() {
                if (!requireAuth()) return;
                const checkboxes = document.querySelectorAll('.qr-chk:checked');
                if (checkboxes.length === 0) {
                    showToast("⚠️ Please select at least one archive.", "error");
                    return;
                }

                const btn = document.getElementById('btn-quick-rebuild');
                const restoreBtn = setButtonBusy(btn, '⏳ Rebuilding...');

                let successCount = 0;
                let failCount = 0;

                for (const chk of checkboxes) {
                    const overviewAttr = chk.getAttribute('data-overview');
                    let overviewPage;
                    try {
                        overviewPage = JSON.parse(overviewAttr);
                    } catch (e) {
                        overviewPage = overviewAttr;
                    }
                    const payload = {
                        slug: chk.value,
                        name: chk.getAttribute('data-name'),
                        overview_page: overviewPage,
                        league: chk.getAttribute('data-league'),
                        start_date: chk.getAttribute('data-start') || null,
                        end_date: chk.getAttribute('data-end') || null
                    };

                    try {
                        showToast("⏳ Fetching: " + payload.name, "success");
                        const res = await sendAuthorizedPost('/rebuild-archive', { 'Content-Type': 'application/json' }, JSON.stringify(payload));

                        if (checkAuthError(res.status)) {
                            restoreBtn();
                            return;
                        }

                        if (res.ok) {
                            successCount++;
                            showToast("✅ Completed: " + payload.name, "success");
                        } else {
                            failCount++;
                            const errText = await res.text();
                            showToast("⚠️ Error (" + payload.name + "): " + errText, "error");
                        }
                    } catch (e) {
                        failCount++;
                        showToast("❌ Network Error: " + payload.name, "error");
                    }
                }

                restoreBtn();
                if (failCount === 0 && successCount > 0) {
                    showToast("🎉 All selected archives rebuilt successfully!", "success");
                    setTimeout(() => window.location.href = "/archive", REDIRECT_DELAY_MS);
                } else if (failCount > 0) {
                    showToast("⚠️ Finished with " + failCount + " errors.", "error");
                }
            }

            // 删除存档功能
            async function deleteArchive(slug, name) {
                if (!requireAuth()) return;
                if (!confirm('Are you sure you want to delete archive "' + name + '"?')) return;

                try {
                    showToast("⏳ Deleting: " + name, "success");
                    const res = await sendAuthorizedPost('/delete-archive', { 'Content-Type': 'application/json' }, JSON.stringify({ slug }));

                    if (checkAuthError(res.status)) return;

                    if (res.ok) {
                        showToast("✅ Archive deleted: " + name, "success");
                        setTimeout(() => window.location.reload(), REDIRECT_DELAY_MS);
                    } else {
                        const errText = await res.text();
                        showToast("⚠️ Error: " + errText, "error");
                    }
                } catch (e) {
                    showToast("❌ Network Error", "error");
                }
            }

            // 填充存档到手动存档表单
            function fillArchive(slug) {
                const checkbox = document.querySelector('.qr-chk[value="' + slug + '"]');
                if (!checkbox) return;

                const name = checkbox.getAttribute('data-name');
                const overviewAttr = checkbox.getAttribute('data-overview');
                const league = checkbox.getAttribute('data-league');
                const startDate = checkbox.getAttribute('data-start');
                const endDate = checkbox.getAttribute('data-end');

                let overviewPage;
                try {
                    overviewPage = JSON.parse(overviewAttr);
                } catch (e) {
                    overviewPage = overviewAttr;
                }

                // 填充到 Manual Archive 表单
                document.getElementById('ma-slug').value = slug;
                document.getElementById('ma-name').value = name;

                if (Array.isArray(overviewPage)) {
                    document.getElementById('ma-overview').value = overviewPage.join(', ');
                } else {
                    document.getElementById('ma-overview').value = overviewPage || '';
                }

                document.getElementById('ma-league').value = league || '';
                document.getElementById('ma-start').value = startDate || '';
                document.getElementById('ma-end').value = endDate || '';

                showToast('✅ Filled to Manual Archive. Modify and save!', 'success');

                // 滚动到 Manual Archive 区域
                document.getElementById('ma-slug').scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        </script>
    </body>
    </html>`;
  }

  /**
   * 渲染日志页面
   */
  static renderLogPage(logs, time, sha) {
    if (!Array.isArray(logs)) logs = [];
    const logLevelClassMap = { ERROR: "lvl-err", SUCCESS: "lvl-ok" };
    const entries = logs.map(log => {
        const lvlClass = logLevelClassMap[log.l] || "lvl-inf";
        return `<li class="log-entry"><code class="log-time">${log.t}</code><span class="log-level ${lvlClass}">${log.l}</span><code class="log-msg">${log.m}</code></li>`;
    }).join("");
    const buildFooter = HTMLRenderer.renderBuildFooter(time, sha);

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Logs</title>
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
    <div class="container logs-container-tight">
        <ul class="log-list">${entries}</ul>
        ${logs.length === 0 ? '<div class="empty-logs">No logs found</div>' : ''}
    </div>
    ${buildFooter}
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