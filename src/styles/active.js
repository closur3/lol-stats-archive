import baseCSS from "./base.js";

export default `${baseCSS}
    .container { --table-label-width: 80px; max-width: 1400px; }
    .wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 25px; display: flex; flex-direction: column; --min-table-width: 1340px; }
    .wrapper::-webkit-scrollbar, .match-list::-webkit-scrollbar { display: none; }
    .wrapper, .match-list { -ms-overflow-style: none; scrollbar-width: none; }
    table { width: 100%; min-width: var(--min-table-width); border-collapse: separate; border-spacing: 0; font-size: 14px; table-layout: fixed; margin: 0; border: none; }

    th { background: #f8fafc; padding: 14px 8px; font-weight: 600; color: #64748b; cursor: pointer; transition: 0.2s; box-shadow: inset -1px -1px 2px rgba(0, 0, 0, 0.05); border: none !important; }
    th:hover { background: #eff6ff; color: #2563eb; }
    td { padding: 12px 8px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: inset -1px -1px 2px rgba(0, 0, 0, 0.04); border: none !important; }
    tr { border: none !important; }
    .team-col { position: sticky; left: 0; background: white !important; z-index: 10; text-align: left; font-weight: 600; padding-left: 15px; width: var(--table-label-width); transition: 0.2s; box-shadow: inset 1px 0 2px rgba(0, 0, 0, 0.04), inset -1px -1px 2px rgba(0, 0, 0, 0.04) !important; border: none !important; outline: none !important; }
    .team-clickable { cursor: pointer; }
    .team-clickable:hover, .time-table-cell:not(.is-empty):hover { color: #2563eb !important; background-color: #eff6ff !important; }
    .active-sec > .table-title { display: flex; align-items: center; justify-content: space-between; min-height: 72px; padding: 12px 16px; border: none; border-radius: var(--radius-card) var(--radius-card) 0 0; box-sizing: border-box; background: var(--gradient-header); box-shadow: inset 1px 0 2px rgba(0, 0, 0, 0.04), inset -1px 0 2px rgba(0, 0, 0, 0.04); font-weight: 600; }
    .tournament-title-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .tournament-title-row > * { align-self: center; }
    .tournament-title-text { display: flex; align-items: center; min-width: 0; min-height: 20px; color: #0f172a; font-weight: 600; line-height: 20px; }
    .tournament-title-short { flex: 0 0 auto; padding: 2px 7px; border: 1px solid #bfdbfe; border-radius: var(--radius-badge); background: #eff6ff; color: #1d4ed8; font-size: 10px; font-weight: 800; line-height: 16px; }
    .tournament-title-row .schedule-phase-icon { display: block; width: 18px; height: 18px; flex: 0 0 18px; }
    .schedule-phase-icon-play { color: var(--color-phase-play); }
    .schedule-phase-icon-idle { color: var(--color-phase-idle); }
    .schedule-phase-icon-done { color: var(--color-phase-done); }
    .schedule-phase-icon-offday { color: var(--color-phase-offday); }
    .tournament-info { position: relative; display: inline-flex; flex: 0 0 auto; }
    .table-title .tournament-info-trigger { cursor: pointer; transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s; }
    .table-title .tournament-info-trigger:hover, .tournament-info.is-open .tournament-info-trigger { border-color: #93c5fd; background: #e6f0ff; box-shadow: 0 1px 2px rgba(37,99,235,0.08); }
    .table-title .tournament-info-trigger:focus-visible { outline: 2px solid rgba(37,99,235,0.35); outline-offset: 1px; }
    .tournament-info-panel { --tournament-info-title-date-gap: 5px; --tournament-info-right-inset: 15px; display: none; position: absolute; isolation: isolate; z-index: 120; top: calc(100% + 8px); left: 50%; transform: translateX(calc(-50% + var(--tournament-info-shift, 0px))); width: min(344px, calc(100vw - 30px)); box-sizing: border-box; overflow: hidden; border: 1px solid #d7e0eb; border-radius: var(--radius-card); background: #ffffff; color: #334155; box-shadow: 0 20px 48px rgba(15,23,42,0.2), 0 2px 8px rgba(15,23,42,0.06); text-align: left; cursor: default; }
    .tournament-info-panel::before { content: ""; position: absolute; z-index: -1; top: 0; right: 0; left: 0; height: 3px; background: linear-gradient(90deg, #2563eb, #60a5fa 58%, #bfdbfe); }
    .tournament-info.is-open .tournament-info-panel { display: block; }
    .tournament-info-header { display: block; padding: 17px 62px 0 15px; background: linear-gradient(145deg, #f8fbff 0%, #ffffff 78%); }
    .tournament-info-name { display: block; min-width: 0; overflow: hidden; color: #0f172a; font-size: 13px; font-weight: 850; line-height: 18px; text-overflow: ellipsis; white-space: nowrap; }
    .tournament-info-league { position: absolute; top: 16px; right: var(--tournament-info-right-inset); box-shadow: 0 1px 2px rgba(37,99,235,0.08); }
    .tournament-info-dates { display: flex; align-items: center; gap: 7px; padding: var(--tournament-info-title-date-gap) 15px 14px; border-bottom: 1px solid #edf2f7; background: linear-gradient(145deg, #f8fbff 0%, #ffffff 78%); color: #64748b; font-size: 10px; font-weight: 750; line-height: 16px; }
    .tournament-info-dates > span { color: #94a3b8; }
    .tournament-info-dates time { white-space: nowrap; }
    .tournament-info-phase-section { display: grid; grid-template-columns: minmax(0, 1fr) 100px; align-items: stretch; padding: 12px var(--tournament-info-right-inset); border-top: 1px solid #edf2f7; background: #fbfdff; }
    .tournament-info-phase-header { display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 8px; min-width: 0; padding: 0 0 0 16px; box-sizing: border-box; border-left: 1px solid #e7edf4; text-align: right; }
    .tournament-info-phase-state, .tournament-info-phase-countdown { display: inline-flex; align-items: center; box-sizing: border-box; font-variant-numeric: tabular-nums; }
    .tournament-info-phase-state { color: #94a3b8; font-size: 12px; font-weight: 850; letter-spacing: 0.08em; line-height: 1.2; }
    .tournament-info-phase-countdown { justify-content: flex-end; color: #64748b; font-size: 12px; font-weight: 850; letter-spacing: 0.02em; white-space: nowrap; }
    .tournament-info-phase-matches { display: flex; flex-direction: column; justify-content: center; gap: 4px; min-width: 0; }
    .tournament-info-phase-match { display: grid; grid-template-columns: max-content minmax(0, 1fr); align-items: center; min-height: 24px; min-width: 0; }
    .tournament-info-phase-match > time { color: #94a3b8; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .tournament-info-phase-matchup { display: grid; grid-template-columns: minmax(0, 1fr) max-content minmax(0, 1fr); align-items: center; column-gap: 8px; min-width: 0; }
    .tournament-info-phase-team { overflow: hidden; color: #1e293b; font-size: 12px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
    .tournament-info-phase-team1 { text-align: right; }
    .tournament-info-phase-team2 { text-align: left; }
    .tournament-info-phase-result { color: #94a3b8; font-size: 7px; font-weight: 500; line-height: 1; text-align: center; white-space: nowrap; }
    .tournament-info-phase-empty { display: flex; align-items: center; min-height: 28px; color: #94a3b8; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; }
    .tournament-info-source-section { display: block; padding: 10px 6px 9px 9px; border-top: 1px solid #edf2f7; background: #fbfdff; }
    .tournament-info-label { display: block; padding: 0 6px 7px; color: #94a3b8; font-size: 9px; font-weight: 850; letter-spacing: 0.08em; line-height: 1.2; }
    .tournament-info-sources { display: flex; flex-direction: column; gap: 4px; }
    .tournament-info-source { display: flex; flex-direction: column; gap: var(--tournament-info-title-date-gap); padding: 8px; border: 1px solid transparent; border-radius: var(--radius-control); background: transparent; color: #475569 !important; transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s, transform 0.15s; }
    .tournament-info-source-main, .tournament-info-source-meta { display: flex; align-items: center; gap: 10px; min-width: 0; width: 100%; }
    .tournament-info-source-main { justify-content: space-between; }
    .tournament-info-source-name { min-width: 0; overflow: hidden; color: #1e293b; font-size: 11px; font-weight: 850; line-height: 16px; text-overflow: ellipsis; white-space: nowrap; }
    .tournament-info-source-side { display: inline-flex; align-items: center; gap: 7px; flex: 0 0 auto; }
    .tournament-info-source-count { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 16px; padding: 0 5px; box-sizing: border-box; border-radius: var(--radius-badge); background: #ffffff; color: #64748b; font-size: 9px; font-weight: 850; font-variant-numeric: tabular-nums; }
    .tournament-info-source-meta { color: #94a3b8; font-size: 10px; font-weight: 700; line-height: 15px; white-space: nowrap; }
    .tournament-info-source svg { width: 12px; height: 12px; flex: 0 0 12px; color: #94a3b8; transition: color 0.15s; }
    .tournament-info-source:hover { transform: translateY(-1px); border-color: #dbeafe; background: #eff6ff; box-shadow: 0 3px 8px rgba(37,99,235,0.08); }
    .tournament-info-source:hover .tournament-info-source-name, .tournament-info-source:hover svg { color: #1d4ed8; }
    .active-sec:has(.tournament-info.is-open) { position: relative; z-index: 70; overflow: visible; }
    .active-sec { margin-bottom: 25px; border: 1px solid #e2e8f0; border-radius: var(--radius-card); box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden; }
    .active-sec > .wrapper { margin-bottom: 0; border: none; border-radius: 0; box-shadow: none; }
    .table-title a { color: #2563eb; text-decoration: none; }
    .statistics-root { width: 100%; }
    .statistics-heading-meta { display: grid; grid-template-columns: auto 1.5px auto; align-items: center; gap: 10px; min-height: 26px; max-width: 100%; }
    .statistics-heading-meta:not(.has-scope-select):not(:has(> .stats-group-legend)) { grid-template-columns: auto; }
    .statistics-heading-meta.has-scope-select:has(.statistics-scope-legend:not(.is-hidden):not(:empty)) { grid-template-columns: auto 1.5px auto auto; }
    .statistics-heading-meta > .tournament-summary, .statistics-scope-summary { grid-column: 1; grid-row: 1; }
    .statistics-scope-summary { display: flex; align-items: center; align-self: center; }
    .heading-meta-divider { display: inline-block; width: 1.5px; height: 15px; flex: 0 0 1.5px; align-self: center; border-radius: var(--radius-badge); background: #cbd5e1; }
    .statistics-heading-divider { grid-column: 2; grid-row: 1; }
    .statistics-scope-select { display: block; grid-column: 3; grid-row: 1; align-self: center; max-width: 150px; }
    .statistics-heading-meta.has-scope-select:has(.statistics-scope-legend:not(.is-hidden):not(:empty)) .statistics-scope-select { grid-column: 4; }
    .statistics-scope-select .statistics-scope-trigger { width: max-content; max-width: 150px; height: 26px; font-size: 11px; }
    .statistics-scope-menu { top: calc(100% + 5px); right: 0; bottom: auto; left: auto; }
    .active-sec:has(.statistics-scope-select.is-open) { position: relative; z-index: 70; overflow: visible; }
    .statistics-scope-content { width: 100%; }
    .statistics-scope-content.is-hidden, .statistics-scope-schedule.is-hidden, .statistics-scope-summary.is-hidden { display: none; }
    .statistics-scope-legend.is-hidden { display: none; }
    .stats-group-legend { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; min-width: 0; }
    .stats-group-legend-item { display: inline-flex; align-items: center; gap: 5px; min-width: 0; color: #64748b; font-size: 9px; font-weight: 800; letter-spacing: 0.025em; line-height: normal; }
    .stats-group-legend-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .stats-group-legend-count { color: #94a3b8; font-size: 9px; font-variant-numeric: tabular-nums; }
    .stats-group-legend-mark, .team-group-row-mark { display: inline-block; flex: 0 0 auto; border-radius: var(--radius-circle); background: var(--stats-group-color); }
    .stats-group-legend-mark { width: 6px; height: 6px; margin-left: 2px; box-shadow: 0 0 0 2px var(--stats-group-ring); }
    .team-group-row-mark { width: 6px; height: 6px; margin-right: 8px; vertical-align: 1px; }
    .stats-group-color-0 { --stats-group-color: #3b82f6; --stats-group-ring: #dbeafe; }
    .stats-group-color-1 { --stats-group-color: #8b5cf6; --stats-group-ring: #ede9fe; }
    .stats-group-color-2 { --stats-group-color: #f59e0b; --stats-group-ring: #fef3c7; }
    .stats-group-color-3 { --stats-group-color: #10b981; --stats-group-ring: #d1fae5; }
    .statistics-scope-legend { display: flex; grid-column: 3; grid-row: 1; align-items: center; align-self: center; min-width: 0; }
    .statistics-scope-legend:empty { display: none; }
    .statistics-heading-meta .stats-group-legend { flex: 1 1 auto; min-height: 18px; flex-wrap: nowrap; justify-content: flex-start; overflow: hidden; }
    .statistics-heading-meta > .stats-group-legend { grid-column: 3; grid-row: 1; align-self: center; }
    .statistics-heading-meta .stats-group-legend-item { flex: 0 1 auto; overflow: visible; }
    .stats-group-body + .stats-group-body tr:first-child td { box-shadow: inset 0 1px 0 #dbe3ec, inset -1px -1px 2px rgba(0, 0, 0, 0.04); }
    .stats-group-body + .stats-group-body tr:first-child .team-col { box-shadow: inset 0 1px 0 #dbe3ec, inset 1px 0 2px rgba(0, 0, 0, 0.04), inset -1px -1px 2px rgba(0, 0, 0, 0.04) !important; }
    .stats-view-empty { min-width: var(--min-table-width); padding: 28px 15px; box-sizing: border-box; color: #94a3b8; background: #ffffff; text-align: center; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; }
    .col-bo3 { width: 90px; } .col-bo3-pct { width: 90px; } .col-bo5 { width: 90px; } .col-bo5-pct { width: 90px; }
    .col-series { width: 90px; } .col-series-wr { width: 90px; } .col-game { width: 90px; } .col-game-wr { width: 90px; }
    .width-team { width: var(--table-label-width); } .width-streak { width: 70px; } .width-last { width: 110px; }
    .col-streak { width: 70px; } .col-last { width: 110px; }
    .col-bo3, .col-bo3-pct, .col-bo5, .col-bo5-pct, .col-series, .col-series-wr, .col-game, .col-game-wr, .col-series-trailed, .col-series-trailed-pct, .col-series-led, .col-series-led-pct, .col-streak, .col-last, .sch-time, .sch-fin-score, .sch-live-score { font-variant-numeric: tabular-nums; font-weight: 600; letter-spacing: 0; }
    .metric-record { padding-right: 2px; }
    .metric-rate { padding-left: 2px; }
    .spine-row { display: flex; justify-content: center; align-items: stretch; width: 100%; height: 100%; }
    .spine-l { flex: 1; flex-basis: 0; display: flex; align-items: center; justify-content: flex-end; padding: 0; font-weight: 600; transition: background 0.15s; }
    .spine-r { flex: 1; flex-basis: 0; display: flex; align-items: center; justify-content: flex-start; padding: 0; font-weight: 600; transition: background 0.15s; }
    .spine-sep { width: 12px; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; }
    .spine-strong { font-weight: 700; }
    .spine-sep-muted { opacity: 0.4; }
    .muted-dash { color: #cbd5e1; }
    .sch-row .spine-l { padding: 4px 5px; margin-left: 0; }
    .sch-row .spine-r { padding: 4px 5px; margin-right: 0; }
    .spine-l.clickable:hover, .spine-r.clickable:hover, .spine-sep.clickable:hover { background-color: #eff6ff; color: #2563eb; cursor: pointer; }
    .t-cell { display: flex; align-items: center; width: 100%; height: 100%; }
    .t-val { flex: 1; flex-basis: 0; text-align: right; font-weight: 600; padding-right: 4px; white-space: nowrap; }
    .t-pct { flex: 1; flex-basis: 0; text-align: left; opacity: 0.9; font-size: 11px; font-weight: 600; padding-left: 4px; white-space: nowrap; }
    .time-table-block { width: 100%; }
    .time-table { font-variant-numeric: tabular-nums; border-top: none; }
    .time-header-row { border-bottom: none; }
    .time-header-cell { cursor: default; pointer-events: none; }
    .time-total-row { font-weight: bold; background: #f8fafc; }
    .time-total-label { background: #f1f5f9 !important; }
    .time-filter-cell { pointer-events: auto; vertical-align: middle; text-align: center !important; padding: 8px 4px !important; cursor: default; }
    .compact-menu { position: relative; }
    .compact-menu-trigger { position: relative; display: flex; align-items: center; padding: 0 18px 0 9px; border: 1px solid #dbe4ef; border-radius: var(--radius-control); background: #ffffff; color: #334155; font: inherit; font-weight: 700; cursor: pointer; outline: none; box-shadow: inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(15,23,42,0.04); }
    .compact-menu-trigger::before, .compact-menu-trigger::after { content: ""; position: absolute; top: 50%; width: 4px; height: 4px; transform: translateY(-50%); }
    .compact-menu-trigger::before { right: 12px; background: linear-gradient(45deg, transparent 50%, #64748b 50%); }
    .compact-menu-trigger::after { right: 8px; background: linear-gradient(135deg, #64748b 50%, transparent 50%); }
    .compact-menu-value { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .compact-menu-trigger:hover { border-color: #93c5fd; color: #1d4ed8; background-color: #f8fbff; }
    .compact-menu-trigger:focus-visible { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,0.12); }
    .compact-menu-popup { display: none; position: absolute; z-index: 40; width: max-content; min-width: 100%; max-height: 280px; overflow-y: auto; padding: 5px; border: 1px solid #dbe3ec; border-radius: var(--radius-control); background: #ffffff; box-shadow: 0 12px 28px rgba(15,23,42,0.16); text-align: left; scrollbar-width: none; -ms-overflow-style: none; }
    .compact-menu-popup::-webkit-scrollbar { display: none; }
    .compact-menu.is-open .compact-menu-popup { display: block; }
    .compact-menu-group { margin-top: 5px; padding-top: 5px; border-top: 1px solid #edf2f7; }
    .compact-menu-group-label { padding: 3px 9px 5px; color: #94a3b8; font-size: 9px; font-weight: 800; letter-spacing: 0.06em; line-height: 1.2; text-transform: uppercase; white-space: nowrap; }
    .compact-menu-option { display: block; width: 100%; min-height: 30px; padding: 5px 9px; border: 0; border-radius: var(--radius-control); background: transparent; color: #475569; font: inherit; font-size: 11px; font-weight: 700; line-height: 20px; text-align: left; white-space: nowrap; cursor: pointer; }
    .compact-menu-option:hover, .compact-menu-option.is-selected { color: #1d4ed8; background: #eff6ff; }
    .time-filter { width: 68px; }
    .time-filter-trigger { width: 68px; height: 26px; font-size: 11px; }
    .time-filter-menu { bottom: calc(100% + 5px); left: 0; }
    .time-table-cell { color: #ffffff; font-weight: 600; cursor: pointer; }
    .time-table-cell.is-empty { background: #f1f5f9 !important; color: #cbd5e1; cursor: default; }
    .time-empty { color: #cbd5e1; }
    .is-empty-stat { background: #f1f5f9; color: #cbd5e1; }
    .rate-cell { font-weight: 700; }
    .col-last { font-weight: 700; }
    .floating-selector { position: fixed; left: min(calc(50vw + min(700px, calc(50vw - 15px)) + 12px), calc(100vw - 100px)); top: 78%; transform: translateY(-50%); z-index: 80; border: 1px solid rgba(226,232,240,0.92); border-radius: var(--radius-card); background: rgba(255,255,255,0.9); box-shadow: 0 14px 32px rgba(15,23,42,0.12); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
    .league-selector { display: flex; flex-direction: column; gap: 4px; padding: 4px; }
    .league-selector-option { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 64px; height: 36px; padding: 0 9px; border: 1px solid transparent; border-radius: var(--radius-control); background: transparent; color: #64748b; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
    .league-selector-option:hover { border-color: #bfdbfe; color: #1d4ed8; background: #eff6ff; }
    .league-selector-option.is-current { color: #ffffff; background: #2563eb; }
    .archive-tournament-list { width: max-content; max-width: min(280px, calc(100vw - 64px)); max-height: min(60vh, 360px); padding: 5px; overflow-y: auto; box-sizing: border-box; }
    .archive-tournament-year-group + .archive-tournament-year-group { margin-top: 5px; padding-top: 5px; border-top: 1px solid #e2e8f0; }
    .archive-tournament-year { padding: 5px 9px 3px; color: #94a3b8; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; }
    .archive-tournament-option { display: block; width: 100%; min-height: 30px; padding: 5px 9px; overflow: hidden; border: 0; border-radius: var(--radius-control); background: transparent; color: #475569; font: inherit; font-size: 11px; font-weight: 700; line-height: 20px; text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
    .archive-tournament-option:hover { color: #1d4ed8; background: #eff6ff; }
    .archive-tournament-option.is-current { color: #ffffff; background: #2563eb; }
    .archive-tournament-selector { display: none; right: 12px; left: auto; width: auto; max-width: calc(100vw - 32px); height: 42px; padding: 0 34px 0 12px; outline: none; color: #334155; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; -webkit-tap-highlight-color: transparent; }
    .archive-tournament-selector:focus, .archive-tournament-selector:focus-visible { outline: none; border-color: rgba(226,232,240,0.92); }
    .badge { padding: 2px 6px; border: 1px solid transparent; border-radius: var(--radius-badge); color: white; font-size: 11px; font-weight: 600; }
    .badge-win { border-color: #6ee7b7; background: #10b981; }
    .badge-loss { border-color: #fda4af; background: #f43f5e; }
    .schedule-root { margin: 28px 0; }
    .schedule-root:not(:has(> .schedule-section)):not(:has(.statistics-scope-schedule:not(.is-hidden) .schedule-section)) { display: none; }
    .schedule-section { margin-top: 0; }
    .sch-fandom-list { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; align-items: start; }
    .sch-tab { display: flex; flex-direction: column; min-width: 0; border: 1px solid #e2e8f0; border-radius: var(--radius-card); background: #ffffff; overflow: hidden; }
    .sch-tab-heading { padding: 10px 14px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; color: #334155; font-size: 13px; font-weight: 800; letter-spacing: 0.04em; }
    .sch-tab-past { display: block; }
    .sch-tab-past-first { grid-column-start: 1; }
    .sch-tab-past summary { cursor: pointer; list-style: none; user-select: none; }
    .sch-tab-past summary::-webkit-details-marker { display: none; }
    .sch-tab-past .sch-tab-heading { position: relative; padding-left: 30px; border-bottom: 0; }
    .sch-tab-past .sch-tab-heading::before { content: ''; position: absolute; left: 14px; top: 50%; width: 6px; height: 6px; border-right: 1.5px solid #64748b; border-bottom: 1.5px solid #64748b; transform: translateY(-50%) rotate(-45deg); transition: transform 0.15s ease; }
    .sch-tab-past[open] .sch-tab-heading { border-bottom: 1px solid #e2e8f0; }
    .sch-tab-past[open] .sch-tab-heading::before { transform: translateY(-65%) rotate(45deg); }
    .sch-session + .sch-session { border-top: 1px solid #e2e8f0; }
    .sch-session-heading { display: flex; align-items: center; justify-content: space-between; min-height: 32px; padding: 0 14px; border-bottom: 1px solid #edf2f7; color: #64748b; font-size: 10px; font-weight: 750; letter-spacing: 0.04em; }
    .sch-session-heading time { font-variant-numeric: tabular-nums; }
    .sch-session.is-today .sch-session-heading { border-bottom-color: #bfdbfe; background: #eff6ff; color: #1d4ed8; }
    .sch-row { display: flex; align-items: stretch; padding: 0; border-bottom: 1px solid #f8fafc; font-size: 14px; color: #334155; min-height: 36px; flex: 0 0 auto; }
    .sch-time { width: 54px; color: #94a3b8; font-size: 12px; display: flex; align-items: center; justify-content: flex-start; padding-left: 14px; }
    .sch-tag-col { width: 54px; display: flex; align-items: center; justify-content: flex-end; padding-right: 14px; }
    .sch-vs-container { flex: 1; display: flex; align-items: stretch; justify-content: center; }
    .sch-tag-col .best-of-pill { font-size: 12px; }
    .sch-live-score { color: #10b981; font-size: 13px; }
    .sch-fin-score { color: #334155; font-size: 13px; }
    .sch-mid-cell { display: flex; justify-content: center; align-items: center; width: 34px; transition: background 0.2s; }
    .vs-text { color: #94a3b8; font-size: 13px; font-weight: 700; margin: 0 2px; }
    .score-sep { opacity: 0.4; margin: 0 1px; }
    .score-win { color: #0f172a; }
    .score-draw { color: #64748b; }
    .score-loss { color: #94a3b8; }
    .tbd-team { color: #9ca3af; }
    .match-forfeit { margin-left: 3px; color: #b45309; font-size: 10px; font-weight: 700; vertical-align: 1px; }
    .rate-hint { font-weight: 400; color: #94a3b8; font-size: 11px; margin: 0 2px; }
    .arch-empty-msg { text-align: center; padding: 40px; color: #94a3b8; }

    .tournament-summary { display:inline-flex; flex: 0 0 auto; align-items:center; padding: 0; color:#64748b; font-size:12px; font-weight: 600; white-space:nowrap; }
    .tournament-summary-rate { opacity: 0.7; font-weight: 400; }
    .summary-sep { margin: 0 10px; }
    .title-right-area { display:flex; align-items:center; gap:12px; justify-content: flex-start; flex-wrap: wrap; }

    @media (max-width: 1100px) { .sch-fandom-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 650px) {
        .container { padding-bottom: 31px; }
        .sch-fandom-list { grid-template-columns: 1fr; }
        .active-sec > .table-title { flex-direction: column; align-items: flex-start; flex-wrap: wrap; gap: 0; width: 100%; padding: 0; background: #fff; }
        .table-title > .tournament-title-row { width: 100%; padding: 8px 15px; display: flex; align-items: center; flex: 1 1 0; gap: 8px; min-width: 0; }
        .table-title > .tournament-title-row .tournament-title-text { display: block; min-height: 0; white-space: normal; line-height: 1.4; word-break: break-word; }
        .table-title .title-right-area { width: 100%; flex: 1 1 0; justify-content: flex-end; margin-top: 0; padding: 8px 15px; border-top: 1px dashed #e2e8f0; transform: none; }
        .tournament-summary { font-size: 11px; }
        .statistics-heading-meta { display: grid; grid-template-columns: auto auto; align-items: center; justify-content: end; gap: 4px 10px; width: 100%; }
        .statistics-heading-meta:not(.has-scope-select),
        .statistics-heading-meta.has-scope-select { grid-template-columns: auto; }
        .statistics-heading-meta.has-scope-select:has(.statistics-scope-legend:not(.is-hidden):not(:empty)) { grid-template-columns: auto auto; }
        .statistics-heading-meta > .tournament-summary,
        .statistics-scope-summary { grid-column: 1 / -1; grid-row: 1; justify-self: end; }
        .statistics-heading-divider { display: none; }
        .statistics-scope-select { grid-column: 1; grid-row: 2; justify-self: end; max-width: min(180px, 55vw); }
        .statistics-heading-meta.has-scope-select:has(.statistics-scope-legend:not(.is-hidden):not(:empty)) .statistics-scope-select { grid-column: 2; }
        .statistics-scope-legend { grid-column: 1; grid-row: 2; justify-self: end; }
        .statistics-heading-meta .stats-group-legend { flex: 0 1 auto; max-width: 100%; justify-content: flex-end; }
        .statistics-heading-meta > .stats-group-legend { grid-column: 1; grid-row: 2; justify-self: end; }
        .time-filter, .time-filter-trigger { width: 66px; }
        .floating-selector { top: auto; right: auto; left: 50%; bottom: max(12px, env(safe-area-inset-bottom)); transform: translateX(-50%); }
        .league-selector { flex-direction: row; }
        .league-selector-option { min-width: 58px; height: 34px; }
        .archive-tournament-list { display: none; }
        .archive-tournament-selector { display: block; }
    }

    @keyframes modalShow { 0% { opacity: 0; transform: translate(-50%, -45%) scale(0.98); } 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
    .modal { --modal-vertical-inset: max(50px, 8dvh); display: none; position: fixed; z-index: 999; left: 0; top: 0; width: 100%; height: 100dvh; overflow: hidden; background-color: rgba(15, 23, 42, 0.45); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
    .modal-content { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background-color: #ffffff; margin: 0; padding: 0; border: 1px solid #e2e8f0; width: 90%; max-width: 420px; border-radius: var(--radius-card); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); animation: modalShow 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; display: flex; flex-direction: column; max-height: calc(100dvh - var(--modal-vertical-inset)); }
    #modalTitle { margin: 0; padding: 20px 24px; border-bottom: 1px solid #f1f5f9; font-size: 18px; font-weight: 600; color: #0f172a; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; background: #f8fafc; border-radius: var(--radius-card) var(--radius-card) 0 0; flex-shrink: 0; }
    #modalTitle.history-status-modal-title { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-top: 14px; padding-bottom: 14px; }
    .modal-title-copy { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .modal-context-label { display: block; margin-bottom: 7px; color: #94a3b8; font-size: 9px; font-weight: 800; letter-spacing: 0.16em; line-height: 1; }
    .modal-context-title { display: flex; align-items: baseline; gap: 8px; color: #0f172a; font-size: 17px; font-weight: 750; }
    .modal-title-record { font-variant-numeric: tabular-nums; }
    .modal-context-divider { color: #cbd5e1; font-weight: 500; }
    .match-list { margin: 0; padding: 16px 24px; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; flex: 1; }
    .history-status-modal-title + .match-list { padding-top: 10px; padding-bottom: 10px; }
    .match-list::-webkit-scrollbar { width: 6px; }
    .match-list::-webkit-scrollbar-track { background: transparent; }
    .match-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: var(--radius-control); }
    .match-list::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    .match-item { display: flex; flex-direction: column; align-items: stretch; background: #ffffff; border: 1px solid #cbd5e1; border-radius: var(--radius-card); margin-bottom: 12px; padding: 12px 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.02); transition: all 0.2s ease; min-height: 48px; }
    .match-item:last-child { margin-bottom: 0; }
    .match-card { padding: 0; overflow: hidden; border-color: #dbe3ec; box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04); }
    .match-card-meta { display: flex; align-items: center; justify-content: space-between; min-height: 32px; padding: 0 12px; border-bottom: 1px solid #edf2f7; background: #f8fafc; color: #64748b; font-size: 11px; font-weight: 650; font-variant-numeric: tabular-nums; }
    .match-card-meta > span:first-child { display: flex; align-items: center; gap: 7px; }
    .match-card-meta b { color: #334155; font-size: 12px; }
    .match-card-tags { display: flex; align-items: center; gap: 8px; }
    .match-card-fixture { display: grid; grid-template-columns: minmax(0, 1fr) 58px minmax(0, 1fr); align-items: center; min-height: 54px; padding: 5px 18px; }
    .match-card-team { min-width: 0; color: #475569; font-size: 14px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .match-card-team-left { text-align: right; padding-right: 10px; }
    .match-card-team-right { text-align: left; padding-left: 10px; }
    .match-card-team-winner { color: #0f172a; font-weight: 800; }
    .match-card-team-loser { color: #94a3b8; }
    .match-card-score-box { display: flex; align-items: center; justify-content: center; min-height: 30px; border: 1px solid #e2e8f0; border-radius: var(--radius-control); background: #ffffff; }
    .match-card-score-box.is-full { border-color: #fdba74; background: #fff7ed; box-shadow: inset 0 0 0 1px #fed7aa; }
    .match-card-score-box.is-live { border-color: #38bdf8; background: #f0f9ff; box-shadow: inset 0 0 0 1px #7dd3fc; }
    .match-card-score { color: #1e293b; font-size: 16px; font-weight: 750; font-variant-numeric: tabular-nums; }
    .match-card-score.is-live { color: #10b981; }
    .match-card-score-box.is-full .match-card-score { color: #c2410c; }
    .match-card-vs { color: #94a3b8; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; }
    .match-card .match-details { margin: 0 12px 10px; padding-top: 9px; }
    .history-section-divider { display: flex; align-items: center; gap: 8px; margin: 18px 0 10px; color: #94a3b8; font-size: 9px; font-weight: 800; letter-spacing: 0.14em; }
    .history-section-divider::before, .history-section-divider::after { content: ''; flex: 1; height: 1px; background: #dbe3ec; }
    .history-tournament-group { margin: 0 0 10px; border: 1px solid #dbe3ec; border-radius: var(--radius-card); background: #ffffff; overflow: hidden; }
    .history-group-summary { position: relative; display: flex; align-items: center; justify-content: center; min-height: 38px; padding: 0 48px; background: #f8fafc; color: #334155; cursor: pointer; list-style: none; font-size: 11px; font-weight: 750; }
    .history-group-summary::-webkit-details-marker { display: none; }
    .history-group-summary::before { content: ''; position: absolute; left: 14px; width: 6px; height: 6px; border-right: 1.5px solid #64748b; border-bottom: 1.5px solid #64748b; transform: rotate(-45deg); transition: transform 0.15s ease; }
    .history-tournament-group[open] > .history-group-summary::before { transform: rotate(45deg); }
    .history-group-summary > span:first-child { min-width: 0; max-width: 100%; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; }
    .history-group-count { flex-shrink: 0; color: #64748b; font-size: 9px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .history-group-summary > .history-group-count { position: absolute; right: 12px; }
    .history-group-meta { position: absolute; right: 12px; display: flex; align-items: center; gap: 8px; }
    .history-group-record { display: inline-flex; align-items: center; gap: 3px; min-width: 31px; justify-content: center; padding: 3px 6px; border: 1px solid #dbe4ef; border-radius: var(--radius-badge); background: #ffffff; color: #334155; font-size: 10px; line-height: 1; font-variant-numeric: tabular-nums; }
    .history-group-record b { color: #334155; }
    .history-group-record i { color: #64748b; font-style: normal; font-weight: 500; }
    .history-tab-group { padding-top: 7px; }
    .history-tournament-group[open] > .history-tab-group:last-child { padding-bottom: 8px; }
    .history-tab-label { padding: 0 12px 3px; color: #64748b; font-size: 10px; font-weight: 750; letter-spacing: 0.03em; }
    .history-group-list { padding: 8px 10px 0; }
    .history-status-switch { flex: 0 0 auto; }
    .history-status-switch-control { display: grid; grid-template-columns: 44px; gap: 2px; }
    .history-status-button { display: inline-flex; align-items: center; justify-content: space-between; gap: 5px; width: 44px; height: 22px; padding: 0 7px; border: 0; border-radius: var(--radius-control); outline: none; background: transparent; color: #94a3b8; cursor: pointer; font: inherit; transition: background 0.15s ease, color 0.15s ease; }
    .history-status-button:hover { background: #f1f5f9; color: #475569; }
    .history-status-button.is-active { background: #e2e8f0; color: #334155; }
    .history-status-button:focus-visible { box-shadow: 0 0 0 2px #bfdbfe; }
    .history-status-button svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .history-status-button span { color: inherit; font-size: 9px; font-weight: 750; font-variant-numeric: tabular-nums; }
    .history-status-view.is-hidden { display: none; }
    .history-status-empty { padding: 28px 12px; color: #94a3b8; text-align: center; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; }
    .h2h-tournament-group { margin: 0 0 8px; border: 1px solid #dbe3ec; border-radius: var(--radius-card); background: #ffffff; overflow: hidden; }
    .history-status-view > .h2h-tournament-group:last-child { margin-bottom: 0; }
    .h2h-group-heading { position: relative; display: flex; align-items: center; justify-content: center; min-height: 38px; padding: 0 48px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; color: #334155; font-size: 11px; font-weight: 750; }
    .h2h-group-heading > span:first-child { min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; }
    .h2h-group-heading > .h2h-group-meta { position: absolute; right: 12px; }
    .h2h-tournament-group > .history-tab-group:last-child { padding-bottom: 8px; }
    .match-details { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: center; min-height: 26px; margin-top: 10px; padding-top: 10px; border-top: 1px solid #e2e8f0; }
    .match-details::after { content: ''; position: absolute; top: 10px; bottom: 0; left: 50%; width: 1px; background: #e2e8f0; transform: translateX(-0.5px); }
    .match-details.game-only { grid-template-columns: minmax(0, 1fr); }
    .match-details.game-only::after { display: none; }
    .match-details.game-only .game-results { justify-content: center; padding-right: 0; }
    .match-result { font-size: 13px; font-weight: 800; letter-spacing: 0.04em; }
    .match-result-win { color: #059669; }
    .match-result-loss { color: #e11d48; }
    .match-result-draw { color: #d97706; }
    .match-result-next { color: #64748b; }
    .match-result-live { color: #38bdf8; }
    .turnaround-event { display: flex; justify-content: flex-start; min-width: 0; padding-left: 12px; }
    .turnaround-badge { display: inline-flex; align-items: center; min-height: 18px; padding: 2px 7px; border: 1px solid transparent; border-radius: var(--radius-badge); font-size: 9px; font-weight: 700; letter-spacing: 0.05em; }
    .turnaround-icon { display: inline-flex; align-items: center; margin-right: 4px; font-size: 11px; line-height: 1; letter-spacing: 0; }
    .turnaround-icon svg { width: 11px; height: 11px; fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
    .turnaround-comeback { border-color: #60a5fa; background: #dbeafe; color: #1d4ed8; }
    .turnaround-lost-lead { border-color: #f472b6; background: #fce7f3; color: #be185d; }
    .turnaround-reverse-sweep { border-color: #4ade80; background: #dcfce7; color: #166534; }
    .turnaround-reverse-swept { border-color: #f87171; background: #fee2e2; color: #b91c1c; }
    .game-results { display: flex; justify-content: flex-end; gap: 4px; min-width: 0; padding-right: 12px; }
    .game-result { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: var(--radius-circle); color: #ffffff; font-size: 10px; font-weight: 700; }
    .game-result-loss .game-result-label { transform: translateX(0.5px); }
    .game-result-win { background: #10b981; }
    .game-result-loss { background: #f43f5e; }
    .best-of-pill { display: inline-block; padding: 2px 6px; border: 1px solid transparent; border-radius: var(--radius-badge); font-size: 13px; font-weight: 600; line-height: normal; }
    .best-of-pill.bo1, .best-of-pill.bo2 { border-color: #cbd5e1; background: #e2e8f0; color: #475569; }
    .best-of-pill.bo3 { border-color: #93c5fd; background: #dbeafe; color: #1d4ed8; }
    .best-of-pill.bo5 { border-color: #e5b96d; background: #f2d49c; color: #9c5326; }
    @media (max-width: 650px) {
        .modal { --modal-vertical-inset: clamp(80px, 16dvh, 150px); }
        .modal-content { width: calc(100% - 32px); }
        .match-item { padding: 10px 8px; }
        .match-card { padding: 0; }
        .match-card-fixture { padding: 5px 10px; }
        .spine-l { padding-right: 2px; }
        .spine-r { padding-left: 2px; }
    }
`;
