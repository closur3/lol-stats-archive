export function isRestDayMeta(meta) {
  const earliest = Number(meta?.todayEarliestTimestamp) || 0;
  const unfinished = Number(meta?.todayUnfinished) || 0;
  const historyUnfinished = !!meta?.hasHistoryUnfinished;
  return earliest === 0 && unfinished === 0 && !historyUnfinished;
}

export function resolveHomeEmoji(meta, nowMs = Date.now()) {
  const earliest = Number(meta?.todayEarliestTimestamp) || 0;
  const unfinished = Number(meta?.todayUnfinished) || 0;
  const historyUnfinished = !!meta?.hasHistoryUnfinished;

  if (historyUnfinished || (unfinished > 0 && earliest > 0 && nowMs >= earliest)) return "🎮";
  if (earliest > 0) return nowMs >= earliest ? "👀" : "⏳";
  return "🕊️";
}

export function resolveLogsPhaseLabel(phase, meta) {
  if (phase === "window") return "🎮WINDOW";
  if (phase === "tail") return "👀TAIL";
  return isRestDayMeta(meta) ? "🕊️OFFDAY" : "⏳IDLE";
}

