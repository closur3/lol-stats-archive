import { FandomClient } from '../../api/fandomClient.js';
import { kvKeys } from '../../infrastructure/kv/keyFactory.js';
import { dataUtils } from '../../utils/dataUtils.js';

export function hasRevisionRecordChanged(previousRecord, nextRecord) {
  assertRevisionRecord(previousRecord, "previous REV record");
  assertRevisionRecord(nextRecord, "next REV record");
  if (previousRecord.slug !== nextRecord.slug) return true;

  const prevPages = previousRecord.pages;
  const nextPages = nextRecord.pages;
  const prevTitles = Object.keys(prevPages);
  const nextTitles = Object.keys(nextPages);
  if (prevTitles.length !== nextTitles.length) return true;

  for (const title of prevTitles) {
    if (!Object.prototype.hasOwnProperty.call(nextPages, title)) return true;
    const prevPage = normalizeRevisionPage(previousRecord.slug, title, prevPages[title]);
    const nextPage = normalizeRevisionPage(nextRecord.slug, title, nextPages[title]);
    if (prevPage.revid !== nextPage.revid) return true;
    if (prevPage.revisionTimeUTC !== nextPage.revisionTimeUTC) return true;
    if (prevPage.pageid !== nextPage.pageid) return true;
  }
  return false;
}

function assertRevisionRecord(record, label) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(`${label} must be a JSON object`);
  }
  if (!record.slug || typeof record.slug !== "string") {
    throw new Error(`${label} slug missing`);
  }
  if (!record.pages || typeof record.pages !== "object" || Array.isArray(record.pages)) {
    throw new Error(`${label} pages must be a JSON object`);
  }
}

function normalizeRevisionPage(slug, title, page) {
  if (!page || typeof page !== "object" || Array.isArray(page)) {
    throw new Error(`REV page must be a JSON object: ${slug}:${title}`);
  }
  const revid = Number(page.revid);
  const pageid = Number(page.pageid);
  if (!Number.isFinite(revid) || revid <= 0) throw new Error(`REV page revid invalid: ${slug}:${title}`);
  if (!Number.isFinite(pageid) || pageid <= 0) throw new Error(`REV page pageid invalid: ${slug}:${title}`);
  if (!page.revisionTimeUTC || typeof page.revisionTimeUTC !== "string") {
    throw new Error(`REV page revisionTimeUTC missing: ${slug}:${title}`);
  }
  return {
    revid,
    pageid,
    revisionTimeUTC: page.revisionTimeUTC
  };
}

function normalizePreviousRevisionState(slug, previousRevisionState) {
  if (previousRevisionState == null) return { slug, pages: {} };
  if (typeof previousRevisionState !== "object" || Array.isArray(previousRevisionState)) {
    throw new Error(`REV state must be a JSON object: ${slug}`);
  }
  const pages = previousRevisionState.pages;
  if (!pages || typeof pages !== "object" || Array.isArray(pages)) {
    throw new Error(`REV pages must be a JSON object: ${slug}`);
  }
  return { slug, pages };
}

async function prepareRevisionCheck(env, tournament) {
  const slug = tournament?.slug;
  if (!slug) return null;

  const pages = dataUtils.normalizeOverviewPages(tournament.overview_page);
  if (pages.length === 0) return null;

  const dataPages = Array.from(new Set(pages.map(dataUtils.toDataPage)));
  const expandedDataPages = [];
  for (const dataPage of dataPages) {
    const subpages = await FandomClient.fetchAllSubpages(dataPage);
    expandedDataPages.push(...subpages);
  }

  const previousRevisionState = await env["lol-stats-kv"].get(kvKeys.rev(slug), { type: "json" });
  console.log(`[REV:CHECK] ${slug}`);

  return {
    slug,
    dataPages: Array.from(new Set(expandedDataPages)),
    previousRevisionState
  };
}

async function collectRevisionChecks(env, tournaments) {
  if (!Array.isArray(tournaments)) throw new Error("tournaments must be an array");
  const errors = [];
  const checks = [];
  const results = await Promise.allSettled(tournaments.map(tournament => prepareRevisionCheck(env, tournament)));

  for (const result of results) {
    if (result.status === "rejected") {
      errors.push(result.reason);
      console.log(`[REV:ERROR] prepare failed: ${result.reason?.message || "unknown error"}`);
      continue;
    }
    if (result.value) checks.push(result.value);
  }

  return { checks, errors };
}

async function fetchLatestRevisionPages(dataPages) {
  const pageResults = await Promise.all(
    dataPages.map(async (page) => {
      const latest = await FandomClient.fetchLatestRevision(page);
      return { page, latest };
    })
  );
  return pageResults.filter(pageResult => !pageResult.latest?.missing);
}

async function evaluateRevisionCheck(check) {
  const { slug, dataPages, previousRevisionState } = check;
  const prevRecord = normalizePreviousRevisionState(slug, previousRevisionState);
  const prevPages = prevRecord.pages;
  const nextPages = {};
  const changedPages = [];
  const revidChanges = [];

  const pageResults = await fetchLatestRevisionPages(dataPages);

  for (const { page, latest } of pageResults) {
    const title = latest.title || page;
    nextPages[title] = {
      revid: latest.revid,
      revisionTimeUTC: latest.revisionTimeUTC,
      pageid: latest.pageid
    };

    const prevRev = prevPages?.[title]?.revid;
    if (!prevRev || Number(prevRev) !== Number(latest.revid)) {
      changedPages.push(`${title}:${prevRev === undefined ? "none" : prevRev}->${latest.revid}`);
      const safeTitle = title.replace(/ /g, "_");
      revidChanges.push({
        revid: latest.revid,
        diffUrl: `https://lol.fandom.com/wiki/${safeTitle}?diff=prev&oldid=${latest.revid}`,
        title
      });
    }
  }

  const nextRecord = { slug, pages: nextPages };
  return {
    slug,
    shouldWriteRev: hasRevisionRecordChanged({ slug, pages: prevPages }, nextRecord),
    nextRecord,
    revisionChanged: changedPages.length > 0,
    changedPages,
    revidChanges
  };
}

export async function detectRevisionChanges(env, tournaments) {
  const changedSlugs = new Set();
  const revidChanges = {};
  const pendingRevisionWrites = {};
  const { checks: revisionChecks, errors } = await collectRevisionChecks(env, tournaments);
  let hasErrors = errors.length > 0;
  const checkedSlugs = revisionChecks.length;

  const revChecks = await Promise.allSettled(
    revisionChecks
      .map(check => evaluateRevisionCheck(check))
  );

  for (const checkResult of revChecks) {
    if (checkResult.status === 'rejected') {
      hasErrors = true;
      console.log(`[REV:ERROR] check failed: ${checkResult.reason?.message || 'unknown error'}`);
      continue;
    }

    const { slug, shouldWriteRev, nextRecord, revisionChanged, changedPages, revidChanges: slugRevidChanges } = checkResult.value;

    if (shouldWriteRev) {
      pendingRevisionWrites[slug] = nextRecord;
    }

    if (revisionChanged) {
      changedSlugs.add(slug);
      revidChanges[slug] = slugRevidChanges;
      console.log(`[REV:CHANGE] ${slug} pages=${changedPages.length}${changedPages.length ? ` | ${changedPages.join(", ")}` : ""}`);
    }
  }

  return { changedSlugs, revidChanges, pendingRevisionWrites, hasErrors, checkedSlugs };
}
