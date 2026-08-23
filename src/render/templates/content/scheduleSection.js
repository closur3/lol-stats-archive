import { escapeHtml } from '../../../utils/htmlEscape.js';
import { timePolicy } from '../../../utils/timePolicy.js';
import { renderScheduleRow } from '../../components/scheduleRow.js';

function formatSessionDate(match) {
  return `${match.date.slice(5)} ${timePolicy.getWeekdayName(match.date)}`;
}

function isFinishedTab(sessions) {
  return sessions.every(session => session.matches.every(match => match.isFinished));
}

function hasReachedTabStartDate(sessions, today) {
  const startDate = sessions
    .flatMap(session => session.matches)
    .map(match => match.date)
    .sort()[0];
  return startDate <= today;
}

function renderScheduleSessions(sessions, status, combinedStatsByName) {
  if (!Array.isArray(sessions)) throw new Error("schedule sessions must be an array");
  if (sessions.length === 0) throw new Error("schedule sessions must not be empty");

  const sessionsByTab = new Map();
  for (const session of sessions) {
    if (!session || typeof session !== "object" || Array.isArray(session)) throw new Error("schedule session must be a JSON object");
    if (typeof session.tabName !== "string" || !Number.isInteger(session.matchDay) || !Array.isArray(session.matches) || session.matches.length === 0) {
      throw new Error("schedule session fields invalid");
    }
    if (!sessionsByTab.has(session.tabName)) sessionsByTab.set(session.tabName, []);
    sessionsByTab.get(session.tabName).push(session);
  }
  const today = timePolicy.getAppDateKey(Date.now());
  const tabs = Array.from(sessionsByTab, ([tabName, tabSessions]) => {
    const sessionHtml = tabSessions.map(session => {
      const firstMatch = session.matches[0];
      const rows = session.matches.map(match => renderScheduleRow(match, combinedStatsByName)).join("");
      const todayClass = session.matches.some(match => match.date === today) ? " is-today" : "";
      return `<div class="sch-session${todayClass}"><div class="sch-session-heading"><span>Day ${session.matchDay}</span><time datetime="${escapeHtml(firstMatch.date)}">${escapeHtml(formatSessionDate(firstMatch))}</time></div>${rows}</div>`;
    }).join("");
    const heading = `<div class="sch-tab-heading">${escapeHtml(tabName || "Schedule")}</div>`;
    return { tabSessions, heading, sessionHtml };
  });
  const tabStates = tabs.map((tab, index) => {
    const nextTab = tabs[index + 1];
    return {
      ...tab,
      isPast: status === "past"
        || Boolean(nextTab) && isFinishedTab(tab.tabSessions) && hasReachedTabStartDate(nextTab.tabSessions, today)
    };
  });
  const openTabs = tabStates
    .filter(tab => !tab.isPast)
    .map(tab => `<section class="sch-tab">${tab.heading}${tab.sessionHtml}</section>`)
    .join("");
  const pastTabs = tabStates
    .filter(tab => tab.isPast)
    .map((tab, index) => `<details class="sch-tab sch-tab-past${index === 0 ? " sch-tab-past-first" : ""}"><summary>${tab.heading}</summary>${tab.sessionHtml}</details>`)
    .join("");
  return `<div class="sch-fandom-list">${openTabs}${pastTabs}</div>`;
}

export function renderScheduleSection(schedule, combinedStatsByName) {
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) {
    throw new Error("schedule must be a JSON object");
  }
  if (!["past", "current", "future"].includes(schedule.status)) {
    throw new Error("schedule status invalid");
  }
  const sessions = renderScheduleSessions(schedule.sessions, schedule.status, combinedStatsByName);
  return `<section class="schedule-section" data-schedule-section>${sessions}</section>`;
}
