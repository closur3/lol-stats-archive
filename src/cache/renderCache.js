let homeCache = null;
let archiveCache = null;

export const renderCache = {
  getHome() {
    return homeCache;
  },

  getArchive() {
    return archiveCache;
  },

  setHome(html) {
    homeCache = html;
  },

  setArchive(html) {
    archiveCache = html;
  },

  invalidateHome() {
    homeCache = null;
  },

  invalidateArchive() {
    archiveCache = null;
  },

  invalidateAll() {
    homeCache = null;
    archiveCache = null;
  }
};
