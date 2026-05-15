function buildMatchFieldLabel(matchId, field) {
  return `${matchId}.${field}`;
}

export function parseMatchScore(value, matchId, field) {
  if (value === "" || value === null || value === undefined) return 0;
  const score = Number.parseInt(value, 10);
  if (!Number.isInteger(score) || score < 0) {
    throw new Error(`Invalid score: ${buildMatchFieldLabel(matchId, field)}`);
  }
  return score;
}

export function parseMatchBestOf(value, matchId, field) {
  const bestOf = Number.parseInt(value, 10);
  if (!Number.isInteger(bestOf) || bestOf <= 0) {
    throw new Error(`Invalid BestOf: ${buildMatchFieldLabel(matchId, field)}`);
  }
  return bestOf;
}
