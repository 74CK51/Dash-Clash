require('dotenv').config();
const express = require('express');
const axios = require('axios');
const qs = require('qs');
const Database = require('better-sqlite3');
const app = express();
const { userMap } = require('./api/strava'); // Import userMap from strava.js


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
                    mileage: "-"
                };
            }
            const result = leaderboards_db.prepare(`
                SELECT mileage FROM leaderboards WHERE userId = ? AND weekNum = ?
            `).get(userId, weekNum);
            return {
                name: userMap[userId],
                mileage: result?.mileage !== undefined ? result.mileage : 0
            };
        });
    } else {
        // All-time leaderboard (sum mileage)
        leaderboardData = users.map(userId => {
            const hasToken = tokens.includes(userId);
            if (!hasToken) {
                return {
                    name: userMap[userId],
                    mileage: "-"
                };
            }
            const result = leaderboards_db.prepare(`
                SELECT SUM(mileage) as mileage FROM leaderboards WHERE userId = ?
            `).get(userId);
            return {
                name: userMap[userId],
                mileage: result?.mileage !== null && result?.mileage !== undefined ? Math.round(result.mileage * 100) / 100 : 0
            };
        });
    }

    res.json(leaderboardData);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

