export const pageActionsScript = `
const floatingActionsFooterGap = 12;

function getTournamentSections() {
    return Array.from(document.querySelectorAll("section.active-sec"));
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

function createTournamentYearGroup(popup, year) {
    const group = document.createElement("div");
    group.className = "tournament-jump-year-group compact-menu-group";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", year);
    const heading = document.createElement("div");
    heading.className = "tournament-jump-year-label compact-menu-group-label";
    heading.setAttribute("aria-hidden", "true");
    heading.textContent = year;
    group.append(heading);
    popup.append(group);
    return group;
}

function updateTournamentJumpCurrent() {
    const sections = getTournamentSections();
    const menu = document.getElementById("tournamentJump");
    if (!menu || sections.length === 0) return;
    const currentIndex = Math.max(0, sections.findLastIndex(section => section.getBoundingClientRect().top <= 96));
    const currentTitle = readTournamentTitle(sections[currentIndex]);
    const trigger = menu.querySelector(".tournament-jump-trigger");
    if (!trigger) throw new Error("Tournament jump trigger missing");
    trigger.setAttribute("aria-label", "Jump to tournament: " + currentTitle);
    menu.querySelectorAll(".tournament-jump-option").forEach((option, index) => {
        option.classList.toggle("is-current", index === currentIndex);
        option.setAttribute("aria-current", String(index === currentIndex));
    });
}

function jumpToTournament(section, index) {
    if (index === 0) {
        scrollToPageTop();
        closeCompactMenus();
        return;
    }
    const top = section.getBoundingClientRect().top + window.scrollY - 76;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    closeCompactMenus();
}

function initTournamentJump() {
    const menu = document.getElementById("tournamentJump");
    if (!menu) return;
    const trigger = menu.querySelector(".tournament-jump-trigger");
    const popup = menu.querySelector(".tournament-jump-menu");
    if (!trigger || !popup) throw new Error("Tournament jump structure invalid");
    const sections = getTournamentSections();
    if (sections.length === 0) return;
    const showYearHeadings = popup.dataset.yearHeadings === "true";
    let currentGroupLabel = "";
    let optionParent = popup;
    sections.forEach((section, index) => {
        const title = readTournamentTitle(section);
        if (showYearHeadings) {
          const year = readTournamentYear(title);
            if (year !== currentGroupLabel) {
                currentGroupLabel = year;
                optionParent = createTournamentYearGroup(popup, year);
            }
        }
        const option = document.createElement("button");
        option.type = "button";
        option.className = "tournament-jump-option compact-menu-option";
        option.setAttribute("role", "option");
        option.textContent = title;
        option.addEventListener("click", () => jumpToTournament(section, index));
        optionParent.append(option);
    });
    trigger.disabled = false;
    const openMenu = () => {
        syncTournamentJumpMobilePosition();
        if (!menu.classList.contains("is-open")) toggleCompactMenu(trigger);
    };
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
        menu.addEventListener("pointerenter", openMenu);
        menu.addEventListener("pointerleave", closeCompactMenus);
    }
    syncTournamentJumpMobilePosition();
    updateTournamentJumpCurrent();
}

function refreshCurrentPage() {
    window.location.reload();
}

function scrollToPageTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetFloatingActionsPosition(actions) {
    actions.style.top = "";
    actions.style.bottom = "";
    actions.style.transform = "";
}

function syncFloatingActionsMobilePosition() {
    const actions = document.getElementById("floatingPageActions");
    if (!actions) return;
    if (!window.matchMedia("(max-width: 650px)").matches) {
        resetFloatingActionsPosition(actions);
        return;
    }
    const footer = document.querySelector(".build-footer");
    if (!footer) {
        resetFloatingActionsPosition(actions);
        return;
    }
    const footerBox = footer.getBoundingClientRect();
    if (footerBox.top < window.innerHeight) {
        const actionsBox = actions.getBoundingClientRect();
        const centerY = footerBox.top - floatingActionsFooterGap - (actionsBox.height / 2);
        actions.style.top = centerY + "px";
        actions.style.bottom = "auto";
        actions.style.transform = "translate(-50%, -50%)";
        return;
    }
    resetFloatingActionsPosition(actions);
}

function syncTournamentJumpMobilePosition() {
    const menu = document.getElementById("tournamentJump");
    if (!menu) return;
    const popup = menu.querySelector(".tournament-jump-menu");
    if (!popup) throw new Error("Tournament jump menu missing");
    if (!window.matchMedia("(max-width: 650px)").matches) {
        popup.style.left = "";
        popup.style.transform = "";
        return;
    }
    popup.style.left = (window.innerWidth / 2) - menu.getBoundingClientRect().left + "px";
    popup.style.transform = "translateX(-50%)";
}

function bindFloatingActionsMobilePosition() {
    let pendingFrame = 0;
    const scheduleSync = () => {
        if (pendingFrame) return;
        pendingFrame = window.requestAnimationFrame(() => {
            pendingFrame = 0;
            syncFloatingActionsMobilePosition();
            syncTournamentJumpMobilePosition();
            updateTournamentJumpCurrent();
        });
    };
    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync);
    scheduleSync();
}

function initFloatingPageActions() {
    const actions = document.getElementById("floatingPageActions");
    if (!actions) return;
    initTournamentJump();
    bindFloatingActionsMobilePosition();
}

window.refreshCurrentPage = refreshCurrentPage;
window.scrollToPageTop = scrollToPageTop;
initFloatingPageActions();
`;
