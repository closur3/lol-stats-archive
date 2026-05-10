export function isOffDayMeta(meta) {
  const earliest = Number(meta?.todayEarliestTimestamp) || 0;
  const unfinished = Number(meta?.todayUnfinished) || 0;
  const historyUnfinished = !!meta?.hasHistoryUnfinished;
  return earliest === 0 && unfinished === 0 && !historyUnfinished;
}

export function resolveLogsPhaseLabel(phase, meta) {
  if (phase === "play") return "🎮PLAY";
  if (phase === "tail") return "👀TAIL";
  return isOffDayMeta(meta) ? "🕊️IDLE" : "⏳IDLE";
}

export function resolveHomeEmojiByPhase(phase, meta) {
  if (phase === "play") return "🎮";
  if (phase === "tail") return "👀";
  return isOffDayMeta(meta) ? "🕊️" : "⏳";
}
