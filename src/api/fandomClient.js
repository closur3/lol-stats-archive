import { BOT_UA, MAX_RETRIES, FETCH_DELAY_MS } from '../utils/constants.js';
import { dateUtils } from '../utils/dateUtils.js';
import { dataUtils } from '../utils/dataUtils.js';

/**
 * Fandom API 客户端
 */
export class FandomClient {
  constructor(authContext = null) {
    this.authContext = authContext;
  }

  /**
   * 登录到Fandom
   */
  static async login(user, pass) {
    if (user && user.trim().toLowerCase() === "anonymous") {
      return { isAnonymous: true };
    }
    if (!user || !pass) {
      return null;
    }

    const API = "https://lol.fandom.com/api.php";
    const MAX_LOGIN_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_LOGIN_RETRIES; attempt++) {
      try {
        const tokenResp = await fetch(`${API}?action=query&meta=tokens&type=login&format=json`, {
          headers: { "User-Agent": BOT_UA }
        });
        if (!tokenResp.ok) throw new Error(`Token HTTP Error: ${tokenResp.status}`);

        const tokenData = await tokenResp.json();
        const loginToken = tokenData?.query?.tokens?.logintoken;
        if (!loginToken) throw new Error("Failed to get login token");

        const step1Cookie = dataUtils.extractCookies(tokenResp.headers);

        const params = new URLSearchParams();
        params.append("action", "login"); params.append("format", "json");
        params.append("lgname", user); params.append("lgpassword", pass); params.append("lgtoken", loginToken);

        const loginResp = await fetch(API, {
          method: "POST", body: params,
          headers: { "User-Agent": BOT_UA, "Cookie": step1Cookie }
        });
        const loginData = await loginResp.json();

        if (loginData.login && loginData.login.result === "Success") {
          const step2Cookie = dataUtils.extractCookies(loginResp.headers);
          const finalCookie = `${step1Cookie}; ${step2Cookie}`;
          return { cookie: finalCookie, username: loginData.login.lgusername };
        } else {
          throw new Error(`Login Failed: ${loginData.login?.result || "unknown"}`);
        }
      } catch (error) {
        console.error(`[Fandom Login] Attempt ${attempt}/${MAX_LOGIN_RETRIES}: ${error.message}`);
        if (attempt < MAX_LOGIN_RETRIES) {
          await new Promise(resolveDelay => setTimeout(resolveDelay, attempt * 2000));
        }
      }
    }

    console.error("[Fandom Login] All attempts failed, falling back to anonymous");
    return null;
  }

  /**
   * 获取页面最新 revision（用于轻量变更检测）
   */
  static async fetchLatestRevision(pageTitle, maxRetries = 3) {
    const API = "https://lol.fandom.com/api.php";
    const params = new URLSearchParams({
      action: "query",
      prop: "revisions",
      titles: pageTitle,
      rvlimit: "1",
      rvprop: "ids|timestamp",
      format: "json"
    });

    let attempt = 1;
    while (attempt <= maxRetries) {
      try {
        const resp = await fetch(`${API}?${params.toString()}`, {
          headers: { "User-Agent": BOT_UA, "Accept": "application/json" }
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const pagesObj = data?.query?.pages || {};
        const firstPage = Object.values(pagesObj)[0];
        if (!firstPage) throw new Error("Invalid revision payload");
        if (firstPage.missing !== undefined) {
          return {
            pageid: firstPage.pageid || null,
            title: firstPage.title || pageTitle,
            missing: true
          };
        }
        const rev = firstPage?.revisions?.[0];
        if (!rev || typeof rev.revid !== "number") throw new Error("Invalid revision payload");
        return {
          pageid: firstPage.pageid,
          title: firstPage.title || pageTitle,
          revid: rev.revid,
          parentid: rev.parentid || null,
          timestamp: rev.timestamp || null,
          missing: false
        };
      } catch (error) {
        if (attempt >= maxRetries) throw error;
        await new Promise(resolveDelay => setTimeout(resolveDelay, 1000 * attempt));
        attempt++;
      }
    }
  }

  /**
   * 带重试的fetch
   */
  async fetchWithRetry(url, maxRetries = MAX_RETRIES) {
    let attempt = 1;
    const headers = {
      "User-Agent": BOT_UA, 
      "Accept": "application/json", 
      "Accept-Encoding": "gzip, deflate, br"
    };
    if (this.authContext?.cookie) headers["Cookie"] = this.authContext.cookie;

    while (attempt <= maxRetries) {
      try {
        const response = await fetch(url, { headers });
        if (response.status === 429 || response.status === 503) {
          const retryAfter = response.headers.get("Retry-After");
          const waitSeconds = retryAfter ? parseInt(retryAfter) : 30;
          throw new Error(`Wait ${waitSeconds}s`);
        }

        const rawBody = await response.text();
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        let data;
        try { 
          data = JSON.parse(rawBody); 
        } catch (error) { 
          throw new Error(`JSON Parse Fail`); 
        }

        if (data.error) {
          if (data.error.code === "maxlag") {
            const retryAfter = response.headers.get("Retry-After") || 5;
            throw new Error(`Wait ${retryAfter}s`);
          }
          throw new Error(`API Error [${data.error.code}]`);
        }
        if (!data.cargoquery) throw new Error(`Structure Error`);
        return data.cargoquery;
      } catch (error) {
        let waitTimeMs = 15000 * Math.pow(2, attempt - 1);
        const match = error.message.match(/Wait (\d+)s/);
        if (match) waitTimeMs = parseInt(match[1]) * 1000;

        if (attempt >= maxRetries) {
          throw error;
        } else {
          await new Promise(resolveDelay => setTimeout(resolveDelay, waitTimeMs));
        }
        attempt++;
      }
    }
  }

  /**
   * 获取所有比赛
   */
  async fetchAllMatches(slug, sourceInput, dateFilter = null) {
    const pages = Array.isArray(sourceInput) ? sourceInput : [sourceInput];
    const inClause = pages.map(page => `'${page}'`).join(", ");
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

      const batchRaw = await this.fetchWithRetry(`https://lol.fandom.com/api.php?${params}`);
      const batch = batchRaw.map(record => record.title);

      if (!batch.length) break;

      all = all.concat(batch);
      offset += batch.length;

      if (dateFilter) break;
      if (batch.length < limit) break;

      await new Promise(resolveDelay => setTimeout(resolveDelay, FETCH_DELAY_MS));
    }
    return all;
  }
}
