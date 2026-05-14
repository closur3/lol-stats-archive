export function parseMatchScore(value, label) {
  if (value === "" || value === null || value === undefined) return 0;
  const score = Number.parseInt(value, 10);
  if (!Number.isInteger(score) || score < 0) throw new Error(`Invalid score: ${label}`);
  return score;
}

export function parseMatchBestOf(value, label) {
  const bestOf = Number.parseInt(value, 10);
  if (!Number.isInteger(bestOf) || bestOf <= 0) throw new Error(`Invalid BestOf: ${label}`);
  return bestOf;
}
