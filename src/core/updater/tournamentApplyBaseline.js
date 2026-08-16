import { kvKeys } from "../../infrastructure/kv/keyFactory.js";
import {
  haveSameActiveFingerprints,
  haveSameTournamentApplyState,
  readExistingTournamentApplyState,
  TournamentApplyStateSchemaError
} from "../facts/tournamentApplyState.js";

const ActiveArtifactPrefixes = [
  kvKeys.ActiveSnapshotPrefix,
  kvKeys.ActiveLogPrefix,
  kvKeys.FandomRevisionPrefix,
  kvKeys.RawMatchesPrefix,
  kvKeys.ScheduleSessionsPrefix
];

async function listKeys(kv, prefix) {
  const names = [];
  let cursor;
  do {
    const options = cursor ? { prefix, cursor } : { prefix };
    const page = await kv.list(options);
    if (!page || !Array.isArray(page.keys) || typeof page.list_complete !== "boolean") {
      throw new Error(`KV list result invalid: ${prefix}`);
    }
    for (const key of page.keys) {
      if (!key || typeof key.name !== "string" || !key.name.startsWith(prefix)) {
        throw new Error(`KV list key invalid: ${prefix}`);
      }
      names.push(key.name);
    }
    if (page.list_complete) return names;
    if (typeof page.cursor !== "string" || !page.cursor) {
      throw new Error(`KV list cursor missing: ${prefix}`);
    }
    cursor = page.cursor;
  } while (true);
}

async function readStoredActiveArtifactNames(env) {
  const kv = env["lol-stats-kv"];
  const keyGroups = await Promise.all(ActiveArtifactPrefixes.map(prefix => listKeys(kv, prefix)));
  return new Set(keyGroups.flatMap((keys, index) => keys.map(key => key.slice(ActiveArtifactPrefixes[index].length))));
}

function buildRecoveryApplyState(runtimeNames, existingApplyState) {
  const activeFingerprints = { ...(existingApplyState?.activeFingerprints || {}) };
  for (const tournamentName of [...runtimeNames].sort()) {
    if (!Object.hasOwn(activeFingerprints, tournamentName)) activeFingerprints[tournamentName] = "0".repeat(64);
  }
  return {
    configDigest: existingApplyState?.configDigest || "0".repeat(64),
    activeFingerprints
  };
}

async function readApplyCheckpoint(env) {
  let existingApplyState;
  try {
    existingApplyState = await readExistingTournamentApplyState(env);
  } catch (error) {
    if (!(error instanceof TournamentApplyStateSchemaError)) throw error;
    console.error(`[TOURNAMENT:CHECKPOINT] replacing invalid TournamentApplyState: ${error.message}`);
    existingApplyState = null;
  }
  return existingApplyState;
}

async function buildAuditedApplyBaseline(env, desiredApplyState, existingApplyState) {
  const storedArtifactNames = await readStoredActiveArtifactNames(env);
  const baseline = buildRecoveryApplyState(storedArtifactNames, existingApplyState);
  if (
    existingApplyState?.configDigest === desiredApplyState.configDigest
    && !haveSameActiveFingerprints(baseline.activeFingerprints, desiredApplyState.activeFingerprints)
  ) {
    console.error("[TOURNAMENT:CHECKPOINT] runtime does not match current TournamentConfig; reconciling from Config");
    baseline.configDigest = "0".repeat(64);
  }
  return baseline;
}

function assertDesiredApplyState(desiredApplyState) {
  if (!desiredApplyState || typeof desiredApplyState !== "object" || Array.isArray(desiredApplyState)) {
    throw new Error("desiredApplyState must be an object");
  }
}

export async function resolveTournamentApplyBaseline(env, desiredApplyState) {
  assertDesiredApplyState(desiredApplyState);
  const existingApplyState = await readApplyCheckpoint(env);
  if (haveSameTournamentApplyState(existingApplyState, desiredApplyState)) return existingApplyState;
  return buildAuditedApplyBaseline(env, desiredApplyState, existingApplyState);
}

export async function auditTournamentApplyBaseline(env, desiredApplyState) {
  assertDesiredApplyState(desiredApplyState);
  const existingApplyState = await readApplyCheckpoint(env);
  return buildAuditedApplyBaseline(env, desiredApplyState, existingApplyState);
}
