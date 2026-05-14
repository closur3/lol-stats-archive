export const dateUtils = {
  /**
   * 补零函数
   */
  pad: (value) => value < 10 ? '0' + value : value,

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
    if (!dateStringInput) throw new Error(`Invalid date format: ${dateStringInput}`);
    if (dateStringInput.includes('T')) {
      return new Date(dateStringInput);
    }
    return new Date(dateStringInput + (dateStringInput.endsWith('Z') ? '' : 'Z'));
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
  pruneScheduleMapByDayStatus: (scheduleMap, maxDays = 8, todayStr, hasHistoryUnfinished = {}) => {
    if (!todayStr) throw new Error("todayStr is required");
    if (!scheduleMap || typeof scheduleMap !== "object" || Array.isArray(scheduleMap)) {
      throw new Error("scheduleMap must be a JSON object");
    }
    const today = todayStr;
    const kept = {};

    Object.keys(scheduleMap).sort().forEach(date => {
      const matches = scheduleMap[date];
      if (!Array.isArray(matches)) throw new Error(`scheduleMap.${date} must be an array`);
      if (date >= today) {
        kept[date] = matches;
        return;
      }
      const slugHasUnfinished = matches.some(match => hasHistoryUnfinished[match?.slug]);
      if (slugHasUnfinished) kept[date] = matches;
    });

    const limited = {};
    Object.keys(kept).sort().slice(0, Math.max(1, Number(maxDays))).forEach(date => {
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
