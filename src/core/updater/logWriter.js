import { dateUtils } from '../../utils/dateUtils.js';

export function formatDeltaTag(item) {
  const added = Number.isFinite(item?.added) ? item.added : 0;
  const updated = Number.isFinite(item?.updated) ? item.updated : 0;
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

export function buildLeagueLogEntries(syncItems, skipItems, breakers, apiErrors, authContext, runtimeConfig, displayNameMap) {
  const nowShort = dateUtils.getNow().shortDateTimeString;
  const isAnon = (!authContext || authContext.isAnonymous);
  const bySlug = {};

  const getDisplayName = (slug) => displayNameMap?.get(slug) || slug;

  const pushEntry = (slug, entry) => {
    if (!slug) return;
    bySlug[slug] = { timestamp: nowShort, ...entry };
  };

  syncItems.forEach(item => {
    pushEntry(item.slug, {
      action: "SYNC",
      level: "SUCCESS",
      displayName: getDisplayName(item.slug),
      added: item.added ?? 0,
      updated: item.updated ?? 0,
      trigger: item.revidChanges?.[0] || null,
      isForce: item.isForce ?? false,
      isAnon
    });
  });

  skipItems.forEach(item => {
    if (bySlug[item.slug]) return;
    pushEntry(item.slug, {
      action: "SKIP",
      level: "SUCCESS",
      displayName: getDisplayName(item.slug),
      added: item.added ?? 0,
      updated: item.updated ?? 0,
      trigger: item.revidChanges?.[0] || null,
      isForce: item.isForce ?? false,
      isAnon
    });
  });

  breakers.forEach(breaker => {
    const slug = String(breaker ?? "").split("(")[0];
    const dropInfo = String(breaker ?? "").match(/\(Drop .+\)/)?.[0] || "(Drop)";
    const name = getDisplayName(slug);
    pushEntry(slug, { action: "BREAKER", level: "ERROR", displayName: name, dropInfo, isAnon });
  });

  apiErrors.forEach(apiError => {
    const slug = String(apiError || "").split("(")[0];
    const name = getDisplayName(slug);
    pushEntry(slug, { action: "API_ERROR", level: "ERROR", displayName: name, isAnon });
  });

  return bySlug;
}
