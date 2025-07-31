require('dotenv').config();
const express = require('express');
const axios = require('axios');
const qs = require('qs');
const Database = require('better-sqlite3');
const app = express();
const { userMap } = require('./api/strava'); // Import userMap from strava.js
const { team1, team2 } = require('./public/teams');
const { weekRanges } = require('./api/strava');


const PORT = 3000;

app.use(express.static('public')); // serve HTML/JS

const db = new Database('tokens.db');
const leaderboards_db = new Database('leaderboards.db');

// Create table if not exists
db.prepare(`
  CREATE TABLE IF NOT EXISTS tokens (
    userId TEXT PRIMARY KEY UNIQUE,
    access_token TEXT,
    refresh_token TEXT,
    expires_at INTEGER
  )
`).run();

app.get('/exchange_token', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('No code provided');

  try {
    const response = await axios.post('https://www.strava.com/oauth/token', {
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      code: code,
      grant_type: 'authorization_code'
    });

    // Get athlete username from Strava API
    const athlete = response.data.athlete;
    const userId = String(athlete.id);

    // TODO: Check if response token is the correct scope --> reroute back to auth if not

    // Store in database
    db.prepare(`
      INSERT OR REPLACE INTO tokens (userId, access_token, refresh_token, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(
      userId,
      response.data.access_token,
      response.data.refresh_token,
      response.data.expires_at
    );

    res.send('Authorization successful! You can close this window.');
    // TODO: Redirect back to home page or success page
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).send('Token exchange failed');
  }
});

const tokens = db.prepare('SELECT userId FROM tokens').all().map(row => row.userId);

app.get('/leaderboards', (req, res) => {
    const weekNum = req.query.weekNum;
    const stat = req.query.stat || "mileage"; // Default to mileage if not specified
    const users = Object.keys(userMap);

    let leaderboardData;
    if (weekNum !== undefined && weekNum !== "") {
        // Leaderboard for a specific week
        leaderboardData = users.map(userId => {
            // Check if user has a token
            const hasToken = tokens.includes(userId);
            if (!hasToken) {
                return {
                    name: userMap[userId],
                    mileage: "-",
                    pace: "-",
                    numRuns: "-"
                };
            }
            const result = leaderboards_db.prepare(`
                SELECT mileage, movingTime, numRuns FROM leaderboards WHERE userId = ? AND weekNum = ?
            `).get(userId, weekNum);

            let pace = "-";
            if (result?.mileage > 0 && result?.movingTime > 0) {
                const avgPace = (result.movingTime / 60) / result.mileage; // min/mile
                pace = formatPace(avgPace);
            }

            return {
                name: userMap[userId],
                mileage: result?.mileage !== undefined ? result.mileage : 0,
                pace,
                numRuns: result?.numRuns !== undefined ? result.numRuns : 0
            };
        });
    } else {
        // All-time leaderboard (sum mileage)
        leaderboardData = users.map(userId => {
            const hasToken = tokens.includes(userId);
            if (!hasToken) {
                return {
                    name: userMap[userId],
                    mileage: "-",
                    pace: "-",
                    numRuns: "-"
                };
            }
            const result = leaderboards_db.prepare(`
                SELECT SUM(mileage) as mileage, SUM(movingTime) as movingTime, SUM(numRuns) as numRuns FROM leaderboards WHERE userId = ?
            `).get(userId);

            let pace = "-";
            if (result?.mileage > 0 && result?.movingTime > 0) {
                const avgPace = (result.movingTime / 60) / result.mileage; // min/mile
                pace = formatPace(avgPace);
            }

            return {
                name: userMap[userId],
                mileage: result?.mileage !== undefined ? result.mileage : 0,
                pace,
                numRuns: result?.numRuns !== undefined ? result.numRuns : 0       
            };
        });
    }

    res.json(leaderboardData);
});

app.get('/team-leaderboard', (req, res) => {
    const weekNum = req.query.weekNum;
    if (weekNum === undefined) return res.status(400).json({ error: "weekNum required" });

    const db = new Database('leaderboards.db');
    function getTeamStats(team) {
        let total = 0;
        let contributors = [];
        for (const userId of Object.keys(team)) {
            // Check if user is authorized
            const hasToken = tokens.includes(userId);
            if (!hasToken) {
                contributors.push({ name: team[userId], mileage: "-" });
                continue;
            }
            const result = leaderboards_db.prepare(`
                SELECT mileage FROM leaderboards WHERE userId = ? AND weekNum = ?
            `).get(userId, weekNum);
            const mileage = result?.mileage !== undefined ? result.mileage : 0;
            total += mileage;
            contributors.push({ name: team[userId], mileage });
        }
        // Sort contributors by mileage descending, treating "-" as lowest
        contributors.sort((a, b) => {
            if (a.mileage === "-") return 1;
            if (b.mileage === "-") return -1;
            return b.mileage - a.mileage;
        });
        return { total, contributors };
    }

    const team1Stats = getTeamStats(team1);
    const team2Stats = getTeamStats(team2);

    res.json({
        weekNum,
        team1: team1Stats,
        team2: team2Stats
    });
});

// To communicate week ranges index.html
app.get('/weekRanges', (req, res) => {
  res.json(weekRanges);
});

function formatPace(pace) {
  if (pace === null || pace === undefined || isNaN(pace)) return "-";
  const min = Math.floor(pace);
  const sec = Math.round((pace - min) * 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

