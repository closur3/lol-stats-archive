export const tournamentSelectorsScript = `
const floatingSelectorFooterGap = 12;
let tournamentJumpTarget = null;
let tournamentJumpSequence = 0;

function getTournamentSections() {
    return Array.from(document.querySelectorAll("section.active-sec"));
}

function readLeagueShort(section) {
    const trigger = section.querySelector(".tournament-info-trigger");
    if (!trigger) throw new Error("Tournament leagueShort missing");
    return trigger.textContent.trim();
}

function readTournamentTitle(section) {
    const title = section.querySelector(".tournament-title-text");
    if (!title) throw new Error("Tournament title missing");
    return title.textContent.trim();
}

function readTournamentYear(title) {
    const match = title.match(/^((?:19|20)[0-9]{2}) /);
    if (!match) throw new Error("Tournament title must use the canonical year-first format");
    return match[1];
}

function readTournamentLabel(title) {
    const year = readTournamentYear(title);
    return title.slice(year.length + 1);
}

function currentTournamentSection() {
    const sections = getTournamentSections();
    if (sections.length === 0) return null;
    const index = Math.max(0, sections.findLastIndex(section => section.getBoundingClientRect().top <= 96));
    return sections[index];
}

function selectedTournamentSection() {
    return tournamentJumpTarget || currentTournamentSection();
}

function scrollToTournamentSection(target) {
    const isFirst = target === getTournamentSections()[0];
    const sectionTop = isFirst ? 0 : target.getBoundingClientRect().top + window.scrollY - 76;
    const maxTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const top = Math.min(maxTop, Math.max(0, sectionTop));
    const sequence = ++tournamentJumpSequence;
    tournamentJumpTarget = target;
    updateTournamentSelector();
    window.scrollTo({ top, behavior: "smooth" });
    const startedAt = performance.now();
    const releaseTarget = () => {
        if (sequence !== tournamentJumpSequence) return;
        if (Math.abs(window.scrollY - top) <= 1 || performance.now() - startedAt >= 4000) {
            tournamentJumpTarget = null;
            updateTournamentSelector();
            return;
        }
        window.requestAnimationFrame(releaseTarget);
    };
    window.requestAnimationFrame(releaseTarget);
}

function getLeagueSections() {
    const leagues = new Map();
    getTournamentSections().forEach(section => {
        const leagueShort = readLeagueShort(section);
        if (!leagues.has(leagueShort)) leagues.set(leagueShort, []);
        leagues.get(leagueShort).push(section);
    });
    return leagues;
}

function updateLeagueSelector(selector, section) {
    const currentLeague = readLeagueShort(section);
    selector.querySelectorAll(".league-selector-option").forEach(option => {
        const isCurrent = option.dataset.league === currentLeague;
        option.classList.toggle("is-current", isCurrent);
        option.setAttribute("aria-current", String(isCurrent));
    });
}

function initLeagueSelector(selector) {
    getLeagueSections().forEach((sections, leagueShort) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "league-selector-option";
        option.dataset.league = leagueShort;
        option.textContent = leagueShort;
        option.setAttribute("aria-label", "Jump to " + leagueShort);
        option.addEventListener("click", () => scrollToTournamentSection(sections[0]));
        selector.append(option);
    });
}

function appendArchiveTournamentOptions(selector, sections) {
    let yearGroup = null;
    let currentYear = "";
    sections.forEach((section, index) => {
        const title = readTournamentTitle(section);
        const year = readTournamentYear(title);
        if (year !== currentYear) {
            currentYear = year;
            yearGroup = document.createElement("optgroup");
            yearGroup.label = year;
            selector.append(yearGroup);
        }
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = readTournamentLabel(title);
        yearGroup.append(option);
    });
}

function appendArchiveTournamentList(list, sections) {
    let yearGroup = null;
    let currentYear = "";
    sections.forEach((section, index) => {
        const title = readTournamentTitle(section);
        const year = readTournamentYear(title);
        if (year !== currentYear) {
            currentYear = year;
            yearGroup = document.createElement("div");
            yearGroup.className = "archive-tournament-year-group";
            const heading = document.createElement("div");
            heading.className = "archive-tournament-year";
            heading.textContent = year;
            yearGroup.append(heading);
            list.append(yearGroup);
        }
        const option = document.createElement("button");
        option.type = "button";
        option.className = "archive-tournament-option";
        option.dataset.tournamentIndex = String(index);
        option.textContent = readTournamentLabel(title);
        option.setAttribute("aria-label", "Jump to " + title);
        option.addEventListener("click", () => scrollToTournamentSection(section));
        yearGroup.append(option);
    });
}

function initArchiveTournamentSelector(list, selector) {
    const sections = getTournamentSections();
    appendArchiveTournamentList(list, sections);
    appendArchiveTournamentOptions(selector, sections);
    selector.disabled = false;
    selector.addEventListener("change", () => {
        const target = sections[Number(selector.value)];
        if (!target) throw new Error("Archive tournament selection invalid");
        scrollToTournamentSection(target);
    });
}

function updateTournamentSelector() {
    const section = selectedTournamentSection();
    if (!section) return;
    const leagueSelector = document.getElementById("leagueSelector");
    if (leagueSelector) {
        updateLeagueSelector(leagueSelector, section);
        return;
    }
    const archiveList = document.getElementById("archiveTournamentList");
    const archiveSelector = document.getElementById("archiveTournamentSelector");
    if (!archiveList || !archiveSelector) return;
    const index = getTournamentSections().indexOf(section);
    if (index < 0) throw new Error("Current archive tournament missing");
    archiveSelector.value = String(index);
    archiveList.querySelectorAll(".archive-tournament-option").forEach(option => {
        const isCurrent = option.dataset.tournamentIndex === String(index);
        option.classList.toggle("is-current", isCurrent);
        option.setAttribute("aria-current", String(isCurrent));
    });
}

function resetFloatingSelectorPosition(selector) {
    selector.style.left = "";
    selector.style.right = "";
    selector.style.top = "";
    selector.style.bottom = "";
    selector.style.transform = "";
}

function syncFloatingSelectorPosition(selector) {
    if (!window.matchMedia("(max-width: 650px)").matches) {
        resetFloatingSelectorPosition(selector);
        if (selector.id === "archiveTournamentList") {
            const selectorBox = selector.getBoundingClientRect();
            const viewportInset = 12;
            if (selectorBox.right > window.innerWidth - viewportInset) {
                selector.style.left = Math.max(viewportInset, window.innerWidth - viewportInset - selectorBox.width) + "px";
            }
        }
        return;
    }
    resetFloatingSelectorPosition(selector);
    if (selector.offsetParent === null) return;
    const footer = document.querySelector(".build-footer");
    if (!footer) {
        return;
    }
    const footerBox = footer.getBoundingClientRect();
    if (footerBox.top < window.innerHeight) {
        const selectorBox = selector.getBoundingClientRect();
        const centerY = footerBox.top - floatingSelectorFooterGap - (selectorBox.height / 2);
        selector.style.top = centerY + "px";
        selector.style.bottom = "auto";
        selector.style.transform = "translate(-50%, -50%)";
        return;
    }
}

function bindTournamentSelector(selectors) {
    let pendingFrame = 0;
    const scheduleSync = () => {
        if (pendingFrame) return;
        pendingFrame = window.requestAnimationFrame(() => {
            pendingFrame = 0;
            selectors.forEach(syncFloatingSelectorPosition);
            updateTournamentSelector();
        });
    };
    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync);
    scheduleSync();
}

function initTournamentSelector() {
    const leagueSelector = document.getElementById("leagueSelector");
    const archiveList = document.getElementById("archiveTournamentList");
    const archiveSelector = document.getElementById("archiveTournamentSelector");
    const selectors = [leagueSelector, archiveList, archiveSelector].filter(Boolean);
    if (selectors.length === 0 || getTournamentSections().length === 0) return;
    if (leagueSelector) initLeagueSelector(leagueSelector);
    if (archiveList && archiveSelector) initArchiveTournamentSelector(archiveList, archiveSelector);
    updateTournamentSelector();
    bindTournamentSelector(selectors);
}

initTournamentSelector();
`;
