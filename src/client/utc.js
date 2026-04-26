export const UTC_SCRIPT = `
(function(){
function pad(n) { return n < 10 ? '0' + n : n; }

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
    var year = String(date.getFullYear()).slice(2);
    var month = pad(date.getMonth() + 1);
    var day = pad(date.getDate());
    var hour = pad(date.getHours());
    var minute = pad(date.getMinutes());
    var second = pad(date.getSeconds());
    
    if (format === 'time') {
        el.textContent = hour + ":" + minute;
    } else if (format === 'date') {
        el.textContent = month + "-" + day;
    } else if (format === 'hour') {
        el.textContent = hour + ":00";
    } else if (format === 'datetime') {
        el.textContent = year + "-" + month + "-" + day + " " + hour + ":" + minute;
    } else {
        el.textContent = year + "-" + month + "-" + day + " " + hour + ":" + minute + ":" + second;
    }
}

function convertAllUtcElements() {
    document.querySelectorAll('.utc-local[data-utc]').forEach(convertUtcToLocal);
}

var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        mutation.addedNodes.forEach(function(node) {
            if (node.nodeType === 1) {
                if (node.classList && node.classList.contains('utc-local')) {
                    convertUtcToLocal(node);
                }
                node.querySelectorAll && node.querySelectorAll('.utc-local[data-utc]').forEach(convertUtcToLocal);
            }
        });
    });
});

document.addEventListener('DOMContentLoaded', function() {
    convertAllUtcElements();
    observer.observe(document.body, { childList: true, subtree: true });
});

window.convertUtcToLocal = convertUtcToLocal;
window.convertAllUtcElements = convertAllUtcElements;
})();
`;