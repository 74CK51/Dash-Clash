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