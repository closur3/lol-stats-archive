import { GitHubClient } from '../api/githubClient.js';
import { FandomClient } from '../api/fandomClient.js';
import { Analyzer } from './analyzer.js';
import { HTMLRenderer } from '../render/htmlRenderer.js';
import { dateUtils } from '../utils/dateUtils.js';
import { dataUtils } from '../utils/dataUtils.js';
import { KV_KEYS, SLOW_THRESHOLD, MATCH_EXPIRY_HOURS } from '../utils/constants.js';

/**
 * 更新管理器
 */
export class Updater {
  constructor(env) {
    this.env = env;
    this.githubClient = new GitHubClient(env);
    this.logger = new Logger();
  }

  /**
   * 运行更新任务
   */
  async runUpdate(force = false) {
    const NOW = Date.now();
    const UPDATE_ROUNDS = 1;

    // 加载配置
    let runtimeConfig = null;
    let teamsRaw = null;
    try {
      teamsRaw = await this.githubClient.fetchJson("config/teams.json");
      const tourns = await this.githubClient.fetchJson("config/tour.json");
      if (tourns) runtimeConfig = { TOURNAMENTS: tourns };
    } catch (e) {}

    if (!runtimeConfig) {
      this.logger.error(`🔴 [ERR!] | ❌ Config(Fail)`);
      return this.logger;
    }

    // 清理过期的HOME键
    await this.cleanupStaleHomeKeys(runtimeConfig);

    // 加载缓存数据
    const cache = await this.loadCachedData(runtimeConfig.TOURNAMENTS);
    runtimeConfig.TOURNAMENTS = dateUtils.sortTournamentsByDate(runtimeConfig.TOURNAMENTS);

    // 为每个锦标赛附加team_map
    for (const tourn of (runtimeConfig.TOURNAMENTS || [])) {
      const rawMatches = cache.rawMatches[tourn.slug] || [];
      tourn.team_map = dataUtils.pickTeamMap(teamsRaw, tourn, rawMatches);
    }

    // 确定需要更新的锦标赛
    const candidates = this.determineCandidates(runtimeConfig.TOURNAMENTS, cache, NOW, force);
    if (candidates.length === 0) {
      console.log(`[SKIP] All tournaments skipped`);
      return this.logger;
    }

    // 登录到Fandom
    const authContext = await FandomClient.login(this.env.FANDOM_USER, this.env.FANDOM_PASS);
    const fandomClient = new FandomClient(authContext);

    // 执行数据抓取
    const results = await this.fetchMatchData(fandomClient, candidates, cache, NOW, force);

    // 处理结果
    const { failedSlugs, syncItems, idleItems, breakers, apiErrors } = this.processResults(results, cache, NOW, force, runtimeConfig);

    // 加载模式覆盖配置
    const modeOverrides = await this.env.LOL_KV.get(KV_KEYS.MODE_OVERRIDES, { type: "json" }) || {};

    // 分析数据
    const oldTournMeta = cache.meta?.tournaments || {};
    const analysis = Analyzer.runFullAnalysis(cache.rawMatches, oldTournMeta, runtimeConfig, failedSlugs, modeOverrides);

    // 生成日志
    this.generateLog(syncItems, idleItems, breakers, apiErrors, authContext, analysis, runtimeConfig, oldTournMeta);

    // 保存数据
    await this.saveData(runtimeConfig, cache, analysis, syncItems);

    return this.logger;
  }

  /**
   * 清理过期的HOME键
   */
  async cleanupStaleHomeKeys(runtimeConfig) {
    try {
      const allHomeKeys = await this.env.LOL_KV.list({ prefix: KV_KEYS.HOME_PREFIX });
      const activeSlugs = new Set((runtimeConfig.TOURNAMENTS || []).map(t => t.slug));
      const staleKeys = allHomeKeys.keys
        .map(k => k.name)
        .filter(n => n !== KV_KEYS.HOME_STATIC_HTML)
        .filter(n => {
          const slug = n.slice(KV_KEYS.HOME_PREFIX.length);
          return !activeSlugs.has(slug);
        });
      for (const key of staleKeys) await this.env.LOL_KV.delete(key);
    } catch (e) {}
  }

  /**
   * 加载缓存数据
   */
  async loadCachedData(tournaments) {
    const cache = { rawMatches: {}, updateTimestamps: {}, meta: { tournaments: {} } };
    
    const homeEntries = await Promise.all((tournaments || []).map(async t => {
      const data = await this.env.LOL_KV.get(KV_KEYS.HOME_PREFIX + t.slug, { type: "json" });
      return [t.slug, data];
    }));
    
    homeEntries.forEach(([slug, home]) => {
      if (home && home.rawMatches) cache.rawMatches[slug] = home.rawMatches;
      if (home && home.updateTimestamps && home.updateTimestamps[slug]) cache.updateTimestamps[slug] = home.updateTimestamps[slug];
      if (home && home.tournMeta && home.tournMeta[slug]) cache.meta.tournaments[slug] = home.tournMeta[slug];
    });
    
    return cache;
  }

  /**
   * 确定需要更新的候选锦标赛
   */
  determineCandidates(tournaments, cache, NOW, force) {
    const candidates = [];
    
    tournaments.forEach(tournament => {
      const lastTs = cache.updateTimestamps[tournament.slug] || 0;
      const elapsed = NOW - lastTs;

      const tMetaFromKV = (cache.meta?.tournaments && cache.meta.tournaments[tournament.slug]);

      if (!tMetaFromKV) {
        console.log(`[THRESHOLD] ${tournament.slug}: NO_KV_DATA, use fast mode, threshold=0`);
        candidates.push({
          slug: tournament.slug, 
          overview_page: tournament.overview_page, 
          league: tournament.league,
          mode: "fast",
          start_date: tournament.start_date || null
        });
        return;
      }

      const currentMode = tMetaFromKV.mode;
      const startTs = tMetaFromKV.startTs || 0;

      const isMatchStarted = startTs > 0 && NOW >= startTs;
      const threshold = (currentMode === "slow" && !isMatchStarted) ? SLOW_THRESHOLD : 0;

      console.log(`[THRESHOLD] ${tournament.slug}: mode=${currentMode}, startTs=${startTs}, isMatchStarted=${isMatchStarted}, threshold=${threshold/1000/60}m, elapsed=${elapsed/1000/60}m`);

      if (force || elapsed >= threshold) {
        candidates.push({
          slug: tournament.slug, 
          overview_page: tournament.overview_page, 
          league: tournament.league,
          mode: currentMode,
          start_date: tournament.start_date || null
        });
      } else {
        console.log(`[SKIP] ${tournament.slug}: mode=${currentMode}, elapsed=${elapsed/1000/60}m < threshold=${threshold/1000/60}m`);
      }
    });

    return candidates;
  }

  /**
   * 抓取比赛数据
   */
  async fetchMatchData(fandomClient, candidates, cache, NOW, force) {
    const pastDateObj = new Date(NOW - 48 * 60 * 60 * 1000);
    const futureDateObj = new Date(NOW + 48 * 60 * 60 * 1000);
    const deltaStartUTC = pastDateObj.toISOString().slice(0, 10);
    const deltaEndUTC = futureDateObj.toISOString().slice(0, 10);

    const batch = candidates.slice(0, Math.ceil(candidates.length / 1));
    const results = [];

    for (const c of batch) {
      try {
        const oldData = cache.rawMatches[c.slug] || [];
        let beforeFirstMatch = false;
        if (c.start_date) {
          const startDt = dateUtils.parseDate(`${c.start_date} 00:00:00`);
          if (startDt && NOW < startDt.getTime()) beforeFirstMatch = true;
        }
        const isFullFetch = force || oldData.length === 0 || c.mode === "slow" || beforeFirstMatch;
        const dateQuery = isFullFetch ? null : { start: deltaStartUTC, end: deltaEndUTC };

        const data = await fandomClient.fetchAllMatches(c.slug, c.overview_page, dateQuery);
        results.push({ status: 'fulfilled', slug: c.slug, data: data, isDelta: !isFullFetch });
      } catch (err) {
        results.push({ status: 'rejected', slug: c.slug, err: err });
      }
      if (c !== batch[batch.length - 1]) await new Promise(res => setTimeout(res, 2000));
    }

    return results;
  }

  /**
   * 处理抓取结果
   */
  processResults(results, cache, NOW, force, runtimeConfig) {
    const failedSlugs = new Set();
    const syncItems = [];
    const idleItems = [];
    const breakers = [];
    const apiErrors = [];

    const getDisplayName = (slug) => {
      const tournament = runtimeConfig.TOURNAMENTS.find(t => t.slug === slug);
      return tournament ? (tournament.league || tournament.name || slug.toUpperCase()) : slug;
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

    const getField = (match, name) => {
      const keys = fieldAliases[name] || [name];
      for (const k of keys) {
        if (match != null && Object.prototype.hasOwnProperty.call(match, k)) return match[k];
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

    const getUniqueKey = (match) => {
      const id = match.MatchId ?? match["MatchId"];
      return String(id ?? "");
    };

    results.forEach(res => {
      if (res.status === 'fulfilled') {
        const slug = res.slug;
        const newData = res.data || [];
        const oldData = cache.rawMatches[slug] || [];

        if (res.isDelta) {
          if (newData.length > 0) {
            const matchMap = new Map();
            oldData.forEach(match => matchMap.set(getUniqueKey(match), match));

            let changesCount = 0;
            newData.forEach(match => {
              const key = getUniqueKey(match);
              const oldMatch = matchMap.get(key);
              if (!oldMatch || !isSameMatch(oldMatch, match)) {
                matchMap.set(key, match);
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
              syncItems.push({ slug, dName: getDisplayName(slug), type: "delta", count: changesCount });
            } else {
              idleItems.push({ slug, dName: getDisplayName(slug), type: "delta", count: 0 });
            }
          } else {
            idleItems.push({ slug, dName: getDisplayName(slug), type: "delta", count: 0 });
          }
        } else {
          if (!force && oldData.length > 10 && newData.length < oldData.length * 0.9) {
            breakers.push(`${slug}(Drop)`);
            failedSlugs.add(slug);
          } else {
            cache.rawMatches[slug] = newData;
            if (JSON.stringify(oldData) !== JSON.stringify(newData)) {
              syncItems.push({ slug, dName: getDisplayName(slug), type: "full", count: newData.length });
            } else {
              idleItems.push({ slug, dName: getDisplayName(slug), type: "full", count: newData.length });
            }
          }
        }
        cache.updateTimestamps[slug] = NOW;
      } else {
        apiErrors.push(`${res.slug}(Fail)`);
        failedSlugs.add(res.slug);
      }
    });

    return { failedSlugs, syncItems, idleItems, breakers, apiErrors };
  }

  /**
   * 生成日志
   */
  generateLog(syncItems, idleItems, breakers, apiErrors, authContext, analysis, runtimeConfig, oldTournMeta) {
    const isAnon = (!authContext || authContext.isAnonymous);
    const authPrefix = isAnon ? "👻 " : "";
    
    // 格式化倒计时信息
    const formatCountdown = (slug) => {
      const metaNow = analysis.tournMeta[slug] || oldTournMeta[slug] || { mode: "fast" };
      const mode = metaNow.mode;
      const modeIcon = mode === "slow" ? "🐌" : "⚡";
      const countdownMins = mode === "slow"
        ? Math.ceil(SLOW_THRESHOLD / 60000)
        : Number(this.env.CRON_INTERVAL_MINUTES) || 5; // 从环境变量读取，默认5分钟
      return { modeIcon, countdownMins, mode };
    };

    // 格式化项目信息
    const formatItem = (item) => {
      const info = formatCountdown(item.slug);
      const prefix = item.type === "delta" ? "+" : "*";
      return `${item.dName} ${prefix}${item.count} (${info.modeIcon}${info.countdownMins}m)`;
    };

    const syncDetails = syncItems.map(formatItem);
    const idleDetails = idleItems.map(formatItem);
    
    // 模式切换检测
    const modeSwitches = [];
    Object.keys(analysis.tournMeta).forEach(slug => {
      const oldMode = (oldTournMeta[slug] && oldTournMeta[slug].mode) || "fast";
      const newMode = analysis.tournMeta[slug].mode;

      if (oldMode !== newMode) {
        const tournament = runtimeConfig.TOURNAMENTS.find(it => it.slug === slug);
        const displayName = tournament ? (tournament.league || tournament.name || slug.toUpperCase()) : slug;
        const arrow = oldMode === "fast" ? "⚡->🐌" : "🐌->⚡";
        modeSwitches.push(`${displayName}(${arrow})`);
      }
    });

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
    if (trafficLight === "🔴") this.logger.error(finalLog); else this.logger.success(finalLog);
  }

  /**
   * 保存数据
   */
  async saveData(runtimeConfig, cache, analysis, syncItems) {
    // 保存首页静态HTML
    try {
      const homeFragment = HTMLRenderer.renderContentOnly(
        analysis.globalStats, analysis.timeGrid, analysis.scheduleMap,
        runtimeConfig, false, analysis.tournMeta
      );
      const fullPage = HTMLRenderer.renderPageShell("LoL Insights", homeFragment, "home");
      const existingHomeHTML = await this.env.LOL_KV.get(KV_KEYS.HOME_STATIC_HTML);
      if (existingHomeHTML !== fullPage) {
        console.log(`[KV] PUT ${KV_KEYS.HOME_STATIC_HTML}`);
        await this.env.LOL_KV.put(KV_KEYS.HOME_STATIC_HTML, fullPage);
      }
    } catch (e) {
      console.error("Error generating home HTML:", e);
    }

    // 按slug组织赛程数据
    const scheduleBySlug = {};
    Object.keys(analysis.scheduleMap || {}).forEach(date => {
      const list = analysis.scheduleMap[date] || [];
      list.forEach(match => {
        const slug = match.slug;
        if (!scheduleBySlug[slug]) scheduleBySlug[slug] = {};
        if (!scheduleBySlug[slug][date]) scheduleBySlug[slug][date] = [];
        scheduleBySlug[slug][date].push(match);
      });
    });

    // 保存每个锦标赛的数据
    const writePromises = [];
    for (const tournament of runtimeConfig.TOURNAMENTS) {
      const slug = tournament.slug;
      const raw = cache.rawMatches[slug] || [];
      const ts = cache.updateTimestamps[slug] || 0;
      const stats = analysis.globalStats[slug] || {};
      const grid = analysis.timeGrid[slug] || {};
      const tournamentMeta = analysis.tournMeta[slug] ? { [slug]: analysis.tournMeta[slug] } : {};

      const teamMap = tournament.team_map || {};
      const { team_map: _, ...tournamentStored } = tournament;

      const homeSnapshot = {
        tourn: tournamentStored,
        rawMatches: raw,
        updateTimestamps: { [slug]: ts },
        stats: stats,
        timeGrid: grid,
        scheduleMap: scheduleBySlug[slug] || {},
        tournMeta: tournamentMeta,
        team_map: teamMap
      };

      // 数据变化检测
      const homeKey = KV_KEYS.HOME_PREFIX + slug;
      const existingHome = await this.env.LOL_KV.get(homeKey, { type: "json" });
      const mode = tournamentMeta[slug]?.mode || "fast";
      let homeHasChanges = !existingHome ||
          JSON.stringify(existingHome.rawMatches || []) !== JSON.stringify(raw) ||
          JSON.stringify(existingHome.tournMeta || {}) !== JSON.stringify(tournamentMeta);

      if (mode === "slow") {
        homeHasChanges = homeHasChanges ||
          JSON.stringify(existingHome.updateTimestamps || {}) !== JSON.stringify({ [slug]: ts });
      }

      if (homeHasChanges) {
        console.log(`[KV] PUT ${homeKey}`);
        writePromises.push(this.env.LOL_KV.put(homeKey, JSON.stringify(homeSnapshot)));
      }

      // 保存归档数据
      if (stats && Object.keys(stats).length > 0) {
        const snapshot = { tourn: tournamentStored, rawMatches: raw, updateTimestamps: { [slug]: ts }, team_map: teamMap };
        const archiveKey = `ARCHIVE_${slug}`;
        const existingArchive = await this.env.LOL_KV.get(archiveKey, { type: "json" });
        const archiveHasChanges = !existingArchive ||
            JSON.stringify(existingArchive.rawMatches || []) !== JSON.stringify(raw);

        if (archiveHasChanges) {
          console.log(`[KV] PUT ${archiveKey}`);
          writePromises.push(this.env.LOL_KV.put(archiveKey, JSON.stringify(snapshot)));
        }
      }
    }

    await Promise.all(writePromises);

    // 只有当有数据变化时才重新生成归档HTML
    if (syncItems.length > 0) {
      try {
        const archiveHTML = await this.generateArchiveStaticHTML();
        const existingArchiveHTML = await this.env.LOL_KV.get(KV_KEYS.ARCHIVE_STATIC_HTML);
        if (existingArchiveHTML !== archiveHTML) {
          console.log(`[KV] PUT ${KV_KEYS.ARCHIVE_STATIC_HTML}`);
          await this.env.LOL_KV.put(KV_KEYS.ARCHIVE_STATIC_HTML, archiveHTML);
        }
      } catch (e) {
        console.error("Error generating archive HTML:", e);
      }
    }
  }

  /**
   * 生成归档静态HTML
   */
  async generateArchiveStaticHTML() {
    try {
      const allKeys = await this.env.LOL_KV.list({ prefix: "ARCHIVE_" });
      const dataKeys = allKeys.keys.filter(k => k.name !== KV_KEYS.ARCHIVE_STATIC_HTML);

      if (!dataKeys.length) {
        return HTMLRenderer.renderPageShell("LoL Archive", `<div class="arch-content arch-empty-msg">No archive data available.</div>`, "archive");
      }

      const rawSnapshots = await Promise.all(dataKeys.map(k => this.env.LOL_KV.get(k.name, { type: "json" })));
      let validSnapshots = rawSnapshots.filter(s => s && s.tourn && s.tourn.slug);

      validSnapshots = dataUtils.sortTournamentsByDate(validSnapshots);

      const combined = validSnapshots.map(snap => {
        const tournamentWithMap = { ...snap.tourn, team_map: snap.team_map || {} };
        const miniConfig = { TOURNAMENTS: [tournamentWithMap] };
        const analysis = Analyzer.runFullAnalysis({ [snap.tourn.slug]: snap.rawMatches || [] }, {}, miniConfig);
        const statsObj = analysis.globalStats[snap.tourn.slug] || {};
        const timeObj = analysis.timeGrid[snap.tourn.slug] || {};
        const content = HTMLRenderer.renderContentOnly(
          { [snap.tourn.slug]: statsObj },
          { [snap.tourn.slug]: timeObj },
          {}, miniConfig, true
        );
        return content;
      }).join("");

      return HTMLRenderer.renderPageShell("LoL Archive", `<div class="arch-content">${combined}</div>`, "archive");
    } catch (e) {
      return HTMLRenderer.renderPageShell("LoL Archive Error", `<div class="arch-error-msg">Error generating archive: ${e.message}</div>`, "archive");
    }
  }
}

/**
 * 日志记录器
 */
class Logger {
  constructor() { 
    this.l = []; 
  }
  
  error(m) { 
    this.l.push({
      t: dateUtils.getNow().short, 
      l: 'ERROR', 
      m: m
    }); 
  }
  
  success(m) { 
    this.l.push({
      t: dateUtils.getNow().short, 
      l: 'SUCCESS', 
      m: m
    }); 
  }
  
  export() { 
    return this.l; 
  }
}