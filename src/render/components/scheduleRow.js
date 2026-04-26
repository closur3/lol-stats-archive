import { getRateHtml } from './rateBadge.js';

const STYLE_VS_TEXT = 'style="color:#94a3b8;font-size:13px;font-weight:700;margin:0 2px;"';
const STYLE_SCORE_SEP = 'style="opacity:0.4; margin:0 1px;"';
const STYLE_SCH_MID_CELL = 'style="display:flex;justify-content:center;align-items:center;width:34px;transition:background 0.2s;"';
const STYLE_TBD_TEAM = 'style="color:#9ca3af"';

const escapeHtml = (str) => {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
};

const escapeJsString = (str) => {
  if (!str) return "";
  return escapeHtml(str).replace(/\//g, "&#x2F;");
};

export function buildScheduleRow(match, globalStats) {
  const bestOfLabel = match.bestOf ? `BO${match.bestOf}` : "";
  const bestOfClass = match.bestOf === 5 ? "sch-pill gold" : "sch-pill";
  const isTbd1 = match.team1Name === "TBD", isTbd2 = match.team2Name === "TBD";
  const safeTeam1 = escapeJsString(match.team1Name);
  const safeTeam2 = escapeJsString(match.team2Name);
  const safeDisplay1 = escapeHtml(match.team1Name);
  const safeDisplay2 = escapeHtml(match.team2Name);
  const team1ClickHandler = isTbd1 ? "" : `onclick="openTeam('${match.slug}', '${safeTeam1}')"`;
  const team2ClickHandler = isTbd2 ? "" : `onclick="openTeam('${match.slug}', '${safeTeam2}')"`;
  const team1RateHint = getRateHtml(safeDisplay1, match.slug, match.bestOf, globalStats);
  const team2RateHint = getRateHtml(safeDisplay2, match.slug, match.bestOf, globalStats);

  let midContent = `<span ${STYLE_VS_TEXT}>vs</span>`;
  if (match.isFinished) {
    const team1ScoreStyle = match.team1Score > match.team2Score ? "color:#0f172a" : "color:#94a3b8";
    const team2ScoreStyle = match.team2Score > match.team1Score ? "color:#0f172a" : "color:#94a3b8";
    midContent = `<span class="sch-fin-score"><span style="${team1ScoreStyle}">${match.team1Score}</span><span ${STYLE_SCORE_SEP}>-</span><span style="${team2ScoreStyle}">${match.team2Score}</span></span>`;
  } else if (match.isLive) {
    midContent = `<span class="sch-live-score">${match.team1Score}<span ${STYLE_SCORE_SEP}>-</span>${match.team2Score}</span>`;
  }

  const h2hClass = (!isTbd1 && !isTbd2) ? "spine-sep clickable" : "spine-sep";
  const h2hClick = (!isTbd1 && !isTbd2) ? `onclick="openH2H('${match.slug}', '${safeTeam1}', '${safeTeam2}')"` : "";

  return `<div class="sch-row"><span class="sch-time"><span class="utc-local" data-utc="${match.isoTimestamp || ''}" data-format="time">${match.time}</span></span><div class="sch-vs-container"><div class="spine-row"><span class="${isTbd1 ? "spine-l" : "spine-l clickable"}" ${team1ClickHandler} ${isTbd1 ? STYLE_TBD_TEAM : ""}>${team1RateHint}${safeDisplay1}</span><span class="${h2hClass}" ${h2hClick} ${STYLE_SCH_MID_CELL}>${midContent}</span><span class="${isTbd2 ? "spine-r" : "spine-r clickable"}" ${team2ClickHandler} ${isTbd2 ? STYLE_TBD_TEAM : ""}>${safeDisplay2}${team2RateHint}</span></div></div><div class="sch-tag-col"><span class="${bestOfClass}">${bestOfLabel}</span></div></div>`;
}