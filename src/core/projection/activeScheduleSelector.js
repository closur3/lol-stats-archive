import { timePolicy } from "../../utils/timePolicy.js";
import { assertScheduleSessionsFields } from "../facts/scheduleSessionsStore.js";
import { parseScheduleSessionKey } from "../scheduleIdentity.js";

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
}

function assertFields(value, fields, label) {
  requireObject(value, label);
  const actualFields = Object.keys(value);
  if (actualFields.length !== fields.length || fields.some(field => !Object.hasOwn(value, field))) {
    throw new Error(`${label} fields must be ${fields.join(" and ")}`);
  }
}

function readNowTimestamp(now) {
  const timestamp = now instanceof Date ? now.getTime() : now;
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new Error("now must be a Date or non-negative integer timestamp");
  }
  return timestamp;
}

function readDate(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be an ISO date`);
  }
  return value;
}

function readOverviewPages(tournament, label) {
  if (!Array.isArray(tournament.overviewPages) || tournament.overviewPages.length === 0) {
    throw new Error(`${label}.overviewPages must be a nonempty array`);
  }
  const overviewPages = tournament.overviewPages.map((entry, overviewIndex) => {
    const overviewLabel = `${label}.overviewPages[${overviewIndex}]`;
    requireObject(entry, overviewLabel);
    if (typeof entry.overviewPage !== "string" || entry.overviewPage.trim() === "") {
      throw new Error(`${overviewLabel}.overviewPage must be a string`);
    }
    const startDate = readDate(entry.startDate, `${overviewLabel}.startDate`);
    const endDate = readDate(entry.endDate, `${overviewLabel}.endDate`);
    if (startDate > endDate) throw new Error(`${overviewLabel} date range is invalid`);
    return { overviewPage: entry.overviewPage, startDate, endDate };
  });
  if (new Set(overviewPages.map(entry => entry.overviewPage)).size !== overviewPages.length) {
    throw new Error(`${label}.overviewPages contains duplicate overviewPage`);
  }
  return overviewPages;
}

function readTournaments(tournaments) {
  if (!Array.isArray(tournaments)) throw new Error("tournaments must be an array");
  const names = new Set();
  return tournaments.map((tournament, tournamentIndex) => {
    const label = `tournaments[${tournamentIndex}]`;
    requireObject(tournament, label);
    if (typeof tournament.name !== "string" || tournament.name.trim() === "") {
      throw new Error(`${label}.name must be a string`);
    }
    if (typeof tournament.leagueShort !== "string" || tournament.leagueShort.trim() === "") {
      throw new Error(`${label}.leagueShort must be a string`);
    }
    if (names.has(tournament.name)) throw new Error(`Duplicate tournament name: ${tournament.name}`);
    names.add(tournament.name);
    return {
      name: tournament.name,
      leagueShort: tournament.leagueShort,
      overviewPages: readOverviewPages(tournament, label)
    };
  });
}

function assertMapScope(value, label, tournamentNames) {
  if (!(value instanceof Map)) throw new Error(`${label} must be a Map`);
  for (const tournamentName of value.keys()) {
    if (!tournamentNames.has(tournamentName)) throw new Error(`${label} contains unexpected tournamentName: ${String(tournamentName)}`);
  }
  for (const tournamentName of tournamentNames) {
    if (!value.has(tournamentName)) throw new Error(`${label} missing tournamentName: ${tournamentName}`);
  }
}

function readScheduleSessions(scheduleSessionsMap, tournamentName) {
  const stored = scheduleSessionsMap.get(tournamentName);
  const label = `ScheduleSessions.${tournamentName}`;
  assertFields(stored, ["tournamentName", "sessions"], label);
  if (stored.tournamentName !== tournamentName) throw new Error(`${label}.tournamentName must match ${tournamentName}`);
  return assertScheduleSessionsFields(label, { sessions: stored.sessions });
}

function getOverviewStatus(overview, today) {
  if (overview.endDate < today) return "past";
  if (overview.startDate > today) return "future";
  return "current";
}

function buildScheduleRow(match, tournament) {
  const dateTime = timePolicy.getCurrentAppDateTime(match.scheduledAt);
  return {
    time: dateTime.timeString.slice(0, 5),
    team1Name: match.team1Name,
    team2Name: match.team2Name,
    team1Score: match.team1Score,
    team2Score: match.team2Score,
    bestOf: match.bestOf,
    winner: match.winner,
    isForfeit: match.isForfeit,
    isFinished: match.winner !== null,
    isLive: match.isLive,
    tournamentName: tournament.name,
    date: dateTime.dateString
  };
}

function appendScheduleSessions(sessionsByOverviewPage, sessions, tournament, overviewPages) {
  const overviewPageNames = new Set(overviewPages.map(overview => overview.overviewPage));
  for (const session of sessions) {
    const { overviewPage, tab, matchDay } = parseScheduleSessionKey(session.sessionKey, `ScheduleSessions.${tournament.name}.${session.sessionKey}`);
    if (!overviewPageNames.has(overviewPage)) {
      throw new Error(`ScheduleSessions.${tournament.name} references overviewPage outside TournamentConfig: ${overviewPage}`);
    }
    const matches = session.matches.map(match => buildScheduleRow(match, tournament));
    sessionsByOverviewPage.get(overviewPage).sessions.push({ tabName: tab, matchDay, matches });
  }
}

function buildTournamentSchedules(tournament, sessions, today) {
  const sessionsByOverviewPage = new Map(tournament.overviewPages.map(overview => [
    overview.overviewPage,
    { status: getOverviewStatus(overview, today), sessions: [] }
  ]));
  appendScheduleSessions(sessionsByOverviewPage, sessions, tournament, tournament.overviewPages);
  return tournament.overviewPages.map(overview => {
    const schedule = sessionsByOverviewPage.get(overview.overviewPage);
    return {
      overviewPage: overview.overviewPage,
      status: schedule.status,
      sessions: schedule.sessions
    };
  });
}

export function selectActiveSchedulesByTournament(scheduleSessionsMap, tournaments, now) {
  const today = timePolicy.getAppDateKey(readNowTimestamp(now));
  const orderedTournaments = readTournaments(tournaments);
  const tournamentNames = new Set(orderedTournaments.map(tournament => tournament.name));
  assertMapScope(scheduleSessionsMap, "scheduleSessionsMap", tournamentNames);

  return Object.fromEntries(orderedTournaments.map(tournament => [
    tournament.name,
    buildTournamentSchedules(tournament, readScheduleSessions(scheduleSessionsMap, tournament.name).sessions, today)
  ]));
}
