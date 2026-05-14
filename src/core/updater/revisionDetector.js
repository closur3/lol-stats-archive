import { evaluateRevisionCheck, prepareRevisionCheck } from './revisionFetch.js';
export { hasRevisionRecordChanged } from './revisionState.js';

async function collectRevisionChecks(env, tournaments) {
  if (!Array.isArray(tournaments)) throw new Error("tournaments must be an array");
  return Promise.all(tournaments.map(tournament => prepareRevisionCheck(env, tournament)));
}

function applyRevisionCheckResult(state, checkResult) {
  const { slug, shouldWriteRev, nextRecord, revisionChanged, changedPages, revidChanges: slugRevidChanges } = checkResult;

  if (shouldWriteRev) {
    state.pendingRevisionWrites[slug] = nextRecord;
  }

  if (revisionChanged) {
    state.changedSlugs.add(slug);
    state.revidChanges[slug] = slugRevidChanges;
    console.log(`[REV:CHANGE] ${slug} pages=${changedPages.length}${changedPages.length ? ` | ${changedPages.join(", ")}` : ""}`);
  }
}

export async function detectRevisionChanges(env, tournaments) {
  const checks = await collectRevisionChecks(env, tournaments);
  const state = {
    changedSlugs: new Set(),
    revidChanges: {},
    pendingRevisionWrites: {},
    hasErrors: false
  };

  const revChecks = await Promise.all(checks.map(check => evaluateRevisionCheck(check)));
  for (const checkResult of revChecks) {
    applyRevisionCheckResult(state, checkResult);
  }

  return {
    changedSlugs: state.changedSlugs,
    revidChanges: state.revidChanges,
    pendingRevisionWrites: state.pendingRevisionWrites,
    hasErrors: state.hasErrors,
    checkedSlugs: checks.length
  };
}
