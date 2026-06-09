export const PAGE_ACTIONS_SCRIPT = `
const FLOATING_ACTIONS_FOOTER_GAP = 12;

function getLeagueSections() {
    return Array.from(document.querySelectorAll("details.home-sec"));
}

function updateLeagueToggleButton() {
    const button = document.getElementById("floatingToggleLeagues");
    if (!button) return;
    const sections = getLeagueSections();
    if (sections.length === 0) {
        button.disabled = true;
        button.setAttribute("aria-label", "No leagues");
        button.dataset.actionState = "disabled";
        return;
    }
    const hasClosedSection = sections.some(section => !section.open);
    button.disabled = false;
    button.dataset.actionState = hasClosedSection ? "expand" : "collapse";
    button.setAttribute("aria-label", hasClosedSection ? "Expand all leagues" : "Collapse all leagues");
}

function toggleAllLeagues() {
    const sections = getLeagueSections();
    const shouldExpand = sections.some(section => !section.open);
    sections.forEach(section => { section.open = shouldExpand; });
    updateLeagueToggleButton();
    syncFloatingActionsMobilePosition();
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
        const centerY = footerBox.top - FLOATING_ACTIONS_FOOTER_GAP - (actionsBox.height / 2);
        actions.style.top = centerY + "px";
        actions.style.bottom = "auto";
        actions.style.transform = "translate(-50%, -50%)";
        return;
    }
    resetFloatingActionsPosition(actions);
}

function bindFloatingActionsMobilePosition() {
    let pendingFrame = 0;
    const scheduleSync = () => {
        if (pendingFrame) return;
        pendingFrame = window.requestAnimationFrame(() => {
            pendingFrame = 0;
            syncFloatingActionsMobilePosition();
        });
    };
    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync);
    scheduleSync();
}

function initFloatingPageActions() {
    const actions = document.getElementById("floatingPageActions");
    if (!actions) return;
    getLeagueSections().forEach(section => {
        section.addEventListener("toggle", () => {
            updateLeagueToggleButton();
            syncFloatingActionsMobilePosition();
        });
    });
    updateLeagueToggleButton();
    bindFloatingActionsMobilePosition();
}

window.toggleAllLeagues = toggleAllLeagues;
window.refreshCurrentPage = refreshCurrentPage;
window.scrollToPageTop = scrollToPageTop;
initFloatingPageActions();
`;
