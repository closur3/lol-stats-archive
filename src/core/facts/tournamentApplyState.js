import { kvKeys } from "../../infrastructure/kv/keyFactory.js";

const DigestPattern = /^[a-f0-9]{64}$/;

export class TournamentApplyStateSchemaError extends Error {
  constructor(cause) {
    super(`TournamentApplyState schema invalid: ${cause.message}`, { cause });
    this.name = "TournamentApplyStateSchemaError";
  }
}

function assertDigest(value, label) {
  if (typeof value !== "string" || !DigestPattern.test(value)) {
    throw new Error(`${label} must be a SHA-256 digest`);
  }
  return value;
}

function normalizeActiveFingerprints(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("TournamentApplyState.activeFingerprints must be an object");
  }
  const fingerprints = {};
  for (const [tournamentName, fingerprint] of Object.entries(value)) {
    if (!tournamentName.trim()) throw new Error("TournamentApplyState active tournamentName missing");
    fingerprints[tournamentName] = assertDigest(fingerprint, `TournamentApplyState.activeFingerprints.${tournamentName}`);
  }
  return fingerprints;
}

function normalizeApplyState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("TournamentApplyState must be an object");
  }
  const fields = Object.keys(value);
  if (fields.length !== 2 || !Object.hasOwn(value, "configDigest") || !Object.hasOwn(value, "activeFingerprints")) {
    throw new Error("TournamentApplyState fields must be configDigest and activeFingerprints");
  }
  return {
    configDigest: assertDigest(value.configDigest, "TournamentApplyState.configDigest"),
    activeFingerprints: normalizeActiveFingerprints(value.activeFingerprints)
  };
}

export function haveSameActiveFingerprints(left, right) {
  const leftEntries = Object.entries(left);
  return leftEntries.length === Object.keys(right).length
    && leftEntries.every(([tournamentName, fingerprint]) => right[tournamentName] === fingerprint);
}

export function haveSameTournamentApplyState(left, right) {
  return left !== null
    && left.configDigest === right.configDigest
    && haveSameActiveFingerprints(left.activeFingerprints, right.activeFingerprints);
}

export async function readExistingTournamentApplyState(env) {
  const stored = await env["lol-stats-kv"].get(kvKeys.tournamentApplyState());
  if (stored == null) return null;
  try {
    const value = typeof stored === "string" ? JSON.parse(stored) : stored;
    return normalizeApplyState(value);
  } catch (error) {
    throw new TournamentApplyStateSchemaError(error);
  }
}

export async function writeTournamentApplyState(env, state) {
  const normalized = normalizeApplyState(state);
  await env["lol-stats-kv"].put(kvKeys.tournamentApplyState(), JSON.stringify(normalized));
}
