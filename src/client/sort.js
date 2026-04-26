export const SORT_SCRIPT = `
(function(){
const COL_TEAM=0, COL_BO3=1, COL_BO3_PCT=2, COL_BO5=3, COL_BO5_PCT=4, COL_SERIES=5, COL_SERIES_WR=6, COL_GAME=7, COL_GAME_WR=8, COL_STREAK=9, COL_LAST_DATE=10;

function doSort(columnIndex, tableId) {
    const table = document.getElementById(tableId);
    const tbody = table.tBodies[0];
    const rows = Array.from(tbody.rows);
    const sortDirKey = 'data-sort-dir-' + columnIndex;
    const currentDir = table.getAttribute(sortDirKey);
    const defaultAscCols = [COL_TEAM, COL_BO3_PCT, COL_BO5_PCT];
    const nextDir = (!currentDir) ? (defaultAscCols.includes(columnIndex) ? 'asc' : 'desc') : (currentDir === 'desc' ? 'asc' : 'desc');

    rows.sort((rowA, rowB) => {
        const rawA = (rowA.cells[columnIndex].innerText || "").replace(/\\s+/g, "");
        const rawB = (rowB.cells[columnIndex].innerText || "").replace(/\\s+/g, "");
        const isMissingA = rawA === "-";
        const isMissingB = rawB === "-";
        if (isMissingA !== isMissingB) return isMissingA ? 1 : -1;

        const compareTeamName = () => {
            const teamA = (rowA.cells[COL_TEAM].innerText || "").toLowerCase();
            const teamB = (rowB.cells[COL_TEAM].innerText || "").toLowerCase();
            if (teamA === teamB) return 0;
            return teamA > teamB ? 1 : -1;
        };

        if (columnIndex === COL_SERIES) {
            const parseSeriesRecord = (text) => {
                if (text === "-" || !text.includes("-")) return { wins: -1, losses: 9999, winRate: -1 };
                const parts = text.split("-");
                const wins = parseFloat(parts[0]) || 0;
                const losses = parseFloat(parts[1]) || 0;
                const total = wins + losses;
                return { wins, losses, winRate: total > 0 ? (wins / total) : -1 };
            };

            const recA = parseSeriesRecord(rowA.cells[COL_SERIES].innerText);
            const recB = parseSeriesRecord(rowB.cells[COL_SERIES].innerText);

            if (recA.wins !== recB.wins) return nextDir === 'asc' ? (recA.wins - recB.wins) : (recB.wins - recA.wins);
            if (recA.losses !== recB.losses) return nextDir === 'asc' ? (recB.losses - recA.losses) : (recA.losses - recB.losses);
            if (recA.winRate !== recB.winRate) return nextDir === 'asc' ? (recA.winRate - recB.winRate) : (recB.winRate - recA.winRate);

            const gameA = parseValue(rowA.cells[COL_GAME_WR].innerText);
            const gameB = parseValue(rowB.cells[COL_GAME_WR].innerText);
            if (gameA !== gameB) return nextDir === 'asc' ? (gameA - gameB) : (gameB - gameA);
            return compareTeamName();
        }

        let valueA = rowA.cells[columnIndex].innerText;
        let valueB = rowB.cells[columnIndex].innerText;
        
        if (columnIndex === COL_LAST_DATE) { 
          valueA = valueA === "-" ? "" : valueA; 
          valueB = valueB === "-" ? "" : valueB; 
        } else if (columnIndex === COL_STREAK) { 
          const parseStreak = (streak) => streak === "-" ? 0 : (streak.includes('W') ? parseInt(streak) : -parseInt(streak)); 
          valueA = parseStreak(valueA); 
          valueB = parseStreak(valueB); 
        } else { 
          valueA = parseValue(valueA); 
          valueB = parseValue(valueB); 
        }

        if (valueA !== valueB) return nextDir === 'asc' ? (valueA > valueB ? 1 : -1) : (valueA < valueB ? 1 : -1);
        
        if (columnIndex === COL_BO3_PCT || columnIndex === COL_BO5_PCT) { 
          const tieA = parseFloat(rowA.cells[columnIndex].dataset.bayesTie || "0");
          const tieB = parseFloat(rowB.cells[columnIndex].dataset.bayesTie || "0");
          if (tieA !== tieB) return nextDir === 'asc' ? (tieA - tieB) : (tieB - tieA);

          const sampleA = parseFloat(rowA.cells[columnIndex].dataset.sampleSize || "0");
          const sampleB = parseFloat(rowB.cells[columnIndex].dataset.sampleSize || "0");
          if (sampleA !== sampleB) return nextDir === 'asc' ? (sampleB - sampleA) : (sampleA - sampleB);

          const seriesA = parseValue(rowA.cells[COL_SERIES_WR].innerText);
          const seriesB = parseValue(rowB.cells[COL_SERIES_WR].innerText);
          if (seriesA !== seriesB) return seriesB - seriesA;

          const gameA = parseValue(rowA.cells[COL_GAME_WR].innerText);
          const gameB = parseValue(rowB.cells[COL_GAME_WR].innerText);
          if (gameA !== gameB) return gameB - gameA;
        }
        
        if (columnIndex === COL_SERIES_WR) {
            const gameA = parseValue(rowA.cells[COL_GAME_WR].innerText);
            const gameB = parseValue(rowB.cells[COL_GAME_WR].innerText);
            if (gameA !== gameB) return gameB - gameA;
        } else if (columnIndex === COL_GAME) {
            const getGameNet = (cell) => {
                const text = cell.innerText;
                if (text === "-" || !text.includes("-")) return 0;
                const parts = text.split("-");
                if (parts.length === 2) {
                    const wins = parseFloat(parts[0]) || 0;
                    const losses = parseFloat(parts[1]) || 0;
                    return wins - losses;
                }
                return 0;
            };
            const netA = getGameNet(rowA.cells[COL_GAME]);
            const netB = getGameNet(rowB.cells[COL_GAME]);
            if (netA !== netB) return netB - netA;
        }
        return compareTeamName();
    });

    table.setAttribute(sortDirKey, nextDir);
    rows.forEach(row => tbody.appendChild(row));
}

function parseValue(value) {
    if(value === "-") return Number.POSITIVE_INFINITY; 
    if(value.includes('%')) return parseFloat(value);
    if(value.includes('/')) {
      const parts = value.split('/');
      return parts[1] === '-' ? Number.POSITIVE_INFINITY : parseFloat(parts[0]) / parseFloat(parts[1]);
    }
    if(value.includes('-') && value.split('-').length === 2) {
      return parseFloat(value.split('-')[0]);
    }
    const parsedNum = parseFloat(value); 
    return isNaN(parsedNum) ? value.toLowerCase() : parsedNum;
}

window.doSort = doSort;
window.parseValue = parseValue;
})();
`;