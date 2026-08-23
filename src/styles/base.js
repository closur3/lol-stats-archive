import footerCSS from "./footer.js";

export default `* { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
        --color-bg: #f1f5f9;
        --color-surface: #ffffff;
        --color-surface-muted: #f8fafc;
        --color-border: #e2e8f0;
        --color-border-strong: #cbd5e1;
        --color-text: #0f172a;
        --color-text-muted: #5a6d82;
        --color-text-faint: #94a3b8;
        --color-primary: #2563eb;
        --color-primary-strong: #1d4ed8;
        --color-primary-soft: #eff6ff;
        --color-phase-play: #1d4ed8;
        --color-phase-idle: #5b21b6;
        --color-phase-done: #166534;
        --color-phase-offday: #5a6d82;
        --color-danger: #dc2626;
        --gradient-header: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
        --radius-card: 10px;
        --radius-control: 6px;
        --radius-badge: 6px;
        --radius-circle: 50%;
        --shadow-card: 0 4px 6px rgba(0,0,0,0.05);
        --page-inline-padding: 15px;
    }
    body, code, input, button, select, textarea { font-family: "Roboto Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    body { background: var(--color-bg); color: var(--color-text); margin: 0; padding: 0; overflow-x: hidden; min-height: 100dvh; display: flex; flex-direction: column; }
    .main-header { position: sticky; top: 0; z-index: 100; background: var(--color-surface); border-bottom: 1px solid var(--color-border); width: 100%; }
    .nav-container { max-width: 1400px; width: 100%; margin: 0 auto; padding: 0 var(--page-inline-padding); display: flex; align-items: center; justify-content: space-between; height: 64px; }
    .nav-left { display: flex; align-items: center; gap: 8px; }
    .nav-right { display: flex; align-items: center; gap: 24px; }
    .nav-logo { font-size: 1.8rem; line-height: 1; }
    .nav-title { margin: 0; font-size: 1.5rem; font-weight: 600; color: var(--color-text); letter-spacing: 0; }
    .nav-title-link { color: inherit; text-decoration: none; }
    .nav-links { display: flex; align-items: center; gap: 20px; }
    .nav-link { position: relative; display: inline-flex; align-items: center; padding: 0; border: 0; font-size: 14px; font-weight: 500; color: var(--color-text-muted); text-decoration: none; transition: color 0.2s; line-height: 64px; }
    .nav-link:hover { color: var(--color-text); }
    .nav-link.active { color: var(--color-text); font-weight: 600; }
    .nav-link.active::after { content: ""; position: absolute; bottom: 0; left: 50%; width: 24px; height: 2px; transform: translateX(-50%); border-radius: var(--radius-badge); background: var(--color-text); }
    .container, .logs-cards-container { max-width: 1400px; width: 100%; margin: 0 auto; padding: 40px var(--page-inline-padding); box-sizing: border-box; }
    .wrapper { width: 100%; background: var(--color-surface); border-radius: var(--radius-card); box-shadow: var(--shadow-card); border: 1px solid var(--color-border); overflow: hidden; box-sizing: border-box; }
    .table-title { font-weight: 600; display: flex; align-items: center; background: var(--color-surface); color: var(--color-text); box-sizing: border-box; }
    .empty-state { text-align: center; padding: 40px; color: var(--color-text-faint); }

    .primary-btn, .secondary-btn { padding: 10px 20px; border-radius: var(--radius-control); font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-size: 13px; transition: 0.2s; margin: 0; white-space: nowrap; }
    .primary-btn { background: var(--color-primary); color: #fff; border: none; }
    .primary-btn:hover { background: var(--color-primary-strong); box-shadow: 0 2px 4px rgba(37,99,235,0.2); }
    .secondary-btn { background: var(--color-surface); color: #475569; border: 1px solid var(--color-border-strong); }
    .secondary-btn:hover { background: var(--color-surface-muted); color: var(--color-text); border-color: var(--color-text-faint); }
    .icon-btn { width: 32px; height: 32px; background: none; border: 1px solid var(--color-border); border-radius: var(--radius-control); padding: 0; cursor: pointer; color: #475569; transition: 0.2s; display: inline-flex; align-items: center; justify-content: center; }
    .icon-btn:hover { background: var(--color-bg); border-color: var(--color-border-strong); color: var(--color-primary-strong); }
    .icon-btn-del { color: var(--color-danger); }
    .icon-btn-del:hover { background: #fef2f2; border-color: #fca5a5; color: var(--color-danger); }
    .ui-icon { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }

    .form-input { width: 100%; padding: 10px 12px; border: 1px solid var(--color-border-strong); border-radius: var(--radius-control); font-size: 14px; color: var(--color-text); box-sizing: border-box; transition: all 0.2s; background: var(--color-surface-muted); }
    .form-input:focus { background: var(--color-surface); border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); outline: none; }
    .form-input::placeholder { color: var(--color-text-faint); }
    @media (max-width: 650px) {
        .nav-container { height: 56px; min-height: 56px; gap: 8px; }
        .nav-left { flex: 0 0 auto; }
        .nav-logo { font-size: 1.8rem; }
        .nav-title { display: none; }
        .nav-right { flex: 1 1 auto; min-width: 0; }
        .nav-links { display: flex; justify-content: flex-end; width: 100%; gap: 16px; }
        .nav-link { justify-content: center; flex: 0 0 auto; min-width: 0; color: #64748b; font-size: 14px; line-height: 56px; }
        .nav-link.active { color: var(--color-text); }
        .primary-btn, .secondary-btn { width: 100%; }
    }

    ${footerCSS}
`;
