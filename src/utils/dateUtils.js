/**
 * 日期时间工具函数 (纯UTC)
 */
export const dateUtils = {
  /**
   * 补零函数
   */
  pad: (n) => n < 10 ? '0' + n : n,

  /**
   * 获取UTC时间部分
   */
  timeParts: (ts) => {
    const date = ts ? new Date(ts) : new Date();
    return {
      y: date.getUTCFullYear(),
      mo: dateUtils.pad(date.getUTCMonth() + 1),
      da: dateUtils.pad(date.getUTCDate()),
      h: dateUtils.pad(date.getUTCHours()),
      m: dateUtils.pad(date.getUTCMinutes()),
      s: dateUtils.pad(date.getUTCSeconds()),
      day: date.getUTCDay()
    };
  },

  /**
   * 获取当前UTC时间信息
   */
  getNow: () => {
    const date = new Date();
    const isoString = date.toISOString();
    const full = isoString.replace('T', ' ').slice(0, 19);
    return {
      dateTime: date,
      iso: isoString,
      full: full,
      short: full.slice(2), // 保持原格式 "26-03-26 10:57:11"
      date: isoString.slice(0, 10),
      time: isoString.slice(11, 19),
      timestamp: date.getTime()
    };
  },

  /**
   * 格式化UTC日期
   */
  fmtDate: (timestamp) => {
    if (!timestamp) return "(Pending)";
    const parts = dateUtils.timeParts(timestamp);
    return `${parts.y.toString().slice(2)}-${parts.mo}-${parts.da} ${parts.h}:${parts.m}`;
  },

  /**
   * 转换为ISO字符串
   */
  toISO: (ts) => {
    const date = ts ? new Date(ts) : new Date();
    return date.toISOString();
  },

  /**
   * 转换为ISO字符串 (无毫秒)
   */
  toISOShort: (ts) => {
    const iso = dateUtils.toISO(ts);
    return iso.replace(/\.\d{3}Z$/, 'Z');
  },

  /**
   * 解析日期字符串
   */
  parseDate: (str) => {
    if(!str) return null;
    try {
      if (str.includes('T')) {
        return new Date(str);
      }
      return new Date(str + (str.endsWith('Z') ? '' : 'Z'));
    } catch(e) {
      return null;
    }
  },

  /**
   * 根据日期距离现在的时间返回颜色
   */
  colorDate: (ts) => {
    if (!ts) return "#9ca3af";
    const diffDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
    if (diffDays <= 1) return "hsl(215, 80%, 45%)";
    if (diffDays <= 3) return "hsl(215, 70%, 50%)";
    if (diffDays <= 7) return "hsl(215, 55%, 55%)";
    if (diffDays <= 14) return "hsl(215, 40%, 60%)";
    return "hsl(215, 40%, 60%)";
  },

  /**
   * 检查是否为跨天比赛
   */
  isCrossDayKeep: (matchDateStr, todayStr, isFinished, isLive, wasLive) => {
    if (matchDateStr >= todayStr) return false;
    if (!isFinished && isLive) return true;
    if (wasLive && isFinished) {
      const nextDay = new Date(matchDateStr + "T00:00:00Z");
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const nextDayStr = nextDay.toISOString().slice(0, 10);
      return todayStr <= nextDayStr;
    }
    return false;
  },

  /**
   * 排序锦标赛日期
   */
  sortTournamentsByDate: (tournaments) => {
    return [...tournaments].sort((a, b) => {
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
  }
};
