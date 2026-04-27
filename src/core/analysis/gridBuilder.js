import { TIME_GRID_COLUMN_COUNT } from '../../constants/index.js';
import { clusterTimeSlots, assignMatchesToClusters } from './timeCluster.js';

export function buildTimeGridAndSchedule(tournamentSlug, parsedMatches, timeGrid) {
  const dayCounts = {};
  for (const m of parsedMatches) {
    dayCounts[m.matchDateStr] = (dayCounts[m.matchDateStr] || 0) + 1;
  }
  const maxMatchesPerDay = Math.max(...Object.values(dayCounts), 1);
  const clusters = clusterTimeSlots(parsedMatches, maxMatchesPerDay);
  assignMatchesToClusters(parsedMatches, clusters);

  const createSlot = () => {
    const slot = {};
    for (let dayIndex = 0; dayIndex < TIME_GRID_COLUMN_COUNT; dayIndex++) {
      slot[dayIndex] = { totalMatchCount: 0, fullLengthMatchCount: 0, matches: [] };
    }
    return slot;
  };

  const assignedClusterByMatch = buildDateDedupAssignment(parsedMatches, clusters);

  if (!timeGrid[tournamentSlug]) timeGrid[tournamentSlug] = { "Total": createSlot() };

  for (const cluster of clusters) {
    if (!timeGrid[tournamentSlug][cluster.label]) {
      timeGrid[tournamentSlug][cluster.label] = createSlot();
    }
  }

  for (const m of parsedMatches) {
    const matchObj = {
      dateDisplay: m.dateDisplay,
      fullDateDisplay: m.fullDateDisplay,
      isoTimestamp: m.isoTimestamp,
      timestamp: m.timestamp,
      team1Name: m.team1Name,
      team2Name: m.team2Name,
      scoreDisplay: `${m.team1Score}-${m.team2Score}`,
      isFullLength: m.isFullLength,
      bestOf: m.bestOf
    };

    let bestCluster = null;
    const assignedClusterIndex = assignedClusterByMatch.get(m);
    if (assignedClusterIndex != null && clusters[assignedClusterIndex]) {
      bestCluster = clusters[assignedClusterIndex];
    } else {
      let bestDist = Infinity;
      for (const c of clusters) {
        const dist = Math.abs(m.timeMinutes - c.actualCenter);
        if (dist < bestDist) { bestDist = dist; bestCluster = c; }
      }
    }
    if (!bestCluster) continue;

    const dayIndex = m.weekdayIndex;
    const addMatchToSlot = (grid, label, dayIndex) => {
      grid[label][dayIndex].totalMatchCount++;
      if (m.isFullLength) grid[label][dayIndex].fullLengthMatchCount++;
      grid[label][dayIndex].matches.push(matchObj);
    };
    addMatchToSlot(timeGrid[tournamentSlug], bestCluster.label, dayIndex);
    addMatchToSlot(timeGrid[tournamentSlug], "Total", dayIndex);
    addMatchToSlot(timeGrid[tournamentSlug], bestCluster.label, 7);
    addMatchToSlot(timeGrid[tournamentSlug], "Total", 7);
  }
}

function buildDateDedupAssignment(parsedMatches, clusters) {
  const assignedClusterByMatch = new Map();
  const matchesByDate = {};
  for (const match of parsedMatches) {
    if (!matchesByDate[match.matchDateStr]) matchesByDate[match.matchDateStr] = [];
    matchesByDate[match.matchDateStr].push(match);
  }
  for (const dailyMatches of Object.values(matchesByDate)) {
    const sortedDailyMatches = [...dailyMatches].sort((leftMatch, rightMatch) => {
      if (leftMatch.timeMinutes !== rightMatch.timeMinutes) return leftMatch.timeMinutes - rightMatch.timeMinutes;
      return (leftMatch.timestamp ?? 0) - (rightMatch.timestamp ?? 0);
    });
    const usedClusterIndexes = new Set();
    for (const match of sortedDailyMatches) {
      let chosenClusterIndex = -1;
      let chosenDist = Infinity;
      let chosenCenter = Infinity;

      for (let clusterIndex = 0; clusterIndex < clusters.length; clusterIndex++) {
        if (usedClusterIndexes.has(clusterIndex)) continue;
        const cluster = clusters[clusterIndex];
        const dist = Math.abs(match.timeMinutes - cluster.actualCenter);
        const center = cluster.actualCenter;
        if (dist < chosenDist || (dist === chosenDist && center < chosenCenter)) {
          chosenDist = dist;
          chosenCenter = center;
          chosenClusterIndex = clusterIndex;
        }
      }

      if (chosenClusterIndex < 0) {
        throw new Error(`No available time slot for match on ${match.matchDateStr}. dailyMatches=${sortedDailyMatches.length}, clusters=${clusters.length}`);
      }
      usedClusterIndexes.add(chosenClusterIndex);
      assignedClusterByMatch.set(match, chosenClusterIndex);
    }
  }
  return assignedClusterByMatch;
}