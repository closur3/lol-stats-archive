import { dataUtils } from '../../utils/dataUtils.js';
import { TIME_GRID_COLUMN_COUNT } from '../../constants/index.js';

const STYLE_SCORE_SEP = 'style="opacity:0.4; margin:0 1px;"';

const TIME_TABLE_COLUMNS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Total"];

export function buildTimeTable(regionGrid) {
  const hours = Object.keys(regionGrid).filter(key => key !== "Total" && !isNaN(key)).map(Number).sort((leftHour, rightHour) => leftHour - rightHour);

  let html = `<div style="border-top: 1px solid #f1f5f9; width:100%;"></div><table style="font-variant-numeric:tabular-nums; border-top:none;"><thead><tr style="border-bottom:none;"><th class="team-col" style="cursor:default; pointer-events:none;">TIME</th>`;
  TIME_TABLE_COLUMNS.forEach(dayName => { html += `<th style="cursor:default; pointer-events:none;">${dayName}</th>`; });
  html += "</tr></thead><tbody>";

  [...hours, "Total"].forEach(hour => {
    if (!regionGrid[hour]) return;
    const isTotal = hour === "Total";
    const label = isTotal ? "Total" : `${String(hour).padStart(2,'0')}:00`;
    const hourAttr = isTotal ? '' : ` utc-local" data-utc="2026-01-01T${String(hour).padStart(2,'0')}:00:00Z" data-format="hour`;
    html += `<tr style="${isTotal ? 'font-weight:bold; background:#f8fafc;' : ''}"><td class="team-col ${hourAttr}" style="${isTotal ? 'background:#f1f5f9;' : ''}">${label}</td>`;

    for (let dayIndex = 0; dayIndex < TIME_GRID_COLUMN_COUNT; dayIndex++) {
      const cellData = regionGrid[hour][dayIndex] || { totalMatchCount: 0 };
      if (cellData.totalMatchCount === 0) {
        html += "<td style='background:#f1f5f9; color:#cbd5e1'>-</td>";
      } else {
        const fullRate = cellData.fullLengthMatchCount / cellData.totalMatchCount;
        const matches = JSON.stringify(cellData.matches).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
        html += `<td style='background:${dataUtils.color(fullRate, true)}; color:white; font-weight:bold; cursor:pointer;' onclick='showPopup("${label}", ${dayIndex}, ${matches})'><div class="t-cell"><span class="t-val">${cellData.fullLengthMatchCount}<span ${STYLE_SCORE_SEP}>/</span>${cellData.totalMatchCount}</span><span class="t-pct">(${Math.round(fullRate * 100)}%)</span></div></td>`;
      }
    }

    html += "</tr>";
  });

  html += "</tbody></table>";
  return html;
}