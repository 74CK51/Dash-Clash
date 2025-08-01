// This code fetches the leaderboard data from the server and displays it in a table format.

function loadLeaderboard(weekNum = "", stat = "mileage") {
  let url = '/leaderboards';
  if (weekNum !== "") url += `?weekNum=${weekNum}`;
  fetch(url)
    .then(res => res.json())
    .then(data => {
      // Sort: for pace, lower is better; for mileage, higher is better
      data.sort((a, b) => {
        function paceToSeconds(val) {
          if (val === "-") return Infinity;
          if (typeof val === "number") return val; // fallback
          const [min, sec] = val.split(":").map(Number);
          return min * 60 + sec;
        }

        if (stat === "pace") {
          return paceToSeconds(a.pace) - paceToSeconds(b.pace); // lower is better
        } else if (stat === "numRuns") {
          const aVal = a.numRuns === "-" || a.numRuns === undefined ? -Infinity : a.numRuns;
          const bVal = b.numRuns === "-" || b.numRuns === undefined ? -Infinity : b.numRuns;
          return bVal - aVal; // higher is better
        } else {
          const aVal = a.mileage === "-" /*|| a.mileage === undefined*/ ? -Infinity : a.mileage;
          const bVal = b.mileage === "-" /*|| b.mileage === undefined*/ ? -Infinity : b.mileage;
          return bVal - aVal; // higher is better
        }
      });

      /**
       * getFirst
       * -----------
       * Determines the "winner(s)" for a given leaderboard stat (mileage, pace, or numRuns).
       * 
       * - For mileage and numRuns:
       *    - Filters out users with invalid values ("-" or undefined).
       *    - Sorts users by highest value.
       *    - If the top value is 0, returns "-" (no winner).
       *    - If multiple users are tied for the top value (>0), returns all as "Name (value), Name2 (value)".
       *    - If only one user has the top value (>0), returns just that user.
       * 
       * - For pace:
       *    - Filters out users with invalid pace ("-" or undefined).
       *    - Sorts users by fastest pace (lowest MM:SS).
       *    - Finds all users tied for the fastest pace.
       *    - Returns all tied users as "Name (pace), Name2 (pace)".
       * 
       * Edge Cases:
       *  - If no valid users exist for the stat, returns "-".
       *  - For mileage/numRuns, if all valid values are 0, returns "-".
       *  - For pace, if multiple users have the same fastest time, all are shown.
       */
      function getFirst(stat, isPace = false) {
        const isValid = val => val !== "-" && val !== undefined;

        const paceToSeconds = val => {
          if (!isValid(val)) return Infinity;
          const [min, sec] = val.split(":").map(Number);
          return min * 60 + sec;
        };

        let valid = data.filter(u => isValid(isPace ? u.pace : u[stat]));
        if (valid.length === 0) return "-";

        if (isPace) {
          valid.sort((a, b) => paceToSeconds(a.pace) - paceToSeconds(b.pace));
          const topSeconds = paceToSeconds(valid[0].pace);
          const winners = valid.filter(u => paceToSeconds(u.pace) === topSeconds);
          return winners.map(u => `${u.name} (${u.pace})`).join(", ");
        } else {
          valid.sort((a, b) => b[stat] - a[stat]);
          const topVal = valid[0][stat];
          if (topVal === 0) return "-";
          const winners = valid.filter(u => u[stat] === topVal);
          return winners.map(u => `${u.name} (${u[stat]})`).join(", ");
        }
      }


      document.getElementById('firstMileage').textContent = `🏆 1st Mileage: ${getFirst('mileage')}`;
      document.getElementById('firstPace').textContent = `🏆 1st Pace: ${getFirst('pace', true)}`;
      document.getElementById('firstNumRuns').textContent = `🏆 1st Number of Runs: ${getFirst('numRuns')}`;


      const tbody = document.querySelector('#leaderboard tbody');
      tbody.innerHTML = "";

      data.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${user.name}</td>
          <td>${user[stat]}</td>
        `;
        tbody.appendChild(row);
      });
    })
    .catch(err => {
      console.error('Failed to load leaderboard:', err);
    });
}

function updateTableHeader(weekNum, stat) {
  const th = document.getElementById('statHeader');
  if (stat === "mileage") {
    th.textContent = weekNum === "" ? "All Time Mileage" : `Week ${weekNum} Mileage`;
  } else {
    th.textContent = weekNum === "" ? "All Time Pace" : `Week ${weekNum} Pace`;
  }
}

const weekSelect = document.getElementById('weekSelect');
const statSelect = document.getElementById('statSelect');

function reloadLeaderboard() {
  const weekNum = weekSelect.value;
  const stat = statSelect.value;
  updateTableHeader(weekNum, stat);
  loadLeaderboard(weekNum, stat);
}

weekSelect.addEventListener('change', reloadLeaderboard);
statSelect.addEventListener('change', reloadLeaderboard);

// Initial load
reloadLeaderboard();