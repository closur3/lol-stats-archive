import { formatPhaseCountdown } from "../utils/phaseCountdown.js";

export const phaseCountdownScript = `
const formatPhaseCountdown = ${formatPhaseCountdown.toString()};

function updatePhaseCountdowns(elements) {
  elements.forEach(element => {
    const targetTimestamp = Number(element.dataset.phaseCountdownTarget);
    if (!Number.isSafeInteger(targetTimestamp) || targetTimestamp < 1) {
      throw new Error('Phase countdown target invalid');
    }
    const countdown = formatPhaseCountdown(targetTimestamp, Date.now());
    if (element.textContent !== countdown) element.textContent = countdown;
  });
}

const phaseCountdownElements = [...document.querySelectorAll('[data-phase-countdown-target]')];
if (phaseCountdownElements.length > 0) {
  updatePhaseCountdowns(phaseCountdownElements);
  setInterval(() => updatePhaseCountdowns(phaseCountdownElements), 30_000);
}
`;
