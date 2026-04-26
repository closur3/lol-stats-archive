export const MODAL_SCRIPT = `
<script>
(function(){
const RESULT_ICON_MAP = { 
  'WIN': '\u2714', 
  'LOSS': '\u274c', 
  'LIVE': '\ud83d\udd35', 
  'NEXT': '\ud83d\udd52' 
};
const STYLE_DATE_TIME = 'style="font-weight:700;color:#475569"';
const STYLE_SCORE_DASH = 'style="opacity:0.4;margin:0 1px"';
const STYLE_SCORE_WRAP = 'style="width:52px;flex-shrink:0;display:flex;align-items:center;justify-content:center"';
const STYLE_MODAL_EMPTY = 'style="text-align:center;color:#999;padding:20px"';
const STYLE_H2H_SUMMARY = 'style="color:#94a3b8;font-size:14px"';
const STYLE_H2H_DASH = 'style="margin:0 1px"';
const STYLE_MUTED_DASH = 'style="color:#cbd5e1"';

function pad(n) { return n < 10 ? '0' + n : n; }

function renderMatchItem(mode, dateDisplay, resultTagHtml, team1Name, team2Name, isFullLength, scoreDisplay, matchResultCode, isoTimestamp) {
    const dateParts = (dateDisplay || '').split(' ');
    const dateHtml = dateParts.length === 2 
      ? dateParts[0] + '<br><span ' + STYLE_DATE_TIME + ' class="utc-local" data-utc="' + (isoTimestamp || '') + '" data-format="time">' + dateParts[1] + '</span>' 
      : (dateDisplay || '');

    let matchItemClass = 'match-item';
    if (mode === 'history') {
        if (matchResultCode === 'WIN') {
            matchItemClass += ' match-win';
        } else if (matchResultCode === 'LOSS') {
            matchItemClass += ' match-loss';
        }
    }

    let scoreContent = '', scoreClass = 'score-text';
    if (matchResultCode === 'LIVE') scoreClass += ' live';
    if (matchResultCode === 'NEXT') { 
      scoreContent = '<span class="score-text vs">VS</span>'; 
    } else { 
      const formattedScore = (scoreDisplay || '').toString().replace('-', '<span ' + STYLE_SCORE_DASH + '>-</span>'); 
      scoreContent = '<span class="' + scoreClass + '">' + formattedScore + '</span>'; 
    }
    const boxClass = isFullLength ? 'score-box is-full' : 'score-box';
    const team1Style = team1Name === 'TBD' ? 'style="padding-right:5px;color:#9ca3af !important;"' : 'style="padding-right:5px;"';
    const team2Style = team2Name === 'TBD' ? 'style="padding-left:5px;color:#9ca3af !important;"' : 'style="padding-left:5px;"';

    return '<div class="' + matchItemClass + '">' +
           '<div class="col-date">' + dateHtml + '</div>' +
           '<div class="modal-divider"></div>' +
           '<div class="col-vs-area"><div class="spine-row">' +
           '<span class="spine-l" ' + team1Style + '>' + team1Name + '</span>' +
           '<div ' + STYLE_SCORE_WRAP + '><div class="' + boxClass + '">' + scoreContent + '</div></div>' +
           '<span class="spine-r" ' + team2Style + '>' + team2Name + '</span>' +
           '</div></div>' +
           '<div class="modal-divider"></div>' +
           '<div class="col-res">' + resultTagHtml + '</div>' +
           '</div>';
}

function renderListHTML(htmlArray) {
    const modalList = document.getElementById('modalList');
    if(!htmlArray || htmlArray.length === 0) {
      modalList.innerHTML = "<div " + STYLE_MODAL_EMPTY + ">No matches found</div>";
    } else {
      modalList.innerHTML = htmlArray.join("");
    }
    document.querySelectorAll('#modalList .utc-local[data-utc]').forEach(convertUtcToLocal);
}

function parseUtcString(utc) {
    if (!utc) return null;
    var timestamp = Number(utc);
    if (!isNaN(timestamp) && timestamp > 0) return new Date(timestamp);
    if (/^\\d{4}-\\d{2}-\\d{2}T/.test(utc)) {
        var parsedDate = new Date(utc.includes('Z') ? utc : utc + 'Z');
        if (!isNaN(parsedDate.getTime())) return parsedDate;
    }
    var clean = utc.replace('T', ' ');
    var parts = clean.match(/(\\d{2})-(\\d{2})-(\\d{2})\\s+(\\d{2}):(\\d{2})(?::(\\d{2}))?/);
    if (parts) {
        return new Date(Date.UTC(2000 + parseInt(parts[1]), parseInt(parts[2]) - 1, parseInt(parts[3]), parseInt(parts[4]), parseInt(parts[5]), parseInt(parts[6] || 0)));
    }
    return null;
}

function convertUtcToLocal(el) {
    var utc = el.getAttribute('data-utc');
    if (!utc) return;
    
    var date = parseUtcString(utc);
    if (!date) return;
    
    var format = el.getAttribute('data-format') || 'datetime';
    var hour = pad(date.getHours());
    var minute = pad(date.getMinutes());
    
    if (format === 'time') {
        el.textContent = hour + ":" + minute;
    }
}

function showPopup(title, dayIndex, matches) {
    const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Total"];
    
    let localTime = title;
    if (title !== "Total") {
        const hour = parseInt(title.split(':')[0]);
        if (!isNaN(hour)) {
            const utcDate = new Date(Date.UTC(2026, 0, 1, hour, 0, 0));
            const localHour = utcDate.getHours();
            const localMinute = utcDate.getMinutes();
            localTime = pad(localHour) + ':' + pad(localMinute);
        }
    }
    
    document.getElementById('modalTitle').innerText = localTime + " - " + dayNames[dayIndex];
    const sortedMatches = [...matches].sort((matchA, matchB) => (matchB.timestamp || 0) - (matchA.timestamp || 0) || matchB.dateDisplay.localeCompare(matchA.dateDisplay));
    const listHtml = sortedMatches.map(match => {
        let boTag = '<span ' + STYLE_MUTED_DASH + '>-</span>';
        if (match.bestOf === 5) boTag = '<span class="sch-pill gold">BO5</span>';
        else if (match.bestOf === 3) boTag = '<span class="sch-pill">BO3</span>';
        else if (match.bestOf === 1) boTag = '<span class="sch-pill">BO1</span>';
        return renderMatchItem('distribution', match.dateDisplay, boTag, match.team1Name, match.team2Name, match.isFullLength, match.scoreDisplay, null, match.isoTimestamp);
    });
    renderListHTML(listHtml);
    document.getElementById('matchModal').style.display = "block";
}

function openTeam(slug, teamName) {
    if (!window.g_stats || !window.g_stats[slug] || !window.g_stats[slug][teamName]) return;
    const data = window.g_stats[slug][teamName];
    document.getElementById('modalTitle').innerText = teamName + " - Schedule";
    
    const history = data.history || [];
    
    const finished = history.filter(match => match.matchResultCode === 'WIN' || match.matchResultCode === 'LOSS');
    const upcoming = history.filter(match => match.matchResultCode === 'NEXT' || match.matchResultCode === 'LIVE');
    
    finished.sort((leftMatch, rightMatch) => (rightMatch.timestamp || 0) - (leftMatch.timestamp || 0) || rightMatch.dateDisplay.localeCompare(leftMatch.dateDisplay));
    upcoming.sort((leftMatch, rightMatch) => (leftMatch.timestamp || 0) - (rightMatch.timestamp || 0) || leftMatch.dateDisplay.localeCompare(rightMatch.dateDisplay));
    
    let listHtml = [];
    
    finished.forEach(match => {
        const icon = RESULT_ICON_MAP[match.matchResultCode] || RESULT_ICON_MAP['NEXT'];
        const resultTag = '<span class="' + ((match.matchResultCode === 'WIN' || match.matchResultCode === 'LOSS') ? '' : 'hist-icon') + '">' + icon + '</span>';
        listHtml.push(renderMatchItem('history', match.dateDisplay, resultTag, teamName, match.opponentName, match.isFullLength, match.scoreDisplay, match.matchResultCode, match.isoTimestamp));
    });
    
    if (upcoming.length > 0) {
        const marginTop = finished.length > 0 ? 'margin-top:16px;' : '';
        listHtml.push('<div style="border-top:2px solid #3b82f6;margin:8px 0;' + marginTop + '"></div>');
        upcoming.forEach(match => {
            const icon = RESULT_ICON_MAP[match.matchResultCode] || RESULT_ICON_MAP['NEXT'];
            const resultTag = '<span class="' + ((match.matchResultCode === 'WIN' || match.matchResultCode === 'LOSS') ? '' : 'hist-icon') + '">' + icon + '</span>';
            listHtml.push(renderMatchItem('history', match.dateDisplay, resultTag, teamName, match.opponentName, match.isFullLength, match.scoreDisplay, match.matchResultCode, match.isoTimestamp));
        });
    }
    
    renderListHTML(listHtml);
    document.getElementById('matchModal').style.display="block";
}

function openStats(slug, teamName, type) {
    if (!window.g_stats || !window.g_stats[slug] || !window.g_stats[slug][teamName]) return;
    const data = window.g_stats[slug][teamName];
    let history = data.history || [];
    let titleSuffix = "";
    if (type === 'bo3') { history = history.filter(match => match.bestOf === 3); titleSuffix = " - BO3"; }
    else if (type === 'bo5') { history = history.filter(match => match.bestOf === 5); titleSuffix = " - BO5"; }
    else { titleSuffix = " - Series"; }
    document.getElementById('modalTitle').innerText = teamName + titleSuffix;
    
    const finished = history.filter(match => match.matchResultCode === 'WIN' || match.matchResultCode === 'LOSS');
    const upcoming = history.filter(match => match.matchResultCode === 'NEXT' || match.matchResultCode === 'LIVE');
    
    finished.sort((leftMatch, rightMatch) => (rightMatch.timestamp || 0) - (leftMatch.timestamp || 0) || rightMatch.dateDisplay.localeCompare(leftMatch.dateDisplay));
    upcoming.sort((leftMatch, rightMatch) => (leftMatch.timestamp || 0) - (rightMatch.timestamp || 0) || leftMatch.dateDisplay.localeCompare(rightMatch.dateDisplay));
    
    let listHtml = [];
    
    finished.forEach(match => {
        const icon = RESULT_ICON_MAP[match.matchResultCode] || RESULT_ICON_MAP['NEXT'];
        const resultTag = '<span class="' + ((match.matchResultCode === 'WIN' || match.matchResultCode === 'LOSS') ? '' : 'hist-icon') + '">' + icon + '</span>';
        listHtml.push(renderMatchItem('history', match.dateDisplay, resultTag, teamName, match.opponentName, match.isFullLength, match.scoreDisplay, match.matchResultCode, match.isoTimestamp));
    });
    
    if (upcoming.length > 0) {
        const marginTop = finished.length > 0 ? 'margin-top:16px;' : '';
        listHtml.push('<div style="border-top:2px solid #3b82f6;margin:8px 0;' + marginTop + '"></div>');
        upcoming.forEach(match => {
            const icon = RESULT_ICON_MAP[match.matchResultCode] || RESULT_ICON_MAP['NEXT'];
            const resultTag = '<span class="' + ((match.matchResultCode === 'WIN' || match.matchResultCode === 'LOSS') ? '' : 'hist-icon') + '">' + icon + '</span>';
            listHtml.push(renderMatchItem('history', match.dateDisplay, resultTag, teamName, match.opponentName, match.isFullLength, match.scoreDisplay, match.matchResultCode, match.isoTimestamp));
        });
    }
    
    renderListHTML(listHtml);
    document.getElementById('matchModal').style.display="block";
}

function openH2H(slug, team1Name, team2Name) {
    if (!window.g_stats || !window.g_stats[slug] || !window.g_stats[slug][team1Name]) return;
    const data = window.g_stats[slug][team1Name];
    const h2hHistory = (data.history || []).filter(match => match.opponentName === team2Name);
    let team1Wins = 0, team2Wins = 0;
    h2hHistory.forEach(match => { if(match.matchResultCode === 'WIN') team1Wins++; else if(match.matchResultCode === 'LOSS') team2Wins++; });
    const summary = h2hHistory.length > 0 ? ' <span ' + STYLE_H2H_SUMMARY + '>(' + team1Wins + '<span ' + STYLE_H2H_DASH + '>-</span>' + team2Wins + ')</span>' : "";
    document.getElementById('modalTitle').innerHTML = team1Name + " vs " + team2Name + summary;
    const listHtml = h2hHistory.map(match => {
        const icon = RESULT_ICON_MAP[match.matchResultCode] || RESULT_ICON_MAP['NEXT'];
        const resultTag = '<span class="' + ((match.matchResultCode === 'WIN' || match.matchResultCode === 'LOSS') ? '' : 'hist-icon') + '">' + icon + '</span>';
        return renderMatchItem('history', match.dateDisplay, resultTag, team1Name, match.opponentName, match.isFullLength, match.scoreDisplay, match.matchResultCode, match.isoTimestamp);
    });
    renderListHTML(listHtml);
    document.getElementById('matchModal').style.display="block";
}

function closePopup(){document.getElementById('matchModal').style.display="none";}
window.onclick=function(event){if(event.target==document.getElementById('matchModal'))closePopup();}

window.renderMatchItem = renderMatchItem;
window.renderListHTML = renderListHTML;
window.showPopup = showPopup;
window.openTeam = openTeam;
window.openStats = openStats;
window.openH2H = openH2H;
window.closePopup = closePopup;
})();
</script>
`;