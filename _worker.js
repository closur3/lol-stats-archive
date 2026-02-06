// ====================================================
// 🥇 Worker V38.5.3: 认证稳定版 (Auth Stable)
// 基于: V38.5.2 + Cookie Relay Fix
// 状态: 
// 1. Auth: ✅ 成功 (Cookie接力机制修复了Session超时)
// 2. Scheduler: ✅ 智能批次调度正常工作
// 3. UI: ✅ 全功能包含
// ====================================================

const UI_VERSION = "2026-02-05-V38.5.3-AuthStable";

// --- 1. 工具库 ---
const utils = {
    getNow: () => {
        const d = new Date();
        const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
        const bj = new Date(utc + (3600000 * 8));
        return {
            obj: bj,
            full: bj.toISOString().replace("T", " ").slice(0, 19),
            short: bj.toISOString().slice(5, 19).replace("T", " "), 
            date: bj.toISOString().slice(0, 10),
            time: bj.toISOString().slice(11, 16)
        };
    },
    fmtDate: (ts) => {
        if (!ts) return "(Pending)";
        const d = new Date(ts + 28800000); // UTC+8
        return d.toISOString().slice(5, 10) + " " + d.toISOString().slice(11, 16);
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
        return headerVal.split(',')
            .map(c => c.split(';')[0].trim())
            .filter(c => c.includes('='))
            .join('; ');
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

// --- 3. 认证逻辑 (V38.5.3: Cookie 接力修复版) ---
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
        // ==========================================
        // Step 1: 获取 Token (并捕获临时会话 Cookie)
        // ==========================================
        const tokenResp = await fetch(`${API}?action=query&meta=tokens&type=login&format=json`, {
            headers: { "User-Agent": UA }
        });
        
        if (!tokenResp.ok) throw new Error(`Token HTTP Error: ${tokenResp.status}`);

        const tokenData = await tokenResp.json();
        const loginToken = tokenData?.query?.tokens?.logintoken;

        if (!loginToken) throw new Error("Failed to get login token");

        // 关键修复：抓取第一步返回的临时 Session Cookie
        // 如果不带这个，第二步就会报 "Session timed out"
        const step1SetCookie = tokenResp.headers.get("set-cookie");
        const step1Cookie = utils.extractCookies(step1SetCookie);

        // ==========================================
        // Step 2: 发送登录请求 (带上 Token 和 Cookie)
        // ==========================================
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
                "Cookie": step1Cookie // <--- 必须带上第一步的 Cookie！
            }
        });

        const loginData = await loginResp.json();
        
        if (loginData.login && loginData.login.result === "Success") {
            // 登录成功，获取最终的长期 Cookie
            const step2SetCookie = loginResp.headers.get("set-cookie");
            const finalCookie = utils.extractCookies(step2SetCookie);
            
            logger.success(`🔐 Authenticated as ${loginData.login.lgusername}`);
            // 注意：有时候最终 Cookie 需要合并第一步的 Cookie，但在 MediaWiki 中，
            // 登录成功后的 Set-Cookie 通常包含了我们需要的所有新身份信息。
            return { cookie: finalCookie, ua: UA };
        } else {
            // 打印详细错误原因
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
        "User-Agent": authContext?.ua || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36" 
    };
    if (authContext?.cookie) {
        headers["Cookie"] = authContext.cookie;
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const r = await fetch(url, { headers });
            
            // 【关键点 1】先以文本形式获取全部返回内容
            const rawBody = await r.text();

            // 【关键点 2】检查 HTTP 状态码
            if (!r.ok) {
                // 如果状态码不是 2xx，直接抛出包含部分内容的错误
                throw new Error(`HTTP ${r.status}: ${rawBody.slice(0, 150)}...`);
            }

            // 【关键点 3】尝试解析 JSON
            let data;
            try {
                data = JSON.parse(rawBody);
            } catch (e) {
                // 如果解析失败，说明返回的可能不是 JSON (比如 HTML 报错页)
                throw new Error(`JSON Parse Fail. Content: ${rawBody.slice(0, 150)}...`);
            }

            // 【关键点 4】检查业务逻辑错误 (MediaWiki 规范)
            if (data.error) {
                // 如果 API 返回了具体的错误对象 (如 code, info)
                throw new Error(`API Error [${data.error.code}]: ${data.error.info}`);
            }

            if (!data.cargoquery) {
                // 如果结构不对，打印出整个 JSON 的缩略图
                throw new Error(`Structure Error: ${rawBody.slice(0, 150)}`);
            }

            return data.cargoquery; 

        } catch (e) {
            if (attempt === maxRetries) throw e; 
            
            // 随机等待 3~5 秒进行重试
            const waitTime = 30000 + Math.floor(Math.random() * 20000); 
            
            // 在日志中详细记录失败原因
            logger.error(`❌ Fetch Fail (Attempt ${attempt}): ${e.message}`);
            
            await new Promise(res => setTimeout(res, waitTime));
        }
    }
}

async function fetchAllMatches(overviewPage, logger, authContext) {
    let all = [];
    let offset = 0;
    const limit = 50;
    logger.info(`📡 Fetching: ${overviewPage}...`);
    
    while(true) {
        const params = new URLSearchParams({
            action: "cargoquery", format: "json", tables: "MatchSchedule",
            fields: "Team1,Team2,Team1Score,Team2Score,DateTime_UTC,OverviewPage,BestOf,N_MatchInPage,Tab,Round",
            where: `OverviewPage='${overviewPage}'`, limit: limit.toString(), offset: offset.toString(), order_by: "DateTime_UTC ASC", origin: "*"
        });
        
        try {
            const batchRaw = await fetchWithRetry(`https://lol.fandom.com/api.php?${params}`, logger, authContext);
            const batch = batchRaw.map(i => i.title);
            if (!batch.length) break;
            all = all.concat(batch);
            offset += batch.length;
            if (batch.length < limit) break;
            await new Promise(res => setTimeout(res, 500)); 
        } catch(e) {
            throw new Error(`Batch Fail at offset ${offset}: ${e.message}`);
        }
    }
    logger.success(`📦 Received: ${overviewPage} - Got ${all.length} matches.`);
    return all;
}

// --- 5. 统计核心 ---
function runFullAnalysis(allRawMatches, currentStreak, runtimeConfig) {
    const globalStats = {};
    const debugInfo = {};
    const timeGrid = { "LCK": { 16: {}, 18: {}, "Total": {} }, "LPL": { 15: {}, 17: {}, 19: {}, "Total": {} }, "ALL": {} };
    const initGrid = (t) => { for(let i=0; i<8; i++) t[i] = { total:0, full:0, matches:[] }; };
    Object.values(timeGrid.LCK).forEach(initGrid); Object.values(timeGrid.LPL).forEach(initGrid); initGrid(timeGrid.ALL);

    let maxDateTs = 0;
    let grandTotal = 0;
    
    const todayStr = utils.getNow().date;
    const allFutureMatches = {}; 
    let matchesTodayCount = 0;
    let pendingTodayCount = 0;

    runtimeConfig.TOURNAMENTS.forEach((tourn, tournIdx) => {
        const rawMatches = allRawMatches[tourn.slug] || [];
        const stats = {};
        let processed = 0, skipped = 0;
        
        const ensureTeam = (name) => { if(!stats[name]) stats[name] = { name, bo3_f:0, bo3_t:0, bo5_f:0, bo5_t:0, s_w:0, s_t:0, g_w:0, g_t:0, strk_w:0, strk_l:0, last:0, history:[] }; };

        rawMatches.forEach(m => {
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
                const bjTime = new Date(ts + 28800000);
                const matchDateStr = bjTime.toISOString().slice(0, 10);
                const matchTimeStr = bjTime.toISOString().slice(11, 16);
                
                const month = (bjTime.getUTCMonth()+1).toString().padStart(2,'0');
                const day = bjTime.getUTCDate().toString().padStart(2,'0');
                dateDisplay = `${month}-${day} ${matchTimeStr}`;

                if (matchDateStr >= todayStr) {
                    if (matchDateStr === todayStr) {
                        matchesTodayCount++;
                        if (!isFinished) pendingTodayCount++;
                    }
                    if (!allFutureMatches[matchDateStr]) allFutureMatches[matchDateStr] = [];
                    
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

                const bj = new Date(ts + 28800000);
                const dateShort = `${(bj.getUTCMonth()+1).toString().padStart(2,'0')}-${bj.getUTCDate().toString().padStart(2,'0')}`;
                const matchObj = { d: dateShort, t1: t1, t2: t2, s: `${s1}-${s2}`, f: isFull };
                const pyDay = bj.getUTCDay() === 0 ? 6 : bj.getUTCDay() - 1;
                const hour = bj.getUTCHours();
                let targetH = null;
                if(tourn.region === "LCK") targetH = (hour <= 16) ? 16 : 18;
                if(tourn.region === "LPL") targetH = (hour <= 15) ? 15 : (hour <= 17 ? 17 : 19);
                
                const add = (grid, h, d) => { if(grid[h] && grid[h][d]) { grid[h][d].total++; if(isFull) grid[h][d].full++; grid[h][d].matches.push(matchObj); } };
                if(targetH) { add(timeGrid[tourn.region], targetH, pyDay); add(timeGrid[tourn.region], "Total", pyDay); add(timeGrid[tourn.region], targetH, 7); add(timeGrid[tourn.region], "Total", 7); }
                timeGrid.ALL[pyDay].total++; if(isFull) timeGrid.ALL[pyDay].full++; timeGrid.ALL[pyDay].matches.push(matchObj);
                timeGrid.ALL[7].total++; if(isFull) timeGrid.ALL[7].full++; timeGrid.ALL[7].matches.push(matchObj);
            }
        });
        
        Object.values(stats).forEach(team => team.history.sort((a, b) => b.ts - a.ts));
        debugInfo[tourn.slug] = { raw: rawMatches.length, processed, skipped };
        globalStats[tourn.slug] = stats;
        grandTotal += processed;
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

    let statusText = `<span style="color:#9ca3af; margin-left:6px">💤 NO MATCHES</span>`;
    let nextStreak = 0; 
    if (matchesTodayCount > 0) {
        if (pendingTodayCount > 0) { statusText = `<span style="color:#10b981; margin-left:6px; font-weight:bold">● ONGOING</span>`; nextStreak = 0; }
        else { nextStreak = currentStreak >= 1 ? 2 : 1; statusText = nextStreak === 2 ? `<span style="color:#9ca3af; margin-left:6px; font-weight:bold">● FINISHED</span>` : `<span style="color:#f59e0b; margin-left:6px; font-weight:bold">🟡 VERIFYING...</span>`; }
    }

    return { globalStats, timeGrid, debugInfo, maxDateTs, grandTotal, statusText, scheduleMap, nextStreak };
}

// --- 6. Markdown 生成器 ---
function generateMarkdown(tourn, stats, timeGrid) {
    let md = `# ${tourn.title}\n\n`;
    md += `**Updated:** ${utils.getNow().full} (CST)\n\n---\n\n`;
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
        const last = s.last ? new Date(s.last+28800000).toISOString().slice(0,10) : "-";
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

// --- 7. HTML 渲染器 ---
const PYTHON_STYLE = `
    body { font-family: -apple-system, sans-serif; background: #f1f5f9; margin: 0; padding: 0; }
    .main-header { background: #fff; padding: 15px 25px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; margin-bottom: 25px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-logo { font-size: 1.8rem; }
    .header-title { margin: 0; font-size: 1.4rem; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
    .header-right { display: flex; gap: 10px; align-items: center; }
    .action-btn { background: #fff; border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; color: #475569; text-decoration: none; display: flex; align-items: center; gap: 5px; transition: 0.2s; }
    .action-btn:hover { background: #f8fafc; color: #0f172a; border-color: #94a3b8; }
    .update-btn { color: #2563eb; border-color: #bfdbfe; background: #eff6ff; }
    .update-btn:hover { background: #dbeafe; border-color: #93c5fd; }
    
    .container { max-width: 1400px; margin: 0 auto; padding: 0 15px 40px 15px; }
    .wrapper { width: 100%; overflow-x: auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-bottom: 25px; border: 1px solid #e2e8f0; }
    .wrapper::-webkit-scrollbar, .match-list::-webkit-scrollbar, .log-list::-webkit-scrollbar { display: none; }
    .wrapper, .match-list, .log-list { -ms-overflow-style: none; scrollbar-width: none; }

    .table-title { padding: 15px; font-weight: 700; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
    .table-title a { color: #2563eb; text-decoration: none; }
    table { width: 100%; min-width: 1000px; border-collapse: collapse; font-size: 14px; table-layout: fixed; }
    th { background: #f8fafc; padding: 14px 8px; font-weight: 600; color: #64748b; border-bottom: 2px solid #f1f5f9; cursor: pointer; transition: 0.2s; }
    th:hover { background: #eff6ff; color: #2563eb; }
    td { padding: 12px 8px; text-align: center; border-bottom: 1px solid #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    
    .team-col { position: sticky; left: 0; background: white !important; z-index: 10; border-right: 2px solid #f1f5f9; text-align: left; font-weight: 800; padding-left: 15px; width: 80px; transition: 0.2s; }
    .team-clickable { cursor: pointer; } 
    .team-clickable:hover { color: #2563eb; background-color: #eff6ff !important; }

    .col-bo3 { width: 70px; } .col-bo3-pct { width: 85px; } .col-bo5 { width: 70px; } .col-bo5-pct { width: 85px; }
    
    .col-bo3, .col-bo3-pct, .col-bo5, .col-bo5-pct, .col-series, .col-series-wr, .col-game, .col-game-wr,
    .col-streak, .col-last { 
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-variant-numeric: tabular-nums;
        letter-spacing: 0;
        font-weight: 700;
    }
    
    #time-stats td:not(.team-col) { 
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-variant-numeric: tabular-nums;
        letter-spacing: 0;
    }

    .spine-row { display: flex; justify-content: center; align-items: stretch; width: 100%; height: 100%; }
    
    .spine-l { flex: 1; flex-basis: 0; display: flex; align-items: center; justify-content: flex-end; padding: 0; font-weight: 800; transition: background 0.15s; }
    .spine-r { flex: 1; flex-basis: 0; display: flex; align-items: center; justify-content: flex-start; padding: 0; font-weight: 800; transition: background 0.15s; }
    .spine-sep { width: 12px; display: flex; align-items: center; justify-content: center; opacity: 0.6; font-weight: 700; font-size: 10px; }

    .sch-row .spine-l, .sch-row .spine-r { padding: 4px 5px; }

    .spine-l.clickable:hover, .spine-r.clickable:hover {
        background-color: #eff6ff; 
        color: #2563eb;            
        cursor: pointer;
    }
    
    .t-cell { display: flex; justify-content: center; align-items: center; gap: 6px; }
    .t-val { text-align: right; width: 35px; white-space: nowrap; } 
    .t-pct { text-align: left; width: 40px; opacity: 0.8; font-size: 11px; white-space: nowrap; } 

    .col-series { width: 80px; } .col-series-wr { width: 100px; } .col-game { width: 80px; } .col-game-wr { width: 100px; }
    .col-streak { width: 80px; } .col-last { width: 130px; }
    .badge { color: white; border-radius: 4px; padding: 3px 7px; font-size: 11px; font-weight: 700; }
    .footer { text-align: center; font-size: 12px; color: #94a3b8; margin: 40px 0; }
    
    /* Grid Layout */
    .sch-container { 
        display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-top: 40px; width: 100%; 
        align-items: start;
    }
    .sch-card { background: #fff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; overflow: hidden; display: flex; flex-direction: column; }
    .sch-header { padding: 12px 15px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #334155; display:flex; justify-content:space-between; }
    
    .sch-body { display: flex; flex-direction: column; flex: 1; padding-bottom: 0; }
    
    /* TAB */
    .sch-group-header { 
        border-bottom: 1px solid #e2e8f0; border-top: 1px solid #e2e8f0;
        padding: 4px 0; color: #475569; font-size: 11px; letter-spacing: 0.5px;
    }
    .sch-group-header .spine-l { justify-content: flex-end; padding-right: 2px; }
    .sch-group-header .spine-r { justify-content: flex-start; padding-left: 2px; opacity: 0.7; }
    .sch-group-header:first-child { border-top: none; }
    
    /* Match Row */
    .sch-row { 
        display: flex; align-items: stretch;
        padding: 0; 
        border-bottom: 1px solid #f8fafc; font-size: 13px; color: #334155;
        min-height: 36px;
        flex: 0 0 auto;
    }
    .sch-row:last-child { border-bottom: none; }
    
    .sch-time { width: 60px; color: #94a3b8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 700; display:flex; align-items:center; justify-content:center; box-sizing:border-box; font-variant-numeric: tabular-nums; } 
    .sch-tag-col { width: 60px; display: flex; align-items:center; justify-content: center; padding-right:0px; box-sizing:border-box; }
    .sch-vs-container { flex: 1; display: flex; align-items: stretch; justify-content: center; }

    .sch-pill { padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; background: #f1f5f9; color: #64748b; }
    .sch-pill.gold { background: #f2d49c; color: #9c5326; }
    
    .sch-live-score { color: #10b981; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums; }
    .sch-fin-score { color: #334155; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums; }
    
    .sch-empty { margin-top: 40px; text-align: center; color: #94a3b8; background: #fff; padding: 30px; border-radius: 12px; border: 1px solid #e2e8f0; font-weight: 700; letter-spacing: 0.5px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }

    @media (max-width: 1100px) { .sch-container { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 600px) { .sch-container { grid-template-columns: 1fr; } .btn-text { display: none; } .action-btn { padding: 6px 10px; } }
    
    .modal { display: none; position: fixed; z-index: 99; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.4); backdrop-filter: blur(2px); }
    .modal-content { background-color: #fefefe; margin: 12% auto; padding: 25px; border: 1px solid #888; width: 420px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.25); animation: fadeIn 0.2s; }
    .close { color: #aaa; float: right; font-size: 28px; font-weight: bold; cursor: pointer; }
    .match-list { margin-top: 20px; max-height: 400px; overflow-y: auto; }
    
    .match-item { display: grid; align-items: center; border-bottom: 1px solid #f1f5f9; padding: 10px 1px; font-size: 14px; gap: 0; }
    .match-item.history-layout { grid-template-columns: 95px auto 1fr 20px 1fr 60px; }
    .match-item.dist-layout { grid-template-columns: 48px 1fr 24px 1fr 70px; }

    .col-date { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 13px; color: #94a3b8; text-align: left; font-variant-numeric: tabular-nums; }
    .col-res { font-weight: 900; font-size: 16px; text-align: center; line-height: 1; }
    .col-t1 { text-align: right; font-weight: 800; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 5px; min-width: 0; }
    .col-vs { text-align: center; color: #94a3b8; font-size: 10px; }
    .col-t2 { text-align: left; font-weight: 800; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-left: 5px; min-width: 0; }
    .col-score { text-align: right; white-space: nowrap; display: flex; justify-content: flex-end; align-items: center; }

    .hist-win { color: #10b981; } .hist-loss { color: #f43f5e; }
    .hist-score { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-weight: 700; font-size: 16px; color: #0f172a; font-variant-numeric: tabular-nums; }
    .hist-full { color: #f59e0b; font-size: 10px; border: 1px solid #f59e0b; padding: 1px 4px; border-radius: 4px; font-weight: 700; margin-right: 8px; }
    .hist-icon { font-size: 16px; }
    
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
`;

const PYTHON_JS = `
    <script>
    const COL_TEAM=0, COL_BO3=1, COL_BO3_PCT=2, COL_BO5=3, COL_BO5_PCT=4, COL_SERIES=5, COL_SERIES_WR=6, COL_GAME=7, COL_GAME_WR=8, COL_STREAK=9, COL_LAST_DATE=10;
    
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

    function renderMatchItem(mode, date, resTag, team1, team2, isFull, score) {
        const fullTag = isFull ? '<span class="hist-full">FULL</span>' : '';
        const scoreStyle = isFull ? 'color:#ef4444' : '';
        const layoutClass = mode === 'history' ? 'history-layout' : 'dist-layout';
        const resHtml = mode === 'history' ? \`<span class="col-res">\${resTag}</span>\` : '';
        
        return \`<div class="match-item \${layoutClass}">
            <span class="col-date">\${date}</span>
            \${resHtml}
            <span class="col-t1">\${team1}</span>
            <span class="col-vs">vs</span>
            <span class="col-t2">\${team2}</span>
            <div class="col-score">
                \${fullTag}
                <span class="hist-score" style="\${scoreStyle}">\${score}</span>
            </div>
        </div>\`;
    }

    function showPopup(t,d,m){
        const ds=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday","Total"];
        document.getElementById('modalTitle').innerText=t+" - "+ds[d];
        const sortedMatches = [...m].sort((a, b) => b.d.localeCompare(a.d));
        const listHtml = sortedMatches.map(item => renderMatchItem('dist', item.d, '', item.t1, item.t2, item.f, item.s));
        renderListHTML(listHtml);
        document.getElementById('matchModal').style.display="block";
    }

    function openTeam(slug, teamName) {
        if (!window.g_stats || !window.g_stats[slug] || !window.g_stats[slug][teamName]) return;
        const data = window.g_stats[slug][teamName];
        const history = data.history || [];
        document.getElementById('modalTitle').innerText = teamName + " - Schedule";
        
        const resMap = {
            'W': { t: '✅', c: '' },
            'L': { t: '❌', c: '' },
            'LIV': { t: '🔵', c: '' },
            'N': { t: '🕒', c: '' }
        };

        const listHtml = history.map(h => {
            const map = resMap[h.res] || resMap['N'];
            const resTag = \`<span class="\${(h.res === 'W' || h.res === 'L') ? '' : 'hist-icon'}">\${map.t}</span>\`;
            return renderMatchItem('history', h.d, resTag, teamName, h.vs, h.full, h.s);
        });
        renderListHTML(listHtml);
        document.getElementById('matchModal').style.display="block";
    }

    function renderListHTML(htmlArr) {
        const l=document.getElementById('modalList');
        if(!htmlArr || htmlArr.length===0) l.innerHTML="<div style='text-align:center;color:#999;padding:20px'>No matches found</div>";
        else l.innerHTML = htmlArr.join("");
    }

    function closePopup(){document.getElementById('matchModal').style.display="none";}
    window.onclick=function(e){if(e.target==document.getElementById('matchModal'))closePopup();}
    </script>
`;

function renderFullHtml(globalStats, timeData, updateTime, debugInfo, maxDateTs, statusText, scheduleMap, runtimeConfig, updateTimestamps) {
    if (!statusText) statusText = `<span style="color:#9ca3af; margin-left:6px">Status Unknown</span>`;
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
            const last = s.last ? new Date(s.last+28800000).toISOString().slice(2,16).replace("T"," ") : "-";
            const lastColor = utils.colorDate(s.last, minTs, maxTsLocal);
            const emptyBg = '#f1f5f9', emptyCol = '#cbd5e1';
            
            return `<tr><td class="team-col team-clickable" onclick="openTeam('${t.slug}', '${s.name}')">${s.name}</td>
                <td class="col-bo3" style="background:${s.bo3_t===0?emptyBg:'transparent'};color:${s.bo3_t===0?emptyCol:'inherit'}">${bo3Txt}</td>
                <td class="col-bo3-pct" style="background:${utils.color(bo3R,true)};color:${bo3R!==null?'white':emptyCol};font-weight:bold">${utils.pct(bo3R)}</td>
                <td class="col-bo5" style="background:${s.bo5_t===0?emptyBg:'transparent'};color:${s.bo5_t===0?emptyCol:'inherit'}">${bo5Txt}</td>
                <td class="col-bo5-pct" style="background:${utils.color(bo5R,true)};color:${bo5R!==null?'white':emptyCol};font-weight:bold">${utils.pct(bo5R)}</td>
                <td class="col-series" style="background:${s.s_t===0?emptyBg:'transparent'};color:${s.s_t===0?emptyCol:'inherit'}">${serTxt}</td>
                <td class="col-series-wr" style="background:${utils.color(winR)};color:${winR!==null?'white':emptyCol};font-weight:bold">${utils.pct(winR)}</td>
                <td class="col-game" style="background:${s.g_t===0?emptyBg:'transparent'};color:${s.g_t===0?emptyCol:'inherit'}">${gamTxt}</td>
                <td class="col-game-wr" style="background:${utils.color(gameR)};color:${gameR!==null?'white':emptyCol};font-weight:bold">${utils.pct(gameR)}</td>
                <td class="col-streak" style="background:${s.strk_w===0&&s.strk_l===0?emptyBg:'transparent'};color:${s.strk_w===0&&s.strk_l===0?emptyCol:'inherit'}">${strk}</td>
                <td class="col-last" style="background:${!s.last?emptyBg:'transparent'};color:${!s.last?emptyCol:lastColor};font-weight:700">${last}</td></tr>`;
        }).join("");
        tablesHtml += `<div class="wrapper"><div class="table-title"><a href="https://lol.fandom.com/wiki/${t.overview_page}" target="_blank">${t.title}</a> ${debugLabel}</div><table id="${tableId}"><thead><tr><th class="team-col" onclick="doSort(0, '${tableId}')">TEAM</th><th colspan="2" onclick="doSort(2, '${tableId}')">BO3 FULLRATE</th><th colspan="2" onclick="doSort(4, '${tableId}')">BO5 FULLRATE</th><th colspan="2" onclick="doSort(6, '${tableId}')">SERIES</th><th colspan="2" onclick="doSort(8, '${tableId}')">GAMES</th><th class="col-streak" onclick="doSort(9, '${tableId}')">STREAK</th><th class="col-last" onclick="doSort(10, '${tableId}')">LAST DATE</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    });

    let timeHtml = `<div class="wrapper" style="margin-top: 40px;"><div class="table-title">📅 Full Series Distribution</div><table id="time-stats"><thead><tr><th class="team-col">Time Slot</th>`;
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Total"].forEach(d => timeHtml += `<th>${d}</th>`);
    timeHtml += "</tr></thead><tbody>";
    const renderRow = (region, h, label) => {
        const isTotal = h === "Total";
        let tr = `<tr style="${isTotal?'font-weight:bold; background:#f8fafc;':''}"><td class="team-col" style="${isTotal?'background:#f1f5f9;':''}">${label}</td>`;
        for(let w=0; w<8; w++) {
            const c = (region==="ALL") ? timeData.ALL[w] : timeData[region][h][w];
            if(c.total===0) tr += "<td style='background:#f1f5f9; color:#cbd5e1'>-</td>";
            else {
                const r = c.full/c.total;
                const matches = JSON.stringify(c.matches).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
                tr += `<td style='background:${utils.color(r,true)}; color:white; font-weight:bold; cursor:pointer;' onclick='showPopup("${label}", ${w}, ${matches})'>
                    <div class="t-cell">
                        <span class="t-val">${c.full}/${c.total}</span>
                        <span class="t-pct">(${Math.round(r*100)}%)</span>
                    </div>
                </td>`;
            }
        }
        return tr + "</tr>";
    };
    [["LCK",16,"LCK 16:00"],["LCK",18,"LCK 18:00"],["LCK","Total","LCK Total"],["LPL",15,"LPL 15:00"],["LPL",17,"LPL 17:00"],["LPL",19,"LPL 19:00"],["LPL","Total","LPL Total"]].forEach(r => timeHtml += renderRow(r[0], r[1], r[2]));
    timeHtml += `<tr style='border-top: 2px solid #cbd5e1; font-weight:700'><td class='team-col'>GRAND</td>`;
    for(let w=0; w<8; w++) {
        const c = timeData.ALL[w];
        if(c.total===0) timeHtml += "<td style='background:#f1f5f9; color:#cbd5e1'>-</td>";
        else {
            const r = c.full/c.total;
            const matches = JSON.stringify(c.matches).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
            timeHtml += `<td style='background:${utils.color(r,true)}; color:white; cursor:pointer;' onclick='showPopup("GRAND", ${w}, ${matches})'>
                <div class="t-cell">
                    <span class="t-val">${c.full}/${c.total}</span>
                    <span class="t-pct">(${Math.round(r*100)}%)</span>
                </div>
            </td>`;
        }
    }
    timeHtml += "</tr></tbody></table></div>";

    let scheduleHtml = "";
    const dates = Object.keys(scheduleMap).sort();
    
    if (dates.length === 0) {
        scheduleHtml = `<div class="sch-empty">💤 NO FUTURE MATCHES SCHEDULED</div>`;
    } else {
        scheduleHtml = `<div class="sch-container">`;

        dates.forEach(d => {
            const matches = scheduleMap[d];
            const titleColor = "#334155";
            const titleBg = "#f8fafc";
            
            // 计算星期几
            const dateObj = new Date(d + "T00:00:00Z");
            const dayOfWeek = dateObj.getUTCDay();
            const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            const dayName = dayNames[dayOfWeek];
            
            const titleText = `📅 ${d.slice(5)} ${dayName}`;
            
            let cardHtml = `<div class="sch-card"><div class="sch-header" style="background:${titleBg};color:${titleColor}"><span>${titleText}</span><span style="font-size:11px;opacity:0.6">${matches.length} Matches</span></div><div class="sch-body">`;
            
            let lastGroupKey = "";

            matches.forEach(m => {
                const blockName = m.blockName ? m.blockName : "";
                const groupKey = `${m.tourn}_${blockName}`;

                if (groupKey !== lastGroupKey) {
                    const blockDisplay = blockName || "REGULAR"; 
                    cardHtml += `<div class="sch-group-header" style="background:${titleBg}">
                        <div class="spine-row" style="width:100%; padding:0 10px; box-sizing:border-box">
                            <span class="spine-l" style="font-weight:800">${m.tourn}</span>
                            <span class="spine-sep">/</span>
                            <span class="spine-r" style="font-weight:800; opacity:0.7">${blockDisplay}</span>
                        </div>
                    </div>`;
                    lastGroupKey = groupKey;
                }

                const boLabel = m.bo ? `BO${m.bo}` : '';
                const isBo5 = m.bo === 5;
                const boClass = isBo5 ? "sch-pill gold" : "sch-pill"; 
                
                const isTbd1 = m.t1 === "TBD";
                const isTbd2 = m.t2 === "TBD";
                const t1Click = isTbd1 ? "" : `onclick="openTeam('${m.tournSlug}', '${m.t1}')"`;
                const t2Click = isTbd2 ? "" : `onclick="openTeam('${m.tournSlug}', '${m.t2}')"`;
                
                const t1Class = isTbd1 ? "spine-l" : "spine-l clickable";
                const t2Class = isTbd2 ? "spine-r" : "spine-r clickable";

                const r1 = getRateHtml(m.t1, m.tournSlug, m.bo);
                const r2 = getRateHtml(m.t2, m.tournSlug, m.bo);

                let midContent = `<span style="color:#cbd5e1;font-size:10px;margin:0 2px">vs</span>`;
                if (m.is_finished) {
                    const s1Style = m.s1 > m.s2 ? "color:#0f172a" : "color:#94a3b8";
                    const s2Style = m.s2 > m.s1 ? "color:#0f172a" : "color:#94a3b8";
                    midContent = `<span class="sch-fin-score"><span style="${s1Style}">${m.s1}</span><span style="margin: 0 1px;">-</span><span style="${s2Style}">${m.s2}</span></span>`;
                } else if (m.is_live) {
                    midContent = `<span class="sch-live-score">${m.s1}<span style="margin: 0 1px;">-</span>${m.s2}</span>`;
                }

                const vsContent = `
                    <div class="spine-row">
                        <span class="${t1Class}" ${t1Click} style="${isTbd1?'color:#9ca3af':''}">${r1}${m.t1}</span>
                        <span class="spine-sep" style="display:flex;justify-content:center;align-items:center;width:40px">${midContent}</span>
                        <span class="${t2Class}" ${t2Click} style="${isTbd2?'color:#9ca3af':''}">${m.t2}${r2}</span>
                    </div>
                `;

                cardHtml += `<div class="sch-row">
                    <span class="sch-time">${m.time}</span>
                    <div class="sch-vs-container">${vsContent}</div>
                    <div class="sch-tag-col"><span class="${boClass}">${boLabel}</span></div>
                </div>`;
            });

            cardHtml += `</div></div>`; 
            scheduleHtml += cardHtml;
        });
        scheduleHtml += `</div>`;
    }

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>LoL Insights</title><style>${PYTHON_STYLE}</style>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text x='50' y='.9em' font-size='85' text-anchor='middle'>🥇</text></svg>">
    </head>
    <body data-ui-version="${UI_VERSION}">
    <header class="main-header"><div class="header-left"><span class="header-logo">🥇</span><h1 class="header-title">LoL Insights</h1></div>
    <div class="header-right">
        <form action="/force" method="POST" style="margin:0"><button class="action-btn update-btn"><span class="btn-icon">⚡</span> <span class="btn-text">Update</span></button></form>
        <a href="/logs" class="action-btn"><span class="btn-icon">📜</span> <span class="btn-text">Logs</span></a>
    </div></header>
    <div class="container">${tablesHtml} ${timeHtml} ${scheduleHtml} <div class="footer">${statusText}</div></div>
    <div id="matchModal" class="modal"><div class="modal-content"><span class="close" onclick="closePopup()">&times;</span><h3 id="modalTitle">Match History</h3><div id="modalList" class="match-list"></div></div></div>
    ${injectedData}
    ${PYTHON_JS}</body></html>`;
}

// --- 8. 主控 (Rich Logging + Batch Scheduler + Auth) ---
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
    const UPDATE_THRESHOLD = 8 * 60 * 1000; 
    const UPDATE_ROUNDS = 2; // 确保分批次逻辑存在

    // 1. 读取基础缓存
    let cache = await env.LOL_KV.get("CACHE_DATA", {type:"json"});
    const meta = await env.LOL_KV.get("META", {type:"json"}) || { finish_streak: 0 };
    const today = utils.getNow().date;

    // 2. 智能早退 (完赛逻辑)
    if (!force) {
        if (cache && cache.updateTime.date === today && meta.finish_streak >= 2) {
            l.success("💤 Sleep Mode: All matches finished (Streak 2+). Standing by."); 
            return l;
        }
    }

    // 3. 认证 (NEW - 依赖环境变量)
    const authContext = await loginToFandom(env, l);
    if (!authContext) {
        l.info("⚠️ Authentication skipped/failed. Proceeding anonymously.");
    } else {
        l.success("✅ Authenticated. Ready to fetch.");
    }

    let runtimeConfig = null;

    // 4. 加载配置
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

    // 5. 核心调度 (恢复 V38.4.0 的完整逻辑)
    const candidates = [];
    const cooldowns = [];

    runtimeConfig.TOURNAMENTS.forEach(t => {
        const lastTs = cache.updateTimestamps[t.slug] || 0;
        const elapsed = NOW - lastTs;
        const elapsedMins = Math.floor(elapsed / 60000);
        
        if (force || elapsed >= UPDATE_THRESHOLD) {
            candidates.push({ slug: t.slug, overview_page: t.overview_page, elapsed: elapsed, label: `${t.slug}(${elapsedMins}m ago)` });
        } else {
            const waitMins = Math.ceil((UPDATE_THRESHOLD - elapsed) / 60000);
            cooldowns.push(`${t.slug}(-${waitMins}m)`);
        }
    });

    l.info(`🔍 Scan: ${candidates.length} Candidates, ${cooldowns.length} Cooldown.`);
    if (cooldowns.length > 0) l.info(`❄️ Cooldown: [ ${cooldowns.join(', ')} ]`);

    if (candidates.length === 0) return l;

    // 排序: 饥饿时间降序
    candidates.sort((a, b) => b.elapsed - a.elapsed);

    // 计算批次
    const totalLeagues = runtimeConfig.TOURNAMENTS.length;
    const batchSize = Math.ceil(totalLeagues / UPDATE_ROUNDS);
    
    // 切片
    const batch = candidates.slice(0, batchSize);
    const queue = candidates.slice(batchSize);
    
    l.info(`✅ Batch (${batch.length}): [ ${batch.map(b=>b.label).join(', ')} ] -> GO!`);
    if (queue.length > 0) {
        l.info(`⏳ Queue (${queue.length}): [ ${queue.map(q=>q.label).join(', ')} ] -> Wait next run.`);
    }

    // 6. 并发执行 (传递 authContext)
    const updatePromises = batch.map(c => 
        fetchAllMatches(c.overview_page, l, authContext)
            .then(data => ({ status: 'fulfilled', slug: c.slug, data: data }))
            .catch(err => ({ status: 'rejected', slug: c.slug, err: err }))
    );

    const results = await Promise.all(updatePromises);

    // 7. 合并数据
    let successCount = 0;
    results.forEach(res => {
        if (res.status === 'fulfilled') {
            cache.rawMatches[res.slug] = res.data;
            cache.updateTimestamps[res.slug] = NOW;
            successCount++;
        } else {
            l.error(`⚠️ Failed ${res.slug}: ${res.err.message}`);
        }
    });

    // 8. 全量分析
    let oldMeta = await env.LOL_KV.get("META", {type:"json"}) || { total: 0, finish_streak: 0 };
    const analysis = runFullAnalysis(cache.rawMatches, oldMeta.finish_streak, runtimeConfig);

    if (oldMeta.total > 0 && analysis.grandTotal < oldMeta.total * 0.9 && !force) {
        l.error(`🛑 Rollback detected. Aborting save.`);
        return l;
    }

    // 9. 保存结果
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

    await env.LOL_KV.put("META", JSON.stringify({ total: analysis.grandTotal, finish_streak: analysis.nextStreak }));
    
    l.success(`🎉 Sync Complete. Updated: ${successCount}, Batched: ${batch.length}, Total Parsed: ${analysis.grandTotal}`);
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

        // 🚦 路由指挥中心
        switch (url.pathname) {

            //Case 1: 归档接口 (API)
            case "/archive": {
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

            // Case 2: 强制更新 (Trigger)
            case "/force": {
                const l = await runUpdate(env, true);
                const oldLogs = await env.LOL_KV.get("logs", { type: "json" }) || [];
                const newLogs = l.export();
                let combinedLogs = [...newLogs, ...oldLogs];
                if (combinedLogs.length > 100) combinedLogs = combinedLogs.slice(0, 100);
                await env.LOL_KV.put("logs", JSON.stringify(combinedLogs));
                return Response.redirect(url.origin + "/logs", 303);
            }

            // Case 3: 查看日志 (Log Viewer)
            case "/logs": {
                const logs = await env.LOL_KV.get("logs", { type: "json" }) || [];
                return new Response(renderLogPage(logs), { headers: { "content-type": "text/html;charset=utf-8" } });
            }

            // Case 4: 主页 (Dashboard) - 只有访问根路径 "/" 才会触发渲染
            case "/": {
                const cache = await env.LOL_KV.get("CACHE_DATA", { type: "json" });
                if (!cache) {
                    return new Response("Initializing... <a href='/force'>Click to Build</a>", { headers: { "content-type": "text/html" } });
                }

                const html = renderFullHtml(
                    cache.globalStats,
                    cache.timeGrid,
                    cache.updateTime,
                    cache.debugInfo,
                    cache.maxDateTs,
                    cache.statusText,
                    cache.scheduleMap,
                    cache.runtimeConfig || { TOURNAMENTS: [] },
                    cache.updateTimestamps
                );

                return new Response(html, { headers: { "content-type": "text/html;charset=utf-8" } });
            }

            // Case 5: 浏览器图标 (防止控制台爆红)
            case "/favicon.ico":
                return new Response(null, { status: 204 });

            // 🛑 默认分支：所有未定义的路径统统 404
            default:
                return new Response("404 Not Found - Wrong Turn, Summoner!", { status: 404 });
        }
    },

    // 定时任务逻辑保持不变 (它不走 fetch 路由)
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
