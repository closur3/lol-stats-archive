// --- 常量定义 ---
export const BOT_UA = `LoLStatsWorker/2026 (User:HsuX)`;
export const GITHUB_COMMIT_BASE = "https://github.com/closur3/lol-stats-archive/commit/";

// 时间相关常量 (纯UTC)
export const FETCH_DELAY_MS = 2000; // API请求间隔
export const MAX_RETRIES = 3; // 最大重试次数

// KV键名
export const KV_KEYS = {
  HOME_PREFIX: "HOME_",
  ARCHIVE_PREFIX: "ARCHIVE_",
  HOME_STATIC_HTML: "HOME_STATIC_HTML",
  ARCHIVE_STATIC_HTML: "ARCHIVE_STATIC_HTML",
  META: "Meta"
};
