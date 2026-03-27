// --- 常量定义 ---
export const BOT_UA = `LoLStatsWorker/2026 (User:HsuX)`;
export const GITHUB_COMMIT_BASE = "https://github.com/closur3/lol-stats-archive/commit/";

// 时间相关常量 (纯UTC)
export const SLOW_THRESHOLD = 120 * 60 * 1000; // 2小时（毫秒）
export const MATCH_EXPIRY_HOURS = 48; // 跨天比赛保留时间
export const MAX_LOGS = 100; // 最大日志条数
export const FETCH_DELAY_MS = 2000; // API请求间隔
export const MAX_RETRIES = 3; // 最大重试次数

// KV键名
export const KV_KEYS = {
  HOME_PREFIX: "HOME_",
  ARCHIVE_PREFIX: "ARCHIVE_",
  LOGS: "LOGS",
  HOME_STATIC_HTML: "HOME_STATIC_HTML",
  ARCHIVE_STATIC_HTML: "ARCHIVE_STATIC_HTML"
};

// 获取HOME键名
export const getHomeKey = (slug) => `HOME_${slug}`;

// 赛事状态
export const MATCH_STATUS = {
  LIVE: 'LIVE',
  FINISHED: 'FINISHED',
  UPCOMING: 'UPCOMING'
};

// 表格列索引
export const TABLE_COLUMNS = {
  TEAM: 0,
  BO3: 1,
  BO3_PCT: 2,
  BO5: 3,
  BO5_PCT: 4,
  SERIES: 5,
  SERIES_WR: 6,
  GAME: 7,
  GAME_WR: 8,
  STREAK: 9,
  LAST_DATE: 10
};

// 响应图标
export const ICONS = {
  WIN: '✔',
  LOSS: '❌',
  LIVE: '🔵',
  UPCOMING: '🕒'
};

// 错误消息
export const ERROR_MESSAGES = {
  AUTH_FAILED: "Session expired or incorrect password.",
  NETWORK_ERROR: "❌ Network connection failed",
  REBUILD_REQUIRED: "⚠️ Please fill in all 4 fields.",
  INVALID_JSON: "Invalid JSON payload",
  MISSING_FIELDS: "Missing required fields",
  NO_MATCHES: "No matches found",
  SERVER_ERROR: "⚠️ Server Error: "
};