import { CST_OFFSET } from './constants.js';

/**
 * 日期时间工具函数
 */
export const dateUtils = {
  /**
   * 补零函数
   */
  pad: (n) => n < 10 ? '0' + n : n,

  /**
   * 转换为CST时间
   */
  toCST: (ts) => new Date((ts || Date.now()) + CST_OFFSET),

  /**
   * 获取时间部分
   */
  timeParts: (ts) => {
    const date = dateUtils.toCST(ts);
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
   * 获取当前时间信息
   */
  getNow: () => {
    const parts = dateUtils.timeParts();
    const isoString = `${parts.y}-${parts.mo}-${parts.da} ${parts.h}:${parts.m}:${parts.s}`;
    return { 
      dateTime: dateUtils.toCST(), 
      full: isoString, 
      short: isoString.slice(2), 
      date: isoString.slice(0, 10), 
      time: isoString.slice(11, 16) 
    };
  },

  /**
   * 格式化日期
   */
  fmtDate: (timestamp) => {
    if (!timestamp) return "(Pending)";
    const parts = dateUtils.timeParts(timestamp);
    return `${parts.y.toString().slice(2)}-${parts.mo}-${parts.da} ${parts.h}:${parts.m}`;
  },

  /**
   * 解析日期字符串
   */
  parseDate: (str) => {
    if(!str) return null;
    try { 
      return new Date(str.replace(" ", "T") + "Z"); 
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
  isCrossDayKeep: (matchDateStr, todayStr, isFinished, isLive) => {
    if (matchDateStr >= todayStr) return false;
    
    if (!isFinished && isLive) return true;
    
    if (isFinished) {
      const matchDateUTC = new Date(matchDateStr + " 00:00:00 UTC");
      const matchDateCST_Ts = matchDateUTC.getTime() - CST_OFFSET;
      const expireTs = matchDateCST_Ts + 48 * 60 * 60 * 1000;
      return Date.now() < expireTs;
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
  }
};