// ====================================================
// 🥇 Worker V46.0: Ultimate Probe Logging & SSG Stability
// 更新日志:
// 1. 探针级日志: 实现 [SYNC]/[IDLE]/[COOL]/[ERR!] 极致单行账本输出。
// 2. 语义化符号: + (增量), * (全量/存量), 🟰 (查重), ❄️ (冷却)。
// 3. 静默化抓取: 彻底移除抓取过程的碎片化Log，确保输出绝对纯净。
// 4. 名称对齐: 日志中严格优先显示 League 名称。
// 5. 容错保留: 完美继承原有的 SSG 容错与缓存防御机制。
// ====================================================

const BOT_UA = `LoLStatsWorker/2026 (User:HsuX)`;

// --- 1. 工具库 (Global UTC+8 Core) ---
const CST_OFFSET = 8 * 60 * 60 * 1000; 

const utils = {
    pad: (n) => n < 10 ? '0' + n : n,
    toCST: (ts) => new Date((ts || Date.now()) + CST_OFFSET),
    
    timeParts: (ts) => {
        const d = utils.toCST(ts);
        return {
            y: d.getUTCFullYear(), mo: utils.pad(d.getUTCMonth() + 1), da: utils.pad(d.getUTCDate()),
            h: utils.pad(d.getUTCHours()), m: utils.pad(d.getUTCMinutes()), s: utils.pad(d.getUTCSeconds()),
            day: d.getUTCDay()
        };
    },

    getNow: () => {
        const p = utils.timeParts();
        const iso = `${p.y}-${p.mo}-${p.da} ${p.h}:${p.m}:${p.s}`;
        return { obj: utils.toCST(), full: iso, short: iso.slice(2), date: iso.slice(0, 10), time: iso.slice(11, 16) };
    },
    
    fmtDate: (ts) => {
        if (!ts) return "(Pending)";
        const p = utils.timeParts(ts);
        return `${p.y.toString().slice(2)}-${p.mo}-${p.da} ${p.h}:${p.m}`;
    },

    rate: (n, d) => d > 0 ? n / d : null,
    pct: (r) => r !== null ? `${Math.round(r * 100)}%` : "-",
    
    color: (r, rev = false) => {
        if (r === null) return "#f1f5f9"; 
        const val = Math.max(0, Math.min(1, r));
        const hue = rev ? (1 - val) * 140 : val * 140;
        return `hsl(${parseInt(hue)}, 55%, 50%)`;
    },
    
    colorDate: (ts) => {
        if (!ts) return "#9ca3af";
        const diffDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
        if (diffDays <= 1) return "hsl(215, 80%, 45%)";
        if (diffDays <= 3) return "hsl(215, 70%, 50%)";
        if (diffDays <= 7) return "hsl(215, 55%, 55%)";
        if (diffDays <= 14) return "hsl(215, 40%, 60%)";
        return "hsl(215, 40%, 60%)";
    },
    
    parseDate: (str) => {
        if(!str) return null;
        try { return new Date(str.replace(" ", "T") + "Z"); } catch(e) { return null; }
    },
    
    extractCookies: (headers) => {
        if (!headers) return "";
        if (typeof headers.getSetCookie === 'function') {
            const cookies = headers.getSetCookie();
            if (cookies && cookies.length > 0) {
                return cookies.map(c => c.split(';')[0].trim()).join('; ');
            }
        }
        const headerVal = headers.get("set-cookie");
        if (!headerVal) return "";
        return headerVal.split(/,(?=\s*[A-Za-z0-9_]+=[^;]+)/)
            .map(c => c.split(';')[0].trim())
            .filter(c => c.includes('='))
            .join('; ');
    },

    sortTeams: (statsObj) => {
        if (!statsObj) return [];
        const BO5_WEIGHT = 1.33;
        const statsArray = Object.values(statsObj).filter(s => s && s.name && s.name !== "TBD");

        return statsArray.sort((a, b) => {
            const aFulls_W = (a.bo3_f || 0) + ((a.bo5_f || 0) * BO5_WEIGHT);
            const aTotal_W = (a.bo3_t || 0) + ((a.bo5_t || 0) * BO5_WEIGHT);
            const bFulls_W = (b.bo3_f || 0) + ((b.bo5_f || 0) * BO5_WEIGHT);
            const bTotal_W = (b.bo3_t || 0) + ((b.bo5_t || 0) * BO5_WEIGHT);

            const aFullRate = aTotal_W > 0 ? aFulls_W / aTotal_W : 2.0;
            const bFullRate = bTotal_W > 0 ? bFulls_W / bTotal_W : 2.0;
            if (aFullRate !== bFullRate) return aFullRate - bFullRate;

            const aRealTotal = (a.bo3_t || 0) + (a.bo5_t || 0);
            const bRealTotal = (b.bo3_t || 0) + (b.bo5_t || 0);
            if (aRealTotal !== bRealTotal) return bRealTotal - aRealTotal;

            const aWR = utils.rate(a.s_w, a.s_t) || 0;
            const bWR = utils.rate(b.s_w, b.s_t) || 0;
            if (aWR !== bWR) return bWR - aWR;

            return (utils.rate(b.g_w, b.g_t) || 0) - (utils.rate(a.g_w, a.g_t) || 0);
        });
    }
};

// --- 2. GitHub 读取层 ---
const gh = {
    fetchJson: async (env, path) => {
        const url = `https://api.github.com/repos/${env.GITHUB_USER}/${env.GITHUB_REPO}/contents/${path}`;
        try {
            const r = await fetch(url, {
                headers: { 
                    "User-Agent": BOT_UA,
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

// --- 3. 认证逻辑 (静默探针版) ---
async function loginToFandom(env) {
    const user = env.FANDOM_USER;
    if (user && user.trim().toLowerCase() === "anonymous") {
        return { isAnonymous: true };
    }
    const pass = env.FANDOM_PASS;
    if (!user || !pass) {
        return null;
    }
    const API = "https://lol.fandom.com/api.php";

    try {
        const tokenResp = await fetch(`${API}?action=query&meta=tokens&type=login&format=json`, {
            headers: { "User-Agent": BOT_UA }
        });
        if (!tokenResp.ok) throw new Error(`Token HTTP Error: ${tokenResp.status}`);
        
        const tokenData = await tokenResp.json();
        const loginToken = tokenData?.query?.tokens?.logintoken;
        if (!loginToken) throw new Error("Failed to get login token");
        
        const step1Cookie = utils.extractCookies(tokenResp.headers);

        const params = new URLSearchParams();
        params.append("action", "login"); params.append("format", "json");
        params.append("lgname", user); params.append("lgpassword", pass); params.append("lgtoken", loginToken);

        const loginResp = await fetch(API, {
            method: "POST", body: params,
            headers: { "User-Agent": BOT_UA, "Cookie": step1Cookie }
        });
        const loginData = await loginResp.json();
        
        if (loginData.login && loginData.login.result === "Success") {
            const step2Cookie = utils.extractCookies(loginResp.headers);
            const finalCookie = `${step1Cookie}; ${step2Cookie}`;
            return { cookie: finalCookie, username: loginData.login.lgusername };
        } else {
            throw new Error(`Login Failed`);
        }
    } catch (e) {
        return null;
    }
}

// --- 4. 抓取逻辑 (静默探针版) ---
async function fetchWithRetry(url, authContext = null, maxRetries = 3) {
    let attempt = 1;
    const headers = { 
        "User-Agent": BOT_UA, "Accept": "application/json", "Accept-Encoding": "gzip, deflate, br" 
    };
    if (authContext?.cookie) headers["Cookie"] = authContext.cookie;

    while (attempt <= maxRetries) {
        try {
            const r = await fetch(url, { headers });
            if (r.status === 429 || r.status === 503) {
                const retryAfter = r.headers.get("Retry-After");
                const waitSecs = retryAfter ? parseInt(retryAfter) : 30;
                throw new Error(`Wait ${waitSecs}s`);
            }
            
            const rawBody = await r.text();
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            
            let data;
            try { data = JSON.parse(rawBody); } catch (e) { throw new Error(`JSON Parse Fail`); }
            
            if (data.error) {
                if (data.error.code === "maxlag") {
                    const retryAfter = r.headers.get("Retry-After") || 5; 
                    throw new Error(`Wait ${retryAfter}s`);
                }
                throw new Error(`API Error [${data.error.code}]`);
            }
            if (!data.cargoquery) throw new Error(`Structure Error`);
            return data.cargoquery; 
        } catch (e) {
            let waitTimeMs = 15000 * Math.pow(2, attempt - 1); 
            const match = e.message.match(/Wait (\d+)s/);
            if (match) waitTimeMs = parseInt(match[1]) * 1000;

            if (attempt >= maxRetries) {
                throw e;
            } else {
                await new Promise(res => setTimeout(res, waitTimeMs));
            }
            attempt++;
        }
    }
}

async function fetchAllMatches(slug, sourceInput, authContext, dateFilter = null) {
    const pages = Array.isArray(sourceInput) ? sourceInput : [sourceInput];
    const inClause = pages.map(p => `'${p}'`).join(", ");
    let all = [];
    let offset = 0;
    const limit = 100;

    while (true) {
        let whereClause = pages.length === 1
            ? `OverviewPage = '${pages[0]}'`
            : `OverviewPage IN (${inClause})`;

        if (dateFilter) {
            whereClause += ` AND DateTime_UTC >= '${dateFilter.start} 00:00:00' AND DateTime_UTC <= '${dateFilter.end} 23:59:59'`;
        }

        const params = new URLSearchParams({
            action: "cargoquery", format: "json", tables: "MatchSchedule",
            fields: "Team1,Team2,Team1Score,Team2Score,DateTime_UTC,OverviewPage,BestOf,N_MatchInPage,Tab,Round",
            where: whereClause,
            limit: limit.toString(), offset: offset.toString(), order_by: "DateTime_UTC ASC", maxlag: "5"
        });

        const batchRaw = await fetchWithRetry(`https://lol.fandom.com/api.php?${params}`, authContext);
        const batch = batchRaw.map(i => i.title);

        if (!batch.length) break;

        all = all.concat(batch);
        offset += batch.length;

        if (dateFilter) break;
        if (batch.length < limit) break;

        await new Promise(res => setTimeout(res, 2000));
    }
    return all;
}

// --- 5. 统计核心 ---
function runFullAnalysis(allRawMatches, prevTournMeta, runtimeConfig, failedSlugs = new Set()) {
    const globalStats = {};
    const debugInfo = {};
    const tournMeta = {}; 
    
    const timeGrid = { "ALL": {} };
    const createSlot = () => { const t = {}; for(let i=0; i<8; i++) t[i] = { total:0, full:0, matches:[] }; return t; };
    timeGrid.ALL = createSlot(); 

    let maxDateTs = 0, grandTotal = 0, totalMatchesToday = 0;
    const todayStr = utils.getNow().date;
    const allFutureMatches = {}; 

    const teamMapEntries = runtimeConfig.TEAM_MAP ? Object.entries(runtimeConfig.TEAM_MAP).map(([k,v]) => ({k: k.toUpperCase(), v})) : [];
    const nameCache = new Map();
    const resolveName = (raw) => {
        if (!raw) return "Unknown";
        if (nameCache.has(raw)) return nameCache.get(raw);
        let res = raw;
        const upper = raw.toUpperCase();
        if (upper.includes("TBD") || upper.includes("TBA") || upper.includes("TO BE DETERMINED")) {
            res = "TBD";
        } else {
            const match = teamMapEntries.find(e => upper.includes(e.k));
            if (match) res = match.v;
            else res = raw.replace(/(Esports|Gaming|Academy|Team|Club)/gi, "").trim();
        }
        nameCache.set(raw, res);
        return res;
    };

    (runtimeConfig.TOURNAMENTS || []).forEach((tourn, tournIdx) => {
        const rawMatches = allRawMatches[tourn.slug] || [];
        const stats = {};
        let processed = 0, skipped = 0;
        let matchesToday = 0, pendingToday = 0;
        let earliestPendingTs = Infinity;
        
        const ensureTeam = (name) => { if(!stats[name]) stats[name] = { name, bo3_f:0, bo3_t:0, bo5_f:0, bo5_t:0, s_w:0, s_t:0, g_w:0, g_t:0, strk_w:0, strk_l:0, last:0, history:[] }; };

        rawMatches.forEach(m => {
            const t1 = resolveName(m.Team1 || m["Team 1"]);
            const t2 = resolveName(m.Team2 || m["Team 2"]);
            if(!t1 || !t2) { skipped++; return; } 
            
            ensureTeam(t1); ensureTeam(t2);

            const s1 = parseInt(m.Team1Score)||0, s2 = parseInt(m.Team2Score)||0;
            const bo = parseInt(m.BestOf)||3;
            const isFinished = Math.max(s1, s2) >= Math.ceil(bo/2);
            const isLive = !isFinished && (s1 > 0 || s2 > 0 || (m.Team1Score !== "" && m.Team1Score != null));
            const isFull = (bo===3 && Math.min(s1,s2)===1) || (bo===5 && Math.min(s1,s2)===2);
            
            const dt = utils.parseDate(m.DateTime_UTC || m["DateTime UTC"]);
            let dateDisplay = "-", ts = 0;

            if (dt) {
                ts = dt.getTime();
                const p = utils.timeParts(ts);
                const matchDateStr = `${p.y}-${p.mo}-${p.da}`;
                const matchTimeStr = `${p.h}:${p.m}`;
                dateDisplay = `${p.mo}-${p.da} ${matchTimeStr}`;

                if (matchDateStr >= todayStr) {
                    if (matchDateStr === todayStr) {
                        matchesToday++;
                        if (!isFinished) {
                            pendingToday++;
                            if (ts < earliestPendingTs) earliestPendingTs = ts;
                        }
                    }
                    if (!allFutureMatches[matchDateStr]) allFutureMatches[matchDateStr] = [];
                    
                    let blockName = m.Tab || "";
                    if (!blockName || blockName === "Bracket" || blockName === "Knockout Stage") if (m.Round) blockName = m.Round;

                    allFutureMatches[matchDateStr].push({
                        time: matchTimeStr, t1: t1, t2: t2, s1: s1, s2: s2, bo: bo,
                        is_finished: isFinished, is_live: isLive, 
                        league: tourn.league, slug: tourn.slug,
                        tournIndex: tournIdx, blockName: blockName || ""  
                    });
                }

                if (isFinished) {
                    if(ts > stats[t1].last) stats[t1].last = ts;
                    if(ts > stats[t2].last) stats[t2].last = ts;
                    if(ts > maxDateTs) maxDateTs = ts;

                    const pyDay = p.day === 0 ? 6 : p.day - 1;
                    const targetH = parseInt(p.h, 10);

                    const matchObj = { d: `${p.mo}-${p.da}`, t1: t1, t2: t2, s: `${s1}-${s2}`, f: isFull, bo: bo };
                    
                    if (!timeGrid[tourn.slug]) timeGrid[tourn.slug] = { "Total": createSlot() };
                    if (!timeGrid[tourn.slug][targetH]) timeGrid[tourn.slug][targetH] = createSlot();
                    
                    const add = (grid, h, d) => { grid[h][d].total++; if(isFull) grid[h][d].full++; grid[h][d].matches.push(matchObj); };
                    add(timeGrid[tourn.slug], targetH, pyDay);      
                    add(timeGrid[tourn.slug], "Total", pyDay);      
                    add(timeGrid[tourn.slug], targetH, 7);            
                    add(timeGrid[tourn.slug], "Total", 7);            
                }
            }
            
            let resT1 = 'N', resT2 = 'N';
            if (isLive) { resT1 = 'LIV'; resT2 = 'LIV'; }
            else if (isFinished) {
                resT1 = s1 > s2 ? 'W' : 'L';
                resT2 = s2 > s1 ? 'W' : 'L';
            }

            stats[t1].history.push({ d: dateDisplay, vs: t2, s: `${s1}-${s2}`, res: resT1, bo: bo, full: isFull, ts: ts });
            stats[t2].history.push({ d: dateDisplay, vs: t1, s: `${s2}-${s1}`, res: resT2, bo: bo, full: isFull, ts: ts });

            if(!isFinished) { skipped++; return; }

            processed++;
            const winner = s1 > s2 ? t1 : t2, loser = s1 > s2 ? t2 : t1;
            [t1,t2].forEach(tm => { stats[tm].s_t++; stats[tm].g_t += (s1+s2); });
            stats[winner].s_w++; stats[t1].g_w += s1; stats[t2].g_w += s2;
            if(bo===3) { stats[t1].bo3_t++; stats[t2].bo3_t++; if(isFull){stats[t1].bo3_f++; stats[t2].bo3_f++;} }
            else if(bo===5) { stats[t1].bo5_t++; stats[t2].bo5_t++; if(isFull){stats[t1].bo5_f++; stats[t2].bo5_f++;} }

            if(stats[winner].strk_l > 0) { stats[winner].strk_l=0; stats[winner].strk_w=1; } else stats[winner].strk_w++;
            if(stats[loser].strk_w > 0) { stats[loser].strk_w=0; stats[loser].strk_l=1; } else stats[loser].strk_l++;
        });
        
        Object.values(stats).forEach(team => team.history.sort((a, b) => b.ts - a.ts));
        debugInfo[tourn.slug] = { raw: rawMatches.length, processed, skipped };
        globalStats[tourn.slug] = stats;
        grandTotal += processed;
        totalMatchesToday += matchesToday;

        const prevT = prevTournMeta[tourn.slug] || { streak: 0, mode: "fast" };
        let nextStreak = 0, nextMode = "fast";

        if (failedSlugs.has(tourn.slug)) {
            nextStreak = prevT.streak || 0;
            nextMode = prevT.mode || "fast";
        } else if (matchesToday > 0 && pendingToday > 0) { 
            nextStreak = 0; 
            nextMode = (Date.now() >= earliestPendingTs) ? "fast" : "slow";
        } else { 
            nextStreak = prevT.streak >= 1 ? 2 : 1; 
            nextMode = nextStreak >= 2 ? "slow" : "fast"; 
        }
        
        // 赋予每个联赛专属的 Emoji 状态
        let emoji = "";
        if (nextStreak === 0 && nextMode === "fast") emoji = "🎮";
        else if (nextStreak === 0 && nextMode === "slow") emoji = "⏳";
        else if (nextStreak === 1) emoji = "👀";
        else if (matchesToday === 0) emoji = "💤";
        else emoji = "✔️";

        tournMeta[tourn.slug] = { streak: nextStreak, mode: nextMode, startTs: earliestPendingTs !== Infinity ? earliestPendingTs : 0, emoji: emoji };
    });

    let scheduleMap = {};
    const sortedFutureDates = Object.keys(allFutureMatches).sort();
    sortedFutureDates.slice(0, 4).forEach(d => {
        scheduleMap[d] = allFutureMatches[d].sort((a,b) => {
            if (a.tournIndex !== b.tournIndex) return a.tournIndex - b.tournIndex;
            return a.time.localeCompare(b.time);
        });
    });

    // 返回空的 statusText，原先的全局状态废弃
    return { globalStats, timeGrid, debugInfo, maxDateTs, grandTotal, statusText: "", scheduleMap, tournMeta };
}

// --- 6. Markdown 生成器 ---
function generateMarkdown(tourn, stats, timeGrid) {
    const UPDATED_TIME = utils.getNow().full;
    let md = `# ${tourn.name}\n\nUpdated: ${UPDATED_TIME} (CST)\n\n---\n\n## 📊 Statistics\n\n| TEAM | BO3 FULL | BO3% | BO5 FULL | BO5% | SERIES | SERIES WR | GAMES | GAME WR | STREAK | LAST DATE |\n| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;
    const sorted = utils.sortTeams(stats);

    if (sorted.length === 0) {
        md += "| - | - | - | - | - | - | - | - | - | - | - |\n";
    } else {
        sorted.forEach(s => {
            const bo3Txt = s.bo3_t ? `${s.bo3_f}/${s.bo3_t}` : "-";
            const bo3Pct = utils.pct(utils.rate(s.bo3_f, s.bo3_t));
            const bo5Txt = s.bo5_t ? `${s.bo5_f}/${s.bo5_t}` : "-";
            const bo5Pct = utils.pct(utils.rate(s.bo5_f, s.bo5_t));
            const serTxt = s.s_t ? `${s.s_w}-${s.s_t - s.s_w}` : "-";
            const serWR = utils.pct(utils.rate(s.s_w, s.s_t));
            const gamTxt = s.g_t ? `${s.g_w}-${s.g_t - s.g_w}` : "-";
            const gamWR = utils.pct(utils.rate(s.g_w, s.g_t));
            const strk = s.strk_w > 0 ? `${s.strk_w}W` : (s.strk_l > 0 ? `${s.strk_l}L` : "-");
            const last = s.last ? utils.fmtDate(s.last) : "-";
            md += `| ${s.name} | ${bo3Txt} | ${bo3Pct} | ${bo5Txt} | ${bo5Pct} | ${serTxt} | ${serWR} | ${gamTxt} | ${gamWR} | ${strk} | ${last} |\n`;
        });
    }

    md += `\n## 📅 Time Slot Distribution\n\n| Time Slot | Mon | Tue | Wed | Thu | Fri | Sat | Sun | Total |\n| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;
    const regionGrid = timeGrid[tourn.slug] || {};
    const hours = Object.keys(regionGrid).filter(k => k !== "Total" && !isNaN(k)).map(Number).sort((a, b) => a - b);
    
    [...hours, "Total"].forEach(h => {
        if (!regionGrid[h]) return;
        const label = h === "Total" ? `**Total**` : `**${h}:00**`;
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
    return md + `\n---\n*Generated by LoL Stats Worker*\n`;
}

// --- 7. HTML 渲染器 & 页面外壳 ---
const COMMON_STYLE = `
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f1f5f9; color: #0f172a; margin: 0; padding: 0; overflow-x: hidden; }
    .main-header { background: #fff; padding: 15px 25px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; margin-bottom: 25px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); width: 100%; }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-logo { font-size: 1.8rem; }
    .header-title { margin: 0; font-size: 1.4rem; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
    .header-right { display: flex; gap: 10px; align-items: center; }
    .action-btn { background: #fff; border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; color: #475569; text-decoration: none; display: flex; align-items: center; gap: 5px; transition: 0.2s; font-family: inherit; }
    .action-btn:hover { background: #f8fafc; color: #0f172a; border-color: #94a3b8; }
    .btn-icon { display: inline-flex; justify-content: center; width: 16px; text-align: center; }
    @media (max-width: 600px) { .btn-text { display: none; } .action-btn { padding: 6px 10px; } }
`;

const PYTHON_STYLE = `
    ${COMMON_STYLE}
    .container { max-width: 1400px; width: 100%; margin: 0 auto; padding: 0 15px 40px 15px; }
    .wrapper { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; background: #fff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-bottom: 25px; border: 1px solid #e2e8f0; padding-bottom: 0; display: flex; flex-direction: column; }
    .wrapper::-webkit-scrollbar, .match-list::-webkit-scrollbar { display: none; }
    .wrapper, .match-list { -ms-overflow-style: none; scrollbar-width: none; }
    table { width: 100%; min-width: 1000px; border-collapse: separate; border-spacing: 0; font-size: 14px; table-layout: fixed; margin: 0; border: none; }
    th { background: #f8fafc; padding: 14px 8px; font-weight: 600; color: #64748b; cursor: pointer; transition: 0.2s; box-shadow: inset -1px -1px 2px rgba(0, 0, 0, 0.05); border: none !important; }
    th:hover { background: #eff6ff; color: #2563eb; }
    td { padding: 12px 8px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: inset -1px -1px 2px rgba(0, 0, 0, 0.04); border: none !important; }
    tr { border: none !important; }
    .team-col { position: sticky; left: 0; background: white !important; z-index: 10; text-align: left; font-weight: 800; padding-left: 15px; width: 80px; transition: 0.2s; box-shadow: inset 1px 0 2px rgba(0, 0, 0, 0.04), inset -1px -1px 2px rgba(0, 0, 0, 0.04) !important; border: none !important; outline: none !important; }
    .team-clickable { cursor: pointer; } 
    .team-clickable:hover { color: #2563eb; background-color: #eff6ff !important; }
    .table-title { padding: 15px; font-weight: 700; border-bottom: 2px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; background: #fff; }
    .table-title a { color: #2563eb; text-decoration: none; }
    details.arch-sec { background: #fff; border: 1px solid #e2e8f0; border-left: 4px solid #2563eb; border-radius: 12px; margin-bottom: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: all 0.3s ease; display: block; }
    details.arch-sec:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    details.arch-sec[open] { box-shadow: 0 4px 16px rgba(37, 99, 235, 0.12); border-color: #2563eb; }
    summary.arch-sum { cursor: pointer; user-select: none; list-style: none; min-height: 72px; display: flex; padding: 12px 16px; background: linear-gradient(135deg, #f8fafc 0%, #fff 100%); border-bottom: none; align-items: center; transition: background 0.2s; }
    summary.arch-sum:hover { background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%); }
    summary.arch-sum::-webkit-details-marker { display: none; }
    details.arch-sec[open] summary.arch-sum { background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%); }
    .arch-title-wrapper { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
    .arch-title-wrapper a { color: #0f172a; font-weight: 700; text-decoration: none; transition: color 0.2s; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .arch-title-wrapper a:hover { color: #2563eb; }
    .arch-indicator { font-size: 18px; color: #2563eb; font-weight: 600; transition: transform 0.3s ease; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; flex-shrink: 0; margin-right: 8px; }
    details.arch-sec[open] .arch-indicator { transform: rotate(90deg); }
    .col-bo3 { width: 70px; } .col-bo3-pct { width: 70px; } .col-bo5 { width: 70px; } .col-bo5-pct { width: 70px; }
    .col-series { width: 70px; } .col-series-wr { width: 70px; } .col-game { width: 70px; } .col-game-wr { width: 70px; }
    .col-streak { width: 70px; } .col-last { width: 130px; }
    .col-bo3, .col-bo3-pct, .col-bo5, .col-bo5-pct, .col-series, .col-series-wr, .col-game, .col-game-wr, .col-streak, .col-last, .sch-time, .hist-score, .col-date, .sch-fin-score, .sch-live-score { font-family: inherit; font-variant-numeric: tabular-nums; font-weight: 700; letter-spacing: 0; }
    .spine-row { display: flex; justify-content: center; align-items: stretch; width: 100%; height: 100%; }
    .spine-l { flex: 1; flex-basis: 0; display: flex; align-items: center; justify-content: flex-end; padding: 0; font-weight: 800; transition: background 0.15s; }
    .spine-r { flex: 1; flex-basis: 0; display: flex; align-items: center; justify-content: flex-start; padding: 0; font-weight: 800; transition: background 0.15s; }
    .spine-sep { width: 12px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; }
    .sch-row .spine-l, .sch-row .spine-r { padding: 4px 5px; }
    .spine-l.clickable:hover, .spine-r.clickable:hover, .spine-sep.clickable:hover { background-color: #eff6ff; color: #2563eb; cursor: pointer; }
    .t-cell { display: flex; align-items: center; width: 100%; height: 100%; }
    .t-val { flex: 1; flex-basis: 0; text-align: right; font-weight: 700; padding-right: 4px; white-space: nowrap; } 
    .t-pct { flex: 1; flex-basis: 0; text-align: left; opacity: 0.9; font-size: 11px; font-weight: 700; padding-left: 4px; white-space: nowrap; }
    .badge { color: white; border-radius: 4px; padding: 3px 7px; font-size: 11px; font-weight: 700; }
    .footer { text-align: center; font-size: 12px; color: #94a3b8; margin: 40px 0; }
    .sch-container { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-top: 40px; width: 100%; align-items: start; }
    .sch-card { background: #fff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; overflow: hidden; display: flex; flex-direction: column; }
    .sch-header { padding: 12px 15px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #334155; display:flex; justify-content:space-between; }
    .sch-body { display: flex; flex-direction: column; flex: 1; padding-bottom: 0; }
    .sch-group-header { border-bottom: 1px solid #e2e8f0; border-top: 1px solid #e2e8f0; padding: 4px 0; color: #475569; font-size: 11px; letter-spacing: 0.5px; }
    .sch-group-header .spine-l { justify-content: flex-end; padding-right: 2px; }
    .sch-group-header .spine-r { justify-content: flex-start; padding-left: 2px; opacity: 0.7; }
    .sch-group-header:first-child { border-top: none; }
    .sch-row { display: flex; align-items: stretch; padding: 0; border-bottom: 1px solid #f8fafc; font-size: 14px; color: #334155; min-height: 36px; flex: 0 0 auto; }
    .sch-time { width: 60px; color: #94a3b8; font-size: 13px; display:flex; align-items:center; justify-content:center; } 
    .sch-tag-col { width: 60px; display: flex; align-items:center; justify-content: center; }
    .sch-vs-container { flex: 1; display: flex; align-items: stretch; justify-content: center; }
    .sch-pill { padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; background: #dbeafe; color: #1d4ed8; }
    .sch-pill.gold { background: #f2d49c; color: #9c5326; }
    .sch-live-score { color: #10b981; font-size: 13px; }
    .sch-fin-score { color: #334155; font-size: 13px; }
    .sch-empty { margin-top: 40px; text-align: center; color: #94a3b8; background: #fff; padding: 30px; border-radius: 12px; border: 1px solid #e2e8f0; font-weight: 700; }
    @media (max-width: 1100px) { .sch-container { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 600px) { .sch-container { grid-template-columns: 1fr; } }
    
    @keyframes modalShow { 0% { opacity: 0; transform: translate(-50%, -45%) scale(0.98); } 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
    .modal { display: none; position: fixed; z-index: 999; left: 0; top: 0; width: 100%; height: 100%; overflow: hidden; background-color: rgba(15, 23, 42, 0.45); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
    .modal-content { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background-color: #ffffff; margin: 0; padding: 0; border: 1px solid #e2e8f0; width: 90%; max-width: 420px; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); animation: modalShow 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; display: flex; flex-direction: column; max-height: 80vh; }
    #modalTitle { margin: 0; padding: 20px 24px; border-bottom: 1px solid #f1f5f9; font-size: 18px; font-weight: 800; color: #0f172a; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; background: #f8fafc; border-radius: 16px 16px 0 0; flex-shrink: 0; }
    .match-list { margin: 0; padding: 16px 24px; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; flex: 1; }
    .match-list::-webkit-scrollbar { width: 6px; }
    .match-list::-webkit-scrollbar-track { background: transparent; }
    .match-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
    .match-list::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    .match-item { display: flex; align-items: center; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 12px; padding: 12px 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.02); transition: all 0.2s ease; min-height: 48px; }
    .match-item:last-child { margin-bottom: 0; }
    .match-item:hover { border-color: #cbd5e1; box-shadow: 0 4px 12px rgba(0,0,0,0.05); transform: translateY(-1px); }
    .col-date { width: 60px; flex-shrink: 0; font-size: 13px; color: #64748b; font-weight: 600; font-variant-numeric: tabular-nums; text-align: center; line-height: 1.4; white-space: nowrap; }
    .col-res { width: 44px; flex-shrink: 0; font-size: 18px; line-height: 1; display: flex; align-items: center; justify-content: center; }
    .col-vs-area { flex: 1; min-width: 0; }
    .modal-divider { width: 1px; height: 28px; background: #e2e8f0; flex-shrink: 0; margin: 0 16px; }
    .score-box { display: flex; align-items: center; justify-content: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 4px 0; min-height: 28px; min-width: 48px; transition: 0.2s; }
    .score-box.is-full { background: #fff7ed; border-color: #fdba74; box-shadow: inset 0 0 0 1px #fdba74; }
    .score-box.is-full .score-text { color: #c2410c; }
    .score-text { font-weight: 800; font-size: 15px; color: #1e293b; font-variant-numeric: tabular-nums; letter-spacing: 1px; }
    .score-text.live { color: #10b981; }
    .score-text.vs { color: #94a3b8; font-size: 10px; letter-spacing: 0; font-weight: 700; }
    .hist-icon { font-size: 16px; }
`;

const PYTHON_JS = `
    <script>
    const COL_TEAM=0, COL_BO3=1, COL_BO3_PCT=2, COL_BO5=3, COL_BO5_PCT=4, COL_SERIES=5, COL_SERIES_WR=6, COL_GAME=7, COL_GAME_WR=8, COL_STREAK=9, COL_LAST_DATE=10;
    const RES_MAP = { 'W': '✔', 'L': '❌', 'LIV': '🔵', 'N': '🕒' };
    
    function doSort(c, id) {
        const t = document.getElementById(id), b = t.tBodies[0], r = Array.from(b.rows), k = 'data-sort-dir-' + c, cur = t.getAttribute(k);
        const defaultAscCols = [COL_TEAM, COL_BO3_PCT, COL_BO5_PCT];
        const next = (!cur) ? (defaultAscCols.includes(c) ? 'asc' : 'desc') : (cur === 'desc' ? 'asc' : 'desc');

        r.sort((ra, rb) => {
            let va = ra.cells[c].innerText, vb = rb.cells[c].innerText;
            if (c === COL_LAST_DATE) { va = va === "-" ? "" : va; vb = vb === "-" ? "" : vb; } 
            else if (c === COL_STREAK) { const ps = x => x === "-" ? 0 : (x.includes('W') ? parseInt(x) : -parseInt(x)); va = ps(va); vb = ps(vb); } 
            else { va = parseValue(va); vb = parseValue(vb); }
            
            if (va !== vb) return next === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
            if (c === COL_BO3_PCT || c === COL_BO5_PCT) { let sA = parseValue(ra.cells[COL_SERIES_WR].innerText), sB = parseValue(rb.cells[COL_SERIES_WR].innerText); if (sA !== sB) return sB - sA; }
            if (c === COL_SERIES || c === COL_SERIES_WR) { let gA = parseValue(ra.cells[COL_GAME_WR].innerText), gB = parseValue(rb.cells[COL_GAME_WR].innerText); if (gA !== gB) return gB - gA; }
            return 0;
        });

        t.setAttribute(k, next); 
        r.forEach(x => b.appendChild(x));
    }
    
    function parseValue(v) {
        if(v==="-")return -1; if(v.includes('%'))return parseFloat(v);
        if(v.includes('/')){let p=v.split('/');return p[1]==='-'?-1:parseFloat(p[0])/parseFloat(p[1]);}
        if(v.includes('-')&&v.split('-').length===2)return parseFloat(v.split('-')[0]);
        const n=parseFloat(v); return isNaN(n)?v.toLowerCase():n;
    }

    function renderMatchItem(mode, date, resTag, team1, team2, isFull, score, resStatus) {
        const dateParts = (date || '').split(' ');
        const dateHtml = dateParts.length === 2 ? dateParts[0] + '<br><span style="font-weight:700;color:#475569">' + dateParts[1] + '</span>' : (date || '');
        let scoreContent = '', scoreClass = 'score-text';
        if (resStatus === 'LIV') scoreClass += ' live';
        if (resStatus === 'N') { scoreContent = '<span class="score-text vs">VS</span>'; } 
        else { const fmtScore = (score || '').toString().replace('-', '<span style="opacity:0.4;margin:0 1px">-</span>'); scoreContent = '<span class="' + scoreClass + '">' + fmtScore + '</span>'; }
        const boxClass = isFull ? 'score-box is-full' : 'score-box';
        const t1Color = team1 === 'TBD' ? 'color:#9ca3af;' : '', t2Color = team2 === 'TBD' ? 'color:#9ca3af;' : '';

        return '<div class="match-item"><div class="col-date">' + dateHtml + '</div><div class="modal-divider"></div><div class="col-vs-area"><div class="spine-row"><span class="spine-l" style="padding-right:5px;' + t1Color + '">' + team1 + '</span><div style="width:52px;flex-shrink:0;display:flex;align-items:center;justify-content:center"><div class="' + boxClass + '">' + scoreContent + '</div></div><span class="spine-r" style="padding-left:5px;' + t2Color + '">' + team2 + '</span></div></div><div class="modal-divider"></div><div class="col-res">' + resTag + '</div></div>';
    }

    function renderListHTML(htmlArr) {
        const l=document.getElementById('modalList');
        if(!htmlArr || htmlArr.length===0) l.innerHTML="<div style='text-align:center;color:#999;padding:20px'>No matches found</div>";
        else l.innerHTML = htmlArr.join("");
    }

    function showPopup(t,d,m){
        const ds=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday","Total"];
        document.getElementById('modalTitle').innerText=t+" - "+ds[d];
        const sortedMatches = [...m].sort((a, b) => b.d.localeCompare(a.d));
        const listHtml = sortedMatches.map(item => {
            let boTag = '<span style="color:#cbd5e1">-</span>';
            if (item.bo === 5) boTag = '<span class="sch-pill gold" style="font-size:9px; padding:2px 4px;">BO5</span>';
            else if (item.bo === 3) boTag = '<span class="sch-pill" style="font-size:9px; padding:2px 4px;">BO3</span>';
            else if (item.bo === 1) boTag = '<span class="sch-pill" style="font-size:9px; padding:2px 4px;">BO1</span>';
            return renderMatchItem('dist', item.d, boTag, item.t1, item.t2, item.f, item.s);
        });
        renderListHTML(listHtml);
        document.getElementById('matchModal').style.display="block";
    }

    function openTeam(slug, teamName) {
        if (!window.g_stats || !window.g_stats[slug] || !window.g_stats[slug][teamName]) return;
        const data = window.g_stats[slug][teamName];
        document.getElementById('modalTitle').innerText = teamName + " - Schedule";
        const listHtml = (data.history || []).map(h => {
            const icon = RES_MAP[h.res] || RES_MAP['N'];
            const resTag = \`<span class="\${(h.res === 'W' || h.res === 'L') ? '' : 'hist-icon'}">\${icon}</span>\`;
            return renderMatchItem('history', h.d, resTag, teamName, h.vs, h.full, h.s, h.res);
        });
        renderListHTML(listHtml);
        document.getElementById('matchModal').style.display="block";
    }

    function openStats(slug, teamName, type) {
        if (!window.g_stats || !window.g_stats[slug] || !window.g_stats[slug][teamName]) return;
        const data = window.g_stats[slug][teamName];
        let history = data.history || [];
        let titleSuffix = "";
        if (type === 'bo3') { history = history.filter(h => h.bo === 3); titleSuffix = " - BO3"; } 
        else if (type === 'bo5') { history = history.filter(h => h.bo === 5); titleSuffix = " - BO5"; } 
        else { titleSuffix = " - Series"; }
        document.getElementById('modalTitle').innerText = teamName + titleSuffix;
        const listHtml = history.map(h => {
            const icon = RES_MAP[h.res] || RES_MAP['N'];
            const resTag = \`<span class="\${(h.res === 'W' || h.res === 'L') ? '' : 'hist-icon'}">\${icon}</span>\`;
            return renderMatchItem('history', h.d, resTag, teamName, h.vs, h.full, h.s, h.res);
        });
        renderListHTML(listHtml);
        document.getElementById('matchModal').style.display="block";
    }

    function openH2H(slug, t1, t2) {
        if (!window.g_stats || !window.g_stats[slug] || !window.g_stats[slug][t1]) return;
        const data = window.g_stats[slug][t1];
        const h2hHistory = (data.history || []).filter(h => h.vs === t2);
        let t1Wins = 0, t2Wins = 0;
        h2hHistory.forEach(h => { if(h.res === 'W') t1Wins++; else if(h.res === 'L') t2Wins++; });
        const summary = h2hHistory.length > 0 ? ' <span style="color:#94a3b8;font-size:14px">(' + t1Wins + '<span style="margin:0 1px">-</span>' + t2Wins + ')</span>' : "";
        document.getElementById('modalTitle').innerHTML = t1 + " vs " + t2 + summary;
        const listHtml = h2hHistory.map(h => {
            const icon = RES_MAP[h.res] || RES_MAP['N'];
            const resTag = '<span class="' + ((h.res === 'W' || h.res === 'L') ? '' : 'hist-icon') + '">' + icon + '</span>';
            return renderMatchItem('history', h.d, resTag, t1, h.vs, h.full, h.s, h.res);
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
    const logoIcon = navMode === "archive" ? "📦" : "🥇";
    if (navMode === "home") navBtn = `<a href="/archive" class="action-btn"><span class="btn-icon">📦</span> <span class="btn-text">Archive</span></a>`;
    else if (navMode === "archive") navBtn = `<a href="/" class="action-btn"><span class="btn-icon">🏠</span> <span class="btn-text">Home</span></a>`;

    const toolsBtn = (navMode !== "home" && navMode !== "archive") 
        ? `<a href="/tools" class="action-btn"><span class="btn-icon">🧰</span> <span class="btn-text">Tools</span></a>` 
        : "";

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title><style>${PYTHON_STYLE}</style><link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text x='50' y='.9em' font-size='85' text-anchor='middle'>${logoIcon}</text></svg>"></head><body><header class="main-header"><div class="header-left"><span class="header-logo">${logoIcon}</span><h1 class="header-title">${title}</h1></div><div class="header-right">${navBtn}${toolsBtn}<a href="/logs" class="action-btn"><span class="btn-icon">📜</span> <span class="btn-text">Logs</span></a></div></header><div class="container">${bodyContent}<div class="footer">${statusText}</div></div><div id="matchModal" class="modal"><div class="modal-content"><h3 id="modalTitle">Match History</h3><div id="modalList" class="match-list"></div></div></div>${PYTHON_JS}</body></html>`;
}

function renderContentOnly(globalStats, timeData, scheduleMap, runtimeConfig, updateTimestamps, isArchive = false, tournMeta = {}) {
    globalStats = globalStats || {};
    timeData = timeData || {};
    scheduleMap = scheduleMap || {};
    updateTimestamps = updateTimestamps || {};
    runtimeConfig = runtimeConfig || { TOURNAMENTS: [] };
    if (!runtimeConfig.TOURNAMENTS) runtimeConfig.TOURNAMENTS = [];

    const injectedData = `<script>window.g_stats = Object.assign(window.g_stats || {}, ${JSON.stringify(globalStats)});</script>`;
    const mkSpine = (val, sep) => {
        if(!val || val === "-") return `<span style="color:#cbd5e1">-</span>`;
        const parts = val.split(sep);
        if(parts.length !== 2) return val;
        return `<div class="spine-row"><span class="spine-l" style="font-weight:700">${parts[0]}</span><span class="spine-sep" style="opacity:0.4;">${sep}</span><span class="spine-r" style="font-weight:700">${parts[1]}</span></div>`;
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

    runtimeConfig.TOURNAMENTS.forEach((tourn, idx) => {
        if (!tourn || !tourn.slug) return;
        const rawStats = globalStats[tourn.slug] || {};
        const stats = utils.sortTeams(rawStats);
        const tableId = `t_${tourn.slug.replace(/-/g, '_')}`;
        const lastTs = updateTimestamps[tourn.slug];
        const timeStr = lastTs ? utils.fmtDate(lastTs) : "(Pending)";
        const debugLabel = `<span style="font-size:11px;color:#64748b;font-weight:600;margin-left:10px">${timeStr}</span>`;

        const rows = stats.map(s => {
            const bo3R = utils.rate(s.bo3_f, s.bo3_t), bo5R = utils.rate(s.bo5_f, s.bo5_t);
            const winR = utils.rate(s.s_w, s.s_t), gameR = utils.rate(s.g_w, s.g_t);
            const bo3Txt = s.bo3_t ? mkSpine(`${s.bo3_f}/${s.bo3_t}`, '/') : "-";
            const bo5Txt = s.bo5_t ? mkSpine(`${s.bo5_f}/${s.bo5_t}`, '/') : "-";
            const serTxt = s.s_t ? mkSpine(`${s.s_w}-${s.s_t-s.s_w}`, '-') : "-";
            const gamTxt = s.g_t ? mkSpine(`${s.g_w}-${s.g_t-s.g_w}`, '-') : "-";
            const strk = s.strk_w > 0 ? `<span class='badge' style='background:#10b981'>${s.strk_w}W</span>` : (s.strk_l>0 ? `<span class='badge' style='background:#f43f5e'>${s.strk_l}L</span>` : "-");
            const last = s.last ? utils.fmtDate(s.last).slice(0) : "-";
            const lastColor = utils.colorDate(s.last);
            const emptyBg = '#f1f5f9', emptyCol = '#cbd5e1';
            const cls = (base, count) => count > 0 ? `${base} team-clickable` : base;
            const clk = (slug, name, type, count) => count > 0 ? `onclick="openStats('${slug}', '${name}', '${type}')"` : "";
            
            return `<tr><td class="team-col team-clickable" onclick="openTeam('${tourn.slug}', '${s.name}')">${s.name}</td><td class="${cls('col-bo3', s.bo3_t)}" ${clk(tourn.slug, s.name, 'bo3', s.bo3_t)} style="background:${s.bo3_t===0?emptyBg:'transparent'};color:${s.bo3_t===0?emptyCol:'inherit'}">${bo3Txt}</td><td class="col-bo3-pct" style="background:${utils.color(bo3R,true)};color:${bo3R!==null?'white':emptyCol};font-weight:bold">${utils.pct(bo3R)}</td><td class="${cls('col-bo5', s.bo5_t)}" ${clk(tourn.slug, s.name, 'bo5', s.bo5_t)} style="background:${s.bo5_t===0?emptyBg:'transparent'};color:${s.bo5_t===0?emptyCol:'inherit'}">${bo5Txt}</td><td class="col-bo5-pct" style="background:${utils.color(bo5R,true)};color:${bo5R!==null?'white':emptyCol};font-weight:bold">${utils.pct(bo5R)}</td><td class="${cls('col-series', s.s_t)}" ${clk(tourn.slug, s.name, 'series', s.s_t)} style="background:${s.s_t===0?emptyBg:'transparent'};color:${s.s_t===0?emptyCol:'inherit'}">${serTxt}</td><td class="col-series-wr" style="background:${utils.color(winR)};color:${winR!==null?'white':emptyCol};font-weight:bold">${utils.pct(winR)}</td><td class="col-game" style="background:${s.g_t===0?emptyBg:'transparent'};color:${s.g_t===0?emptyCol:'inherit'}">${gamTxt}</td><td class="col-game-wr" style="background:${utils.color(gameR)};color:${gameR!==null?'white':emptyCol};font-weight:bold">${utils.pct(gameR)}</td><td class="col-streak" style="background:${s.strk_w===0&&s.strk_l===0?emptyBg:'transparent'};color:${s.strk_w===0&&s.strk_l===0?emptyCol:'inherit'}">${strk}</td><td class="col-last" style="background:${!s.last?emptyBg:'transparent'};color:${!s.last?emptyCol:lastColor};font-weight:700">${last}</td></tr>`;
        }).join("");

        const mainPage = Array.isArray(tourn.overview_page) ? tourn.overview_page[0] : tourn.overview_page;
        const tableBody = `<table id="${tableId}"><thead><tr><th class="team-col" onclick="doSort(0, '${tableId}')">TEAM</th><th colspan="2" onclick="doSort(2, '${tableId}')">BO3 FULLRATE</th><th colspan="2" onclick="doSort(4, '${tableId}')">BO5 FULLRATE</th><th colspan="2" onclick="doSort(6, '${tableId}')">SERIES</th><th colspan="2" onclick="doSort(8, '${tableId}')">GAMES</th><th class="col-streak" onclick="doSort(9, '${tableId}')">STREAK</th><th class="col-last" onclick="doSort(10, '${tableId}')">LAST DATE</th></tr></thead><tbody>${rows}</tbody></table>`;
        
        let timeTableHtml = "";
        const regionGrid = timeData[tourn.slug] || {};
        const hours = Object.keys(regionGrid).filter(k => k !== "Total" && !isNaN(k)).map(Number).sort((a,b) => a - b);
        
        if (hours.length > 0 || regionGrid["Total"]) {
            timeTableHtml += `<div style="border-top: 1px solid #f1f5f9; width:100%;"></div><table style="font-variant-numeric:tabular-nums; border-top:none;"><thead><tr style="border-bottom:none;"><th class="team-col" style="cursor:default; pointer-events:none;">TIME</th>`;
            ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Total"].forEach(d => { timeTableHtml += `<th style="cursor:default; pointer-events:none;">${d}</th>`; });
            timeTableHtml += "</tr></thead><tbody>";
            
            [...hours, "Total"].forEach(h => {
                if (!regionGrid[h]) return;
                const isTotal = h === "Total";
                const label = isTotal ? "Total" : `${h}:00`;
                timeTableHtml += `<tr style="${isTotal?'font-weight:bold; background:#f8fafc;':''}"><td class="team-col" style="${isTotal?'background:#f1f5f9;':''}">${label}</td>`;
                for(let w=0; w<8; w++) {
                    const c = regionGrid[h][w] || {total:0};
                    if(c.total===0) timeTableHtml += "<td style='background:#f1f5f9; color:#cbd5e1'>-</td>";
                    else {
                        const r = c.full/c.total;
                        const matches = JSON.stringify(c.matches).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
                        timeTableHtml += `<td style='background:${utils.color(r,true)}; color:white; font-weight:bold; cursor:pointer;' onclick='showPopup("${label}", ${w}, ${matches})'><div class="t-cell"><span class="t-val">${c.full}<span style="opacity:0.7; margin:0 1px;">/</span>${c.total}</span><span class="t-pct">(${Math.round(r*100)}%)</span></div></td>`;
                    }
                }
                timeTableHtml += "</tr>";
            });
            timeTableHtml += "</tbody></table>";
        }

        // 仅在主页显示 Emoji
        const emojiStr = (!isArchive && tournMeta[tourn.slug] && tournMeta[tourn.slug].emoji) 
            ? `<span style="font-size: 16px; line-height: 1; display: block; transform: translateY(-1px);">${tournMeta[tourn.slug].emoji}</span>` 
            : "";
        const titleLink = `<a href="https://lol.fandom.com/wiki/${mainPage}" target="_blank">${tourn.name || tourn.slug}</a>`;
        
        if (isArchive) {
            const headerContent = `<div class="arch-title-wrapper"><span class="arch-indicator">❯</span> ${titleLink}</div> ${debugLabel}`;
            tablesHtml += `<details class="arch-sec"><summary class="arch-sum">${headerContent}</summary><div class="wrapper" style="margin-bottom:0; box-shadow:none; border:none; border-top:1px solid #f1f5f9; border-radius:0;">${tableBody}${timeTableHtml}</div></details>`;
        } else {
            tablesHtml += `<div class="wrapper"><div class="table-title"><div style="display:flex; align-items:center; gap: 6px;">${emojiStr}${titleLink}</div> ${debugLabel}</div>${tableBody}${timeTableHtml}</div>`;
        }
    });
    
    let scheduleHtml = "";
    if (!isArchive) {
        const dates = Object.keys(scheduleMap).sort();
        if (dates.length === 0) scheduleHtml = `<div class="sch-empty">💤 NO FUTURE MATCHES SCHEDULED</div>`;
        else {
            scheduleHtml = `<div class="sch-container">`;
            dates.forEach(d => {
                const matches = scheduleMap[d];
                const dateObj = new Date(d + "T00:00:00Z");
                const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dateObj.getUTCDay()];
                let cardHtml = `<div class="sch-card"><div class="sch-header" style="background:#f8fafc;color:#334155"><span>📅 ${d.slice(5)} ${dayName}</span><span style="font-size:11px;opacity:0.6">${matches.length} Matches</span></div><div class="sch-body">`;
                let lastGroupKey = "";
                matches.forEach(m => {
                    const blockName = m.blockName || "";
                    const groupKey = `${m.league}_${blockName}`;
                    if (groupKey !== lastGroupKey) {
                        cardHtml += `<div class="sch-group-header" style="background:#f8fafc"><div class="spine-row" style="width:100%; padding:0 10px; box-sizing:border-box"><span class="spine-l" style="font-weight:800">${m.league}</span><span class="spine-sep">/</span><span class="spine-r" style="font-weight:800; opacity:0.7">${blockName || "REGULAR"}</span></div></div>`;
                        lastGroupKey = groupKey;
                    }
                    const boLabel = m.bo ? `BO${m.bo}` : ''; const isBo5 = m.bo === 5; const boClass = isBo5 ? "sch-pill gold" : "sch-pill";
                    const isTbd1 = m.t1 === "TBD", isTbd2 = m.t2 === "TBD";
                    const t1Click = isTbd1 ? "" : `onclick="openTeam('${m.slug}', '${m.t1}')"`, t2Click = isTbd2 ? "" : `onclick="openTeam('${m.slug}', '${m.t2}')"`;
                    const r1 = getRateHtml(m.t1, m.slug, m.bo), r2 = getRateHtml(m.t2, m.slug, m.bo);
                    let midContent = `<span style="color:#94a3b8;font-size:13px;font-weight:700;margin:0 2px;">vs</span>`;
                    if (m.is_finished) {
                        const s1Style = m.s1 > m.s2 ? "color:#0f172a" : "color:#94a3b8", s2Style = m.s2 > m.s1 ? "color:#0f172a" : "color:#94a3b8";
                        midContent = `<span class="sch-fin-score"><span style="${s1Style}">${m.s1}</span><span style="opacity:0.4; margin:0 1px;">-</span><span style="${s2Style}">${m.s2}</span></span>`;
                    } else if (m.is_live) {
                        midContent = `<span class="sch-live-score">${m.s1}<span style="opacity:0.4; margin:0 1px;">-</span>${m.s2}</span>`;
                    }

                    const h2hClass = (!isTbd1 && !isTbd2) ? "spine-sep clickable" : "spine-sep";
                    const h2hClick = (!isTbd1 && !isTbd2) ? `onclick="openH2H('${m.slug}', '${m.t1}', '${m.t2}')"` : "";
                    cardHtml += `<div class="sch-row"><span class="sch-time">${m.time}</span><div class="sch-vs-container"><div class="spine-row"><span class="${isTbd1?"spine-l":"spine-l clickable"}" ${t1Click} style="${isTbd1?'color:#9ca3af':''}">${r1}${m.t1}</span><span class="${h2hClass}" ${h2hClick} style="display:flex;justify-content:center;align-items:center;width:40px;transition:background 0.2s;">${midContent}</span><span class="${isTbd2?"spine-r":"spine-r clickable"}" ${t2Click} style="${isTbd2?'color:#9ca3af':''}">${m.t2}${r2}</span></div></div><div class="sch-tag-col"><span class="${boClass}">${boLabel}</span></div></div>`;               });
                cardHtml += `</div></div>`;
                scheduleHtml += cardHtml;
            });
            scheduleHtml += `</div>`;
        }
    }
    return `${tablesHtml} ${scheduleHtml} ${injectedData}`;
}

async function generateArchiveStaticHTML(env, cacheMain = null) {
    try {
        const allKeys = await env.LOL_KV.list({ prefix: "ARCHIVE_" });
        
        // 【核心修复】：过滤掉生成的静态 HTML 键值，只处理真正的 JSON 数据
        const dataKeys = allKeys.keys.filter(k => k.name !== "ARCHIVE_STATIC_HTML");
        
        if (!dataKeys.length) {
            return renderPageShell("LoL Archive", `<div class="arch-content" style="text-align:center; padding: 40px; color: #94a3b8; font-weight: bold;">No archive data available.</div>`, "", "archive");
        }

        if (!cacheMain) {
            cacheMain = await env.LOL_KV.get("CACHE_DATA", { type: "json" }) || {};
        }
        const teamMap = cacheMain?.runtimeConfig?.TEAM_MAP || {};

        // 现在映射的是安全过滤后的 dataKeys
        const rawSnapshots = await Promise.all(dataKeys.map(k => env.LOL_KV.get(k.name, { type: "json" })));
        const validSnapshots = rawSnapshots.filter(s => s && s.tourn && s.tourn.slug);

        validSnapshots.sort((a, b) => {
            const tsA = (a.updateTimestamps && a.tourn) ? (a.updateTimestamps[a.tourn.slug] || 0) : 0;
            const tsB = (b.updateTimestamps && b.tourn) ? (b.updateTimestamps[b.tourn.slug] || 0) : 0;
            return tsB - tsA;
        });

        const combined = validSnapshots.map(snap => {
            const miniConfig = { TEAM_MAP: teamMap, TOURNAMENTS: [snap.tourn] };
            const analysis = runFullAnalysis({ [snap.tourn.slug]: snap.rawMatches || [] }, {}, miniConfig);
            const statsObj = analysis.globalStats[snap.tourn.slug] || {};
            const timeObj = analysis.timeGrid[snap.tourn.slug] || {};
            return renderContentOnly(
                { [snap.tourn.slug]: statsObj },
                { [snap.tourn.slug]: timeObj },
                {}, miniConfig, snap.updateTimestamps || {}, true
            );
        }).join("");
        
        return renderPageShell("LoL Archive", `<div class="arch-content">${combined}</div>`, "", "archive");
    } catch (e) {
        return renderPageShell("LoL Archive Error", `<div style="padding: 20px; color: red; text-align: center; font-weight: bold;">Error generating archive: ${e.message}</div>`, "", "archive");
    }
}

// --- 8. 主控 & Tasks (V46.0 探针聚合版) ---
class Logger {
    constructor() { this.l=[]; }
    error(m) { this.l.push({t:utils.getNow().short, l:'ERROR', m}); }
    success(m) { this.l.push({t:utils.getNow().short, l:'SUCCESS', m}); }
    export() { return this.l; }
}

async function runUpdate(env, force=false) {
    const l = new Logger();
    const NOW = Date.now();
    const FAST_THRESHOLD = 6 * 60 * 1000;         
    const SLOW_THRESHOLD = 56 * 60 * 1000;        
    const UPDATE_ROUNDS = 1;

    let cache = await env.LOL_KV.get("CACHE_DATA", {type:"json"});
    const meta = await env.LOL_KV.get("META", {type:"json"}) || { total: 0, tournaments: {} };
    
    let runtimeConfig = null;
    try {
        const teams = await gh.fetchJson(env, "mapping.json");
        const tourns = await gh.fetchJson(env, "tour.json");
        if (teams && tourns) runtimeConfig = { TEAM_MAP: teams, TOURNAMENTS: tourns };
    } catch (e) {}

    if (!runtimeConfig) { 
        l.error(`🔴 [ERR!] | ❌ Config(Fail)`); 
        return l; 
    }

    if (!cache) cache = { globalStats: {}, updateTimestamps: {}, rawMatches: {} };
    if (!cache.rawMatches) cache.rawMatches = {}; 
    if (!cache.updateTimestamps) cache.updateTimestamps = {};

    let candidates = [], coolDetails = [];
    const dayNow = utils.toCST(NOW).getUTCDate();

    runtimeConfig.TOURNAMENTS.forEach(tourn => {
        const lastTs = cache.updateTimestamps[tourn.slug] || 0;
        const elapsed = NOW - lastTs;
        const elapsedMins = Math.floor(elapsed / 60000);
        const dayLast = utils.toCST(lastTs).getUTCDate();
        const isNewDay = dayNow !== dayLast;
        
        const tMeta = (meta.tournaments && meta.tournaments[tourn.slug]) || { mode: "fast", streak: 0, startTs: 0 };
        const currentMode = tMeta.mode;
        const isStarted = tMeta.startTs > 0 && NOW >= tMeta.startTs;
        const threshold = (currentMode === "slow" && !isStarted) ? SLOW_THRESHOLD : FAST_THRESHOLD;
        
        const dName = tourn.league || tourn.name || tourn.slug.toUpperCase();
        const modeIcon = currentMode === "slow" ? "🐌" : "⚡";

        if (force || elapsed >= threshold || isNewDay) {
            candidates.push({ 
                slug: tourn.slug, overview_page: tourn.overview_page, league: dName,
                xm: elapsedMins, isNewDay: isNewDay, mode: currentMode 
            });
        } else {
            coolDetails.push(`${dName}(${modeIcon}${elapsedMins}m)`);
        }
    });

    if (candidates.length === 0) { 
        l.success(`🔵 [COOL] | ❄️ ${coolDetails.join(", ")}`);
        return l; 
    }

    const authContext = await loginToFandom(env);

    const batchSize = Math.ceil(candidates.length / UPDATE_ROUNDS);
    const batch = candidates.slice(0, batchSize);
    
    const pastDateObj = new Date(NOW - 48 * 60 * 60 * 1000); 
    const futureDateObj = new Date(NOW + 48 * 60 * 60 * 1000); 
    const deltaStartUTC = pastDateObj.toISOString().slice(0, 10); 
    const deltaEndUTC = futureDateObj.toISOString().slice(0, 10); 

    const results = [];
    for (const c of batch) {
        try {
            const oldData = cache.rawMatches[c.slug] || [];
            const isFullFetch = force || c.isNewDay || oldData.length === 0 || c.mode === "slow";
            const dateQuery = isFullFetch ? null : { start: deltaStartUTC, end: deltaEndUTC };

            const data = await fetchAllMatches(c.slug, c.overview_page, authContext, dateQuery);
            results.push({ status: 'fulfilled', slug: c.slug, data: data, isDelta: !isFullFetch });
        } catch (err) {
            results.push({ status: 'rejected', slug: c.slug, err: err });
        }
        if (c !== batch[batch.length - 1]) await new Promise(res => setTimeout(res, 2000));
    }

    const failedSlugs = new Set();
    const syncDetails = [];
    const idleDetails = [];
    const breakers = [];
    const apiErrors = [];
    
    results.forEach(res => {
        const c = batch.find(b => b.slug === res.slug);
        const dName = c.league;
        const mIcon = c.mode === "slow" ? "🐌" : "⚡";

        if (res.status === 'fulfilled') {
            const slug = res.slug;
            const newData = res.data || [];
            const oldData = cache.rawMatches[slug] || [];
            
            if (res.isDelta) {
                if (newData.length > 0) {
                    const matchMap = new Map();
                    const getUniqueKey = (m) => {
                        const page = m.OverviewPage || "Unknown";
                        const n = m.N_MatchInPage || m["N MatchInPage"];
                        if (n) return `${page}_${n}`;
                        const t_utc = m.DateTime_UTC || m["DateTime UTC"];
                        const t1 = m.Team1 || m["Team 1"];
                        const t2 = m.Team2 || m["Team 2"];
                        return `${page}_${t_utc}_${t1}_${t2}`;
                    };

                    oldData.forEach(m => matchMap.set(getUniqueKey(m), m));

                    let changesCount = 0;
                    newData.forEach(m => {
                        const key = getUniqueKey(m);
                        const oldM = matchMap.get(key);
                        if (!oldM || JSON.stringify(oldM) !== JSON.stringify(m)) {
                            matchMap.set(key, m);
                            changesCount++;
                        }
                    });

                    if (changesCount > 0) {
                        const mergedList = Array.from(matchMap.values());
                        mergedList.sort((a, b) => {
                            const tA = a.DateTime_UTC || "9999-99-99";
                            const tB = b.DateTime_UTC || "9999-99-99";
                            return tA.localeCompare(tB);
                        });
                        cache.rawMatches[slug] = mergedList;
                        syncDetails.push(`${dName} +${changesCount} (${mIcon}${c.xm}m)`);
                    } else {
                        idleDetails.push(`${dName} *${oldData.length} (${mIcon}${c.xm}m)`);
                    }
                } else {
                    idleDetails.push(`${dName} *${oldData.length} (${mIcon}${c.xm}m)`);
                }
            } else {
                if (!force && oldData.length > 10 && newData.length < oldData.length * 0.9) {
                    breakers.push(`${dName}(Drop)`);
                    failedSlugs.add(slug);
                } else {
                    cache.rawMatches[slug] = newData;
                    if (JSON.stringify(oldData) !== JSON.stringify(newData)) {
                        syncDetails.push(`${dName} *${newData.length} (${mIcon}${c.xm}m)`);
                    } else {
                        idleDetails.push(`${dName} *${newData.length} (${mIcon}${c.xm}m)`);
                    }
                }
            }
            cache.updateTimestamps[slug] = NOW;
        } else {
            apiErrors.push(`${dName}(Fail)`);
            failedSlugs.add(res.slug);
        }
    });

    const activeSlugs = new Set(runtimeConfig.TOURNAMENTS.map(t => t.slug));
    for (const slug of Object.keys(cache.rawMatches)) if (!activeSlugs.has(slug)) delete cache.rawMatches[slug];
    for (const slug of Object.keys(cache.updateTimestamps)) if (!activeSlugs.has(slug)) delete cache.updateTimestamps[slug];

    const oldTournMeta = meta.tournaments || {};
    const analysis = runFullAnalysis(cache.rawMatches, oldTournMeta, runtimeConfig, failedSlugs); 

    const modeSwitches = [];
    Object.keys(analysis.tournMeta).forEach(slug => {
        const oldMode = (oldTournMeta[slug] && oldTournMeta[slug].mode) || "fast";
        const newMode = analysis.tournMeta[slug].mode;
        if (oldMode !== newMode) {
            const t = runtimeConfig.TOURNAMENTS.find(it => it.slug === slug);
            const dName = t ? (t.league || t.name || slug.toUpperCase()) : slug;
            modeSwitches.push(`${dName}(${newMode === "slow" ? "🐌" : "⚡"})`);
        }
    });
    
    // --- 终极日志输出 ---
    const isAnon = (!authContext || authContext.isAnonymous);
    const authPrefix = isAnon ? "👻 " : "";
    let trafficLight, action, content;
    
    if (syncDetails.length === 0 && apiErrors.length === 0 && breakers.length === 0) {
        trafficLight = "⚪"; action = "[IDLE]";
        content = `🔍 ${idleDetails.join(", ")} | 🟰 Identical`;
    } else {
        const hasErr = apiErrors.length > 0 || breakers.length > 0;
        trafficLight = hasErr ? "🔴" : "🟢";
        action = hasErr ? "[ERR!]" : "[SYNC]";
        
        let parts = [];
        if (syncDetails.length > 0) parts.push(`🔄 ${syncDetails.join(", ")}`);
        if (modeSwitches.length > 0) parts.push(`⚙️ ${modeSwitches.join(", ")}`);
        if (breakers.length > 0) parts.push(`🚧 ${breakers.join(", ")}`);
        if (apiErrors.length > 0) parts.push(`❌ ${apiErrors.join(", ")}`);
        content = parts.join(" | ");
    }

    const finalLog = `${trafficLight} ${action} | ${authPrefix}${content}`;
    if (trafficLight === "🔴") l.error(finalLog); else l.success(finalLog);


    const newCacheData = { 
        globalStats: analysis.globalStats, timeGrid: analysis.timeGrid,
        debugInfo: analysis.debugInfo, maxDateTs: analysis.maxDateTs,
        statusText: analysis.statusText, scheduleMap: analysis.scheduleMap,
        tournMeta: analysis.tournMeta,
        updateTime: utils.getNow(), runtimeConfig,
        rawMatches: cache.rawMatches, updateTimestamps: cache.updateTimestamps
    };
    await env.LOL_KV.put("CACHE_DATA", JSON.stringify(newCacheData));

    try {
        const homeFragment = renderContentOnly(
            analysis.globalStats, analysis.timeGrid, analysis.scheduleMap,
            runtimeConfig, cache.updateTimestamps, false, analysis.tournMeta 
        );
        const fullPage = renderPageShell("LoL Insights", homeFragment, analysis.statusText, "home");
        await env.LOL_KV.put("HOME_STATIC_HTML", fullPage);
    } catch (e) {}

    for (const tourn of runtimeConfig.TOURNAMENTS) {
        const slug = tourn.slug;
        if (!analysis.globalStats[slug]) continue;
        const snapshot = { tourn: tourn, rawMatches: cache.rawMatches[slug] || [], updateTimestamps: { [slug]: cache.updateTimestamps[slug] } };
        await env.LOL_KV.put(`ARCHIVE_${slug}`, JSON.stringify(snapshot));
    }
    
    const archiveHTML = await generateArchiveStaticHTML(env, newCacheData);
    await env.LOL_KV.put("ARCHIVE_STATIC_HTML", archiveHTML);

    await env.LOL_KV.put("META", JSON.stringify({ total: analysis.grandTotal, tournaments: analysis.tournMeta }));
    
    return l;
}

async function runCustomRebuild(env, payload) {
    const l = new Logger();
    
    const authContext = await loginToFandom(env);

    try {
        const matches = await fetchAllMatches(payload.slug, payload.overview_page, authContext, null);
        
        if (matches && matches.length > 0) {
            const tourn = {
                slug: payload.slug,
                name: payload.name,
                overview_page: payload.overview_page,
                league: payload.league
            };
            
            const snapshot = {
                tourn: tourn,
                rawMatches: matches,
                updateTimestamps: { [payload.slug]: Date.now() }
            };
            
            await env.LOL_KV.put(`ARCHIVE_${payload.slug}`, JSON.stringify(snapshot));
            l.success(`🟢 [SYNC] | 🔄 ${payload.league} *${matches.length} | ⚙️ Rebuild Archive`);
            
            const archiveHTML = await generateArchiveStaticHTML(env);
            await env.LOL_KV.put("ARCHIVE_STATIC_HTML", archiveHTML);
        } else {
            l.error(`🔴 [ERR!] | 🚧 ${payload.league}(Drop) | ❌ No matches found for rebuild`);
            throw new Error("No matches found from Fandom API");
        }
    } catch (e) {
        l.error(`🔴 [ERR!] | ❌ ${payload.league}(Fail) | ${e.message}`);
        throw e;
    }
    
    return l;
}

// --- 9. 独立页面渲染 ---
function renderToolsPage(time, sha) {
    const shortSha = (sha || "").slice(0, 7) || "unknown";
    return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Tools</title>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text x='50' y='.9em' font-size='85' text-anchor='middle'>🧰</text></svg>">
        <style>
            ${COMMON_STYLE}
            body { min-height: 100dvh; display: flex; flex-direction: column; margin: 0; }
            .container { flex: 1; max-width: 900px; width: 100%; padding: 0 15px 20px 15px; box-sizing: border-box; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
            
            .wrapper { width: 100%; background: #fff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; overflow: hidden; box-sizing: border-box; }
            .table-title { padding: 15px 20px; font-weight: 700; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; background: #fff; color: #0f172a; font-size: 15px; box-sizing: border-box; }
            .section-body { padding: 25px 20px; box-sizing: border-box; }
            
            .flex-row { display: flex; justify-content: space-between; align-items: center; gap: 15px; }
            
            .primary-btn { background: #2563eb; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-size: 13px; transition: 0.2s; font-family: inherit; margin: 0; white-space: nowrap; }
            .primary-btn:hover { background: #1d4ed8; box-shadow: 0 2px 4px rgba(37,99,235,0.2); }
            
            .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
            .form-group { display: flex; flex-direction: column; }
            .tool-label { font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 8px; padding-left: 2px; }
            .form-input { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; font-family: inherit; color: #0f172a; box-sizing: border-box; transition: all 0.2s; background: #f8fafc; }
            .form-input:focus { background: #fff; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); outline: none; }
            .form-input::placeholder { color: #94a3b8; }
            
            @media (max-width: 600px) {
                .form-grid { grid-template-columns: 1fr; gap: 12px; }
                .flex-row { flex-direction: column; align-items: stretch; text-align: left; }
                .primary-btn { width: 100%; }
            }

            .build-footer { flex-shrink: 0; text-align: center; padding: 15px 20px; padding-bottom: calc(15px + env(safe-area-inset-bottom)); color: #94a3b8; font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
            .build-footer b { color: #64748b; }
            .build-footer a { color: inherit; text-decoration: none; opacity: 0.8; }
            .build-footer a:hover { opacity: 1; text-decoration: underline; }
            
            /* Clean Glass Auth Overlay */
            #auth-overlay { position: fixed; inset: 0; background: rgba(241,245,249,0.8); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex; justify-content: center; align-items: center; z-index: 999; }
            .auth-card { background: #fff; padding: 35px 30px; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); width: 340px; text-align: center; box-sizing: border-box; border: 1px solid #e2e8f0; }
            .auth-title { font-size: 18px; font-weight: 800; margin-bottom: 8px; color: #0f172a; }
            .auth-subtitle { color: #64748b; font-size: 13px; margin-bottom: 25px; line-height: 1.4; }
            .auth-btn { width: 100%; justify-content: center; padding: 12px; font-size: 14px; }
            
            /* Toast Notifications */
            #toast-container { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 1000; display: flex; flex-direction: column; gap: 10px; pointer-events: none; width: 90%; max-width: 320px; }
            .toast { background: #334155; color: #fff; padding: 12px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); opacity: 0; transform: translateY(-20px); transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); text-align: center; word-break: break-word; }
            .toast.show { opacity: 1; transform: translateY(0); }
            .toast.error { background: #ef4444; }
            .toast.success { background: #10b981; }
        </style>
    </head>
    <body>
        <div id="toast-container"></div>
        <div id="auth-overlay">
            <div class="auth-card">
                <div style="font-size: 32px; margin-bottom: 12px;">🔐</div>
                <div class="auth-title">Admin Authentication</div>
                <div class="auth-subtitle">Please verify your identity to access tools.</div>
                <input type="password" id="auth-pwd" class="form-input" style="text-align:center; font-family:monospace; letter-spacing:2px; margin-bottom:20px; padding:12px;" placeholder="Password" onkeypress="if(event.key==='Enter') unlockTools()">
                <button class="primary-btn auth-btn" onclick="unlockTools()">Unlock</button>
            </div>
        </div>

        <header class="main-header">
            <div class="header-left">
                <span class="header-logo">🧰</span>
                <h1 class="header-title">Tools</h1>
            </div>
            <div class="header-right">
                <a href="/" class="action-btn"><span class="btn-icon">🏠</span> <span class="btn-text">Home</span></a>
                <a href="/logs" class="action-btn"><span class="btn-icon">📜</span> <span class="btn-text">Logs</span></a>
            </div>
        </header>
        
        <div class="container">
            <div class="wrapper">
                <div class="table-title">🎨 UI Customization</div>
                <div class="section-body flex-row" style="padding-top: 20px; padding-bottom: 20px;">
                    <div>
                        <div style="font-weight: 700; color: #0f172a; margin-bottom: 4px;">Local UI Refresh</div>
                        <div style="font-size: 13px; color: #64748b;">Regenerate static HTML using existing cached data. No API calls.</div>
                    </div>
                    <button class="primary-btn" id="btn-refresh" onclick="runTask('/refresh-ui', 'btn-refresh')">Refresh HTML</button>
                </div>
            </div>

            <div class="wrapper">
                <div class="table-title">⚡ Synchronization</div>
                <div class="section-body flex-row" style="padding-top: 20px; padding-bottom: 20px;">
                    <div>
                        <div style="font-weight: 700; color: #0f172a; margin-bottom: 4px;">Force Update</div>
                        <div style="font-size: 13px; color: #64748b;">Trigger a full manual sync for all active tournaments.</div>
                    </div>
                    <button class="primary-btn" id="btn-force" onclick="runTask('/force', 'btn-force')">Refresh API</button>
                </div>
            </div>
            
            <div class="wrapper">
                <div class="table-title">📦 Archive Management</div>
                <div class="section-body">
                    <div style="font-weight: 700; color: #0f172a; margin-bottom: 4px;">Rebuild Archive</div>
                    <div style="font-size: 13px; color: #64748b; margin-bottom: 20px;">Manually reconstruct a deleted tournament by providing its Fandom details.</div>
                    
                    <div class="form-grid">
                        <div class="form-group">
                            <label class="tool-label">Slug</label>
                            <input type="text" id="rb-slug" placeholder="lpl-2026-split-1" class="form-input">
                        </div>
                        <div class="form-group">
                            <label class="tool-label">Name</label>
                            <input type="text" id="rb-name" placeholder="LPL 2026 Split 1" class="form-input">
                        </div>
                        <div class="form-group">
                            <label class="tool-label">Overview Page</label>
                            <input type="text" id="rb-overview" placeholder="LPL/2026 Season/Split 1" class="form-input">
                        </div>
                        <div class="form-group">
                            <label class="tool-label">League</label>
                            <input type="text" id="rb-league" placeholder="LPL" class="form-input">
                        </div>
                    </div>
                    <div style="display: flex; justify-content: flex-end;">
                        <button class="primary-btn" id="btn-rebuild" onclick="submitRebuild()">Rebuild</button>
                    </div>
                </div>
            </div>
        </div>
        <div class="build-footer">
            deployed: <b>${time || "N/A"}</b> <a href="https://github.com/closur3/lol-stats-archive/commit/${sha}" target="_blank">@${shortSha}</a>
        </div>
        
        <script>
            let adminToken = sessionStorage.getItem('admin_pwd') || "";
            if (adminToken) document.getElementById('auth-overlay').style.display = 'none';

            function showToast(msg, type = 'success') {
                const container = document.getElementById('toast-container');
                const toast = document.createElement('div');
                toast.className = 'toast ' + type;
                toast.innerText = msg;
                container.appendChild(toast);
                void toast.offsetWidth; // trigger reflow
                toast.classList.add('show');
                setTimeout(() => {
                    toast.classList.remove('show');
                    setTimeout(() => toast.remove(), 300);
                }, 3000); // 增加停留时间方便看清长错误
            }

            function unlockTools() {
                const pwd = document.getElementById('auth-pwd').value.trim();
                if (pwd) {
                    adminToken = pwd;
                    sessionStorage.setItem('admin_pwd', pwd);
                    document.getElementById('auth-overlay').style.display = 'none';
                }
            }

            function checkAuthError(status) {
                if (status === 401) {
                    showToast("Session expired or incorrect password.", "error");
                    sessionStorage.removeItem('admin_pwd');
                    adminToken = "";
                    document.getElementById('auth-pwd').value = "";
                    document.getElementById('auth-overlay').style.display = 'flex';
                    return true;
                }
                return false;
            }

            async function runTask(endpoint, btnId) {
                if (!adminToken) { document.getElementById('auth-overlay').style.display = 'flex'; return; }
                const btn = document.getElementById(btnId);
                const originalText = btn.innerHTML;
                btn.innerHTML = '⏳ Processing...';
                btn.style.pointerEvents = 'none';
                btn.style.opacity = '0.7';

                try {
                    const res = await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Authorization': 'Bearer ' + adminToken }
                    });
                    
                    if (checkAuthError(res.status)) return;
                    if (res.ok) { 
                        showToast("✅ Task completed successfully!"); 
                        setTimeout(() => window.location.href = '/', 1200);
                    } else {
                        const errText = await res.text();
                        showToast("⚠️ Server Error: " + errText, "error");
                    }
                } catch (e) {
                    showToast("❌ Network connection failed", "error");
                } finally {
                    btn.innerHTML = originalText;
                    btn.style.pointerEvents = 'auto';
                    btn.style.opacity = '1';
                }
            }

            async function submitRebuild() {
                if (!adminToken) { document.getElementById('auth-overlay').style.display = 'flex'; return; }
                const slug = document.getElementById('rb-slug').value.trim();
                const name = document.getElementById('rb-name').value.trim();
                const overview = document.getElementById('rb-overview').value.trim();
                const league = document.getElementById('rb-league').value.trim();

                if (!slug || !name || !overview || !league) {
                    showToast("⚠️ Please fill in all 4 fields.", "error");
                    return;
                }

                const btn = document.getElementById('btn-rebuild');
                const originalText = btn.innerHTML;
                btn.innerHTML = '⏳ Rebuilding...';
                btn.style.pointerEvents = 'none';
                btn.style.opacity = '0.7';

                try {
                    const res = await fetch('/rebuild-archive', {
                        method: 'POST',
                        headers: { 
                            'Authorization': 'Bearer ' + adminToken,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ slug, name, overview_page: overview, league })
                    });
                    
                    if (checkAuthError(res.status)) return;
                    if (res.ok) { 
                        showToast("✅ Archive reconstructed!"); 
                        setTimeout(() => window.location.href = '/archive', 1200);
                    } else {
                        const errText = await res.text();
                        showToast("⚠️ Error: " + errText, "error");
                    }
                } catch (e) {
                    showToast("❌ Network connection failed", "error");
                } finally {
                    btn.innerHTML = originalText;
                    btn.style.pointerEvents = 'auto';
                    btn.style.opacity = '1';
                }
            }
        </script>
    </body>
    </html>`;
}

function renderLogPage(logs, time, sha) {
    if (!Array.isArray(logs)) logs = [];
    const entries = logs.map(l => {
        let lvlClass = "lvl-inf";
        if(l.l === "ERROR") lvlClass = "lvl-err";
        if(l.l === "SUCCESS") lvlClass = "lvl-ok";
        return `<li class="log-entry"><span class="log-time">${l.t}</span><span class="log-level ${lvlClass}">${l.l}</span><span class="log-msg">${l.m}</span></li>`;
    }).join("");
    const shortSha = (sha || "").slice(0, 7) || "unknown";

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Logs</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text x='50' y='.9em' font-size='85' text-anchor='middle'>📜</text></svg>">
    <style>
        ${COMMON_STYLE}
        body { height: 100vh; height: 100dvh; display: flex; flex-direction: column; overflow: hidden; margin: 0; padding: 0; }
        .main-header { flex-shrink: 0; margin-bottom: 20px; }
        .container { flex: 1; min-height: 0; display: flex; flex-direction: column; max-width: 900px; width: 100%; padding: 0 15px 20px 15px; box-sizing: border-box; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0; overflow: hidden; transform: translateZ(0); -webkit-mask-image: -webkit-radial-gradient(white, black); }
        .log-list { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; list-style: none; margin: 0; padding: 0; }
        .log-entry { display: grid; grid-template-columns: min-content 90px 1fr; gap: 25px; padding: 16px 20px; border-bottom: 1px solid #f1f5f9; font-size: 15px; align-items: center; }
        .log-entry:nth-child(even) { background-color: #f8fafc; }
        .log-time { color: #64748b; font-size: 15px; white-space: nowrap; letter-spacing: -0.5px; text-align: right; font-variant-numeric: tabular-nums; }
        .log-level { font-weight: 800; display: flex; justify-content: center; align-items: center; width: 100%; padding: 6px 0; border-radius: 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; line-height: 1; }
        .lvl-inf { background: #eff6ff; color: #1e40af; border: 1px solid #dbeafe; }
        .lvl-ok { background: #f0fdf4; color: #15803d; border: 1px solid #dcfce7; }
        .lvl-err { background: #fef2f2; color: #b91c1c; border: 1px solid #fee2e2; }
        .log-msg { color: #334155; word-break: break-word; line-height: 1.5; font-weight: 500; }
        .empty-logs { padding: 40px; text-align: center; color: #94a3b8; font-style: italic; }
        .build-footer { flex-shrink: 0; text-align: center; padding: 15px 20px; padding-bottom: calc(15px + env(safe-area-inset-bottom)); color: #94a3b8; font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
        .build-footer b { color: #64748b; }
        .build-footer a { color: inherit; text-decoration: none; opacity: 0.8; }
        .build-footer a:hover { opacity: 1; text-decoration: underline; }
        @media (max-width: 600px) { .log-entry { grid-template-columns: 1fr; gap: 8px; padding: 15px; } .log-time { font-size: 12px; opacity: 0.7; text-align: left; } .log-level { display: inline-block; width: auto; padding: 3px 10px; } }
    </style>
</head>
<body>
    <header class="main-header">
        <div class="header-left"><span class="header-logo">📜</span><h1 class="header-title">Logs</h1></div>
        <div class="header-right">
            <a href="/" class="action-btn"><span class="btn-icon">🏠</span> <span class="btn-text">Home</span></a>
            <a href="/tools" class="action-btn"><span class="btn-icon">🧰</span> <span class="btn-text">Tools</span></a>
        </div>
    </header>
    <div class="container" style="padding: 0; width: calc(100% - 30px);">
        <ul class="log-list">${entries}</ul>
        ${logs.length === 0 ? `<div class="empty-logs">No logs found for today.</div>` : ''}
    </div>
    <div class="build-footer">deployed: <b>${time || "N/A"}</b> <a href="https://github.com/closur3/lol-stats-archive/commit/${sha}" target="_blank">@${shortSha}</a></div>
</body>
</html>`;
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        switch (url.pathname) {
            case "/backup": {
                const cache = await env.LOL_KV.get("CACHE_DATA", { type: "json" });
                if (!cache || !cache.globalStats) return new Response(JSON.stringify({ error: "No data" }), { status: 503 });
                const payload = {};
                for (const tourn of cache.runtimeConfig.TOURNAMENTS) if (cache.globalStats[tourn.slug]) payload[`markdown/${tourn.slug}.md`] = generateMarkdown(tourn, cache.globalStats[tourn.slug], cache.timeGrid);
                return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
            }

            case "/force": {
                const expectedSecret = env.ADMIN_SECRET;
                const authHeader = request.headers.get("Authorization");
                if (expectedSecret && (!authHeader || authHeader !== `Bearer ${expectedSecret}`)) return new Response("Unauthorized", { status: 401 });

                try {
                    const l = await runUpdate(env, true);
                    const oldLogs = await env.LOL_KV.get("logs", { type: "json" }) || [];
                    const newLogs = l.export();
                    let combinedLogs = [...newLogs, ...oldLogs];
                    if (combinedLogs.length > 100) combinedLogs = combinedLogs.slice(0, 100);
                    await env.LOL_KV.put("logs", JSON.stringify(combinedLogs));
                    
                    return new Response("OK", { status: 200 });
                } catch (e) {
                    return new Response(`Worker Error: ${e.message}`, { status: 500 });
                }
            }

            case "/refresh-ui": {
                if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
                const expectedSecret = env.ADMIN_SECRET;
                const authHeader = request.headers.get("Authorization");
                if (expectedSecret && (!authHeader || authHeader !== `Bearer ${expectedSecret}`)) return new Response("Unauthorized", { status: 401 });

                try {
                    const cache = await env.LOL_KV.get("CACHE_DATA", { type: "json" });
                    if (!cache || !cache.globalStats) return new Response("No cache data available. Run Refresh API first.", { status: 400 });

                    const homeFragment = renderContentOnly(
                        cache.globalStats, cache.timeGrid, cache.scheduleMap,
                        cache.runtimeConfig || { TOURNAMENTS: [] },
                        cache.updateTimestamps, false, cache.tournMeta || {} 
                    );
                    const fullPage = renderPageShell("LoL Insights", homeFragment, cache.statusText || "", "home");
                    await env.LOL_KV.put("HOME_STATIC_HTML", fullPage);

                    const archiveHTML = await generateArchiveStaticHTML(env, cache);
                    await env.LOL_KV.put("ARCHIVE_STATIC_HTML", archiveHTML);

                    return new Response("OK", { status: 200 });
                } catch (err) {
                    return new Response(`Render Error: ${err.message}`, { status: 500 });
                }
            }
            
            case "/rebuild-archive": {
                if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
                
                const expectedSecret = env.ADMIN_SECRET;
                const authHeader = request.headers.get("Authorization");
                if (expectedSecret && (!authHeader || authHeader !== `Bearer ${expectedSecret}`)) return new Response("Unauthorized", { status: 401 });

                let payload;
                try {
                    payload = await request.json();
                } catch (e) {
                    return new Response("Invalid JSON payload", { status: 400 });
                }

                if (!payload.slug || !payload.name || !payload.overview_page || !payload.league) {
                    return new Response("Missing required fields. Please provide slug, name, overview_page, and league.", { status: 400 });
                }

                try {
                    const l = await runCustomRebuild(env, payload);
                    const oldLogs = await env.LOL_KV.get("logs", { type: "json" }) || [];
                    const newLogs = l.export();
                    let combinedLogs = [...newLogs, ...oldLogs];
                    if (combinedLogs.length > 100) combinedLogs = combinedLogs.slice(0, 100);
                    await env.LOL_KV.put("logs", JSON.stringify(combinedLogs));
                    
                    return new Response("OK", { status: 200 });
                } catch (err) {
                    return new Response(err.message || "Internal Server Error", { status: 500 });
                }
            }

            case "/tools": {
                const time = env.GITHUB_TIME;
                const sha = env.GITHUB_SHA;
                return new Response(renderToolsPage(time, sha), { headers: { "content-type": "text/html;charset=utf-8" } });
            }

            case "/logs": {
                const logs = await env.LOL_KV.get("logs", { type: "json" }) || [];
                const time = env.GITHUB_TIME;
                const sha = env.GITHUB_SHA;
                return new Response(renderLogPage(logs, time, sha), { headers: { "content-type": "text/html;charset=utf-8" } });
            }
            
            case "/archive": {
                const html = await env.LOL_KV.get("ARCHIVE_STATIC_HTML");
                if (html) {
                    return new Response(html, { headers: { "content-type": "text/html;charset=utf-8" } });
                }
                return new Response("Archive initializing... Please <a href='/tools'>run a Local UI Refresh</a> or wait for the next background update.", { headers: { "content-type": "text/html" } });
            }

            case "/": {
                const html = await env.LOL_KV.get("HOME_STATIC_HTML");
                if (html) {
                    return new Response(html, { headers: { "content-type": "text/html;charset=utf-8" } });
                }
                return new Response("Initializing... Please wait for the first background update or <a href='/tools'>run a Refresh API</a>.", { headers: { "content-type": "text/html" } });
            }

            case "/favicon.ico":
                return new Response(null, { status: 204 });

            default: return new Response("404 Not Found", { status: 404 });
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
