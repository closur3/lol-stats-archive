import { dateUtils } from '../../utils/dateUtils.js';

export function formatDeltaTag(item) {
  const added = Number.isFinite(item?.added) ? item.added : 0;
  const updated = Number.isFinite(item?.updated) ? item.updated : 0;
  if (added > 0 && updated > 0) return `+${added}~${updated}`;
  if (added > 0) return `+${added}`;
  if (updated > 0) return `~${updated}`;
  return "~0";
}

export function generateLog(syncItems, idleItems, breakers, apiErrors, authContext, logger) {
  const isAnon = (!authContext || authContext.isAnonymous);
  const authSuffix = isAnon ? " 👻" : "";

  const formatItem = (item) => `${item.displayName} ${formatDeltaTag(item)}`;

  const syncDetails = syncItems.map(formatItem);
  const idleDetails = idleItems.map(formatItem);

  let trafficLight, action, content;

  if (syncDetails.length === 0 && apiErrors.length === 0 && breakers.length === 0) {
    trafficLight = "⚪"; action = "[IDLE]";

    let parts = [];
    if (idleDetails.length > 0) parts.push(`🔍 ${idleDetails.join(", ")}`);

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

export function buildLeagueLogEntries(syncItems, idleItems, breakers, apiErrors, authContext, runtimeConfig, displayNameMap) {
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
      added: item.added || 0,
      updated: item.updated || 0,
      trigger: item.revidChanges?.[0] || null,
      isForce: item.isForce || false,
      isAnon
    });
  });

  idleItems.forEach(item => {
    if (bySlug[item.slug]) return;
    pushEntry(item.slug, {
      action: "IDLE",
      level: "SUCCESS",
      displayName: getDisplayName(item.slug),
      added: item.added || 0,
      updated: item.updated || 0,
      trigger: item.revidChanges?.[0] || null,
      isForce: item.isForce || false,
      isAnon
    });
  });

  breakers.forEach(breaker => {
    const slug = String(breaker || "").split("(")[0];
    const dropInfo = String(breaker || "").match(/\(Drop .+\)/)?.[0] || "(Drop)";
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

export function formatLogEntry(entry) {
  const suffix = entry.isAnon ? " 👻" : "";
  const { action, displayName, added, updated, trigger, dropInfo, isForce } = entry;
  if (action === "SYNC") {
    let delta = "";
    if (added > 0) delta += `+${added}`;
    if (updated > 0) delta += `~${updated}`;
    if (delta === "") delta = "~0";
    let triggerText = "";
    if (isForce) {
      triggerText = " | ➕ Force";
    } else if (trigger) {
      triggerText = ` | ➕ <a href="${trigger.diffUrl}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">${trigger.revid}</a>`;
    }
    return `🟢 [SYNC] | 🔄 ${displayName} ${delta}${triggerText}${suffix}`;
  }
  if (action === "IDLE") {
    const delta = `~${added + updated}`;
    let triggerText = "";
    if (isForce) {
      triggerText = " | 🟰 Force";
    } else if (trigger) {
      triggerText = ` | 🟰 <a href="${trigger.diffUrl}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">${trigger.revid}</a>`;
    }
    return `⚪ [IDLE] | 🔍 ${displayName} ${delta}${triggerText}${suffix}`;
  }
  if (action === "BREAKER") {
    return `🔴 [ERR!] | 🚧 ${displayName}${dropInfo || "(Drop)"}${suffix}`;
  }
  if (action === "API_ERROR") {
    return `🔴 [ERR!] | ❌ ${displayName}(Fail)${suffix}`;
  }
  return "";
}