export default `* { box-sizing: border-box; margin: 0; padding: 0; }
    body, code, input, button, select, textarea { font-family: "Roboto Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    body { background: #f1f5f9; color: #0f172a; margin: 0; padding: 0; overflow-x: hidden; min-height: 100dvh; display: flex; flex-direction: column; }
    body.nav-mobile-open { overflow: hidden; }

    /* Navigation Bar - VitePress style */
    .main-header { position: sticky; top: 0; z-index: 100; background: #fff; border-bottom: 1px solid #e2e8f0; width: 100%; }
    .nav-container { max-width: 1400px; width: 100%; margin: 0 auto; padding: 0 24px; display: flex; align-items: center; justify-content: space-between; height: 64px; }
    .nav-left { display: flex; align-items: center; gap: 8px; }
    .nav-right { display: flex; align-items: center; gap: 24px; }
    .nav-logo { font-size: 1.8rem; line-height: 1; }
    .nav-title { margin: 0; font-size: 1.5rem; font-weight: 600; color: #0f172a; letter-spacing: -0.3px; }
    .nav-title-link { color: inherit; text-decoration: none; }
    .nav-links { display: flex; align-items: center; gap: 20px; }
    .nav-link { display: inline-flex; align-items: center; padding: 0; font-size: 14px; font-weight: 500; color: #64748b; text-decoration: none; transition: color 0.2s; line-height: 64px; border-bottom: 2px solid transparent; }
    .nav-link:hover { color: #0f172a; }
    .nav-link.active { color: #0f172a; border-bottom-color: #0f172a; font-weight: 600; }
    .nav-toggle { display: none; background: none; border: none; cursor: pointer; padding: 8px; color: #64748b; }
    .nav-toggle:hover { color: #0f172a; }
    .nav-toggle svg { width: 20px; height: 20px; }
    .nav-mobile-overlay { display: none; position: fixed; top: 64px; right: 0; bottom: 0; left: 0; background: rgba(0,0,0,0.25); z-index: 99; }
    .nav-mobile-overlay.open { display: block; }
    .nav-mobile-menu { position: fixed; top: 64px; right: -50vw; width: 50vw; height: calc(100% - 64px); background: #fff; z-index: 100; transition: right 0.25s ease; box-shadow: -4px 0 12px rgba(0,0,0,0.08); display: flex; flex-direction: column; }
    .nav-mobile-menu.open { right: 0; }
    .nav-mobile-links { display: flex; flex-direction: column; padding: 8px 0; }
    .nav-mobile-link { display: block; padding: 12px 24px; font-size: 15px; font-weight: 500; color: #64748b; text-decoration: none; transition: all 0.15s; border-left: 2px solid transparent; }
    .nav-mobile-link:hover { background: #f8fafc; color: #0f172a; }
    .nav-mobile-link.active { color: #0f172a; border-left-color: #0f172a; font-weight: 600; background: #f8fafc; }

    @media (max-width: 650px) {
        .nav-links { display: none; }
        .nav-toggle { display: block; }
        .nav-container { padding: 0 16px; }
    }

    /* Global Container */
    .container, .logs-cards-container { max-width: 1400px; width: 100%; margin: 0 auto; padding: 40px 15px 40px 15px; box-sizing: border-box; }

    body { min-height: 100dvh; display: flex; flex-direction: column; margin: 0; }
    .container { flex: 1; max-width: 900px; display: flex; flex-direction: column; gap: 20px; }

    .wrapper { width: 100%; background: #fff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; overflow: hidden; box-sizing: border-box; }
    .table-title { padding: 15px 20px; font-weight: 600; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; background: #fff; color: #0f172a; font-size: 15px; box-sizing: border-box; }
    .section-body { padding: 25px 20px; box-sizing: border-box; }
    .section-body-compact { padding-top: 20px; padding-bottom: 20px; }

    .flex-row { display: flex; justify-content: space-between; align-items: center; gap: 15px; }
    .tool-info-title { font-weight: 600; color: #0f172a; margin-bottom: 4px; }
    .tool-info-desc { font-size: 13px; color: #64748b; }
    .tool-info-desc-spaced { margin-bottom: 20px; }
    .actions-row-end { display: flex; justify-content: flex-end; }

    .ops-body .list { display: flex; flex-direction: column; gap: 4px; }
    .ops-body .item { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 6px; transition: 0.2s; border: 1px solid transparent; }
    .ops-body .item:hover { background: #f8fafc; border-color: #e2e8f0; }
    .ops-body .item-left { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; cursor: pointer; }
    .ops-body .item-chk { width: 16px; height: 16px; accent-color: #2563eb; flex-shrink: 0; }
    .ops-body .item-name { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ops-body .item-right { display: flex; gap: 4px; flex-shrink: 0; align-items: center; }
    .ops-body .group-header { display: flex; align-items: center; gap: 8px; padding: 12px 12px 6px 12px; }
    .ops-body .group-chk { width: 16px; height: 16px; accent-color: #2563eb; flex-shrink: 0; cursor: pointer; }
    .ops-body .group-label { font-size: 12px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; flex: 1; }
    .ops-body .item-sep { height: 1px; background: #f1f5f9; margin: 4px 0; }
    .ops-body .ops-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 12px; }
    .ops-body .icon-btn { background: none; border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 8px; cursor: pointer; font-size: 14px; transition: 0.2s; }
    .ops-body .icon-btn:hover { background: #f1f5f9; border-color: #cbd5e1; }
    .ops-body .icon-btn-fill { color: #2563eb; }
    .ops-body .icon-btn-fill:hover { background: #eff6ff; border-color: #93c5fd; }
    .ops-body .icon-btn-del { color: #dc2626; }
    .ops-body .icon-btn-del:hover { background: #fef2f2; border-color: #fca5a5; }

    .primary-btn { background: #2563eb; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-size: 13px; transition: 0.2s; margin: 0; white-space: nowrap; }
    .primary-btn:hover { background: #1d4ed8; box-shadow: 0 2px 4px rgba(37,99,235,0.2); }

    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
    .form-group { display: flex; flex-direction: column; }
    .tool-label { font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 8px; padding-left: 2px; }
    .form-input { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; color: #0f172a; box-sizing: border-box; transition: all 0.2s; background: #f8fafc; }
    .form-input:focus { background: #fff; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); outline: none; }
    .form-input::placeholder { color: #94a3b8; }

    /* 修改后的代码：使用 Grid 布局实现一行两个 */
    .qr-list-container { max-height: 250px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; background: #f8fafc; margin-bottom: 15px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .qr-item { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; box-sizing: border-box; }
    .qr-label { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 6px; cursor: pointer; transition: 0.2s; border: 1px solid transparent; background: transparent; flex: 1; min-width: 0; }
    .qr-label:hover { background: #fff; border-color: #cbd5e1; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
    .form-checkbox { width: 16px; height: 16px; cursor: pointer; accent-color: #2563eb; margin: 0; flex-shrink: 0; }
    .qr-name { font-weight: 600; color: #1e293b; font-size: 14px; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .qr-actions { display: flex; gap: 6px; flex-shrink: 0; }
    .fill-btn { background: #fff; color: #2563eb; border: 1px solid #bfdbfe; padding: 6px 10px; border-radius: 6px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; transition: 0.2s; margin: 0; flex-shrink: 0; }
    .fill-btn:hover { background: #eff6ff; border-color: #93c5fd; }
    .delete-btn { background: #fff; color: #dc2626; border: 1px solid #fecaca; padding: 6px 10px; border-radius: 6px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; transition: 0.2s; margin: 0; flex-shrink: 0; }
    .delete-btn:hover { background: #fef2f2; border-color: #fca5a5; }
    .secondary-btn { background: #fff; color: #475569; border: 1px solid #cbd5e1; padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; transition: 0.2s; margin: 0; white-space: nowrap; }
    .secondary-btn:hover { background: #f8fafc; color: #0f172a; border-color: #94a3b8; }
    .mode-select { width: auto; min-width: 80px; padding: 6px 28px 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; color: #0f172a; background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' fill='none' stroke='%2364748b' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 8px center; -webkit-appearance: none; appearance: none; cursor: pointer; flex-shrink: 0; }
    .mode-select:focus { border-color: #2563eb; outline: none; }

    @media (max-width: 650px) { .form-grid { grid-template-columns: 1fr; gap: 12px; } .flex-row { flex-direction: column; align-items: stretch; text-align: left; } .primary-btn, .secondary-btn { width: 100%; } .actions-row-end { flex-direction: column; } .qr-list-container { grid-template-columns: 1fr; } .ops-actions { flex-direction: column; } .ops-body .item { flex-wrap: wrap; } .ops-body .item-right { width: 100%; justify-content: flex-end; margin-top: 4px; } }

    
    .build-footer { margin-top: auto; text-align: center; padding: 15px 20px; padding-bottom: calc(15px + env(safe-area-inset-bottom)); color: #94a3b8; font-size: 11px; }

    .build-footer .footer-label { font-weight: 500; }
    .build-footer .footer-time, .build-footer .footer-sha { color: #64748b; font-weight: 600; }
    .build-footer a { color: inherit; text-decoration: none; opacity: 1; transition: filter 0.2s ease; }
    .build-footer a:hover { filter: brightness(1.08); text-decoration: underline; }


    /* Clean Glass Auth Overlay */
    #auth-overlay { position: fixed; inset: 0; background: rgba(241,245,249,0.8); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex; justify-content: center; align-items: center; z-index: 999; }
    .auth-card { background: #fff; padding: 35px 30px; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); width: 340px; text-align: center; box-sizing: border-box; border: 1px solid #e2e8f0; }
    .auth-icon { font-size: 32px; margin-bottom: 20px; }
    .auth-btn { width: 100%; justify-content: center; padding: 12px; font-size: 14px; }
    .auth-input { text-align: center; letter-spacing: 2px; margin-bottom: 20px; padding: 12px; }

    /* Toast 通知 */
    #toast-container { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 1000; display: flex; flex-direction: column; align-items: center; gap: 10px; pointer-events: none; width: auto; max-width: 92vw; }
    .toast { display: inline-flex; align-items: center; width: fit-content; max-width: min(92vw, 460px); color: #1e293b; background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%); border: 1px solid #d9ecff; padding: 11px 14px; border-radius: 14px; font-size: 13px; line-height: 1.45; font-weight: 600; letter-spacing: 0.1px; box-shadow: 0 12px 28px -18px rgba(14,116,144,0.45), 0 3px 10px rgba(148,163,184,0.18); opacity: 0; transform: translateY(-10px) scale(0.985); transition: opacity 0.22s ease, transform 0.22s ease, box-shadow 0.22s ease; text-align: left; word-break: break-word; }
    .toast.show { opacity: 1; transform: translateY(0) scale(1); box-shadow: 0 14px 30px -18px rgba(14,116,144,0.5), 0 4px 12px rgba(148,163,184,0.2); }
    .toast.success { background: linear-gradient(180deg, #f0fdf4 0%, #ecfdf5 100%); border-color: #86efac; color: #166534; }
    .toast.error { background: linear-gradient(180deg, #fff7ed 0%, #fff1f2 100%); border-color: #fdba74; color: #9a3412; }
`;
