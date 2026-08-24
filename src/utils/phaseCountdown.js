export function formatPhaseCountdown(targetTimestamp, nowTimestamp) {
  const remainingMinutes = Math.max(0, Math.ceil((targetTimestamp - nowTimestamp) / 60_000));
  if (remainingMinutes === 0) return "NOW";
  const days = Math.floor(remainingMinutes / 1_440);
  const hours = Math.floor((remainingMinutes % 1_440) / 60);
  const minutes = remainingMinutes % 60;
  const twoDigits = value => String(value).padStart(2, "0");
  if (days > 0) return `${twoDigits(days)}D ${twoDigits(hours)}H ${twoDigits(minutes)}M`;
  if (hours > 0) return `${twoDigits(hours)}H ${twoDigits(minutes)}M`;
  return `${twoDigits(minutes)}M`;
}
