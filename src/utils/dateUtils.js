/**
 * 日期时间工具函数 (纯UTC)
 */
export const dateUtils = {
  /**
   * 补零函数
   */
  pad: (value) => value < 10 ? '0' + value : value,

  /**
   * 获取UTC时间部分
   */
  getUtcTimeParts: (timestampInput) => {
    const date = timestampInput ? new Date(timestampInput) : new Date();
    return {
      year: date.getUTCFullYear(),
      month: dateUtils.pad(date.getUTCMonth() + 1),
      dayOfMonth: dateUtils.pad(date.getUTCDate()),
      hour: dateUtils.pad(date.getUTCHours()),
      minute: dateUtils.pad(date.getUTCMinutes()),
      second: dateUtils.pad(date.getUTCSeconds()),
      dayOfWeek: date.getUTCDay()
    };
  },

  /**
   * 获取当前UTC时间信息
   */
  getNow: () => {
    const date = new Date();
    const isoString = date.toISOString();
    const fullDateTimeString = isoString.replace('T', ' ').slice(0, 19);
    const shortDateTimeString = fullDateTimeString.slice(2);
    return {
      dateTime: date,
      isoString: isoString,
      fullDateTimeString: fullDateTimeString,
      shortDateTimeString: shortDateTimeString, // 保持原格式 "26-03-26 10:57:11"
      dateString: isoString.slice(0, 10),
      timeString: isoString.slice(11, 19),
      timestamp: date.getTime()
    };
  },

  /**
   * 格式化UTC日期
   */
  fmtDate: (timestamp) => {
    if (!timestamp) return "(Pending)";
    const utcTimeParts = dateUtils.getUtcTimeParts(timestamp);
    return `${utcTimeParts.year.toString().slice(2)}-${utcTimeParts.month}-${utcTimeParts.dayOfMonth} ${utcTimeParts.hour}:${utcTimeParts.minute}`;
  },

  /**
   * 转换为ISO字符串
   */
  toISO: (timestampInput) => {
    const date = timestampInput ? new Date(timestampInput) : new Date();
    return date.toISOString();
  },

  /**
   * 转换为ISO字符串 (无毫秒)
   */
  toISOShort: (timestampInput) => {
    const iso = dateUtils.toISO(timestampInput);
    return iso.replace(/\.\d{3}Z$/, 'Z');
  },

  /**
   * 解析日期字符串
   */
  parseDate: (dateStringInput) => {
    if(!dateStringInput) return null;
    try {
      if (dateStringInput.includes('T')) {
        return new Date(dateStringInput);
      }
      return new Date(dateStringInput + (dateStringInput.endsWith('Z') ? '' : 'Z'));
    } catch(error) {
      return null;
    }
  },

  /**
   * 根据日期距离现在的时间返回颜色
   */
  colorDate: (timestampInput) => {
    if (!timestampInput) return "#9ca3af";
    const diffDays = (Date.now() - timestampInput) / (1000 * 60 * 60 * 24);
    if (diffDays <= 1) return "hsl(215, 80%, 45%)";
    if (diffDays <= 3) return "hsl(215, 70%, 50%)";
    if (diffDays <= 7) return "hsl(215, 55%, 55%)";
    if (diffDays <= 14) return "hsl(215, 40%, 60%)";
    return "hsl(215, 40%, 60%)";
  },

  /**
   * 赛程按“天”清理：
   * - 当天及未来天保留
   * - 过期天仅在仍有未结束比赛时保留
   * - 最后按日期升序截断到 maxDays
   */
  pruneScheduleMapByDayStatus: (scheduleMap, maxDays = 8, todayStr = null) => {
    const today = todayStr || dateUtils.getNow().dateString;
    const kept = {};

    Object.keys(scheduleMap || {}).sort().forEach(date => {
      const matches = Array.isArray(scheduleMap[date]) ? scheduleMap[date] : [];
      if (date >= today) {
        kept[date] = matches;
        return;
      }
      const hasUnfinished = matches.some(match => !match || match.isFinished !== true);
      if (hasUnfinished) kept[date] = matches;
    });

    const limited = {};
    Object.keys(kept).sort().slice(0, Math.max(1, Number(maxDays) || 8)).forEach(date => {
      limited[date] = kept[date];
    });
    return limited;
  },

  /**
   * 排序锦标赛日期
   */
  sortTournamentsByDate: (tournaments) => {
    return [...tournaments].sort((leftTournament, rightTournament) => {
      const leftStart = leftTournament.start_date || '';
      const rightStart = rightTournament.start_date || '';
      const leftEnd = leftTournament.end_date || '';
      const rightEnd = rightTournament.end_date || '';

      if (leftStart !== rightStart) {
        if (!leftStart) return 1;
        if (!rightStart) return -1;
        return rightStart.localeCompare(leftStart);
      }

      if (leftEnd !== rightEnd) {
        if (!leftEnd) return 1;
        if (!rightEnd) return -1;
        return rightEnd.localeCompare(leftEnd);
      }

      return (leftTournament.slug || '').localeCompare(rightTournament.slug || '');
    });
  }
};
