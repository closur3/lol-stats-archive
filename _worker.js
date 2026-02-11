// ====================================================
// 🥇 Worker V39.5.0: 精致视觉与全端渲染优化
// 更新特性:
// 1. 兼容性：修复电脑端 Chrome/Edge 浏览器阴影不渲染的问题 (渲染引擎优化)
// 2. 视觉深度：重构 box-shadow 方案，将锐利白线改为半透明柔和阴影，完美融合色块
// 3. 极致轻量：统一固定列与普通单元格的投影参数，消除视觉上的“厚重感”与“断层感”
// 4. 黄金平衡：表头与数据行采用非对称透明度微调，确保各背景色下视觉权重完全一致
// ====================================================

const UI_VERSION = "2026-02-11-V39.6.0-InteractiveStats";

// --- 1. 工具库 (Global UTC+8 Core) ---
const CST_OFFSET = 8 * 60 * 60 * 1000; 

const utils = {
    // [核心] 将任意 UTC 时间戳转换为 北京时间 Date 对象
    toCST: (ts) => new Date((ts || Date.now()) + CST_OFFSET),

    getNow: () => {
        const bj = utils.toCST();
        return {
            obj: bj,
            full: bj.toISOString().replace("T", " ").slice(0, 19),
            short: bj.toISOString().slice(5, 19).replace("T", " "), 
            date: bj.toISOString().slice(0, 10),
            time: bj.toISOString().slice(11, 16)
        };
    },
    
    // Format: YY-MM-DD HH:mm
    fmtDate: (ts) => {
        if (!ts) return "(Pending)";
        const d = utils.toCST(ts);
        return d.toISOString().slice(2, 10) + " " + d.toISOString().slice(11, 16);
    },

    shortName: (n, teamMap) => {
        if(!n) return "Unknown";
        if(!teamMap) return n;
        const upper = n.toUpperCase();
        if (["TBD", "TBA", "TO BE DETERMINED"].some(x => upper.includes(x))) return "TBD";
        for(let[k,v] of Object.entries(teamMap)) if(upper.includes(k.toUpperCase())) return v;
        return n.replace(/(Esports|Gaming|Academy|Team|Club)/gi, "").trim();
    },

    rate: (n, d) => d > 0 ? n / d : null,
    pct: (r) => r !== null ? `${Math.round(r * 100)}%` : "-",
    
    color: (r, rev = false) => {
        if (r === null) return "#f1f5f9"; 
        const val = Math.max(0, Math.min(1, r));
        const hue = rev ? (1 - val) * 140 : val * 140;
        return `hsl(${parseInt(hue)}, 55%, 50%)`;
    },
    
    colorDate: (ts, minTs, maxTs) => {
        if (!ts) return "#9ca3af"; 
        if (maxTs === minTs) return "hsl(215, 80%, 50%)";
        const factor = (ts - minTs) / (maxTs - minTs);
        const sat = Math.round(factor * 60 + 20); 
        const lig = Math.round(60 - factor * 10);
        return `hsl(215, ${sat}%, ${lig}%)`;
    },
    
    parseDate: (str) => {
        if(!str) return null;
        try { return new Date(str.replace(" ", "T") + "Z"); } catch(e) { return null; }
    },
    
    extractCookies: (headerVal) => {
        if (!headerVal) return "";
        return headerVal.split(',').map(c => c.split(';')[0].trim()).filter(c => c.includes('=')).join('; ');
    }
};

// --- 2. GitHub 读取层 ---
const gh = {
    fetchJson: async (env, path) => {
        const url = `https://api.github.com/repos/${env.GITHUB_USER}/${env.GITHUB_REPO}/contents/${path}`;
        try {
            const r = await fetch(url, {
                headers: { 
                    "User-Agent": "Cloudflare-Worker",
                    "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
                    "Accept": "application/vnd.github.v3+json"
                }
            });
            if (!r.ok) return null;
            const data = await r.json();
            const content = atob(data.content);
            return JSON.parse(decodeURIComponent(escape(content)));
        } catch (e) {
            return null;
        }
    }
};

// --- 3. 认证逻辑 ---
async function loginToFandom(env, logger) {
    const user = env.FANDOM_USER;
    const pass = env.FANDOM_PASS;

    if (!user || !pass) {
        logger.error("🛑 AUTH MISSING: 'FANDOM_USER' or 'FANDOM_PASS' not set.");
        return null;
    }

    const API = "https://lol.fandom.com/api.php";
    const UA = `LoL-Stats-Worker/1.0 (${user})`; 

    try {
        const tokenResp = await fetch(`${API}?action=query&meta=tokens&type=login&format=json`, {
            headers: { "User-Agent": UA }
        });
        
        if (!tokenResp.ok) throw new Error(`Token HTTP Error: ${tokenResp.status}`);

        const tokenData = await tokenResp.json();
        const loginToken = tokenData?.query?.tokens?.logintoken;

        if (!loginToken) throw new Error("Failed to get login token");

        const step1SetCookie = tokenResp.headers.get("set-cookie");
        const step1Cookie = utils.extractCookies(step1SetCookie);

        const params = new URLSearchParams();
        params.append("action", "login");
        params.append("format", "json");
        params.append("lgname", user);
        params.append("lgpassword", pass);
        params.append("lgtoken", loginToken);

        const loginResp = await fetch(API, {
            method: "POST",
            body: params,
            headers: { 
                "User-Agent": UA,
                "Cookie": step1Cookie 
            }
        });

        const loginData = await loginResp.json();
        
        if (loginData.login && loginData.login.result === "Success") {
            const step2SetCookie = loginResp.headers.get("set-cookie");
            const finalCookie = utils.extractCookies(step2SetCookie);
            return { cookie: finalCookie, ua: UA, username: loginData.login.lgusername };
        } else {
            const reason = loginData.login ? loginData.login.reason : JSON.stringify(loginData);
            throw new Error(`Login Failed: ${reason}`);
        }
    } catch (e) {
        logger.error(`❌ Auth Error: ${e.message}`);
        return null;
    }
}

// --- 4. 抓取逻辑 ---
async function fetchWithRetry(url, logger, authContext = null, maxRetries = 3) {
    const headers = { 
        "User-Agent": authContext?.ua || "LoL-Stats-Worker/1.0 (HsuX)" 
    };
    if (authContext?.cookie) {
        headers["Cookie"] = authContext.cookie;
    }

    let attempt = 1;

    while (attempt <= maxRetries) {
        try {
            const r = await fetch(url, { headers });
            
            if (r.status === 429) throw new Error(`HTTP 429 Rate Limit`);

            const rawBody = await r.text();

            if (!r.ok) {
                throw new Error(`HTTP ${r.status}: ${rawBody.slice(0, 150)}...`);
            }

            let data;
            try {
                data = JSON.parse(rawBody);
            } catch (e) {
                throw new Error(`JSON Parse Fail. Content: ${rawBody.slice(0, 150)}...`);
            }

            if (data.error) {
                throw new Error(`API Error [${data.error.code}]: ${data.error.info}`);
            }

            if (!data.cargoquery) {
                throw new Error(`Structure Error: ${rawBody.slice(0, 150)}`);
            }

            return data.cargoquery; 

        } catch (e) {
            const baseWait = 30000;
            const jitter = Math.floor(Math.random() * 15000);
            const waitTime = baseWait + jitter;
            
            if (attempt >= maxRetries) {
                logger.error(`⚠️ Fetch Failed (Attempt ${attempt}/${maxRetries}): ${e.message} -> Max retries exceeded`);
                throw e;
            } else {
                logger.error(`⚠️ Fetch Failed (Attempt ${attempt}/${maxRetries}): ${e.message} -> Retrying in ${Math.floor(waitTime/1000)}s...`);
                await new Promise(res => setTimeout(res, waitTime));
            }
            
            attempt++;
        }
    }
}

async function fetchAllMatches(sourceInput, logger, authContext) {
    const pages = Array.isArray(sourceInput) ? sourceInput : [sourceInput];
    let all = [];

    for (const overviewPage of pages) {
        let offset = 0;
        const limit = 100;
        logger.info(`📡 Fetching: ${overviewPage}`);
        
        while(true) {
            const params = new URLSearchParams({
                action: "cargoquery", format: "json", tables: "MatchSchedule",
                fields: "Team1,Team2,Team1Score,Team2Score,DateTime_UTC,OverviewPage,BestOf,N_MatchInPage,Tab,Round",
                where: `OverviewPage LIKE '${overviewPage}%'`, limit: limit.toString(), offset: offset.toString(), order_by: "DateTime_UTC ASC", origin: "*"
            });

            try {
                const batchRaw = await fetchWithRetry(`https://lol.fandom.com/api.php?${params}`, logger, authContext);
                const batch = batchRaw.map(i => i.title);
                if (!batch.length) break;
                all = all.concat(batch);
                offset += batch.length;
                if (batch.length < limit) break;
                
                await new Promise(res => setTimeout(res, 2000)); 

            } catch(e) {
                logger.error(`💥 Pagination: ${overviewPage} (Offset: ${offset}) -> ${e.message}`);
                throw new Error(`Batch Fail at offset ${offset} for ${overviewPage}: ${e.message}`);
            }
        }
    }
    
    logger.success(`📦 Received: Got ${all.length} matches from ${pages.length} sources`);
    return all;
}

// --- 5. 统计核心 ---
function runFullAnalysis(allRawMatches, prevTournMeta, runtimeConfig) {
    const globalStats = {};
    const debugInfo = {};
    const tournMeta = {}; // [NEW] Store per-tournament meta (streak/mode)
    
    const timeGrid = { "ALL": {} };
    const createSlot = () => { const t = {}; for(let i=0; i<8; i++) t[i] = { total:0, full:0, matches:[] }; return t; };
    timeGrid.ALL = createSlot(); 

    let maxDateTs = 0;
    let grandTotal = 0;
    
    const todayStr = utils.getNow().date;
    const allFutureMatches = {}; 
    
    // [MOVED] Counters are now per-tournament inside the loop

    runtimeConfig.TOURNAMENTS.forEach((tourn, tournIdx) => {
        const rawMatches = allRawMatches[tourn.slug] || [];
        const stats = {};
        let processed = 0, skipped = 0;
        
        // [NEW] Per-tournament counters
        let t_matchesToday = 0;
        let t_pendingToday = 0;
        
        const ensureTeam = (name) => { if(!stats[name]) stats[name] = { name, bo3_f:0, bo3_t:0, bo5_f:0, bo5_t:0, s_w:0, s_t:0, g_w:0, g_t:0, strk_w:0, strk_l:0, last:0, history:[] }; };

        rawMatches.forEach(m => {
            // ... (Team name processing lines 270-280 remain same) ...
            const t1 = utils.shortName(m.Team1 || m["Team 1"], runtimeConfig.TEAM_MAP);
            const t2 = utils.shortName(m.Team2 || m["Team 2"], runtimeConfig.TEAM_MAP);
            if(!t1 || !t2) { skipped++; return; } 
            
            ensureTeam(t1); ensureTeam(t2);

            const s1 = parseInt(m.Team1Score)||0, s2 = parseInt(m.Team2Score)||0;
            const bo = parseInt(m.BestOf)||3;
            const isFinished = Math.max(s1, s2) >= Math.ceil(bo/2);
            const isLive = !isFinished && (s1 > 0 || s2 > 0 || (m.Team1Score !== "" && m.Team1Score != null));
            const isFull = (bo===3 && Math.min(s1,s2)===1) || (bo===5 && Math.min(s1,s2)===2);
            
            const dt = utils.parseDate(m.DateTime_UTC || m["DateTime UTC"]);
            
            let dateDisplay = "-";
            let ts = 0;

            if (dt) {
                ts = dt.getTime();
                const bj = utils.toCST(ts);
                const matchDateStr = bj.toISOString().slice(0, 10);
                const matchTimeStr = bj.toISOString().slice(11, 16);
                
                const month = (bj.getUTCMonth()+1).toString().padStart(2,'0');
                const day = bj.getUTCDate().toString().padStart(2,'0');
                dateDisplay = `${month}-${day} ${matchTimeStr}`;

                if (matchDateStr >= todayStr) {
                    if (matchDateStr === todayStr) {
                        t_matchesToday++; // [UPDATED] Local counter
                        if (!isFinished) t_pendingToday++; // [UPDATED] Local counter
                    }
                    if (!allFutureMatches[matchDateStr]) allFutureMatches[matchDateStr] = [];
                    // ... (Future matches push logic remains same) ...
                    let blockName = m.Tab || "";
                    if (!blockName || blockName === "Bracket" || blockName === "Knockout Stage") {
                        if (m.Round) blockName = m.Round;
                    }
                    if (!blockName) blockName = "";

                    allFutureMatches[matchDateStr].push({
                        time: matchTimeStr, t1: t1, t2: t2, s1: s1, s2: s2, bo: bo,
                        is_finished: isFinished, is_live: isLive, 
                        tourn: tourn.region, tournSlug: tourn.slug,
                        tournIndex: tournIdx, 
                        blockName: blockName  
                    });
                }
            }
            // ... (Rest of match processing remains same) ...
            let resT1 = 'N', resT2 = 'N';
            if (isLive) { resT1 = 'LIV'; resT2 = 'LIV'; }
            else if (isFinished) {
                resT1 = s1 > s2 ? 'W' : 'L';
                resT2 = s2 > s1 ? 'W' : 'L';
            }

            stats[t1].history.push({
                d: dateDisplay, vs: t2, s: `${s1}-${s2}`, res: resT1, bo: bo, full: isFull, ts: ts
            });
            stats[t2].history.push({
                d: dateDisplay, vs: t1, s: `${s2}-${s1}`, res: resT2, bo: bo, full: isFull, ts: ts
            });

            if(!isFinished) { skipped++; return; }

            processed++;
            
            const winner = s1 > s2 ? t1 : t2, loser = s1 > s2 ? t2 : t1;

            [t1,t2].forEach(tm => { stats[tm].s_t++; stats[tm].g_t += (s1+s2); });
            stats[winner].s_w++; stats[t1].g_w += s1; stats[t2].g_w += s2;
            if(bo===3) { stats[t1].bo3_t++; stats[t2].bo3_t++; if(isFull){stats[t1].bo3_f++; stats[t2].bo3_f++;} }
            else if(bo===5) { stats[t1].bo5_t++; stats[t2].bo5_t++; if(isFull){stats[t1].bo5_f++; stats[t2].bo5_f++;} }

            if(stats[winner].strk_l > 0) { stats[winner].strk_l=0; stats[winner].strk_w=1; } else stats[winner].strk_w++;
            if(stats[loser].strk_w > 0) { stats[loser].strk_w=0; stats[loser].strk_l=1; } else stats[loser].strk_l++;

            if(dt) {
                if(ts > stats[t1].last) stats[t1].last = ts;
                if(ts > stats[t2].last) stats[t2].last = ts;
                if(ts > maxDateTs) maxDateTs = ts;

                const bj = utils.toCST(ts);
                const matchDateStr = bj.toISOString().slice(0, 10); // Fix: Ensure matchDateStr available here if needed or re-derive
                // ... (TimeGrid logic lines 385-403 remain same) ...
                const matchObj = { d: `${(bj.getUTCMonth()+1).toString().padStart(2,'0')}-${bj.getUTCDate().toString().padStart(2,'0')}`, t1: t1, t2: t2, s: `${s1}-${s2}`, f: isFull };
                const pyDay = bj.getUTCDay() === 0 ? 6 : bj.getUTCDay() - 1;
                const hour = bj.getUTCHours();
                const targetH = hour;

                if (!timeGrid[tourn.region]) timeGrid[tourn.region] = { "Total": createSlot() };
                if (!timeGrid[tourn.region][targetH]) timeGrid[tourn.region][targetH] = createSlot();
                
                const add = (grid, h, d) => { grid[h][d].total++; if(isFull) grid[h][d].full++; grid[h][d].matches.push(matchObj); };
                
                add(timeGrid[tourn.region], targetH, pyDay);      
                add(timeGrid[tourn.region], "Total", pyDay);      
                add(timeGrid[tourn.region], targetH, 7);            
                add(timeGrid[tourn.region], "Total", 7);            
                
                timeGrid.ALL[pyDay].total++; if(isFull) timeGrid.ALL[pyDay].full++; timeGrid.ALL[pyDay].matches.push(matchObj);
                timeGrid.ALL[7].total++; if(isFull) timeGrid.ALL[7].full++; timeGrid.ALL[7].matches.push(matchObj);
            }
        });
        
        Object.values(stats).forEach(team => team.history.sort((a, b) => b.ts - a.ts));
        debugInfo[tourn.slug] = { raw: rawMatches.length, processed, skipped };
        globalStats[tourn.slug] = stats;
        grandTotal += processed;

        // [NEW] Calculate Status Per Tournament
        const prevT = prevTournMeta[tourn.slug] || { streak: 0, mode: "fast" };
        let nextStreak = 0;
        let nextMode = "fast";

        if (t_matchesToday > 0 && t_pendingToday > 0) {
            // Ongoing
            nextStreak = 0;
            nextMode = "fast";
        } else {
            // Finished for today OR No matches today
            // Logic: 0 -> 1 (Verify) -> 2 (Slow)
            nextStreak = prevT.streak >= 1 ? 2 : 1;
            nextMode = nextStreak >= 2 ? "slow" : "fast";
        }
        tournMeta[tourn.slug] = { streak: nextStreak, mode: nextMode };
    });

    let scheduleMap = {};
    const sortedFutureDates = Object.keys(allFutureMatches).sort();
    const activeDates = sortedFutureDates.slice(0, 4); 
    
    activeDates.forEach(d => {
        scheduleMap[d] = allFutureMatches[d].sort((a,b) => {
            if (a.tournIndex !== b.tournIndex) return a.tournIndex - b.tournIndex;
            return a.time.localeCompare(b.time);
        });
    });

// [NEW] Generate Global Status Text based on aggregation
    let statusText = "";
    const metaValues = Object.values(tournMeta);
    const anyOngoing = metaValues.some(m => m.streak === 0 && m.mode === "fast");
    const anyVerifying = metaValues.some(m => m.streak === 1);
    
    // [CSS修复] 使用 inline-flex + align-items:center 实现绝对垂直居中
    // gap:4px 控制图标和文字的间距
    // transform: translateY(-1px) 用于微调 Emoji 的视觉重心（Emoji 通常偏高）
    const boxStyle = "display:inline-flex; align-items:center; justify-content:center; gap:5px; font-weight:600; font-size:12px; padding: 4px 10px; border-radius: 20px; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;";
    const iconStyle = "font-size: 14px; line-height: 1; display: block; transform: translateY(-1px);"; 

    if (anyOngoing) {
        statusText = `<div style="${boxStyle} color:#10b981;">
            <span style="${iconStyle}">🎮</span><span>ONGOING</span>
        </div>`;
    } else if (anyVerifying) {
        statusText = `<div style="${boxStyle} color:#f59e0b;">
            <span style="${iconStyle}">👀</span><span>VERIFYING</span>
        </div>`;
    } else {
        statusText = `<div style="${boxStyle} color:#94a3b8;">
            <span style="${iconStyle}">✔️</span><span>FINISHED</span>
        </div>`;
    }

    return { globalStats, timeGrid, debugInfo, maxDateTs, grandTotal, statusText, scheduleMap, tournMeta };
}

// --- 6. Markdown 生成器 (Backup) ---
function generateMarkdown(tourn, stats, timeGrid) {
    let md = `# ${tourn.title}\n\n`;
    md += `**Updated:** {{UPDATED_TIME}} (CST)\n\n---\n\n`;
    md += `## 📊 Statistics\n\n`;
    md += `| TEAM | BO3 FULL | BO3% | BO5 FULL | BO5% | SERIES | SERIES WR | GAMES | GAME WR | STREAK | LAST DATE |\n`;
    md += `| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;
    const sorted = Object.values(stats).filter(s => s.name !== "TBD").sort((a,b) => {
        const rA = utils.rate(a.bo3_f, a.bo3_t) ?? -1;
        const rB = utils.rate(b.bo3_f, b.bo3_t) ?? -1;
        if(rA !== rB) return rA - rB; 
        const sWA = utils.rate(a.s_w, a.s_t) || 0;
        const sWB = utils.rate(b.s_w, b.s_t) || 0;
        return sWB - sWA;
    });
    sorted.forEach(s => {
        const bo3Txt = s.bo3_t ? `${s.bo3_f}/${s.bo3_t}` : "-";
        const bo5Txt = s.bo5_t ? `${s.bo5_f}/${s.bo5_t}` : "-";
        const serTxt = s.s_t ? `${s.s_w}-${s.s_t-s.s_w}` : "-";
        const serWrTxt = utils.pct(utils.rate(s.s_w, s.s_t));
        const gamTxt = s.g_t ? `${s.g_w}-${s.g_t-s.g_w}` : "-";
        const gamWrTxt = utils.pct(utils.rate(s.g_w, s.g_t));
        const strk = s.strk_w > 0 ? `${s.strk_w}W` : (s.strk_l > 0 ? `${s.strk_l}L` : "-");
        const last = s.last ? utils.toCST(s.last).toISOString().slice(0,10) : "-";
        md += `| ${s.name} | ${bo3Txt} | ${utils.pct(utils.rate(s.bo3_f, s.bo3_t))} | ${bo5Txt} | ${utils.pct(utils.rate(s.bo5_f, s.bo5_t))} | ${serTxt} | ${serWrTxt} | ${gamTxt} | ${gamWrTxt} | ${strk} | ${last} |\n`;
    });
    md += `\n## 📅 Time Slot Distribution\n\n`;
    md += `| Time Slot | Mon | Tue | Wed | Thu | Fri | Sat | Sun | Total |\n`;
    md += `| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;
    const rows = tourn.region === "LCK" ? [16, 18, "Total"] : [15, 17, 19, "Total"];
    rows.forEach(h => {
        const label = h === "Total" ? `**${tourn.region} Total**` : `${tourn.region} ${h}:00`;
        let line = `| ${label} |`;
        for(let w=0; w<8; w++) {
            const cell = timeGrid[tourn.region][h][w];
            line += cell.total === 0 ? " - |" : ` ${cell.full}/${cell.total} (${Math.round(cell.full/cell.total*100)}%) |`;
        }
        md += line + "\n";
    });
    md += `\n---\n*Generated by LoL Stats Worker*\n`;
    return md;
}

// --- 7. HTML 渲染器 & 页面外壳 ---

const PYTHON_STYLE = `
    /* 全局重置 */
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f1f5f9; margin: 0; padding: 0; color: #0f172a; }
    
    /* Header */
    .main-header { background: #fff; padding: 15px 25px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; margin-bottom: 25px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-logo { font-size: 1.8rem; }
    .header-title { margin: 0; font-size: 1.4rem; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
    .header-right { display: flex; gap: 10px; align-items: center; }

    /* Button */
    .action-btn { background: #fff; border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; color: #475569; text-decoration: none; display: flex; align-items: center; gap: 5px; transition: 0.2s; font-family: inherit; }
    .action-btn:hover { background: #f8fafc; color: #0f172a; border-color: #94a3b8; }
    
    /* Container */
    .container { max-width: 1400px; margin: 0 auto; padding: 0 15px 40px 15px; }
    
    /* Wrapper (Single Card for Stats+Time) */
    .wrapper { width: 100%; overflow-x: auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-bottom: 25px; border: 1px solid #e2e8f0; padding-bottom: 0; display: flex; flex-direction: column; }
    .wrapper::-webkit-scrollbar, .match-list::-webkit-scrollbar, .log-list::-webkit-scrollbar { display: none; }
    .wrapper, .match-list, .log-list { -ms-overflow-style: none; scrollbar-width: none; }

    /* =================表格样式核心修改================= */
    table { 
        width: 100%; 
        min-width: 1000px; 
        border-collapse: separate; 
        border-spacing: 0; 
        font-size: 14px; 
        table-layout: fixed; 
        margin: 0; 
        border: none; 
    }

    /* 表头 (TH) - 稍微深一点点 (0.05透明度)，因为表头通常背景色较深 */
    th { 
        background: #f8fafc; 
        padding: 14px 8px; 
        font-weight: 600; 
        color: #64748b; 
        cursor: pointer; 
        transition: 0.2s; 
        /* 参数解释：X偏移-1px | Y偏移-1px | 模糊2px | 颜色透明度0.05 */
        box-shadow: inset -1px -1px 2px rgba(0, 0, 0, 0.05);
        border: none !important;
    }
    th:hover { background: #eff6ff; color: #2563eb; }

    /* 数据格 (TD) - 最浅淡 (0.03透明度)，保证视觉干净 */
    td { 
        padding: 12px 8px; 
        text-align: center; 
        white-space: nowrap; 
        overflow: hidden; 
        text-overflow: ellipsis; 
        /* 极其柔和的阴影，只起分割作用，不抢眼 */
        box-shadow: inset -1px -1px 2px rgba(0, 0, 0, 0.04);
        border: none !important;
    }

    /* 行 (TR) */
    tr { border: none !important; }

    /* 固定列 (.team-col) - 加强一点点立体感 (0.06透明度) */
    .team-col { 
        position: sticky; 
        left: 0; 
        background: white !important; 
        z-index: 10; 
        text-align: left; 
        font-weight: 800; 
        padding-left: 15px; 
        width: 80px; 
        transition: 0.2s; 
        box-shadow: inset -1px -1px 2px rgba(0, 0, 0, 0.04) !important;
        border: none !important;
        outline: none !important;
    }

    .team-clickable { cursor: pointer; } 
    .team-clickable:hover { color: #2563eb; background-color: #eff6ff !important; }

    /* Titles */
    .table-title { padding: 15px; font-weight: 700; border-bottom: 2px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; background: #fff; }
    .table-title a { color: #2563eb; text-decoration: none; }
    
    /* ============ Archive Details 主容器 ============ */
    details.arch-sec { background: #fff; border: 1px solid #e2e8f0; border-left: 4px solid #2563eb; border-radius: 12px; margin-bottom: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: all 0.3s ease; display: block; }
    details.arch-sec:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    details.arch-sec[open] { box-shadow: 0 4px 16px rgba(37, 99, 235, 0.12); border-color: #2563eb; }
    details.arch-sec[open]:hover { box-shadow: 0 6px 20px rgba(37, 99, 235, 0.15); }

    /* ============ Archive Summary 头部 ============ */
    summary.arch-sum { cursor: pointer; user-select: none; list-style: none; min-height: 48px; display: flex; padding: 12px 16px; background: linear-gradient(135deg, #f8fafc 0%, #fff 100%); border-bottom: none; align-items: center; transition: background 0.2s; }
    summary.arch-sum:hover { background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%); }
    summary.arch-sum::-webkit-details-marker { display: none; }
    details.arch-sec[open] summary.arch-sum { background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%); }

    /* ============ 标题包装器 ============ */
    .arch-title-wrapper { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
    .arch-title-wrapper a { color: #0f172a; font-weight: 700; text-decoration: none; transition: color 0.2s; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .arch-title-wrapper a:hover { color: #2563eb; }

    /* ============ 指示符（❯ 符号） ============ */
    .arch-indicator { font-size: 18px; color: #2563eb; font-weight: 600; transition: transform 0.3s ease; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; flex-shrink: 0; margin-right: 8px; }
    details.arch-sec[open] .arch-indicator { transform: rotate(90deg); }

    /* ============ 时间标签 ============ */
    .time-label { font-size: 11px; color: #94a3b8; font-weight: 600; margin-left: 12px; white-space: nowrap; flex-shrink: 0; }

    /* Column Widths */
    .col-bo3 { width: 70px; } .col-bo3-pct { width: 70px; } .col-bo5 { width: 70px; } .col-bo5-pct { width: 70px; }
    .col-series { width: 70px; } .col-series-wr { width: 70px; } .col-game { width: 70px; } .col-game-wr { width: 70px; }
    .col-streak { width: 70px; } .col-last { width: 130px; }

    /* Fonts */
    .col-bo3, .col-bo3-pct, .col-bo5, .col-bo5-pct, .col-series, .col-series-wr, .col-game, .col-game-wr,
    .col-streak, .col-last, .sch-time, .hist-score, .col-date, .log-time, .sch-fin-score, .sch-live-score { 
        font-family: inherit; font-variant-numeric: tabular-nums; font-weight: 700; letter-spacing: 0;
    }
    
    /* Spine Layout */
    .spine-row { display: flex; justify-content: center; align-items: stretch; width: 100%; height: 100%; }
    
    .spine-l { flex: 1; flex-basis: 0; display: flex; align-items: center; justify-content: flex-end; padding: 0; font-weight: 800; transition: background 0.15s; }
    .spine-r { flex: 1; flex-basis: 0; display: flex; align-items: center; justify-content: flex-start; padding: 0; font-weight: 800; transition: background 0.15s; }
    .spine-sep { width: 12px; display: flex; align-items: center; justify-content: center; opacity: 0.8; font-weight: 700; font-size: 10px; }

    .sch-row .spine-l, .sch-row .spine-r { padding: 4px 5px; }

    .spine-l.clickable:hover, .spine-r.clickable:hover {
        background-color: #eff6ff; 
        color: #2563eb;            
        cursor: pointer;
    }

    /* Cell Alignment - 完美脊柱对齐 (Spine Alignment) */
    .t-cell { 
        display: flex; 
        align-items: center; 
        width: 100%; 
        height: 100%; 
    }
    
    .t-val { 
        flex: 1; 
        flex-basis: 0; 
        text-align: right; 
        font-weight: 700; 
        padding-right: 4px; 
        white-space: nowrap;
    } 
    
    .t-pct { 
        flex: 1; 
        flex-basis: 0; 
        text-align: left; 
        opacity: 0.9; 
        font-size: 11px; 
        font-weight: 700; 
        padding-left: 4px; 
        white-space: nowrap;
    }

    .badge { color: white; border-radius: 4px; padding: 3px 7px; font-size: 11px; font-weight: 700; }
    .footer { text-align: center; font-size: 12px; color: #94a3b8; margin: 40px 0; }

    /* Schedule Grid */
    .sch-container { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-top: 40px; width: 100%; align-items: start; }
    .sch-card { background: #fff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; overflow: hidden; display: flex; flex-direction: column; }
    .sch-header { padding: 12px 15px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #334155; display:flex; justify-content:space-between; }
    .sch-body { display: flex; flex-direction: column; flex: 1; padding-bottom: 0; }
    .sch-group-header { border-bottom: 1px solid #e2e8f0; border-top: 1px solid #e2e8f0; padding: 4px 0; color: #475569; font-size: 11px; letter-spacing: 0.5px; }
    .sch-group-header .spine-l { justify-content: flex-end; padding-right: 2px; }
    .sch-group-header .spine-r { justify-content: flex-start; padding-left: 2px; opacity: 0.7; }
    .sch-group-header:first-child { border-top: none; }
    
    .sch-row { display: flex; align-items: stretch; padding: 0; border-bottom: 1px solid #f8fafc; font-size: 13px; color: #334155; min-height: 36px; flex: 0 0 auto; }
    .sch-row:last-child { border-bottom: none; }
    .sch-time { width: 60px; color: #94a3b8; font-size: 12px; display:flex; align-items:center; justify-content:center; } 
    .sch-tag-col { width: 60px; display: flex; align-items:center; justify-content: center; }
    .sch-vs-container { flex: 1; display: flex; align-items: stretch; justify-content: center; }

    .sch-pill { padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; background: #f1f5f9; color: #64748b; }
    .sch-pill.gold { background: #f2d49c; color: #9c5326; }
    .sch-live-score { color: #10b981; font-size: 13px; }
    .sch-fin-score { color: #334155; font-size: 13px; }
    .sch-empty { margin-top: 40px; text-align: center; color: #94a3b8; background: #fff; padding: 30px; border-radius: 12px; border: 1px solid #e2e8f0; font-weight: 700; }

    /* Mobile */
    @media (max-width: 1100px) { .sch-container { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 600px) { .sch-container { grid-template-columns: 1fr; } .btn-text { display: none; } .action-btn { padding: 6px 10px; } }
    
    /* Modal */
    .modal { display: none; position: fixed; z-index: 99; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.4); backdrop-filter: blur(2px); }
    .modal-content { background-color: #fefefe; margin: 12% auto; padding: 25px; border: 1px solid #888; width: 420px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.25); animation: fadeIn 0.2s; }
    .close { color: #aaa; float: right; font-size: 28px; font-weight: bold; cursor: pointer; }
    .match-list { margin-top: 20px; max-height: 400px; overflow-y: auto; }
    
    .match-item { display: grid; align-items: center; border-bottom: 1px solid #f1f5f9; padding: 10px 1px; font-size: 14px; gap: 0; }
    .match-item.history-layout { grid-template-columns: 95px auto 1fr 20px 1fr 60px; }
    .match-item.dist-layout { grid-template-columns: 48px 1fr 24px 1fr 70px; }
    .col-date { font-size: 13px; color: #94a3b8; text-align: left; }
    .col-res { font-weight: 900; font-size: 16px; text-align: center; line-height: 1; }
    .col-t1 { text-align: right; font-weight: 800; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 5px; min-width: 0; }
    .col-vs { text-align: center; color: #94a3b8; font-size: 10px; }
    .col-t2 { text-align: left; font-weight: 800; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-left: 5px; min-width: 0; }
    .col-score { text-align: right; white-space: nowrap; display: flex; justify-content: flex-end; align-items: center; }
    .hist-win { color: #10b981; } .hist-loss { color: #f43f5e; }
    .hist-score { font-size: 16px; color: #0f172a; }
    .hist-full { color: #f59e0b; font-size: 10px; border: 1px solid #f59e0b; padding: 1px 4px; border-radius: 4px; font-weight: 700; margin-right: 8px; }
    .hist-icon { font-size: 16px; }
    
    /* Logs */
    .log-list { list-style: none; margin: 0; padding: 0; max-height: 80vh; overflow-y: auto; }
    .log-entry { display: grid; grid-template-columns: 115px 90px 1fr; gap: 20px; padding: 14px 20px; border-bottom: 1px solid #f1f5f9; font-size: 15px; align-items: center; }
    .log-entry:nth-child(even) { background-color: #f8fafc; }
    .log-time { color: #64748b; font-size: 15px; white-space: nowrap; letter-spacing: -0.5px; text-align: center; }
    .log-level { font-weight: 800; text-align: center; padding: 4px 0; border-radius: 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .lvl-inf { background: #eff6ff; color: #1e40af; border: 1px solid #dbeafe; }
    .lvl-ok { background: #f0fdf4; color: #15803d; border: 1px solid #dcfce7; }
    .lvl-err { background: #fef2f2; color: #b91c1c; border: 1px solid #fee2e2; }
    .log-msg { color: #334155; word-break: break-word; line-height: 1.5; font-weight: 500; }
`;

const PYTHON_JS = `
    <script>
    // --- 1. 全局常量定义 ---
    const COL_TEAM=0, COL_BO3=1, COL_BO3_PCT=2, COL_BO5=3, COL_BO5_PCT=4, COL_SERIES=5, COL_SERIES_WR=6, COL_GAME=7, COL_GAME_WR=8, COL_STREAK=9, COL_LAST_DATE=10;

    // [优化] 提取全局图标映射，避免重复定义
    const RES_MAP = {
        'W': { t: '✔', c: '' },
        'L': { t: '❌', c: '' },
        'LIV': { t: '🔵', c: '' },
        'N': { t: '🕒', c: '' }
    };

    // --- 2. 排序与解析工具 ---
    function doSort(c,id) {
        const t=document.getElementById(id),b=t.tBodies[0],r=Array.from(b.rows),k='data-sort-dir-'+c,cur=t.getAttribute(k),
        next=(!cur)?((c===COL_TEAM)?'asc':'desc'):((cur==='desc')?'asc':'desc');
        r.sort((ra,rb)=>{
            let va=ra.cells[c].innerText,vb=rb.cells[c].innerText;
            if(c===COL_LAST_DATE){va=va==="-"?0:new Date(va).getTime();vb=vb==="-"?0:new Date(vb).getTime();}
            else{va=parseValue(va);vb=parseValue(vb);}
            if(va!==vb) return next==='asc'?(va>vb?1:-1):(va<vb?1:-1);
            if(c===COL_BO3_PCT||c===COL_BO5_PCT){
                let sA=parseValue(ra.cells[COL_SERIES_WR].innerText), sB=parseValue(rb.cells[COL_SERIES_WR].innerText);
                if(sA!==sB) return sA > sB ? -1 : 1;
            }
            if(c===COL_SERIES || c===COL_SERIES_WR){
                let gA=parseValue(ra.cells[COL_GAME_WR].innerText), gB=parseValue(rb.cells[COL_GAME_WR].innerText);
                if(gA!==gB) return gA > gB ? -1 : 1;
            }
            return 0;
        });
        t.setAttribute(k,next); r.forEach(x=>b.appendChild(x));
    }
    
    function parseValue(v) {
        if(v==="-")return -1; if(v.includes('%'))return parseFloat(v);
        if(v.includes('/')){let p=v.split('/');return p[1]==='-'?-1:parseFloat(p[0])/parseFloat(p[1]);}
        if(v.includes('-')&&v.split('-').length===2)return parseFloat(v.split('-')[0]);
        const n=parseFloat(v); return isNaN(n)?v.toLowerCase():n;
    }

    // --- 3. HTML 渲染核心 ---
    function renderMatchItem(mode, date, resTag, team1, team2, isFull, score) {
        const fullTag = isFull ? '<span class="hist-full">FULL</span>' : '';
        const scoreStyle = isFull ? 'color:#ef4444' : '';
        const layoutClass = mode === 'history' ? 'history-layout' : 'dist-layout';
        // 注意：Worker 中字符串内 JS 模板变量需要转义 \\$
        const resHtml = mode === 'history' ? \`<span class="col-res">\${resTag}</span>\` : '';
        
        // [NEW] 给比分的连字符添加间距
        const fmtScore = (score || "").toString().replace('-', '<span style="margin:0 1px">-</span>');
        
        return \`<div class="match-item \${layoutClass}">
            <span class="col-date">\${date}</span>
            \${resHtml}
            <span class="col-t1">\${team1}</span>
            <span class="col-vs">vs</span>
            <span class="col-t2">\${team2}</span>
            <div class="col-score">
                \${fullTag}
                <span class="hist-score" style="\${scoreStyle}">\${fmtScore}</span>
            </div>
        </div>\`;
    }

    function renderListHTML(htmlArr) {
        const l=document.getElementById('modalList');
        if(!htmlArr || htmlArr.length===0) l.innerHTML="<div style='text-align:center;color:#999;padding:20px'>No matches found</div>";
        else l.innerHTML = htmlArr.join("");
    }

    // --- 4. 弹窗逻辑 ---
    function showPopup(t,d,m){
        const ds=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday","Total"];
        document.getElementById('modalTitle').innerText=t+" - "+ds[d];
        const sortedMatches = [...m].sort((a, b) => b.d.localeCompare(a.d));
        const listHtml = sortedMatches.map(item => renderMatchItem('dist', item.d, '', item.t1, item.t2, item.f, item.s));
        renderListHTML(listHtml);
        document.getElementById('matchModal').style.display="block";
    }

    // [逻辑1] 点击队名：显示所有历史
    function openTeam(slug, teamName) {
        if (!window.g_stats || !window.g_stats[slug] || !window.g_stats[slug][teamName]) return;
        const data = window.g_stats[slug][teamName];
        const history = data.history || [];
        document.getElementById('modalTitle').innerText = teamName + " - Schedule";
        
        const listHtml = history.map(h => {
            const map = RES_MAP[h.res] || RES_MAP['N'];
            const resTag = \`<span class="\${(h.res === 'W' || h.res === 'L') ? '' : 'hist-icon'}">\${map.t}</span>\`;
            return renderMatchItem('history', h.d, resTag, teamName, h.vs, h.full, h.s);
        });
        
        renderListHTML(listHtml);
        document.getElementById('matchModal').style.display="block";
    }

    // [逻辑2] 点击数据格：显示分类历史 (BO3/BO5/Series)
    function openStats(slug, teamName, type) {
        if (!window.g_stats || !window.g_stats[slug] || !window.g_stats[slug][teamName]) return;
        const data = window.g_stats[slug][teamName];
        let history = data.history || [];
        let titleSuffix = "";

        // 过滤逻辑
        if (type === 'bo3') {
            history = history.filter(h => h.bo === 3);
            titleSuffix = " - BO3";
        } else if (type === 'bo5') {
            history = history.filter(h => h.bo === 5);
            titleSuffix = " - BO5";
        } else {
            titleSuffix = " - Series";
        }

        document.getElementById('modalTitle').innerText = teamName + titleSuffix;
        
        const listHtml = history.map(h => {
            const map = RES_MAP[h.res] || RES_MAP['N'];
            const resTag = \`<span class="\${(h.res === 'W' || h.res === 'L') ? '' : 'hist-icon'}">\${map.t}</span>\`;
            return renderMatchItem('history', h.d, resTag, teamName, h.vs, h.full, h.s);
        });
        
        renderListHTML(listHtml);
        document.getElementById('matchModal').style.display="block";
    }

    function closePopup(){document.getElementById('matchModal').style.display="none";}
    window.onclick=function(e){if(e.target==document.getElementById('matchModal'))closePopup();}
    </script>
`;

function renderPageShell(title, bodyContent, statusText = "", navMode = "home") {
    let navBtn = "";
    // Icon Swap Logic
    const logoIcon = navMode === "archive" ? "📦" : "🥇";
    
    if (navMode === "home") {
        navBtn = `<a href="/archive" class="action-btn"><span class="btn-icon">📦</span> <span class="btn-text">Archive</span></a>`;
    } else if (navMode === "archive") {
        navBtn = `<a href="/" class="action-btn"><span class="btn-icon">🏠</span> <span class="btn-text">Home</span></a>`;
    }

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>
    <style>${PYTHON_STYLE}</style>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text x='50' y='.9em' font-size='85' text-anchor='middle'>${logoIcon}</text></svg>">
    </head>
    <body data-ui-version="${UI_VERSION}">
    <header class="main-header"><div class="header-left"><span class="header-logo">${logoIcon}</span><h1 class="header-title">${title}</h1></div>
    <div class="header-right">
        ${navBtn}
        <form action="/force" method="POST" style="margin:0"><button class="action-btn update-btn"><span class="btn-icon">⚡</span> <span class="btn-text">Update</span></button></form>
        <a href="/logs" class="action-btn"><span class="btn-icon">📜</span> <span class="btn-text">Logs</span></a>
    </div></header>
    <div class="container">
        ${bodyContent}
        <div class="footer">${statusText}</div>
    </div>
    <div id="matchModal" class="modal"><div class="modal-content"><span class="close" onclick="closePopup()">&times;</span><h3 id="modalTitle">Match History</h3><div id="modalList" class="match-list"></div></div></div>
    ${PYTHON_JS}</body></html>`;
}

function renderContentOnly(globalStats, timeData, debugInfo, maxDateTs, scheduleMap, runtimeConfig, updateTimestamps, isArchive = false) {
    if (!scheduleMap) scheduleMap = {};
    if (!updateTimestamps) updateTimestamps = {};

    const injectedData = `<script>window.g_stats = ${JSON.stringify(globalStats)};</script>`;

    const mkSpine = (val, sep) => {
        if(!val || val === "-") return `<span style="color:#cbd5e1">-</span>`;
        const parts = val.split(sep);
        if(parts.length !== 2) return val;
        return `<div class="spine-row"><span class="spine-l" style="font-weight:700">${parts[0]}</span><span class="spine-sep">${sep}</span><span class="spine-r" style="font-weight:700">${parts[1]}</span></div>`;
    };

    const getRateHtml = (teamName, slug, bo) => {
        const stats = globalStats[slug];
        if(!stats || !stats[teamName]) return "";
        const s = stats[teamName];
        let r = null;
        if(bo === 5) r = utils.rate(s.bo5_f, s.bo5_t);
        else if(bo === 3) r = utils.rate(s.bo3_f, s.bo3_t);
        if(r === null) return "";
        return `<span style="font-weight:400;color:#94a3b8;font-size:11px;margin:0 2px">(${Math.round(r*100)}%)</span>`;
    };

    let tablesHtml = "";
    if (isArchive) {
        tablesHtml += `<div class="arch-content">`;
    }

    runtimeConfig.TOURNAMENTS.forEach((t, idx) => {
        const stats = globalStats[t.slug] ? Object.values(globalStats[t.slug]).filter(s => s.name !== "TBD") : [];
        const tableId = `t${idx}`;
        
        const lastTs = updateTimestamps[t.slug];
        let timeStr = "(Pending)";
        let timeColor = "#9ca3af"; 
        
        if (lastTs) {
            timeStr = utils.fmtDate(lastTs); 
            const diff = Date.now() - lastTs;
            if (diff < 20 * 60 * 1000) timeColor = "#10b981"; 
        }
        
        const debugLabel = `<span style="font-size:11px;color:${timeColor};font-weight:600;margin-left:10px">${timeStr}</span>`;

        let minTs = 9999999999999, maxTsLocal = 0;
        stats.forEach(s => { if(s.last){ if(s.last<minTs)minTs=s.last; if(s.last>maxTsLocal)maxTsLocal=s.last; }});
        if(minTs===9999999999999)minTs=maxTsLocal;

        stats.sort((a,b) => {
            const rA = utils.rate(a.bo3_f, a.bo3_t) ?? -1.0;
            const rB = utils.rate(b.bo3_f, b.bo3_t) ?? -1.0;
            if(rA !== rB) return rA - rB; 
            const sWA = utils.rate(a.s_w, a.s_t) || 0;
            const sWB = utils.rate(b.s_w, b.s_t) || 0;
            if(sWA !== sWB) return sWB - sWA;
            const gWA = utils.rate(a.g_w, a.g_t) || 0;
            const gWB = utils.rate(b.g_w, b.g_t) || 0;
            return gWB - gWA;
        });

        let rows = stats.map(s => {
            const bo3R = utils.rate(s.bo3_f, s.bo3_t), bo5R = utils.rate(s.bo5_f, s.bo5_t);
            const winR = utils.rate(s.s_w, s.s_t), gameR = utils.rate(s.g_w, s.g_t);
            
            const bo3Txt = s.bo3_t ? mkSpine(`${s.bo3_f}/${s.bo3_t}`, '/') : "-";
            const bo5Txt = s.bo5_t ? mkSpine(`${s.bo5_f}/${s.bo5_t}`, '/') : "-";
            const serTxt = s.s_t ? mkSpine(`${s.s_w}-${s.s_t-s.s_w}`, '-') : "-";
            const gamTxt = s.g_t ? mkSpine(`${s.g_w}-${s.g_t-s.g_w}`, '-') : "-";

            const strk = s.strk_w > 0 ? `<span class='badge' style='background:#10b981'>${s.strk_w}W</span>` : (s.strk_l>0 ? `<span class='badge' style='background:#f43f5e'>${s.strk_l}L</span>` : "-");
            const last = s.last ? utils.toCST(s.last).toISOString().slice(2,16).replace("T"," ") : "-";
            const lastColor = utils.colorDate(s.last, minTs, maxTsLocal);
            const emptyBg = '#f1f5f9', emptyCol = '#cbd5e1';
            
            // [NEW] 动态生成交互属性 (Class & OnClick)
            // 只有当 count > 0 时才添加点击效果和事件
            const cls = (base, count) => count > 0 ? `${base} team-clickable` : base;
            const clk = (slug, name, type, count) => count > 0 ? `onclick="openStats('${slug}', '${name}', '${type}')"` : "";
            
            return `<tr><td class="team-col team-clickable" onclick="openTeam('${t.slug}', '${s.name}')">${s.name}</td>
                <td class="${cls('col-bo3', s.bo3_t)}" ${clk(t.slug, s.name, 'bo3', s.bo3_t)} style="background:${s.bo3_t===0?emptyBg:'transparent'};color:${s.bo3_t===0?emptyCol:'inherit'}">${bo3Txt}</td>
                <td class="col-bo3-pct" style="background:${utils.color(bo3R,true)};color:${bo3R!==null?'white':emptyCol};font-weight:bold">${utils.pct(bo3R)}</td>
                <td class="${cls('col-bo5', s.bo5_t)}" ${clk(t.slug, s.name, 'bo5', s.bo5_t)} style="background:${s.bo5_t===0?emptyBg:'transparent'};color:${s.bo5_t===0?emptyCol:'inherit'}">${bo5Txt}</td>
                <td class="col-bo5-pct" style="background:${utils.color(bo5R,true)};color:${bo5R!==null?'white':emptyCol};font-weight:bold">${utils.pct(bo5R)}</td>
                <td class="${cls('col-series', s.s_t)}" ${clk(t.slug, s.name, 'series', s.s_t)} style="background:${s.s_t===0?emptyBg:'transparent'};color:${s.s_t===0?emptyCol:'inherit'}">${serTxt}</td>
                <td class="col-series-wr" style="background:${utils.color(winR)};color:${winR!==null?'white':emptyCol};font-weight:bold">${utils.pct(winR)}</td>
                <td class="col-game" style="background:${s.g_t===0?emptyBg:'transparent'};color:${s.g_t===0?emptyCol:'inherit'}">${gamTxt}</td>
                <td class="col-game-wr" style="background:${utils.color(gameR)};color:${gameR!==null?'white':emptyCol};font-weight:bold">${utils.pct(gameR)}</td>
                <td class="col-streak" style="background:${s.strk_w===0&&s.strk_l===0?emptyBg:'transparent'};color:${s.strk_w===0&&s.strk_l===0?emptyCol:'inherit'}">${strk}</td>
                <td class="col-last" style="background:${!s.last?emptyBg:'transparent'};color:${!s.last?emptyCol:lastColor};font-weight:700">${last}</td></tr>`;
        }).join("");

        const mainPage = Array.isArray(t.overview_page) ? t.overview_page[0] : t.overview_page;

        // 1. 生成主表内容 (无Wrapper)
        const tableBody = `<table id="${tableId}"><thead><tr><th class="team-col" onclick="doSort(0, '${tableId}')">TEAM</th><th colspan="2" onclick="doSort(2, '${tableId}')">BO3 FULLRATE</th><th colspan="2" onclick="doSort(4, '${tableId}')">BO5 FULLRATE</th><th colspan="2" onclick="doSort(6, '${tableId}')">SERIES</th><th colspan="2" onclick="doSort(8, '${tableId}')">GAMES</th><th class="col-streak" onclick="doSort(9, '${tableId}')">STREAK</th><th class="col-last" onclick="doSort(10, '${tableId}')">LAST DATE</th></tr></thead><tbody>${rows}</tbody></table>`;
        
        // 2. 生成时间表内容 (无Wrapper，前面加分割线)
        let timeRows = [];
        if (timeData[t.region]) {
            timeRows = Object.keys(timeData[t.region]).filter(k => k !== "Total").map(Number).sort((a,b) => a - b);
            timeRows.push("Total");
        }
        const hasTimeData = timeRows.length > 0;
        
        let timeTableHtml = "";
        if (hasTimeData) {
            // 注意：这里是一个内部的 border-top 分割线，不再是独立的 wrapper
            timeTableHtml += `<div style="border-top: 1px solid #f1f5f9; width:100%;"></div>`;
            timeTableHtml += `<table style="font-variant-numeric:tabular-nums; border-top:none;"><thead><tr style="border-bottom:none;"><th class="team-col" style="cursor:default; pointer-events:none;">TIME</th>`;
            ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Total"].forEach(d => { timeTableHtml += `<th style="cursor:default; pointer-events:none;">${d}</th>`; });
            timeTableHtml += "</tr></thead><tbody>";

            timeRows.forEach(h => {
                const isTotal = h === "Total";
                const label = isTotal ? "Total" : `${h}:00`;
                timeTableHtml += `<tr style="${isTotal?'font-weight:bold; background:#f8fafc;':''}"><td class="team-col" style="${isTotal?'background:#f1f5f9;':''}">${label}</td>`;
                for(let w=0; w<8; w++) {
                    const c = (timeData[t.region][h] && timeData[t.region][h][w]) ? timeData[t.region][h][w] : {total:0};
                    if(c.total===0) timeTableHtml += "<td style='background:#f1f5f9; color:#cbd5e1'>-</td>";
                    else {
                        const r = c.full/c.total;
                        const matches = JSON.stringify(c.matches).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
                        timeTableHtml += `<td style='background:${utils.color(r,true)}; color:white; font-weight:bold; cursor:pointer;' onclick='showPopup("${label}", ${w}, ${matches})'><div class="t-cell"><span class="t-val">${c.full}/${c.total}</span><span class="t-pct">(${Math.round(r*100)}%)</span></div></td>`;
                    }
                }
                timeTableHtml += "</tr>";
            });
            timeTableHtml += "</tbody></table>";
        }

        const titleLink = `<a href="https://lol.fandom.com/wiki/${mainPage}" target="_blank">${t.title}</a>`;
        
        // 3. 组装：现在无论是主表还是时间表，都放在同一个 .wrapper (div) 里
        if (isArchive) {
            // Archive 模式：Header 放在 Summary 里，内容放在 details 展开后的一个 wrapper 里
            const headerContent = `<div class="arch-title-wrapper"><span class="arch-indicator">❯</span> ${titleLink}</div> ${debugLabel}`;
            tablesHtml += `<details class="arch-sec">
                <summary class="arch-sum">${headerContent}</summary>
                <div class="wrapper" style="margin-bottom:0; box-shadow:none; border:none; border-top:1px solid #f1f5f9; border-radius:0;">
                    ${tableBody}
                    ${timeTableHtml}
                </div>
            </details>`;
        } else {
            // Home 模式：Header 是 wrapper 的一部分（或者放在 wrapper 里），然后接着是 Table1，Table2
            tablesHtml += `<div class="wrapper">
                <div class="table-title"><div>${titleLink}</div> ${debugLabel}</div>
                ${tableBody}
                ${timeTableHtml}
            </div>`;
        }
    });

    if (isArchive) tablesHtml += `</div>`;
    
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
                const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dateObj.getUTCDay()];
                let cardHtml = `<div class="sch-card"><div class="sch-header" style="background:#f8fafc;color:#334155"><span>📅 ${d.slice(5)} ${dayName}</span><span style="font-size:11px;opacity:0.6">${matches.length} Matches</span></div><div class="sch-body">`;
                let lastGroupKey = "";

                matches.forEach(m => {
                    const blockName = m.blockName ? m.blockName : "";
                    const groupKey = `${m.tourn}_${blockName}`;
                    if (groupKey !== lastGroupKey) {
                        cardHtml += `<div class="sch-group-header" style="background:#f8fafc"><div class="spine-row" style="width:100%; padding:0 10px; box-sizing:border-box"><span class="spine-l" style="font-weight:800">${m.tourn}</span><span class="spine-sep">/</span><span class="spine-r" style="font-weight:800; opacity:0.7">${blockName || "REGULAR"}</span></div></div>`;
                        lastGroupKey = groupKey;
                    }
                    const boLabel = m.bo ? `BO${m.bo}` : '';
                    const isBo5 = m.bo === 5;
                    const boClass = isBo5 ? "sch-pill gold" : "sch-pill"; 
                    const isTbd1 = m.t1 === "TBD", isTbd2 = m.t2 === "TBD";
                    const t1Click = isTbd1 ? "" : `onclick="openTeam('${m.tournSlug}', '${m.t1}')"`;
                    const t2Click = isTbd2 ? "" : `onclick="openTeam('${m.tournSlug}', '${m.t2}')"`;
                    const r1 = getRateHtml(m.t1, m.tournSlug, m.bo), r2 = getRateHtml(m.t2, m.tournSlug, m.bo);
                    let midContent = `<span style="color:#cbd5e1;font-size:10px;margin:0 2px">vs</span>`;
                    if (m.is_finished) {
                        const s1Style = m.s1 > m.s2 ? "color:#0f172a" : "color:#94a3b8";
                        const s2Style = m.s2 > m.s1 ? "color:#0f172a" : "color:#94a3b8";
                        midContent = `<span class="sch-fin-score"><span style="${s1Style}">${m.s1}</span><span style="margin: 0 1px;">-</span><span style="${s2Style}">${m.s2}</span></span>`;
                    } else if (m.is_live) midContent = `<span class="sch-live-score">${m.s1}<span style="margin: 0 1px;">-</span>${m.s2}</span>`;

                    cardHtml += `<div class="sch-row"><span class="sch-time">${m.time}</span><div class="sch-vs-container"><div class="spine-row"><span class="${isTbd1?"spine-l":"spine-l clickable"}" ${t1Click} style="${isTbd1?'color:#9ca3af':''}">${r1}${m.t1}</span><span class="spine-sep" style="display:flex;justify-content:center;align-items:center;width:40px">${midContent}</span><span class="${isTbd2?"spine-r":"spine-r clickable"}" ${t2Click} style="${isTbd2?'color:#9ca3af':''}">${m.t2}${r2}</span></div></div><div class="sch-tag-col"><span class="${boClass}">${boLabel}</span></div></div>`;
                });
                cardHtml += `</div></div>`;
                scheduleHtml += cardHtml;
            });
            scheduleHtml += `</div>`;
        }
    }

    return `${tablesHtml} ${scheduleHtml} ${injectedData}`;
}

// --- 8. 主控 (Rich Logging + Batch Scheduler + Dual Mode) ---
class Logger {
    constructor() { this.l=[]; }
    info(m) { this.l.push({t:utils.getNow().short, l:'INFO', m}); } 
    error(m) { this.l.push({t:utils.getNow().short, l:'ERROR', m}); }
    success(m) { this.l.push({t:utils.getNow().short, l:'SUCCESS', m}); }
    export() { return this.l; }
}

async function runUpdate(env, force=false) {
    const l = new Logger();
    const NOW = Date.now();
    const FAST_THRESHOLD = 8 * 60 * 1000;        
    const SLOW_THRESHOLD = 60 * 60 * 1000;        
    const UPDATE_ROUNDS = 1;

    let cache = await env.LOL_KV.get("CACHE_DATA", {type:"json"});
    const meta = await env.LOL_KV.get("META", {type:"json"}) || { total: 0, tournaments: {} };
    
    let runtimeConfig = null;
    try {
        const teams = await gh.fetchJson(env, "teams.json");
        const tourns = await gh.fetchJson(env, "tournaments.json");
        if (teams && tourns) {
            runtimeConfig = { TEAM_MAP: teams, TOURNAMENTS: tourns };
        }
    } catch (e) { l.error(`❌ Config Error: ${e.message}`); }

    if (!runtimeConfig) {
        l.error("🛑 CRITICAL: Config load failed.");
        return l;
    }

    if (!cache) cache = { globalStats: {}, updateTimestamps: {}, rawMatches: {} };
    if (!cache.rawMatches) cache.rawMatches = {}; 
    if (!cache.updateTimestamps) cache.updateTimestamps = {};

    let needsNetworkUpdate = false;
    let candidates = [];
    let waitings = [];

    // [NEW] Loop through tournaments and use INDIVIDUAL thresholds
    runtimeConfig.TOURNAMENTS.forEach(t => {
        const lastTs = cache.updateTimestamps[t.slug] || 0;
        const elapsed = NOW - lastTs;
        const elapsedMins = Math.floor(elapsed / 60000);
        
        const dayNow = utils.toCST(NOW).getUTCDate();
        const dayLast = utils.toCST(lastTs).getUTCDate();
        const isNewDay = dayNow !== dayLast;

        // Retrieve per-tournament mode (Default: fast)
        const tMeta = (meta.tournaments && meta.tournaments[t.slug]) || { mode: "fast", streak: 0 };
        const currentMode = tMeta.mode;
        const threshold = currentMode === "slow" ? SLOW_THRESHOLD : FAST_THRESHOLD;
        
        if (force || elapsed >= threshold || isNewDay) {
            if (isNewDay) {
                l.info(`🌅 Newday: [${t.slug}] Exit SLOW mode & Resetting triggers`);
            }
            candidates.push({ 
                slug: t.slug, 
                overview_page: t.overview_page, 
                elapsed: elapsed, 
                label: `${t.slug} (${elapsedMins}m, ${currentMode.toUpperCase()})` 
            });
            needsNetworkUpdate = true;
        } else {
            waitings.push(`${t.slug} (${elapsedMins}m, ${currentMode.toUpperCase()})`);
        }
    });

    l.info(`🔍 Detection: ${candidates.length} Candidates | ${waitings.length} Cooldown`);
    if (waitings.length > 0) {
        // Sample logging to avoid spam
        if(waitings.length <= 3) waitings.forEach(w => l.info(`❄️ Cooldown: ${w}`));
        else l.info(`❄️ Cooldown: ${waitings.length} leagues waiting...`);
    }

    if (!needsNetworkUpdate || candidates.length === 0) {
        l.info("⏸️ Threshold not met. Update skipped");
        return l;
    }

    const authContext = await loginToFandom(env, l);
    if (!authContext) l.info("⚠️ Auth Failed. Proceeding anonymously");
    else l.success(`🔐 Authenticated: ${authContext.username || 'User'}`);

    candidates.sort((a, b) => b.elapsed - a.elapsed);

    const totalLeagues = runtimeConfig.TOURNAMENTS.length;
    const batchSize = Math.ceil(totalLeagues / UPDATE_ROUNDS);
    const batch = candidates.slice(0, batchSize);
    const queue = candidates.slice(batchSize);
    
    if (queue.length > 0) queue.forEach(q => l.info(`⏳ Queued: ${q.label}`));

    const results = [];
    for (const c of batch) {
        try {
            const data = await fetchAllMatches(c.overview_page, l, authContext);
            results.push({ status: 'fulfilled', slug: c.slug, data: data });
            
        } catch (err) {
            results.push({ status: 'rejected', slug: c.slug, err: err });
        }

        if (c !== batch[batch.length - 1]) {
            await new Promise(res => setTimeout(res, 3000));
        }
    }

    let successCount = 0;
    let failureCount = 0; 
    
    results.forEach(res => {
        if (res.status === 'fulfilled') {
            cache.rawMatches[res.slug] = res.data;
            cache.updateTimestamps[res.slug] = NOW;
            successCount++;
        } else {
            failureCount++;
        }
    });

    // [UPDATED] Read old meta securely and pass to analysis
    const oldTournMeta = meta.tournaments || {};
    const analysis = runFullAnalysis(cache.rawMatches, oldTournMeta, runtimeConfig);

    if (meta.total > 0 && analysis.grandTotal < meta.total * 0.9 && !force) {
        l.error(`🛑 Rollback: Detected data anomaly. Aborting save`);
        return l;
    }
    // [NEW] 状态跳变日志 (State Transitions Logging)
    Object.keys(analysis.tournMeta).forEach(slug => {
        const oldMode = (oldTournMeta[slug] && oldTournMeta[slug].mode) || "fast";
        const newMode = analysis.tournMeta[slug].mode;
        const streak = analysis.tournMeta[slug].streak;
        
        // 1. 进入慢速模式 (Fast -> Slow)
        if (oldMode === "fast" && newMode === "slow") {
            l.success(`💤 Slowmode: ${slug} Matches finished (Streak ${streak}). Entering SLOW mode`);
        }
        // 2. 唤醒 (Slow -> Fast)
        else if (oldMode === "slow" && newMode === "fast") {
            l.info(`⚡ Fastmode: ${slug} Active matches detected. Waking up FAST mode`);
        }
    });
    // [NEW] Persist the new per-tournament meta
    await env.LOL_KV.put("CACHE_DATA", JSON.stringify({ 
        globalStats: analysis.globalStats,
        timeGrid: analysis.timeGrid,
        debugInfo: analysis.debugInfo,
        maxDateTs: analysis.maxDateTs,
        statusText: analysis.statusText,
        scheduleMap: analysis.scheduleMap,
        updateTime: utils.getNow(),
        runtimeConfig,
        rawMatches: cache.rawMatches,
        updateTimestamps: cache.updateTimestamps 
    }));

    const archiveFragment = renderContentOnly(
        analysis.globalStats,
        analysis.timeGrid,
        analysis.debugInfo,
        analysis.maxDateTs,
        analysis.scheduleMap,
        runtimeConfig,
        cache.updateTimestamps,
        true 
    );
    await env.LOL_KV.put("ARCHIVE_FRAGMENT", archiveFragment);

    await env.LOL_KV.put("META", JSON.stringify({ 
        total: analysis.grandTotal, 
        tournaments: analysis.tournMeta // Save the per-tournament states
    }));
    
    // Logging Summary
    let modeSummary = [];
    Object.entries(analysis.tournMeta).forEach(([k, v]) => {
        if(v.mode === "fast") modeSummary.push(`${k}:FAST`);
    });
    const summaryStr = modeSummary.length > 0 ? modeSummary.join(", ") : "All SLOW";
    
    if (failureCount > 0) {
        l.error(`🚨 Partial: Success ${successCount}/${batch.length} · Total Parsed: ${analysis.grandTotal}`);
    } else {
        l.success(`🎉 Complete: Success ${successCount}/${batch.length} · Total Parsed: ${analysis.grandTotal}`);
    }

    return l;
}

function renderLogPage(logs) {
    if (!Array.isArray(logs)) logs = [];
    const entries = logs.map(l => {
        let lvlClass = "lvl-inf";
        if(l.l==="ERROR") lvlClass = "lvl-err";
        if(l.l==="SUCCESS") lvlClass = "lvl-ok";
        
        return `<li class="log-entry">
            <span class="log-time">${l.t}</span>
            <span class="log-level ${lvlClass}">${l.l}</span>
            <span class="log-msg">${l.m}</span>
        </li>`;
    }).join("");

    const emptyHtml = logs.length === 0 ? `<div class="empty-logs">No logs found for today.</div>` : '';

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>System Logs</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text x='50' y='.9em' font-size='85' text-anchor='middle'>📜</text></svg>">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f1f5f9; color: #0f172a; margin: 0; padding: 20px; }
        .container { max-width: 900px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); overflow: hidden; border: 1px solid #e2e8f0; }
        .header { padding: 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; }
        .header h2 { margin: 0; font-size: 1.25rem; display: flex; align-items: center; gap: 8px; }
        .back-link { color: #2563eb; text-decoration: none; font-weight: 600; font-size: 0.9rem; padding: 6px 12px; border-radius: 6px; background: #eff6ff; transition: background 0.2s; }
        .back-link:hover { background: #dbeafe; }
        .log-list { list-style: none; margin: 0; padding: 0; max-height: 80vh; overflow-y: auto; }
        .log-entry { display: grid; grid-template-columns: 115px 90px 1fr; gap: 20px; padding: 14px 20px; border-bottom: 1px solid #f1f5f9; font-size: 15px; align-items: center; }
        .log-entry:nth-child(even) { background-color: #f8fafc; }
        .log-time { color: #64748b; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 15px; white-space: nowrap; letter-spacing: -0.5px; text-align: center; font-variant-numeric: tabular-nums; }
        .log-level { font-weight: 800; text-align: center; padding: 4px 0; border-radius: 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
        .lvl-inf { background: #eff6ff; color: #1e40af; border: 1px solid #dbeafe; }
        .lvl-ok { background: #f0fdf4; color: #15803d; border: 1px solid #dcfce7; }
        .lvl-err { background: #fef2f2; color: #b91c1c; border: 1px solid #fee2e2; }
        .log-msg { color: #334155; word-break: break-word; line-height: 1.5; font-weight: 500; }
        .empty-logs { padding: 40px; text-align: center; color: #94a3b8; font-style: italic; }
        @media (max-width: 600px) {
            .log-entry { grid-template-columns: 1fr; gap: 8px; padding: 15px; }
            .log-time { font-size: 12px; opacity: 0.7; text-align: left; }
            .log-level { display: inline-block; width: auto; padding: 3px 10px; }
        }
    </style>
    </head><body>
    <div class="container">
        <div class="header"><h2>📜 System Logs</h2><a href="/" class="back-link">← Back to Stats</a></div>
        <ul class="log-list">${entries}</ul>
        ${emptyHtml}
    </div>
    </body></html>`;
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        switch (url.pathname) {
            case "/backup": {
                const cache = await env.LOL_KV.get("CACHE_DATA", { type: "json" });
                if (!cache || !cache.globalStats || !cache.timeGrid || !cache.runtimeConfig) {
                    return new Response(JSON.stringify({ error: "No data available" }), { status: 503 });
                }
                const payload = {};
                for (const t of cache.runtimeConfig.TOURNAMENTS) {
                    if (cache.globalStats[t.slug]) {
                        payload[`tournament/${t.slug}.md`] = generateMarkdown(t, cache.globalStats[t.slug], cache.timeGrid);
                    }
                }
                return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
            }

            case "/force": {
                const l = await runUpdate(env, true);
                const oldLogs = await env.LOL_KV.get("logs", { type: "json" }) || [];
                const newLogs = l.export();
                let combinedLogs = [...newLogs, ...oldLogs];
                if (combinedLogs.length > 100) combinedLogs = combinedLogs.slice(0, 100);
                await env.LOL_KV.put("logs", JSON.stringify(combinedLogs));
                return Response.redirect(url.origin + "/logs", 303);
            }

            case "/logs": {
                const logs = await env.LOL_KV.get("logs", { type: "json" }) || [];
                return new Response(renderLogPage(logs), { headers: { "content-type": "text/html;charset=utf-8" } });
            }
            
            case "/archive": {
                const fragment = await env.LOL_KV.get("ARCHIVE_FRAGMENT");
                if (!fragment) {
                      return new Response("No archive data available. Please wait for the next update.", { headers: { "content-type": "text/html" } });
                }
                const fullPage = renderPageShell("LoL Archive", fragment, "", "archive");
                return new Response(fullPage, { headers: { "content-type": "text/html;charset=utf-8" } });
            }

            case "/": {
                const cache = await env.LOL_KV.get("CACHE_DATA", { type: "json" });
                if (!cache) {
                    return new Response("Initializing... <a href='/force'>Click to Build</a>", { headers: { "content-type": "text/html" } });
                }

                const homeFragment = renderContentOnly(
                    cache.globalStats,
                    cache.timeGrid,
                    cache.debugInfo,
                    cache.maxDateTs,
                    cache.scheduleMap,
                    cache.runtimeConfig || { TOURNAMENTS: [] },
                    cache.updateTimestamps,
                    false
                );

                const fullPage = renderPageShell("LoL Insights", homeFragment, cache.statusText, "home");

                return new Response(fullPage, { headers: { "content-type": "text/html;charset=utf-8" } });
            }

            case "/favicon.ico":
                return new Response(null, { status: 204 });

            default: {
                return new Response("404 Not Found", {
                    status: 404,
                    headers: { "content-type": "text/plain;charset=utf-8" }
                });
            }
        }
    },

    async scheduled(event, env, ctx) {
        const l = await runUpdate(env, false);
        const oldLogs = await env.LOL_KV.get("logs", { type: "json" }) || [];
        const newLogs = l.export();
        if (newLogs.length > 0) {
            let combinedLogs = [...newLogs, ...oldLogs];
            if (combinedLogs.length > 100) combinedLogs = combinedLogs.slice(0, 100);
            await env.LOL_KV.put("logs", JSON.stringify(combinedLogs));
        }
    }
};
