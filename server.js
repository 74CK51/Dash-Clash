require('dotenv').config();
const express = require('express');
const axios = require('axios');
const qs = require('qs');
const Database = require('better-sqlite3');
const app = express();
const { userMap, weekRanges, pool } = require('./api/strava');
const { team1, team2 } = require('./public/teams');
const { updateAllUsersUpToToday } = require('./public/update-all-weeks');
const PORT = 3000;

app.use(express.static('public')); // serve HTML/JS

// const db = new Database('tokens.db');
// const leaderboards_db = new Database('leaderboards.db');

// Create table if not exists
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tokens (
      user_id TEXT PRIMARY KEY,
      access_token TEXT,
      refresh_token TEXT,
      expires_at BIGINT
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leaderboards (
      user_id TEXT NOT NULL,
      week_num INTEGER NOT NULL,
      mileage REAL NOT NULL,
      moving_time REAL,
      num_runs INTEGER,
      PRIMARY KEY (user_id, week_num)
    );
  `);
}
ensureTables();

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
    // db.prepare(`
    //   INSERT OR REPLACE INTO tokens (userId, access_token, refresh_token, expires_at)
    //   VALUES (?, ?, ?, ?)
    // `).run(
    //   userId,
    //   response.data.access_token,
    //   response.data.refresh_token,
    //   response.data.expires_at
    // );
    await pool.query(`
        INSERT INTO tokens (user_id, access_token, refresh_token, expires_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id) DO UPDATE SET access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token, expires_at = EXCLUDED.expires_at    
    `, [userId, response.data.access_token, response.data.refresh_token, response.data.expires_at]);

    // res.send('Authorization successful! You can close this window.');
    updateAllUsersUpToToday()
    res.redirect('/'); // Redirect to home page after successful token exchange

    // TODO: Redirect back to home page or success page
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).send('Token exchange failed');
  }
});

// const tokens = db.prepare('SELECT userId FROM tokens').all().map(row => row.userId);
async function getTokens() {
  const { rows } = await pool.query('SELECT user_id FROM tokens');
  return rows.map(row => row.user_id);
}

app.get('/leaderboards', async (req, res) => {
    const weekNum = req.query.weekNum;
    const stat = req.query.stat || "mileage"; // Default to mileage if not specified
    const users = Object.keys(userMap);
    const tokensSet = new Set(await getTokens()); // no need to loop later

    let leaderboardData;
    if (weekNum !== undefined && weekNum !== "") {
        // Leaderboard for a specific week
        // leaderboardData = users.map(userId => {
        leaderboardData = await Promise.all(users.map(async userId => {

            hasToken = tokensSet.has(userId);
            // Check if user has a token
            if (!hasToken) {
                return {
                    name: userMap[userId],
                    mileage: "-",
                    pace: "-",
                    numRuns: "-"
                };
            }
            // const result = leaderboards_db.prepare(`
            //     SELECT mileage, movingTime, numRuns FROM leaderboards WHERE userId = ? AND weekNum = ?
            // `).get(userId, weekNum);
            const result = await pool.query(
                'SELECT mileage, moving_time, num_runs FROM leaderboards WHERE user_id = $1 AND week_num = $2',
                [userId, weekNum]
            );
            const row = result.rows[0];

            let pace = "-";
            if (row?.mileage > 0 && row?.moving_time > 0) {
                const avgPace = (row.moving_time / 60) / row.mileage; // min/mile
                pace = formatPace(avgPace);
            }

            return {
                name: userMap[userId],
                mileage: row?.mileage !== undefined ? row.mileage : 0,
                pace,
                numRuns: row?.num_runs !== undefined ? row.num_runs : 0
            };
        }));
    } else {
        // All-time leaderboard (sum mileage)
        // leaderboardData = users.map(userId => {
        leaderboardData = await Promise.all(users.map(async userId => {

            hasToken = tokensSet.has(userId);

            if (!hasToken) {
                return {
                    name: userMap[userId],
                    mileage: "-",
                    pace: "-",
                    numRuns: "-"
                };
            }
            // const result = leaderboards_db.prepare(`
            //     SELECT SUM(mileage) as mileage, SUM(movingTime) as movingTime, SUM(numRuns) as numRuns FROM leaderboards WHERE userId = ?
            // `).get(userId);
            const result = await pool.query(
                'SELECT SUM(mileage) as mileage, SUM(moving_time) as moving_time, SUM(num_runs) as num_runs FROM leaderboards WHERE user_id = $1',
                [userId]
            );
            const row = result.rows[0];

            let pace = "-";
            if (row?.mileage > 0 && row?.movingTime > 0) {
                const avgPace = (row.moving_time / 60) / row.mileage; // min/mile
                pace = formatPace(avgPace);
            }

            return {
                name: userMap[userId],
                mileage: row?.mileage !== undefined ? row.mileage : 0,
                pace,
                numRuns: row?.numRuns !== undefined ? row.num_runs : 0       
            };
        }));
    }

    res.json(leaderboardData);
});

app.get('/team-leaderboard', async (req, res) => {
    const weekNum = req.query.weekNum;
    if (weekNum === undefined) return res.status(400).json({ error: "week_num required" });
    const tokens = await getTokens();

    // const db = new Database('leaderboards.db');
    async function getTeamStats(team) {
    const userIds = Object.keys(team);
    const tokensSet = new Set(await getTokens()); // no need to loop later
    
    const result = await pool.query(
        'SELECT user_id, mileage FROM leaderboards WHERE user_id = ANY($1) AND week_num = $2',
        [userIds, weekNum]
    );

    const mileageMap = new Map();
        for (const row of result.rows) {
            mileageMap.set(row.user_id, row.mileage);
        }

        let total = 0;
        let contributors = [];

        for (const userId of userIds) {
            const hasToken = tokensSet.has(userId);

            if (!hasToken) {
            contributors.push({ name: team[userId], mileage: "-" });
            continue;
            }

            const mileage = mileageMap.get(userId) ?? 0;
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

    const team1Stats = await getTeamStats(team1);
    const team2Stats = await getTeamStats(team2);

    res.json({
        weekNum,
        team1: team1Stats,
        team2: team2Stats
    });
});

async function getTeamTotal(team, weekNum) {
    let total = 0;
    for (const userId of Object.keys(team)) {
        // const result = leaderboards_db.prepare(`
        //     SELECT mileage FROM leaderboards WHERE userId = ? AND weekNum = ?
        // `).get(userId, weekNum);
        const result = await pool.query(
            'SELECT mileage FROM leaderboards WHERE user_id = $1 AND week_num = $2',
            [userId, weekNum]
        );
        const row = result.rows[0];

        total += row?.mileage || 0;
    }
    return total;
}

app.get('/team-history', async (req, res) => {
    const weekNums = Object.keys(weekRanges).map(Number).sort((a, b) => a - b);
    const today = new Date();

    let team1Points = 0;
    let team2Points = 0;

    // const history = weekNums.map(weekNum => {
    const history = await Promise.all(weekNums.map(async weekNum => {
        const team1Total = await getTeamTotal(team1, weekNum);
        const team2Total = await getTeamTotal(team2, weekNum);

        // Only count points if the week has ended
        const weekEnd = new Date(weekRanges[weekNum].end);
        let winner = null;
        if (today > weekEnd) {
            if (team1Total > team2Total) {
                team1Points += 1;
                winner = 1;
            } else if (team2Total > team1Total) {
                team2Points += 1;
                winner = 2;
            } else if (team1Total === team2Total ) {
                winner = 0; // tie, no points
            }
        }

        return {
            weekNum,
            team1: team1Total,
            team2: team2Total,
            winner
        };
    }));

    res.json({
        history,
        team1Points,
        team2Points
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

