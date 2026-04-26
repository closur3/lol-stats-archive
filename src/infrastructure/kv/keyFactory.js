const HOME_PREFIX = "HOME_";
const LOG_PREFIX = "LOG_";
const ARCHIVE_PREFIX = "ARCHIVE_";
const REV_PREFIX = "REV_";

export const kvKeys = {
  HOME_PREFIX,
  LOG_PREFIX,
  ARCHIVE_PREFIX,
  REV_PREFIX,

  home(slug) {
    return `${HOME_PREFIX}${slug}`;
  },
  homeStatic() {
    return "HOME_STATIC_HTML";
  },
  log(slug) {
    return `${LOG_PREFIX}${slug}`;
  },
  archive(slug) {
    return `${ARCHIVE_PREFIX}${slug}`;
  },
  archiveStatic() {
    return "ARCHIVE_STATIC_HTML";
  },
  rev(slug) {
    return `${REV_PREFIX}${slug}`;
  },
  scheduleDay() {
    return "SCHEDULE_DAY";
  },
};