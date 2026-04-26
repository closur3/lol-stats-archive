export function clusterTimeSlots(finishedMatches, maxClusters) {
  const timeSet = new Set();
  for (const m of finishedMatches) {
    timeSet.add(m.roundedMinutes);
  }
  const sortedTimes = Array.from(timeSet).sort((a, b) => a - b);

  if (sortedTimes.length <= maxClusters) {
    return sortedTimes.map(t => ({
      actualCenter: t,
      centerMinutes: t,
      modeMinutes: null,
      label: String(Math.floor(t / 60)),
      matches: []
    }));
  }

  const THRESHOLD = 60;
  const clusters = [];
  let currentCluster = { centerMinutes: sortedTimes[0], times: [sortedTimes[0]] };

  for (let i = 1; i < sortedTimes.length; i++) {
    const time = sortedTimes[i];
    const dist = Math.abs(time - currentCluster.centerMinutes);
    if (dist <= THRESHOLD && clusters.length + 1 < maxClusters) {
      currentCluster.times.push(time);
      currentCluster.centerMinutes = Math.round(currentCluster.times.reduce((a, b) => a + b, 0) / currentCluster.times.length);
    } else {
      clusters.push(currentCluster);
      currentCluster = { centerMinutes: time, times: [time] };
    }
  }
  clusters.push(currentCluster);

  while (clusters.length > maxClusters) {
    let minDist = Infinity, mergeIdx = 0;
    for (let i = 0; i < clusters.length - 1; i++) {
      const dist = clusters[i + 1].centerMinutes - clusters[i].centerMinutes;
      if (dist < minDist) { minDist = dist; mergeIdx = i; }
    }
    const merged = {
      centerMinutes: Math.round((clusters[mergeIdx].centerMinutes + clusters[mergeIdx + 1].centerMinutes) / 2),
      times: [...clusters[mergeIdx].times, ...clusters[mergeIdx + 1].times]
    };
    clusters.splice(mergeIdx, 2, merged);
  }

  return clusters.map(c => {
    const utcHour = Math.round(c.centerMinutes / 60) % 24;
    return {
      actualCenter: c.centerMinutes,
      centerMinutes: utcHour * 60,
      modeMinutes: null,
      label: String(utcHour),
      matches: []
    };
  });
}

export function assignMatchesToClusters(finishedMatches, clusters) {
  for (const m of finishedMatches) {
    let bestCluster = 0, bestDist = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      const dist = Math.abs(m.timeMinutes - clusters[i].actualCenter);
      if (dist < bestDist) { bestDist = dist; bestCluster = i; }
    }
    clusters[bestCluster].matches.push(m);
  }

  for (const c of clusters) {
    if (c.matches.length === 0) continue;
    const countMap = {};
    for (const m of c.matches) {
      countMap[m.roundedMinutes] = (countMap[m.roundedMinutes] || 0) + 1;
    }
    let modeMinutes = c.matches[0].roundedMinutes, maxCount = 0;
    for (const [mins, cnt] of Object.entries(countMap)) {
      if (cnt > maxCount) { maxCount = cnt; modeMinutes = parseInt(mins); }
    }
    c.modeMinutes = modeMinutes;
    c.label = String(Math.floor(modeMinutes / 60));
  }
}