// This code fetches the leaderboard data from the server and displays it in a table format.

function loadLeaderboard(weekNum = "") {
  let url = '/leaderboards';
  console.log(weekNum);
  if (weekNum !== "") url += `?weekNum=${weekNum}`;
  fetch(url)
    .then(res => res.json())
    .then(data => {
      // Sort in descending order by mileage (numbers only — ignore "-")
      data.sort((a, b) => {
        const aMiles = a.mileage === "-" ? -Infinity : a.mileage;
        const bMiles = b.mileage === "-" ? -Infinity : b.mileage;
        return bMiles - aMiles;
      });

      const tbody = document.querySelector('#leaderboard tbody');
      tbody.innerHTML = ""; // Clear previous rows

      data.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${user.name}</td>
          <td>${user.mileage}</td>
        `;
        tbody.appendChild(row);
      });
    })
    .catch(err => {
      console.error('Failed to load leaderboard:', err);
    });
}

document.getElementById('weekSelect').addEventListener('change', function() {
  const weekNum = this.value;
  const th = document.querySelector('#leaderboard thead th:last-child');
  th.textContent = weekNum === "" ? "All Time Mileage" : `Week ${weekNum} Mileage`;
  loadLeaderboard(weekNum);
});

// Initial load
const initialWeekNum = document.getElementById('weekSelect').value;
const th = document.querySelector('#leaderboard thead th:last-child');
th.textContent = initialWeekNum === "" ? "All Time Mileage" : `Week ${initialWeekNum} Mileage`;
loadLeaderboard(initialWeekNum);