export function buildResolveName(teamMap = {}) {
  const teamMapEntries = Object.entries(teamMap || {}).map(([key, value]) => {
    const upperKey = String(key || "").toUpperCase();
    return {
      key: upperKey,
      value,
      keyTokens: upperKey.split(/\s+/).filter(Boolean)
    };
  });
  const exactTeamMap = new Map(teamMapEntries.map(teamEntry => [teamEntry.key, teamEntry.value]));
  const nameCache = new Map();

  return (rawName) => {
    if (!rawName) return "Unknown";
    if (nameCache.has(rawName)) return nameCache.get(rawName);

    let resolvedName = rawName;
    const upperName = rawName.toUpperCase();

    if (upperName.includes("TBD") || upperName.includes("TBA") || upperName.includes("TO BE DETERMINED")) {
      resolvedName = "TBD";
    } else {
      const exactName = exactTeamMap.get(upperName);
      let match = exactName ? { value: exactName } : null;
      if (!match) match = teamMapEntries.find(teamEntry => upperName.includes(teamEntry.key));
      if (!match) {
        const inputTokens = upperName.split(/\s+/);
        match = teamMapEntries.find(teamEntry => {
          return inputTokens.every(token => teamEntry.keyTokens.includes(token));
        });
      }
      if (match) resolvedName = match.value;
    }
    nameCache.set(rawName, resolvedName);
    return resolvedName;
  };
}