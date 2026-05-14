function readMetaNumber(meta, key) {
  const number = Number(meta[key]);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`Invalid league meta ${key}`);
  }
  return number;
}

function readLeagueMeta(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    throw new Error("league meta must be a JSON object");
  }
  return {
    earliest: readMetaNumber(meta, "todayEarliestTimestamp"),
    unfinished: readMetaNumber(meta, "todayUnfinished"),
    historyUnfinished: meta.hasHistoryUnfinished === true
  };
}

export function isOffDayMeta(meta) {
  const { earliest, unfinished, historyUnfinished } = readLeagueMeta(meta);
  return earliest === 0 && unfinished === 0 && !historyUnfinished;
}

export function resolveLeaguePhase(meta, nowMs = Date.now()) {
  const { earliest, unfinished, historyUnfinished } = readLeagueMeta(meta);

  if (historyUnfinished) return "play";
  if (unfinished > 0) return earliest > 0 && nowMs < earliest ? "idle" : "play";
  if (earliest === 0) return "offday";
  return "idle";
}

export function resolveLogsPhaseLabel(meta, nowMs = Date.now()) {
  const phase = resolveLeaguePhase(meta, nowMs);
  if (phase === "play") return "🎮PLAY";
  if (phase === "offday") return "🕊️OFFDAY";
  return "⏳IDLE";
}

export function resolveHomeEmojiByPhase(meta, nowMs = Date.now()) {
  const phase = resolveLeaguePhase(meta, nowMs);
  if (phase === "play") return "🎮";
  if (phase === "offday") return "🕊️";
  return "⏳";
}
