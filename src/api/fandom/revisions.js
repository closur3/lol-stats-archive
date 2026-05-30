import { BOT_UA, FANDOM_API } from '../../constants/index.js';

function readRevisionPage(revisionPayload) {
  const pagesObj = revisionPayload?.query?.pages;
  if (!pagesObj || typeof pagesObj !== "object" || Array.isArray(pagesObj)) {
    throw new Error("Invalid revision payload");
  }
  const firstPage = Object.values(pagesObj)[0];
  if (!firstPage || typeof firstPage !== "object") throw new Error("Invalid revision payload");
  return firstPage;
}

function readPageTitle(firstPage, pageTitle) {
  if (typeof firstPage.title !== "string" || firstPage.title.length === 0) {
    throw new Error(`Invalid revision title payload: ${pageTitle}`);
  }
  return firstPage.title;
}

function readOptionalPositiveNumber(value, label) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid revision payload: ${label}`);
  }
  return value;
}

function readRequiredPositiveNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid revision payload: ${label}`);
  }
  return value;
}

function readRevisionTimestamp(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid revision payload: ${label}`);
  }
  return value;
}

export async function fetchLatestRevision(pageTitle, maxRetries = 3) {
  const revisionParams = new URLSearchParams({
    action: "query",
    prop: "revisions",
    titles: pageTitle,
    rvlimit: "1",
    rvprop: "ids|timestamp",
    format: "json"
  });

  let attempt = 1;
  while (attempt <= maxRetries) {
    try {
      const response = await fetch(`${FANDOM_API}?${revisionParams.toString()}`, {
        headers: { "User-Agent": BOT_UA, "Accept": "application/json" }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const revisionPayload = await response.json();
      const firstPage = readRevisionPage(revisionPayload);
      const title = readPageTitle(firstPage, pageTitle);
      if (firstPage.missing !== undefined) {
        return {
          pageid: readOptionalPositiveNumber(firstPage.pageid, `${pageTitle}.pageid`),
          title,
          missing: true
        };
      }
      const rev = firstPage?.revisions?.[0];
      if (!rev || typeof rev.revid !== "number") throw new Error("Invalid revision payload");
      return {
        pageid: readRequiredPositiveNumber(firstPage.pageid, `${pageTitle}.pageid`),
        title,
        revid: readRequiredPositiveNumber(rev.revid, `${pageTitle}.revid`),
        parentid: readOptionalPositiveNumber(rev.parentid, `${pageTitle}.parentid`),
        revisionTimeUTC: readRevisionTimestamp(rev.timestamp, `${pageTitle}.timestamp`),
        missing: false
      };
    } catch (error) {
      if (attempt >= maxRetries) throw error;
      await new Promise(resolveDelay => setTimeout(resolveDelay, 1000 * attempt));
      attempt++;
    }
  }
}
