const BOT_UA = `LoLStatsWorker/2026 (User:HsuX)`;
const GITHUB_COMMIT_BASE = "https://github.com/closur3/lol-stats-archive/commit/";

// --- 1. 工具库 (Global UTC+8 Core) ---
const CST_OFFSET = 8 * 60 * 60 * 1000; 

const getHomeKey = (slug) => `HOME_${slug}`;

const isFlatTeamMap = (obj) => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
    const keys = Object.keys(obj);
    if (keys.length === 0) return false;
    return typeof obj[keys[0]] === "string";
};

const filterTeamMapForMatches = (baseMap, rawMatches = []) => {
    if (!baseMap || typeof baseMap !== "object") return {};
    const rawNames = new Set();
    rawMatches.forEach(m => {
        const t1 = m.Team1 || m["Team 1"];
        const t2 = m.Team2 || m["Team 2"];
        if (t1) rawNames.add(t1);
        if (t2) rawNames.add(t2);
    });
    if (rawNames.size === 0) return {};

    const entries = Object.entries(baseMap).map(([k, v]) => ({ k, v, ku: String(k).toUpperCase() }));
    const needed = {};

    const pickKeyForRaw = (rawUpper) => {
        let match = entries.find(e => rawUpper === e.ku);
        if (!match) match = entries.find(e => rawUpper.includes(e.ku));
        if (!match) {
            const inputTokens = rawUpper.split(/\s+/);
            match = entries.find(e => {
                const keyTokens = e.ku.split(/\s+/);
                return inputTokens.every(t => keyTokens.includes(t));
            });
        }
        return match ? match.k : null;
    };

    rawNames.forEach(raw => {
        const key = pickKeyForRaw(String(raw).toUpperCase());
        if (key && baseMap[key] != null) needed[key] = baseMap[key];
    });

    return needed;
};

const pickTeamMap = (teamsRaw, tourn, rawMatches) => {
    if (!teamsRaw || typeof teamsRaw !== "object") return {};
    let base = {};
    if (teamsRaw.by_slug && teamsRaw.by_slug[tourn.slug]) base = teamsRaw.by_slug[tourn.slug];
    else if (teamsRaw.by_league && teamsRaw.by_league[tourn.league]) base = teamsRaw.by_league[tourn.league];
    else if (teamsRaw[tourn.slug] && typeof teamsRaw[tourn.slug] === "object") base = teamsRaw[tourn.slug];
    else if (teamsRaw[tourn.league] && typeof teamsRaw[tourn.league] === "object") base = teamsRaw[tourn.league];
    else if (isFlatTeamMap(teamsRaw)) base = teamsRaw;
    return filterTeamMapForMatches(base, rawMatches);
};


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
            fields: "MatchId,Team1,Team2,Team1Score,Team2Score,DateTime_UTC,OverviewPage,BestOf,N_MatchInPage,Tab,Round",
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
    const tournMeta = {}; 
    
    const timeGrid = { "ALL": {} };
    const createSlot = () => { const t = {}; for(let i=0; i<8; i++) t[i] = { total:0, full:0, matches:[] }; return t; };
    timeGrid.ALL = createSlot(); 

    const todayStr = utils.getNow().date;
    const allFutureMatches = {}; 

    const buildResolveName = (teamMap = {}) => {
        const teamMapEntries = Object.entries(teamMap || {}).map(([k, v]) => ({ k: k.toUpperCase(), v }));
        const nameCache = new Map();
        return (raw) => {
            if (!raw) return "Unknown";
            if (nameCache.has(raw)) return nameCache.get(raw);
            let res = raw;
            const upper = raw.toUpperCase();
            if (upper.includes("TBD") || upper.includes("TBA") || upper.includes("TO BE DETERMINED")) {
                res = "TBD";
            } else {
                let match = teamMapEntries.find(e => upper === e.k);
                if (!match) match = teamMapEntries.find(e => upper.includes(e.k));
                if (!match) {
                    const inputTokens = upper.split(/\s+/);
                    match = teamMapEntries.find(e => {
                        const keyTokens = e.k.split(/\s+/);
                        return inputTokens.every(t => keyTokens.includes(t));
                    });
                }
                if (match) res = match.v;
            }
            nameCache.set(raw, res);
            return res;
        };
    };

    (runtimeConfig.TOURNAMENTS || []).forEach((tourn, tournIdx) => {
        const rawMatches = allRawMatches[tourn.slug] || [];
        const resolveName = buildResolveName(tourn.team_map);
        const stats = {};
        // processed/skipped removed (unused)
        let matchesToday = 0, pendingToday = 0;
        let earliestPendingTs = Infinity;
        let nextUpcomingTs = Infinity;
        const nowTs = Date.now();
        let hasLiveMatch = false;
        
        const ensureTeam = (name) => { if(!stats[name]) stats[name] = { name, bo3_f:0, bo3_t:0, bo5_f:0, bo5_t:0, s_w:0, s_t:0, g_w:0, g_t:0, strk_w:0, strk_l:0, last:0, history:[] }; };

        rawMatches.forEach(m => {
            const t1 = resolveName(m.Team1 || m["Team 1"]);
            const t2 = resolveName(m.Team2 || m["Team 2"]);
            if(!t1 || !t2) { return; } 
            
            ensureTeam(t1); ensureTeam(t2);

            const s1 = parseInt(m.Team1Score)||0, s2 = parseInt(m.Team2Score)||0;
            const bo = parseInt(m.BestOf)||3;
            const isFinished = Math.max(s1, s2) >= Math.ceil(bo/2);
            const isLive = !isFinished && (s1 > 0 || s2 > 0 || (m.Team1Score !== "" && m.Team1Score != null));
            if (isLive) hasLiveMatch = true;
            const isFull = (bo===3 && Math.min(s1,s2)===1) || (bo===5 && Math.min(s1,s2)===2);
            
            const dt = utils.parseDate(m.DateTime_UTC || m["DateTime UTC"]);
            let dateDisplay = "-", ts = 0;

            if (dt) {
                ts = dt.getTime();
                const p = utils.timeParts(ts);
                const matchDateStr = `${p.y}-${p.mo}-${p.da}`;
                const matchTimeStr = `${p.h}:${p.m}`;
                dateDisplay = `${p.mo}-${p.da} ${matchTimeStr}`;

                const isCrossDayLive = !isFinished && isLive && matchDateStr < todayStr;

                if (matchDateStr >= todayStr || isCrossDayLive) {
                    if (matchDateStr === todayStr || isCrossDayLive) {
                        matchesToday++;
                        if (!isFinished) {
                            pendingToday++;
                            if (ts < earliestPendingTs) earliestPendingTs = ts;
                        }
                    }

                    const bucketDate = matchDateStr;
                    if (!allFutureMatches[bucketDate]) allFutureMatches[bucketDate] = [];
                    
                    const tabName = m.Tab || "";

                    allFutureMatches[bucketDate].push({
                        time: matchTimeStr, t1: t1, t2: t2, s1: s1, s2: s2, bo: bo,
                        is_finished: isFinished, is_live: isLive, 
                        league: tourn.league, slug: tourn.slug,
                        tournIndex: tournIdx, tabName: tabName || ""  
                    });
                }

                if (!isFinished && ts >= nowTs) {
                    if (ts < nextUpcomingTs) nextUpcomingTs = ts;
                }

                if (isFinished) {
                    if(ts > stats[t1].last) stats[t1].last = ts;
                    if(ts > stats[t2].last) stats[t2].last = ts;

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

            if(!isFinished) { return; }
            const winner = s1 > s2 ? t1 : t2, loser = s1 > s2 ? t2 : t1;
            [t1,t2].forEach(tm => { stats[tm].s_t++; stats[tm].g_t += (s1+s2); });
            stats[winner].s_w++; stats[t1].g_w += s1; stats[t2].g_w += s2;
            if(bo===3) { stats[t1].bo3_t++; stats[t2].bo3_t++; if(isFull){stats[t1].bo3_f++; stats[t2].bo3_f++;} }
            else if(bo===5) { stats[t1].bo5_t++; stats[t2].bo5_t++; if(isFull){stats[t1].bo5_f++; stats[t2].bo5_f++;} }

            if(stats[winner].strk_l > 0) { stats[winner].strk_l=0; stats[winner].strk_w=1; } else stats[winner].strk_w++;
            if(stats[loser].strk_w > 0) { stats[loser].strk_w=0; stats[loser].strk_l=1; } else stats[loser].strk_l++;
        });
        
        Object.values(stats).forEach(team => team.history.sort((a, b) => b.ts - a.ts));
        globalStats[tourn.slug] = stats;
        // counters removed

        const prevT = prevTournMeta[tourn.slug] || { mode: "fast" };
        let nextMode = "fast";
        const startTs = earliestPendingTs !== Infinity ? earliestPendingTs : 0;
        const isStarted = startTs > 0 && nowTs >= startTs;

        const hasNearMatch = nextUpcomingTs !== Infinity && (nextUpcomingTs - nowTs) <= (3 * 60 * 60 * 1000);

        if (failedSlugs.has(tourn.slug)) {
            nextMode = prevT.mode || "fast";
        } else if (hasLiveMatch) {
            nextMode = "fast";
        } else if ((matchesToday > 0 && pendingToday > 0) || hasNearMatch) { 
            if (matchesToday > 0 && pendingToday > 0) {
                nextMode = (hasNearMatch || isStarted) ? "fast" : "slow";
            } else {
                // Upcoming match within 3 hours: keep fast even across days
                nextMode = "fast";
            }
        } else { 
            nextMode = "fast"; 
        }
        
        // 赋予每个联赛专属的 Emoji 状态
        let emoji = "";
        if (matchesToday === 0) {
            emoji = "💤";
        } else if (nextMode === "fast") {
            emoji = "🎮";
        } else if (nextMode === "slow") {
            emoji = "⏳";
        } else {
            emoji = "✔️";
        }

        tournMeta[tourn.slug] = { mode: nextMode, startTs, isStarted, emoji };
    });

    let scheduleMap = {};
    const sortedFutureDates = Object.keys(allFutureMatches).sort();
    sortedFutureDates.slice(0, 4).forEach(d => {
        scheduleMap[d] = allFutureMatches[d].sort((a,b) => {
            if (a.tournIndex !== b.tournIndex) return a.tournIndex - b.tournIndex;
            return a.time.localeCompare(b.time);
        });
    });

    return { globalStats, timeGrid, scheduleMap, tournMeta };
}

// --- 6. Markdown 生成器 ---
function generateMarkdown(tourn, stats, timeGrid) {
    const sorted = utils.sortTeams(stats);

    // 计算联赛总打满量
    let t_bo3_f = 0, t_bo3_t = 0, t_bo5_f = 0, t_bo5_t = 0;
    sorted.forEach(s => {
        t_bo3_f += s.bo3_f || 0; t_bo3_t += s.bo3_t || 0;
        t_bo5_f += s.bo5_f || 0; t_bo5_t += s.bo5_t || 0;
    });
    // 比赛双向记录，总数需除以 2
    t_bo3_f /= 2; t_bo3_t /= 2; t_bo5_f /= 2; t_bo5_t /= 2;

    let fullRateStr = "";
    if (t_bo3_t > 0 || t_bo5_t > 0) {
        let parts = [];
        if (t_bo3_t > 0) parts.push(`BO3: **${t_bo3_f}/${t_bo3_t}** (${utils.pct(utils.rate(t_bo3_f, t_bo3_t))})`);
        if (t_bo5_t > 0) parts.push(`BO5: **${t_bo5_f}/${t_bo5_t}** (${utils.pct(utils.rate(t_bo5_f, t_bo5_t))})`);
        fullRateStr = `📊 **Fullrate**: ${parts.join(" | ")}\n\n`;
    }

    let md = `# ${tourn.name}\n\n${fullRateStr}| TEAM | BO3 FULL | BO3% | BO5 FULL | BO5% | SERIES | SERIES WR | GAMES | GAME WR | STREAK | LAST DATE |\n| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;

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

    md += `\n## \n📅 **Time Slot Distribution**\n\n| Time Slot | Mon | Tue | Wed | Thu | Fri | Sat | Sun | Total |\n| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;
    
    const regionGrid = timeGrid[tourn.slug] || {};
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
    .wrapper { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; background: #fff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-bottom: 25px; border: 1px solid #e2e8f0; box-sizing: border-box; display: flex; flex-direction: column; }
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
    .sch-row .spine-l { padding: 4px 5px; margin-left: 6px; }
    .sch-row .spine-r { padding: 4px 5px; margin-right: 6px; }
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
    .sch-time { min-width: 40px; color: #94a3b8; font-size: 13px; display: flex; align-items: center; justify-content: flex-start; padding-left: 10px; }
    .sch-tag-col { min-width: 40px; display: flex; align-items: center; justify-content: flex-end; padding-right: 10px; }
    .sch-vs-container { flex: 1; display: flex; align-items: stretch; justify-content: center; }
    .sch-pill { padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; background: #dbeafe; color: #1d4ed8; }
    .sch-pill.gold { background: #f2d49c; color: #9c5326; }
    .sch-live-score { color: #10b981; font-size: 13px; }
    .sch-fin-score { color: #334155; font-size: 13px; }
    .sch-empty { margin-top: 40px; text-align: center; color: #94a3b8; background: #fff; padding: 30px; border-radius: 12px; border: 1px solid #e2e8f0; font-weight: 700; }
    .arch-empty-msg { text-align: center; padding: 40px; color: #94a3b8; font-weight: 700; }
    .arch-error-msg { padding: 20px; color: #dc2626; text-align: center; font-weight: 700; }

    .league-summary { font-size:12px; color:#64748b; font-weight:700; background:#f8fafc; padding:4px 10px; border-radius:6px; border:1px solid #e2e8f0; display:inline-flex; align-items:center; white-space:nowrap; }
    .summary-sep { opacity:0.3; margin:0 8px; font-weight:400; }
    .title-right-area { display:flex; align-items:center; gap:12px; }

    @media (max-width: 1100px) { .sch-container { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 650px) {
        .table-title, summary.arch-sum { 
            flex-wrap: wrap; 
            gap: 0; 
            padding: 12px 15px 0 15px; 
        }
        summary.arch-sum {
            display: block;
            flex-direction: column;
            align-items: flex-start;
            padding: 0;
        }
        .arch-title-wrapper {
            width: 100%;
            padding: 12px 15px 0 15px;
            display: flex;
            align-items: center;
            column-gap: 10px;
        }
        .arch-indicator { margin-right: 0; }
        .arch-title-wrapper a {
            white-space: normal;
            line-height: 1.3;
        }
        .title-right-area { 
            width: 100%; 
            justify-content: flex-end !important; 
            padding: 10px 15px 12px 15px; 
            border-top: 1px dashed #e2e8f0; 
            margin-top: 8px; 
            display: flex;
        }
        .league-summary { font-size: 11px; padding: 3px 8px; }
    }
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
    @media (max-width: 600px) {
        .match-item { padding: 10px 8px; }
        .col-date { width: 48px; font-size: 12px; }
        .modal-divider { margin: 0 6px; }
        .col-res { width: 28px; }
        .score-box { min-width: 40px; }
        .spine-l { padding-right: 2px; }
        .spine-r { padding-left: 2px; }
    }
`;

const BUILD_FOOTER_STYLE = `
    .build-footer { flex-shrink: 0; text-align: center; padding: 15px 20px; padding-bottom: calc(15px + env(safe-area-inset-bottom)); color: #94a3b8; font-size: 11px; }
    .build-footer code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace !important; background: transparent; border: none; padding: 0; margin: 0; letter-spacing: 0; color: inherit; }
    .build-footer .footer-label { font-weight: 500; }
    .build-footer .footer-time, .build-footer .footer-sha { color: #64748b; font-weight: 700; }
    .build-footer a { color: inherit; text-decoration: none; opacity: 1; transition: filter 0.2s ease; }
    .build-footer a:hover { filter: brightness(1.08); text-decoration: underline; }
`;
const PYTHON_JS = `
    <script>
    const COL_TEAM=0, COL_BO3=1, COL_BO3_PCT=2, COL_BO5=3, COL_BO5_PCT=4, COL_SERIES=5, COL_SERIES_WR=6, COL_GAME=7, COL_GAME_WR=8, COL_STREAK=9, COL_LAST_DATE=10;
    const RES_MAP = { 'W': '✔', 'L': '❌', 'LIV': '🔵', 'N': '🕒' };
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
        const dateHtml = dateParts.length === 2 ? dateParts[0] + '<br><span ' + STYLE_DATE_TIME + '>' + dateParts[1] + '</span>' : (date || '');
        let scoreContent = '', scoreClass = 'score-text';
        if (resStatus === 'LIV') scoreClass += ' live';
        if (resStatus === 'N') { scoreContent = '<span class="score-text vs">VS</span>'; } 
        else { const fmtScore = (score || '').toString().replace('-', '<span ' + STYLE_SCORE_DASH + '>-</span>'); scoreContent = '<span class="' + scoreClass + '">' + fmtScore + '</span>'; }
        const boxClass = isFull ? 'score-box is-full' : 'score-box';
        const t1Color = team1 === 'TBD' ? 'color:#9ca3af;' : '', t2Color = team2 === 'TBD' ? 'color:#9ca3af;' : '';

        return '<div class="match-item"><div class="col-date">' + dateHtml + '</div><div class="modal-divider"></div><div class="col-vs-area"><div class="spine-row"><span class="spine-l" ' + STYLE_TEAM_LEFT_PAD + t1Color + '">' + team1 + '</span><div ' + STYLE_SCORE_WRAP + '><div class="' + boxClass + '">' + scoreContent + '</div></div><span class="spine-r" ' + STYLE_TEAM_RIGHT_PAD + t2Color + '">' + team2 + '</span></div></div><div class="modal-divider"></div><div class="col-res">' + resTag + '</div></div>';
    }

    function renderListHTML(htmlArr) {
        const l=document.getElementById('modalList');
        if(!htmlArr || htmlArr.length===0) l.innerHTML="<div " + STYLE_MODAL_EMPTY + ">No matches found</div>";
        else l.innerHTML = htmlArr.join("");
    }

    function showPopup(t,d,m){
        const ds=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday","Total"];
        document.getElementById('modalTitle').innerText=t+" - "+ds[d];
        const sortedMatches = [...m].sort((a, b) => b.d.localeCompare(a.d));
        const listHtml = sortedMatches.map(item => {
            let boTag = '<span ' + STYLE_MUTED_DASH + '>-</span>';
            if (item.bo === 5) boTag = '<span class="sch-pill gold" ' + STYLE_BO_SMALL + '>BO5</span>';
            else if (item.bo === 3) boTag = '<span class="sch-pill" ' + STYLE_BO_SMALL + '>BO3</span>';
            else if (item.bo === 1) boTag = '<span class="sch-pill" ' + STYLE_BO_SMALL + '>BO1</span>';
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
        const summary = h2hHistory.length > 0 ? ' <span ' + STYLE_H2H_SUMMARY + '>(' + t1Wins + '<span ' + STYLE_H2H_DASH + '>-</span>' + t2Wins + ')</span>' : "";
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

function renderActionBtn(href, icon, text) {
    return `<a href="${href}" class="action-btn"><span class="btn-icon">${icon}</span> <span class="btn-text">${text}</span></a>`;
}

function renderPageShell(title, bodyContent, navMode = "home") {
    let navBtn = "";
    const logoIcon = navMode === "archive" ? "📦" : "🥇";
    if (navMode === "home") navBtn = renderActionBtn("/archive", "📦", "Archive");
    else if (navMode === "archive") navBtn = renderActionBtn("/", "🏠", "Home");

    const toolsBtn = (navMode !== "home" && navMode !== "archive")
        ? renderActionBtn("/tools", "🧰", "Tools")
        : "";

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title><style>${PYTHON_STYLE}</style><link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text x='50' y='.9em' font-size='85' text-anchor='middle'>${logoIcon}</text></svg>"></head><body><header class="main-header"><div class="header-left"><span class="header-logo">${logoIcon}</span><h1 class="header-title">${title}</h1></div><div class="header-right">${navBtn}${toolsBtn}${renderActionBtn("/logs", "📜", "Logs")}</div></header><div class="container">${bodyContent}</div><div id="matchModal" class="modal"><div class="modal-content"><h3 id="modalTitle">Match History</h3><div id="modalList" class="match-list"></div></div></div>${PYTHON_JS}</body></html>`;
}

function renderBuildFooter(time, sha) {
    const shortSha = (sha || "").slice(0, 7) || "unknown";
    return `<div class="build-footer"><code class="footer-label">deployed:</code> <code class="footer-time">${time || "N/A"}</code> <a href="${GITHUB_COMMIT_BASE}${sha}" target="_blank"><code class="footer-sha">@${shortSha}</code></a></div>`;
}

function renderContentOnly(globalStats, timeData, scheduleMap, runtimeConfig, isArchive = false, tournMeta = {}) {
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

    const getRateHtml = (teamName, slug, bo) => {
        const stats = globalStats[slug];
        if (!stats || !stats[teamName]) return "";
        const s = stats[teamName];
        let r = null;
        if (bo === 5) r = utils.rate(s.bo5_f, s.bo5_t);
        else if (bo === 3) r = utils.rate(s.bo3_f, s.bo3_t);
        if (r === null) return "";
        return `<span ${STYLE_RATE_HINT}>(${Math.round(r * 100)}%)</span>`;
    };

    const buildTeamRow = (s, slug) => {
        const bo3R = utils.rate(s.bo3_f, s.bo3_t), bo5R = utils.rate(s.bo5_f, s.bo5_t);
        const winR = utils.rate(s.s_w, s.s_t), gameR = utils.rate(s.g_w, s.g_t);
        const bo3Txt = s.bo3_t ? mkSpine(`${s.bo3_f}/${s.bo3_t}`, '/') : "-";
        const bo5Txt = s.bo5_t ? mkSpine(`${s.bo5_f}/${s.bo5_t}`, '/') : "-";
        const serTxt = s.s_t ? mkSpine(`${s.s_w}-${s.s_t - s.s_w}`, '-') : "-";
        const gamTxt = s.g_t ? mkSpine(`${s.g_w}-${s.g_t - s.g_w}`, '-') : "-";
        const strk = s.strk_w > 0
            ? `<span class='badge' style='background:#10b981'>${s.strk_w}W</span>`
            : (s.strk_l > 0 ? `<span class='badge' style='background:#f43f5e'>${s.strk_l}L</span>` : "-");
        const last = s.last ? utils.fmtDate(s.last) : "-";
        const lastColor = utils.colorDate(s.last);

        const emptyBg = '#f1f5f9', emptyCol = '#cbd5e1';
        const cls = (base, count) => count > 0 ? `${base} team-clickable` : base;
        const clk = (name, type, count) => count > 0 ? `onclick="openStats('${slug}', '${name}', '${type}')"` : "";
        const statStyle = (count) => `style="background:${count === 0 ? emptyBg : 'transparent'};color:${count === 0 ? emptyCol : 'inherit'}"`;
        const pctStyle = (rate, strong = false) => `style="background:${utils.color(rate, strong)};color:${rate !== null ? 'white' : emptyCol};font-weight:bold"`;
        const lastStyle = `style="background:${!s.last ? emptyBg : 'transparent'};color:${!s.last ? emptyCol : lastColor};font-weight:700"`;
        const streakEmpty = s.strk_w === 0 && s.strk_l === 0;
        const streakStyle = `style="background:${streakEmpty ? emptyBg : 'transparent'};color:${streakEmpty ? emptyCol : 'inherit'}"`;

        return `<tr><td class="team-col team-clickable" onclick="openTeam('${slug}', '${s.name}')">${s.name}</td><td class="${cls('col-bo3', s.bo3_t)}" ${clk(s.name, 'bo3', s.bo3_t)} ${statStyle(s.bo3_t)}>${bo3Txt}</td><td class="col-bo3-pct" ${pctStyle(bo3R, true)}>${utils.pct(bo3R)}</td><td class="${cls('col-bo5', s.bo5_t)}" ${clk(s.name, 'bo5', s.bo5_t)} ${statStyle(s.bo5_t)}>${bo5Txt}</td><td class="col-bo5-pct" ${pctStyle(bo5R, true)}>${utils.pct(bo5R)}</td><td class="${cls('col-series', s.s_t)}" ${clk(s.name, 'series', s.s_t)} ${statStyle(s.s_t)}>${serTxt}</td><td class="col-series-wr" ${pctStyle(winR)}>${utils.pct(winR)}</td><td class="col-game" ${statStyle(s.g_t)}>${gamTxt}</td><td class="col-game-wr" ${pctStyle(gameR)}>${utils.pct(gameR)}</td><td class="col-streak" ${streakStyle}>${strk}</td><td class="col-last" ${lastStyle}>${last}</td></tr>`;
    };

    const buildTimeTable = (regionGrid) => {
        const hours = Object.keys(regionGrid).filter(k => k !== "Total" && !isNaN(k)).map(Number).sort((a, b) => a - b);
        if (hours.length === 0 && !regionGrid["Total"]) return "";

        let html = `<div style="border-top: 1px solid #f1f5f9; width:100%;"></div><table style="font-variant-numeric:tabular-nums; border-top:none;"><thead><tr style="border-bottom:none;"><th class="team-col" style="cursor:default; pointer-events:none;">TIME</th>`;
        TIME_TABLE_COLUMNS.forEach(d => { html += `<th style="cursor:default; pointer-events:none;">${d}</th>`; });
        html += "</tr></thead><tbody>";

        [...hours, "Total"].forEach(h => {
            if (!regionGrid[h]) return;
            const isTotal = h === "Total";
            const label = isTotal ? "Total" : `${String(h).padStart(2,'0')}:00`;
            html += `<tr style="${isTotal ? 'font-weight:bold; background:#f8fafc;' : ''}"><td class="team-col" style="${isTotal ? 'background:#f1f5f9;' : ''}">${label}</td>`;

            for (let w = 0; w < 8; w++) {
                const c = regionGrid[h][w] || { total: 0 };
                if (c.total === 0) {
                    html += "<td style='background:#f1f5f9; color:#cbd5e1'>-</td>";
                } else {
                    const r = c.full / c.total;
                    const matches = JSON.stringify(c.matches).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
                    html += `<td style='background:${utils.color(r, true)}; color:white; font-weight:bold; cursor:pointer;' onclick='showPopup("${label}", ${w}, ${matches})'><div class="t-cell"><span class="t-val">${c.full}<span ${STYLE_SCORE_SEP}>/</span>${c.total}</span><span class="t-pct">(${Math.round(r * 100)}%)</span></div></td>`;
                }
            }

            html += "</tr>";
        });

        html += "</tbody></table>";
        return html;
    };

    const buildScheduleRow = (m) => {
        const boLabel = m.bo ? `BO${m.bo}` : "";
        const boClass = m.bo === 5 ? "sch-pill gold" : "sch-pill";
        const isTbd1 = m.t1 === "TBD", isTbd2 = m.t2 === "TBD";
        const t1Click = isTbd1 ? "" : `onclick="openTeam('${m.slug}', '${m.t1}')"`;
        const t2Click = isTbd2 ? "" : `onclick="openTeam('${m.slug}', '${m.t2}')"`;
        const r1 = getRateHtml(m.t1, m.slug, m.bo), r2 = getRateHtml(m.t2, m.slug, m.bo);

        let midContent = `<span ${STYLE_VS_TEXT}>vs</span>`;
        if (m.is_finished) {
            const s1Style = m.s1 > m.s2 ? "color:#0f172a" : "color:#94a3b8";
            const s2Style = m.s2 > m.s1 ? "color:#0f172a" : "color:#94a3b8";
            midContent = `<span class="sch-fin-score"><span style="${s1Style}">${m.s1}</span><span ${STYLE_SCORE_SEP}>-</span><span style="${s2Style}">${m.s2}</span></span>`;
        } else if (m.is_live) {
            midContent = `<span class="sch-live-score">${m.s1}<span ${STYLE_SCORE_SEP}>-</span>${m.s2}</span>`;
        }

        const h2hClass = (!isTbd1 && !isTbd2) ? "spine-sep clickable" : "spine-sep";
        const h2hClick = (!isTbd1 && !isTbd2) ? `onclick="openH2H('${m.slug}', '${m.t1}', '${m.t2}')"` : "";

        return `<div class="sch-row"><span class="sch-time">${m.time}</span><div class="sch-vs-container"><div class="spine-row"><span class="${isTbd1 ? "spine-l" : "spine-l clickable"}" ${t1Click} ${isTbd1 ? STYLE_TBD_TEAM : ""}>${r1}${m.t1}</span><span class="${h2hClass}" ${h2hClick} ${STYLE_SCH_MID_CELL}>${midContent}</span><span class="${isTbd2 ? "spine-r" : "spine-r clickable"}" ${t2Click} ${isTbd2 ? STYLE_TBD_TEAM : ""}>${m.t2}${r2}</span></div></div><div class="sch-tag-col"><span class="${boClass}">${boLabel}</span></div></div>`;
    };

    let tablesHtml = "";

    runtimeConfig.TOURNAMENTS.forEach((tourn) => {
        if (!tourn || !tourn.slug) return;
        const rawStats = globalStats[tourn.slug] || {};
        const stats = utils.sortTeams(rawStats);
        const tableId = `t_${tourn.slug.replace(/-/g, '_')}`;

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
            if (t_bo3_t > 0) parts.push(`BO3: ${t_bo3_f}/${t_bo3_t} <span style="opacity:0.7;font-weight:400;">(${utils.pct(utils.rate(t_bo3_f, t_bo3_t))})</span>`);
            if (t_bo5_t > 0) parts.push(`BO5: ${t_bo5_f}/${t_bo5_t} <span style="opacity:0.7;font-weight:400;">(${utils.pct(utils.rate(t_bo5_f, t_bo5_t))})</span>`);
            
            leagueSummaryHtml = `<div class="league-summary">${parts.join(" <span class='summary-sep'>|</span> ")}</div>`;
        }

        const mainPage = Array.isArray(tourn.overview_page) ? tourn.overview_page[0] : tourn.overview_page;
        const rows = stats.map(s => buildTeamRow(s, tourn.slug)).join("");
        const tableBody = `<table id="${tableId}"><thead><tr><th class="team-col" onclick="doSort(0, '${tableId}')">TEAM</th><th colspan="2" onclick="doSort(2, '${tableId}')">BO3 FULLRATE</th><th colspan="2" onclick="doSort(4, '${tableId}')">BO5 FULLRATE</th><th colspan="2" onclick="doSort(6, '${tableId}')">SERIES</th><th colspan="2" onclick="doSort(8, '${tableId}')">GAMES</th><th class="col-streak" onclick="doSort(9, '${tableId}')">STREAK</th><th class="col-last" onclick="doSort(10, '${tableId}')">LAST DATE</th></tr></thead><tbody>${rows}</tbody></table>`;

        const regionGrid = timeData[tourn.slug] || {};
        const timeTableHtml = buildTimeTable(regionGrid);

        const emojiStr = (!isArchive && tournMeta[tourn.slug] && tournMeta[tourn.slug].emoji)
            ? `<span ${STYLE_EMOJI}>${tournMeta[tourn.slug].emoji}</span>`
            : "";
        const titleLink = `<a href="https://lol.fandom.com/wiki/${mainPage}" target="_blank">${tourn.name}</a>`;

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

                matches.forEach(m => {
                    const tabName = m.tabName || "";
                    const groupKey = `${m.league}_${tabName}`;
                    if (groupKey !== lastGroupKey) {
                        const blockHtml = tabName ? `<span class="spine-sep">/</span><span class="spine-r" ${STYLE_SCH_GROUP_BLOCK}>${tabName}</span>` : "";
                        cardHtml += `<div class="sch-group-header" ${STYLE_SCH_GROUP_HEADER}><div class="spine-row" ${STYLE_SCH_GROUP_ROW}><span class="spine-l" ${STYLE_SCH_GROUP_NAME}>${m.league}</span>${blockHtml}</div></div>`;
                        lastGroupKey = groupKey;
                    }
                    cardHtml += buildScheduleRow(m);
                });

                cardHtml += `</div></div>`;
                scheduleHtml += cardHtml;
            });
            scheduleHtml += `</div>`;
        }
    }

    return `${tablesHtml} ${scheduleHtml} ${injectedData}`;
}

async function generateArchiveStaticHTML(env) {
    try {
        const allKeys = await env.LOL_KV.list({ prefix: "ARCHIVE_" });
        
        const dataKeys = allKeys.keys.filter(k => k.name !== "ARCHIVE_STATIC_HTML");
        
        if (!dataKeys.length) {
            return renderPageShell("LoL Archive", `<div class="arch-content arch-empty-msg">No archive data available.</div>`, "archive");
        }

        const rawSnapshots = await Promise.all(dataKeys.map(k => env.LOL_KV.get(k.name, { type: "json" })));
        const validSnapshots = rawSnapshots.filter(s => s && s.tourn && s.tourn.slug);

        // 排序逻辑：start_date 倒序 > end_date 倒序 > slug 字母顺序
        validSnapshots.sort((a, b) => {
            const aStart = a.tourn.start_date || '';
            const bStart = b.tourn.start_date || '';
            const aEnd = a.tourn.end_date || '';
            const bEnd = b.tourn.end_date || '';
            
            // 主要排序：start_date 倒序（日期越晚越靠前）
            if (aStart !== bStart) {
                if (!aStart) return 1; // 没有日期的排后面
                if (!bStart) return -1;
                return bStart.localeCompare(aStart);
            }
            
            // 第二排序：end_date 倒序
            if (aEnd !== bEnd) {
                if (!aEnd) return 1;
                if (!bEnd) return -1;
                return bEnd.localeCompare(aEnd);
            }
            
            // 第三排序：slug 字母顺序（确保稳定性）
            return (a.tourn.slug || '').localeCompare(b.tourn.slug || '');
        });

        const combined = validSnapshots.map(snap => {
            const tournWithMap = { ...snap.tourn, team_map: snap.team_map || {} };
            const miniConfig = { TOURNAMENTS: [tournWithMap] };
            const analysis = runFullAnalysis({ [snap.tourn.slug]: snap.rawMatches || [] }, {}, miniConfig);
            const statsObj = analysis.globalStats[snap.tourn.slug] || {};
            const timeObj = analysis.timeGrid[snap.tourn.slug] || {};
            return renderContentOnly(
                { [snap.tourn.slug]: statsObj },
                { [snap.tourn.slug]: timeObj },
                {}, miniConfig, true
            );
        }).join("");
        
        return renderPageShell("LoL Archive", `<div class="arch-content">${combined}</div>`, "archive");
    } catch (e) {
        return renderPageShell("LoL Archive Error", `<div class="arch-error-msg">Error generating archive: ${e.message}</div>`, "archive");
    }
}

// --- 8. 主控 & Tasks (V46.0 探针聚合版) ---
class Logger {
    constructor() { this.l=[]; }
    error(m) { this.l.push({t:utils.getNow().short, l:'ERROR', m}); }
    success(m) { this.l.push({t:utils.getNow().short, l:'SUCCESS', m}); }
    export() { return this.l; }
}

async function appendLogs(env, logger, onlyWhenNonEmpty = false) {
    const newLogs = logger.export();
    if (onlyWhenNonEmpty && newLogs.length === 0) return;
    const oldLogs = await env.LOL_KV.get("LOGS", { type: "json" }) || [];
    let combinedLogs = [...newLogs, ...oldLogs];
    if (combinedLogs.length > 100) combinedLogs = combinedLogs.slice(0, 100);
    await env.LOL_KV.put("LOGS", JSON.stringify(combinedLogs));
}

function isUnauthorized(request, env) {
    const expectedSecret = env.ADMIN_SECRET;
    const authHeader = request.headers.get("Authorization");
    return Boolean(expectedSecret && (!authHeader || authHeader !== `Bearer ${expectedSecret}`));
}

function htmlResponse(body, status = 200) {
    return new Response(body, { status, headers: { "content-type": "text/html;charset=utf-8" } });
}
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function textResponse(body, status = 200) {
    return new Response(body, { status });
}

function okResponse() {
    return textResponse("OK", 200);
}

function unauthorizedResponse() {
    return textResponse("Unauthorized", 401);
}

function methodNotAllowedResponse() {
    return textResponse("Method Not Allowed", 405);
}

async function executeTaskWithLogs(env, taskRunner, errorPrefix = "") {
    try {
        const logger = await taskRunner();
        await appendLogs(env, logger);
        return okResponse();
    } catch (err) {
        const prefix = errorPrefix ? `${errorPrefix}: ` : "";
        return textResponse(`${prefix}${err.message}`, 500);
    }
}

async function respondCachedHtml(env, key, fallback) {
    const html = await env.LOL_KV.get(key);
    if (html) return htmlResponse(html);
    return htmlResponse(fallback);
}
async function runUpdate(env, force=false) {
    const l = new Logger();
    const NOW = Date.now();

    const SLOW_THRESHOLD = 60 * 60 * 1000;
    const UPDATE_ROUNDS = 1;

    let runtimeConfig = null;
    let teamsRaw = null;
    try {
        teamsRaw = await gh.fetchJson(env, "teams.json");
        const tourns = await gh.fetchJson(env, "tour.json");
        if (tourns) runtimeConfig = { TOURNAMENTS: tourns };
    } catch (e) {}

    if (!runtimeConfig) { 
        l.error(`🔴 [ERR!] | ❌ Config(Fail)`); 
        return l; 
    }

    // Remove stale HOME_<slug> entries not in current tour.json
    try {
        const allHomeKeys = await env.LOL_KV.list({ prefix: "HOME_" });
        const activeSlugs = new Set((runtimeConfig.TOURNAMENTS || []).map(t => t.slug));
        const staleKeys = allHomeKeys.keys
            .map(k => k.name)
            .filter(n => n !== "HOME_STATIC_HTML")
            .filter(n => {
                const slug = n.slice("HOME_".length);
                return !activeSlugs.has(slug);
            });
        for (const key of staleKeys) await env.LOL_KV.delete(key);
    } catch (e) {}

    // Load per-league cached data
    const cache = { rawMatches: {}, updateTimestamps: {} };
    const meta = { tournaments: {} };
    const homeEntries = await Promise.all((runtimeConfig.TOURNAMENTS || []).map(async t => {
        const data = await env.LOL_KV.get(getHomeKey(t.slug), { type: "json" });
        return [t.slug, data];
    }));
    homeEntries.forEach(([slug, home]) => {
        if (home && home.rawMatches) cache.rawMatches[slug] = home.rawMatches;
        if (home && home.updateTimestamps && home.updateTimestamps[slug]) cache.updateTimestamps[slug] = home.updateTimestamps[slug];
        if (home && home.tournMeta && home.tournMeta[slug]) meta.tournaments[slug] = home.tournMeta[slug];
    });
    // 对联赛进行排序：start_date 倒序 > end_date 倒序 > slug 字母顺序
    runtimeConfig.TOURNAMENTS.sort((a, b) => {
        const aStart = a.start_date || '';
        const bStart = b.start_date || '';
        const aEnd = a.end_date || '';
        const bEnd = b.end_date || '';
        
        // 主要排序：start_date 倒序（日期越晚越靠前）
        if (aStart !== bStart) {
            if (!aStart) return 1; // 没有日期的排后面
            if (!bStart) return -1;
            return bStart.localeCompare(aStart);
        }
        
        // 第二排序：end_date 倒序
        if (aEnd !== bEnd) {
            if (!aEnd) return 1;
            if (!bEnd) return -1;
            return bEnd.localeCompare(aEnd);
        }
        
        // 第三排序：slug 字母顺序（确保稳定性）
        return (a.slug || '').localeCompare(b.slug || '');
    });

    if (!cache.rawMatches) cache.rawMatches = {}; 
    if (!cache.updateTimestamps) cache.updateTimestamps = {};

    let candidates = [];
    runtimeConfig.TOURNAMENTS.forEach(tourn => {
        const lastTs = cache.updateTimestamps[tourn.slug] || 0;
        const elapsed = NOW - lastTs;
        
        const tMeta = (meta.tournaments && meta.tournaments[tourn.slug]) || { mode: "fast", startTs: 0, isStarted: false };
        const currentMode = tMeta.mode;
        const isStarted = tMeta.startTs > 0 && NOW >= tMeta.startTs;
        const threshold = (currentMode === "slow" && !isStarted) ? SLOW_THRESHOLD : 0;
        
        const dName = tourn.league;
        if (force || elapsed >= threshold) {
            candidates.push({ 
                slug: tourn.slug, overview_page: tourn.overview_page, league: dName,
                mode: currentMode,
                start_date: tourn.start_date || null
            });
        }
    });

    if (candidates.length === 0) { 
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
            let beforeFirstMatch = false;
            if (c.start_date) {
                const startDt = utils.parseDate(`${c.start_date} 00:00:00`);
                if (startDt && NOW < startDt.getTime()) beforeFirstMatch = true;
            }
            const isFullFetch = force || oldData.length === 0 || c.mode === "slow" || beforeFirstMatch;
            const dateQuery = isFullFetch ? null : { start: deltaStartUTC, end: deltaEndUTC };

            const data = await fetchAllMatches(c.slug, c.overview_page, authContext, dateQuery);
            results.push({ status: 'fulfilled', slug: c.slug, data: data, isDelta: !isFullFetch });
        } catch (err) {
            results.push({ status: 'rejected', slug: c.slug, err: err });
        }
        if (c !== batch[batch.length - 1]) await new Promise(res => setTimeout(res, 2000));
    }

    const failedSlugs = new Set();
    const syncItems = [];
    const idleItems = [];
    const breakers = [];
    const apiErrors = [];
    
    results.forEach(res => {
        const c = batch.find(b => b.slug === res.slug);
        const dName = c.league;
        if (res.status === 'fulfilled') {
            const slug = res.slug;
            const newData = res.data || [];
            const oldData = cache.rawMatches[slug] || [];
            
            if (res.isDelta) {
                if (newData.length > 0) {
                    const matchMap = new Map();
                    const getUniqueKey = (m) => {
                        const id = m.MatchId ?? m["MatchId"];
                        return String(id ?? "");
                    };

                    const fieldAliases = {
                        MatchId: ["MatchId"],
                        Team1: ["Team1", "Team 1"],
                        Team2: ["Team2", "Team 2"],
                        Team1Score: ["Team1Score", "Team 1 Score"],
                        Team2Score: ["Team2Score", "Team 2 Score"],
                        DateTime_UTC: ["DateTime_UTC", "DateTime UTC"],
                        OverviewPage: ["OverviewPage", "Overview Page"],
                        BestOf: ["BestOf", "Best Of"],
                        N_MatchInPage: ["N_MatchInPage", "N MatchInPage"],
                        Tab: ["Tab"],
                        Round: ["Round"]
                    };

                    const getField = (m, name) => {
                        const keys = fieldAliases[name] || [name];
                        for (const k of keys) {
                            if (m != null && Object.prototype.hasOwnProperty.call(m, k)) return m[k];
                        }
                        return undefined;
                    };

                    const normalize = (v) => (v == null ? "" : String(v));
                    const isSameMatch = (a, b) => {
                        const fields = ["MatchId", "Team1", "Team2", "Team1Score", "Team2Score", "DateTime_UTC", "OverviewPage", "BestOf", "N_MatchInPage", "Tab", "Round"];
                        for (const f of fields) {
                            if (normalize(getField(a, f)) !== normalize(getField(b, f))) return false;
                        }
                        return true;
                    };

                    oldData.forEach(m => matchMap.set(getUniqueKey(m), m));

                    let changesCount = 0;
                    newData.forEach(m => {
                        const key = getUniqueKey(m);
                        const oldM = matchMap.get(key);
                        if (!oldM || !isSameMatch(oldM, m)) {
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
                        syncItems.push({ slug, dName, type: "delta", count: changesCount });
                    } else {
                        idleItems.push({ slug, dName, type: "delta", count: 0 });
                    }
                } else {
                    idleItems.push({ slug, dName, type: "delta", count: 0 });
                }
            } else {
                if (!force && oldData.length > 10 && newData.length < oldData.length * 0.9) {
                    breakers.push(`${dName}(Drop)`);
                    failedSlugs.add(slug);
                } else {
                    cache.rawMatches[slug] = newData;
                    if (JSON.stringify(oldData) !== JSON.stringify(newData)) {
                        syncItems.push({ slug, dName, type: "full", count: newData.length });
                    } else {
                        idleItems.push({ slug, dName, type: "full", count: newData.length });
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

    // Attach per-league team maps (filtered to only needed teams)
    for (const tourn of (runtimeConfig.TOURNAMENTS || [])) {
        const rawMatches = cache.rawMatches[tourn.slug] || [];
        tourn.team_map = pickTeamMap(teamsRaw, tourn, rawMatches);
    }

    const oldTournMeta = meta.tournaments || {};
    const analysis = runFullAnalysis(cache.rawMatches, oldTournMeta, runtimeConfig, failedSlugs); 

    const modeSwitches = [];
    Object.keys(analysis.tournMeta).forEach(slug => {
        const oldMode = (oldTournMeta[slug] && oldTournMeta[slug].mode) || "fast";
        const newMode = analysis.tournMeta[slug].mode;
        const isStarted = analysis.tournMeta[slug].isStarted || false;
        
        // 只有当模式真正改变且比赛未开始时才显示切换提示
        if (oldMode !== newMode && !isStarted) {
            const t = runtimeConfig.TOURNAMENTS.find(it => it.slug === slug);
            const dName = t ? (t.league || t.name || slug.toUpperCase()) : slug;
            modeSwitches.push(`${dName}(${newMode === "slow" ? "🐌" : "⚡"})`);
        }
    });

    const formatCountdown = (slug) => {
        const metaNow = (analysis.tournMeta && analysis.tournMeta[slug]) || (oldTournMeta && oldTournMeta[slug]) || { mode: "fast", startTs: 0, isStarted: false };
        const mode = metaNow.mode || "fast";
        const isStarted = metaNow.isStarted || false;
        const modeIcon = (mode === "slow" && !isStarted) ? "🐌" : "⚡";
        const countdownMins = (mode === "slow" && !isStarted) ? Math.ceil(SLOW_THRESHOLD / 60000) : Number(env.CRON_INTERVAL_MINUTES);
        return { modeIcon, countdownMins };
    };

    const formatItem = (item) => {
        const info = formatCountdown(item.slug);
        const prefix = item.type === "delta" ? "+" : "*";
        return `${item.dName} ${prefix}${item.count} (${info.modeIcon}${info.countdownMins}m)`;
    };

    const syncDetails = syncItems.map(formatItem);
    const idleDetails = idleItems.map(formatItem);
    
    // --- 终极日志输出 ---
    const isAnon = (!authContext || authContext.isAnonymous);
    const authPrefix = isAnon ? "👻 " : "";
    let trafficLight, action, content;
    
    if (syncDetails.length === 0 && apiErrors.length === 0 && breakers.length === 0) {
        trafficLight = "⚪"; action = "[IDLE]";
        
        let parts = [];
        if (idleDetails.length > 0) parts.push(`🔍 ${idleDetails.join(", ")}`);
        parts.push(`🟰 Identical`);
        if (modeSwitches.length > 0) parts.push(`⚙️ ${modeSwitches.join(", ")}`);
        
        content = parts.join(" | ");
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


    try {
        const homeFragment = renderContentOnly(
            analysis.globalStats, analysis.timeGrid, analysis.scheduleMap,
            runtimeConfig, false, analysis.tournMeta 
        );
        const fullPage = renderPageShell("LoL Insights", homeFragment, "home");
        await env.LOL_KV.put("HOME_STATIC_HTML", fullPage);
    } catch (e) {}

    const scheduleBySlug = {};
    Object.keys(analysis.scheduleMap || {}).forEach(date => {
        const list = analysis.scheduleMap[date] || [];
        list.forEach(m => {
            const slug = m.slug;
            if (!scheduleBySlug[slug]) scheduleBySlug[slug] = {};
            if (!scheduleBySlug[slug][date]) scheduleBySlug[slug][date] = [];
            scheduleBySlug[slug][date].push(m);
        });
    });

    for (const tourn of runtimeConfig.TOURNAMENTS) {
        const slug = tourn.slug;
        const raw = cache.rawMatches[slug] || [];
        const ts = cache.updateTimestamps[slug] || 0;
        const stats = analysis.globalStats[slug] || {};
        const grid = analysis.timeGrid[slug] || {};
        const tMeta = analysis.tournMeta[slug] ? { [slug]: analysis.tournMeta[slug] } : {};
        const teamMap = tourn.team_map || {};
        const { team_map, teamMap: _tm, ...tournStored } = tourn;

        const homeSnapshot = {
            tourn: tournStored,
            rawMatches: raw,
            updateTimestamps: { [slug]: ts },
            stats: stats,
            timeGrid: grid,
            scheduleMap: scheduleBySlug[slug] || {},
            tournMeta: tMeta,
            team_map: teamMap
        };
        await env.LOL_KV.put(getHomeKey(slug), JSON.stringify(homeSnapshot));

        if (!stats || Object.keys(stats).length === 0) continue;
        const snapshot = { tourn: tournStored, rawMatches: raw, updateTimestamps: { [slug]: ts }, team_map: teamMap };
        await env.LOL_KV.put(`ARCHIVE_${slug}`, JSON.stringify(snapshot));
    }
    
    const archiveHTML = await generateArchiveStaticHTML(env);
    await env.LOL_KV.put("ARCHIVE_STATIC_HTML", archiveHTML);


    
    return l;
}

async function runCustomRebuild(env, payload) {
    const l = new Logger();
    
    const authContext = await loginToFandom(env);

    try {
        let teamsRaw = null;
        try {
            teamsRaw = await gh.fetchJson(env, "teams.json");
        } catch (e) {}

        // 支持 overview_page 为数组或字符串
        const overviewPages = Array.isArray(payload.overview_page) ? payload.overview_page : [payload.overview_page];
        const matches = await fetchAllMatches(payload.slug, overviewPages, authContext, null);
        
        if (matches && matches.length > 0) {
            const tourn = {
                slug: payload.slug,
                name: payload.name,
                overview_page: overviewPages,
                league: payload.league,
                start_date: payload.start_date || null,
                end_date: payload.end_date || null
            };
            const teamMap = pickTeamMap(teamsRaw, tourn, matches);
            
            const snapshot = {
                tourn: tourn,
                rawMatches: matches,
                updateTimestamps: { [payload.slug]: Date.now() },
                team_map: teamMap
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
// 修改：增加了 existingArchives 参数接收数据库中已有的归档
function renderToolsPage(time, sha, existingArchives = []) {
    const buildFooter = renderBuildFooter(time, sha);
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
            ${COMMON_STYLE}
            body { min-height: 100dvh; display: flex; flex-direction: column; margin: 0; }
            .container { flex: 1; max-width: 900px; width: 100%; padding: 0 15px 20px 15px; box-sizing: border-box; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
            
            .wrapper { width: 100%; background: #fff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; overflow: hidden; box-sizing: border-box; }
            .table-title { padding: 15px 20px; font-weight: 700; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; background: #fff; color: #0f172a; font-size: 15px; box-sizing: border-box; }
            .section-body { padding: 25px 20px; box-sizing: border-box; }
            .section-body-compact { padding-top: 20px; padding-bottom: 20px; }

            .flex-row { display: flex; justify-content: space-between; align-items: center; gap: 15px; }
            .tool-info-title { font-weight: 700; color: #0f172a; margin-bottom: 4px; }
            .tool-info-desc { font-size: 13px; color: #64748b; }
            .tool-info-desc-spaced { margin-bottom: 20px; }
            .actions-row-end { display: flex; justify-content: flex-end; }

            .primary-btn { background: #2563eb; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-size: 13px; transition: 0.2s; font-family: inherit; margin: 0; white-space: nowrap; }
            .primary-btn:hover { background: #1d4ed8; box-shadow: 0 2px 4px rgba(37,99,235,0.2); }
            
            .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
            .form-group { display: flex; flex-direction: column; }
            .tool-label { font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 8px; padding-left: 2px; }
            .form-input { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; font-family: inherit; color: #0f172a; box-sizing: border-box; transition: all 0.2s; background: #f8fafc; }
            .form-input:focus { background: #fff; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); outline: none; }
            .form-input::placeholder { color: #94a3b8; }
            
            /* 修改后的代码：使用 Grid 布局实现一行两个 */
            .qr-list-container { max-height: 250px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; background: #f8fafc; margin-bottom: 15px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
            .qr-item { display: flex; align-items: center; gap: 6px; }
            .qr-label { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 6px; cursor: pointer; transition: 0.2s; border: 1px solid transparent; background: transparent; flex: 1; min-width: 0; }
            .qr-label:hover { background: #fff; border-color: #cbd5e1; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
            .form-checkbox { width: 16px; height: 16px; cursor: pointer; accent-color: #2563eb; margin: 0; flex-shrink: 0; }
            .qr-name { font-weight: 700; color: #1e293b; font-size: 14px; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .qr-league { font-size: 12px; font-weight: 700; color: #fff; background: #94a3b8; padding: 2px 6px; border-radius: 4px; flex-shrink: 0; }
            .qr-actions { display: flex; gap: 6px; flex-shrink: 0; }
            .fill-btn { background: #fff; color: #2563eb; border: 1px solid #bfdbfe; padding: 6px 10px; border-radius: 6px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; transition: 0.2s; font-family: inherit; margin: 0; flex-shrink: 0; }
            .fill-btn:hover { background: #eff6ff; border-color: #93c5fd; }
            .delete-btn { background: #fff; color: #dc2626; border: 1px solid #fecaca; padding: 6px 10px; border-radius: 6px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; transition: 0.2s; font-family: inherit; margin: 0; flex-shrink: 0; }
            .delete-btn:hover { background: #fef2f2; border-color: #fca5a5; }
            .secondary-btn { background: #fff; color: #475569; border: 1px solid #cbd5e1; padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; transition: 0.2s; font-family: inherit; margin: 0; white-space: nowrap; }
            .secondary-btn:hover { background: #f8fafc; color: #0f172a; border-color: #94a3b8; }

            @media (max-width: 600px) {
                .form-grid { grid-template-columns: 1fr; gap: 12px; }
                .flex-row { flex-direction: column; align-items: stretch; text-align: left; }
                .primary-btn, .secondary-btn { width: 100%; }
                .actions-row-end { flex-direction: column; }
                .qr-list-container { grid-template-columns: 1fr; }
            }

            ${BUILD_FOOTER_STYLE}
            
            /* Clean Glass Auth Overlay */
            #auth-overlay { position: fixed; inset: 0; background: rgba(241,245,249,0.8); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex; justify-content: center; align-items: center; z-index: 999; }
            .auth-card { background: #fff; padding: 35px 30px; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); width: 340px; text-align: center; box-sizing: border-box; border: 1px solid #e2e8f0; }
            .auth-icon { font-size: 32px; margin-bottom: 12px; }
            .auth-title { font-size: 18px; font-weight: 800; margin-bottom: 8px; color: #0f172a; }
            .auth-subtitle { color: #64748b; font-size: 13px; margin-bottom: 25px; line-height: 1.4; }
            .auth-btn { width: 100%; justify-content: center; padding: 12px; font-size: 14px; }
            .auth-input { text-align: center; font-family: monospace; letter-spacing: 2px; margin-bottom: 20px; padding: 12px; }
            
            /* Toast 通知 */
            #toast-container { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 1000; display: flex; flex-direction: column; align-items: center; gap: 10px; pointer-events: none; width: auto; max-width: 92vw; }
            .toast { display: inline-flex; align-items: center; width: fit-content; max-width: min(92vw, 460px); color: #1e293b; background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%); border: 1px solid #d9ecff; padding: 11px 14px; border-radius: 14px; font-size: 13px; line-height: 1.45; font-weight: 600; letter-spacing: 0.1px; box-shadow: 0 12px 28px -18px rgba(14,116,144,0.45), 0 3px 10px rgba(148,163,184,0.18); opacity: 0; transform: translateY(-10px) scale(0.985); transition: opacity 0.22s ease, transform 0.22s ease, box-shadow 0.22s ease; text-align: left; word-break: break-word; }
            .toast.show { opacity: 1; transform: translateY(0) scale(1); box-shadow: 0 14px 30px -18px rgba(14,116,144,0.5), 0 4px 12px rgba(148,163,184,0.2); }
            .toast.success { background: linear-gradient(180deg, #f0fdf4 0%, #ecfdf5 100%); border-color: #86efac; color: #166534; }
            .toast.error { background: linear-gradient(180deg, #fff7ed 0%, #fff1f2 100%); border-color: #fdba74; color: #9a3412; }
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
                ${renderActionBtn("/", "🏠", "Home")}
                ${renderActionBtn("/logs", "📜", "Logs")}
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

function renderLogPage(logs, time, sha) {
    if (!Array.isArray(logs)) logs = [];
    const logLevelClassMap = { ERROR: "lvl-err", SUCCESS: "lvl-ok" };
    const entries = logs.map(l => {
        const lvlClass = logLevelClassMap[l.l] || "lvl-inf";
        return `<li class="log-entry"><code class="log-time">${l.t}</code><span class="log-level ${lvlClass}">${l.l}</span><code class="log-msg">${l.m}</code></li>`;
    }).join("");
    const buildFooter = renderBuildFooter(time, sha);

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
        .container { flex: 1; min-height: 0; display: flex; flex-direction: column; max-width: 900px; width: 100%; padding: 0 15px 20px 15px; box-sizing: border-box; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0; overflow: hidden; transform: translateZ(0); }
        .log-list { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; list-style: none; margin: 0; padding: 0; }
        .log-entry { display: grid; grid-template-columns: min-content 90px 1fr; gap: 20px; padding: 12px 20px; border-bottom: 1px solid #f1f5f9; font-size: 14px; align-items: center; }
        .log-entry:nth-child(even) { background-color: #f8fafc; }
        
        code.log-time, code.log-msg { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace !important; background: transparent; border: none; padding: 0; margin: 0; letter-spacing: 0; }
        .log-time { color: #64748b; font-size: 13px; white-space: nowrap; font-weight: 400; }
        .log-level { font-weight: 800; display: flex; justify-content: center; align-items: center; width: 100%; padding: 4px 0; border-radius: 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; line-height: 1; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .lvl-inf { background: #eff6ff; color: #1e40af; border: 1px solid #dbeafe; }
        .lvl-ok { background: #f0fdf4; color: #15803d; border: 1px solid #dcfce7; }
        .lvl-err { background: #fef2f2; color: #b91c1c; border: 1px solid #fee2e2; }
        code.log-msg { color: #334155; word-break: break-all; line-height: 1.6; font-weight: 600; white-space: pre-wrap; display: block; font-size: 14px; }
        
        .empty-logs { padding: 40px; text-align: center; color: #94a3b8; font-style: italic; }
        .logs-container-tight { padding: 0; width: calc(100% - 30px); }
        ${BUILD_FOOTER_STYLE}
        
        @media (max-width: 600px) { 
            .log-entry { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 12px 15px; } 
            .log-time { font-size: 12px; } 
            .log-level { display: inline-flex; width: auto; padding: 3px 8px; font-size: 11px; } 
            code.log-msg { width: 100%; margin-top: 2px; font-size: 14px; } 
        }
    </style>
</head>
<body>
    <header class="main-header">
        <div class="header-left"><span class="header-logo">📜</span><h1 class="header-title">Logs</h1></div>
        <div class="header-right">
            ${renderActionBtn("/", "🏠", "Home")}
            ${renderActionBtn("/tools", "🧰", "Tools")}
        </div>
    </header>
    <div class="container logs-container-tight">
        <ul class="log-list">${entries}</ul>
        ${logs.length === 0 ? '<div class="empty-logs">No logs found for today.</div>' : ''}
    </div>
    ${buildFooter}
</body>
</html>`;
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const time = env.GITHUB_TIME;
        const sha = env.GITHUB_SHA;

        switch (url.pathname) {
            case "/backup": {
                const payload = {};
                const allHomeKeys = await env.LOL_KV.list({ prefix: "HOME_" });
                const dataKeys = allHomeKeys.keys.map(k => k.name).filter(n => n !== "HOME_STATIC_HTML");
                const rawHomes = await Promise.all(dataKeys.map(k => env.LOL_KV.get(k, { type: "json" })));
                rawHomes.forEach(home => {
                    if (home && home.tourn && home.stats) {
                        const slug = home.tourn.slug;
                        payload[`markdown/${slug}.md`] = generateMarkdown(
                            home.tourn,
                            home.stats,
                            { [slug]: home.timeGrid || {} }
                        );
                    }
                });
                if (Object.keys(payload).length === 0) return jsonResponse({ error: "No data" }, 503);
                return jsonResponse(payload);
            }

            case "/force": {
                if (isUnauthorized(request, env)) return unauthorizedResponse();
                return executeTaskWithLogs(env, () => runUpdate(env, true), "Worker Error");
            }

            case "/refresh-ui": {
                if (request.method !== "POST") return methodNotAllowedResponse();
                if (isUnauthorized(request, env)) return unauthorizedResponse();

                try {
                    const allHomeKeys = await env.LOL_KV.list({ prefix: "HOME_" });
                    const dataKeys = allHomeKeys.keys.map(k => k.name).filter(n => n !== "HOME_STATIC_HTML");
                    const rawHomes = await Promise.all(dataKeys.map(k => env.LOL_KV.get(k, { type: "json" })));
                    const homeEntries = rawHomes.filter(h => h && h.tourn);

                    // Sort tournaments same as runUpdate
                    const sortedTourns = homeEntries.map(h => h.tourn).sort((a, b) => {
                        const aStart = a.start_date || '';
                        const bStart = b.start_date || '';
                        const aEnd = a.end_date || '';
                        const bEnd = b.end_date || '';
                        if (aStart !== bStart) {
                            if (!aStart) return 1;
                            if (!bStart) return -1;
                            return bStart.localeCompare(aStart);
                        }
                        if (aEnd !== bEnd) {
                            if (!aEnd) return 1;
                            if (!bEnd) return -1;
                            return bEnd.localeCompare(aEnd);
                        }
                        return (a.slug || '').localeCompare(b.slug || '');
                    });
                    const runtimeConfig = { TOURNAMENTS: sortedTourns };

                    const globalStats = {};
                    const timeGrid = {};
                    const scheduleMap = {};
                    const updateTimestamps = {};
                    const tournMeta = {};

                    homeEntries.forEach(home => {
                        const tourn = home.tourn;
                        if (!home) return;
                        if (home.stats) globalStats[tourn.slug] = home.stats;
                        if (home.timeGrid) timeGrid[tourn.slug] = home.timeGrid;
                        if (home.updateTimestamps && home.updateTimestamps[tourn.slug]) {
                            updateTimestamps[tourn.slug] = home.updateTimestamps[tourn.slug];
                        }
                        if (home.tournMeta && home.tournMeta[tourn.slug]) {
                            tournMeta[tourn.slug] = home.tournMeta[tourn.slug];
                        }
                        const sch = home.scheduleMap || {};
                        Object.keys(sch).forEach(date => {
                            if (!scheduleMap[date]) scheduleMap[date] = [];
                            scheduleMap[date].push(...sch[date]);
                        });
                    });
                    Object.keys(scheduleMap).forEach(date => {
                        scheduleMap[date].sort((a, b) => {
                            if (a.tournIndex !== b.tournIndex) return a.tournIndex - b.tournIndex;
                            return a.time.localeCompare(b.time);
                        });
                    });

                    if (Object.keys(globalStats).length === 0) return textResponse("No cache data available. Run Refresh API first.", 400);

                    const homeFragment = renderContentOnly(
                        globalStats, timeGrid, scheduleMap,
                        runtimeConfig || { TOURNAMENTS: [] },
                        false, tournMeta 
                    );
                    const fullPage = renderPageShell("LoL Insights", homeFragment, "home");
                    await env.LOL_KV.put("HOME_STATIC_HTML", fullPage);

                    const archiveHTML = await generateArchiveStaticHTML(env);
                    await env.LOL_KV.put("ARCHIVE_STATIC_HTML", archiveHTML);

                    return okResponse();
                } catch (err) {
                    return textResponse(`Render Error: ${err.message}`, 500);
                }
            }
            
            case "/rebuild-archive": {
                if (request.method !== "POST") return methodNotAllowedResponse();
                if (isUnauthorized(request, env)) return unauthorizedResponse();

                let payload;
                try {
                    payload = await request.json();
                } catch (e) {
                    return textResponse("Invalid JSON payload", 400);
                }

                if (!payload.slug || !payload.name || !payload.overview_page || !payload.league) {
                    return textResponse("Missing required fields. Please provide slug, name, overview_page, and league.", 400);
                }

                return executeTaskWithLogs(env, () => runCustomRebuild(env, payload));
            }

            case "/delete-archive": {
                if (request.method !== "POST") return methodNotAllowedResponse();
                if (isUnauthorized(request, env)) return unauthorizedResponse();

                let payload;
                try {
                    payload = await request.json();
                } catch (e) {
                    return textResponse("Invalid JSON payload", 400);
                }

                if (!payload.slug) {
                    return textResponse("Missing required field: slug", 400);
                }

                try {
                    const logger = new Logger();
                    await env.LOL_KV.delete(`ARCHIVE_${payload.slug}`);
                    
                    // 重新生成 archive HTML
                    const archiveHTML = await generateArchiveStaticHTML(env);
                    await env.LOL_KV.put("ARCHIVE_STATIC_HTML", archiveHTML);
                    
                    logger.success(`🗑️ [DELETE] | 📦 ${payload.name}`);
                    await appendLogs(env, logger);
                    
                    return okResponse();
                } catch (err) {
                    return textResponse(`Delete Error: ${err.message}`, 500);
                }
            }

            case "/manual-archive": {
                if (request.method !== "POST") return methodNotAllowedResponse();
                if (isUnauthorized(request, env)) return unauthorizedResponse();

                let payload;
                try {
                    payload = await request.json();
                } catch (e) {
                    return textResponse("Invalid JSON payload", 400);
                }

                if (!payload.slug || !payload.name || !payload.overview_page || !payload.league) {
                    return textResponse("Missing required fields. Please provide slug, name, overview_page, and league.", 400);
                }

                try {
                    const logger = new Logger();
                    let teamsRaw = null;
                    try {
                        teamsRaw = await gh.fetchJson(env, "teams.json");
                    } catch (e) {}
                    
                    // 处理 overview_page：支持逗号分隔或 JSON 数组格式
                    let overviewPages = payload.overview_page;
                    if (typeof overviewPages === 'string') {
                        const trimmed = overviewPages.trim();
                        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                            try {
                                overviewPages = JSON.parse(trimmed);
                            } catch (e) {
                                overviewPages = trimmed.split(',').map(s => s.trim()).filter(s => s.length > 0);
                            }
                        } else {
                            overviewPages = trimmed.split(',').map(s => s.trim()).filter(s => s.length > 0);
                        }
                    } else if (!Array.isArray(overviewPages)) {
                        overviewPages = [overviewPages];
                    }
                    
                    // 创建空的存档（仅元数据，无比赛数据）
                    const snapshot = {
                        tourn: {
                            slug: payload.slug,
                            name: payload.name,
                            overview_page: overviewPages,
                            league: payload.league,
                            start_date: payload.start_date || null,
                            end_date: payload.end_date || null
                        },
                        rawMatches: [], // 空数据
                        updateTimestamps: { [payload.slug]: Date.now() },
                        team_map: pickTeamMap(teamsRaw, { slug: payload.slug, league: payload.league }, [])
                    };
                    
                    await env.LOL_KV.put(`ARCHIVE_${payload.slug}`, JSON.stringify(snapshot));
                    
                    // 重新生成 archive HTML
                    const archiveHTML = await generateArchiveStaticHTML(env);
                    await env.LOL_KV.put("ARCHIVE_STATIC_HTML", archiveHTML);
                    
                    logger.success(`📦 [MANUAL] | 📝 ${payload.name}`);
                    await appendLogs(env, logger);
                    
                    return okResponse();
                } catch (err) {
                    return textResponse(`Save Error: ${err.message}`, 500);
                }
            }

            case "/tools": {
                // 读取现有归档，生成重构列表
                let existingArchives = [];
                try {
                    const allKeys = await env.LOL_KV.list({ prefix: "ARCHIVE_" });
                    const dataKeys = allKeys.keys.filter(k => k.name !== "ARCHIVE_STATIC_HTML");
                    const rawSnapshots = await Promise.all(dataKeys.map(k => env.LOL_KV.get(k.name, { type: "json" })));
                    // 提取出有效的 tournament 基础信息
                    existingArchives = rawSnapshots.filter(s => s && s.tourn).map(s => s.tourn);
                } catch(e) {
                    console.error("Error fetching archives for tools page", e);
                }
                
                return htmlResponse(renderToolsPage(time, sha, existingArchives));
            }

            case "/logs": {
                const logs = await env.LOL_KV.get("LOGS", { type: "json" }) || [];
                return htmlResponse(renderLogPage(logs, time, sha));
            }
            
            case "/archive": {
                return respondCachedHtml(
                    env,
                    "ARCHIVE_STATIC_HTML",
                    "Archive initializing... Please <a href='/tools'>run a Local UI Refresh</a> or wait for the next background update."
                );
            }

            case "/": {
                return respondCachedHtml(
                    env,
                    "HOME_STATIC_HTML",
                    "Initializing... Please wait for the first background update or <a href='/tools'>run a Refresh API</a>."
                );
            }

            case "/favicon.ico":
                return new Response(null, { status: 204 });

            default: return textResponse("404 Not Found", 404);
        }
    },

    async scheduled(event, env, ctx) {
        const l = await runUpdate(env, false);
        await appendLogs(env, l, true);
    }
};
