import { timePolicy } from '../../utils/timePolicy.js';

export function formatDeltaTag(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("log item must be a JSON object");
  if (!Number.isInteger(item.added) || item.added < 0) throw new Error(`log item added invalid: ${item.slug}`);
  if (!Number.isInteger(item.updated) || item.updated < 0) throw new Error(`log item updated invalid: ${item.slug}`);
  const added = item.added;
  const updated = item.updated;
  if (added > 0 && updated > 0) return `+${added}~${updated}`;
  if (added > 0) return `+${added}`;
  if (updated > 0) return `~${updated}`;
  return "~0";
}

export function generateLog(syncItems, skipItems, breakers, apiErrors, authContext, logger) {
  const isAnon = (!authContext || authContext.isAnonymous);
  const authSuffix = isAnon ? " 👻" : "";

  const formatItem = (item) => `${item.displayName} ${formatDeltaTag(item)}`;

  const syncDetails = syncItems.map(formatItem);
  const skipDetails = skipItems.map(formatItem);

  let trafficLight, action, content;

  if (syncDetails.length === 0 && apiErrors.length === 0 && breakers.length === 0) {
    trafficLight = "⚪"; action = "[SKIP]";

    let parts = [];
    if (skipDetails.length > 0) parts.push(`🔍 ${skipDetails.join(", ")}`);

    content = parts.join(" | ");
  } else {
    const hasErr = apiErrors.length > 0 || breakers.length > 0;
    trafficLight = hasErr ? "🔴" : "🟢";
    action = hasErr ? "[ERR!]" : "[SYNC]";

    let parts = [];
    if (syncDetails.length > 0) parts.push(`🔄 ${syncDetails.join(", ")}`);
    if (breakers.length > 0) parts.push(`🚧 ${breakers.join(", ")}`);
    if (apiErrors.length > 0) parts.push(`❌ ${apiErrors.join(", ")}`);

    content = parts.join(" | ");
  }

  const finalLog = `${trafficLight} ${action} | ${content}${authSuffix}`;
  if (trafficLight === "🔴") logger.error(finalLog); else logger.success(finalLog);
}

function pickLatestRevisionTrigger(revidChanges) {
  if (revidChanges === undefined) return null;
  if (!Array.isArray(revidChanges)) throw new Error("revidChanges must be an array");
  if (revidChanges.length === 0) return null;
  return revidChanges.reduce((latest, curr) =>
    Number(curr.revid) > Number(latest.revid) ? curr : latest
  );
}

export function buildLeagueLogEntries(syncItems, skipItems, breakers, apiErrors, authContext, runtimeConfig, displayNameMap) {
  const loggedAt = timePolicy.getNow().fullDateTimeString;
  const isAnon = (!authContext || authContext.isAnonymous);
  const bySlug = {};

  if (!(displayNameMap instanceof Map)) throw new Error("displayNameMap must be a Map");

  const getDisplayName = (slug) => {
    const displayName = displayNameMap.get(slug);
    return displayName === undefined ? slug : displayName;
  };

  const pushEntry = (slug, entry) => {
    if (!slug) throw new Error("LOG slug missing");
    bySlug[slug] = { loggedAt, ...entry };
  };

  syncItems.forEach(item => {
    pushEntry(item.slug, {
      action: "SYNC",
      level: "SUCCESS",
      displayName: getDisplayName(item.slug),
      added: item.added,
      updated: item.updated,
      trigger: pickLatestRevisionTrigger(item.revidChanges),
      isForce: item.isForce === true,
      isAnon
    });
  });

  skipItems.forEach(item => {
    if (bySlug[item.slug]) return;
    pushEntry(item.slug, {
      action: "SKIP",
      level: "SUCCESS",
      displayName: getDisplayName(item.slug),
      added: item.added,
      updated: item.updated,
      trigger: pickLatestRevisionTrigger(item.revidChanges),
      isForce: item.isForce === true,
      isAnon
    });
  });

  breakers.forEach(breaker => {
    if (typeof breaker !== "string" || breaker.length === 0) throw new Error("breaker log item invalid");
    const slug = breaker.split("(")[0];
    const dropMatch = breaker.match(/\(Drop .+\)/);
    const dropInfo = dropMatch ? dropMatch[0] : "(Drop)";
    const name = getDisplayName(slug);
    pushEntry(slug, { action: "BREAKER", level: "ERROR", displayName: name, dropInfo, isAnon });
  });

  apiErrors.forEach(apiError => {
    if (typeof apiError !== "string" || apiError.length === 0) throw new Error("api error log item invalid");
    const slug = apiError.split("(")[0];
    const name = getDisplayName(slug);
    pushEntry(slug, { action: "API_ERROR", level: "ERROR", displayName: name, isAnon });
  });

  return bySlug;
}
