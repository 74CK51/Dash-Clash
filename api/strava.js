const path = require('path');

require('dotenv').config({ 
    path: path.join(__dirname, '../.env')
});

// const Database = require('better-sqlite3');

// const dbTokensPath = path.join(__dirname, '../tokens.db');
// const db = new Database(dbTokensPath);

const axios = require('axios');

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 1. Name to Strava ID mapping
const userMap = {
  "83165490": "Jack",
  "113189520": "Noor",
  "84566629": "Aaron",
  "66978872": "Anna",
  "162093542": "Jasmine",
  "119756195": "Ricardo",
  "152828762": "Sommer",
  "31772969": "Carly",
  "165773731": "Hayley",
  "118539458": "Mady"
};

// 2. Week label to date range mapping
const weekRanges = {
    1:  { start: "2025-08-03T23:59", end: "2025-08-11T00:00" },
    2:  { start: "2025-08-10T23:59", end: "2025-08-18T00:00" },
    3:  { start: "2025-08-17T23:59", end: "2025-08-25T00:00" },
    4:  { start: "2025-08-24T23:59", end: "2025-09-01T00:00" },
    5:  { start: "2025-08-31T23:59", end: "2025-09-08T00:00" },
    6:  { start: "2025-09-07T23:59", end: "2025-09-15T00:00" },
    7:  { start: "2025-09-14T23:59", end: "2025-09-22T00:00" },
    8:  { start: "2025-09-21T23:59", end: "2025-09-29T00:00" },
    9:  { start: "2025-09-28T23:59", end: "2025-10-06T00:00" },
    10: { start: "2025-10-05T23:59", end: "2025-10-13T00:00" },
    11: { start: "2025-10-12T23:59", end: "2025-10-20T00:00" },
    12: { start: "2025-10-19T23:59", end: "2025-10-27T00:00" },
    13: { start: "2025-10-26T23:59", end: "2025-11-03T00:00" },
    14: { start: "2025-11-02T23:59", end: "2025-11-10T00:00" },
    15: { start: "2025-11-09T23:59", end: "2025-11-17T00:00" },
    16: { start: "2025-11-16T23:59", end: "2025-11-24T00:00" }
};

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

async function refreshToken(userId) {
//   const token = db.prepare('SELECT userId, access_token, refresh_token, expires_at FROM tokens WHERE userId = ?').get(userId);
  const { rows } = await pool.query(
    'SELECT user_id, access_token, refresh_token, expires_at FROM tokens WHERE user_id = $1',
    [userId]
  );
  const token = rows[0];

  if (!token) return false;
  const now = Math.floor(Date.now() / 1000); // current time in seconds

  if (token.expires_at < now) {
    console.log('Token expired, refreshing...');
    // Token is expired
    try {

        const response = await axios.post('https://www.strava.com/oauth/token', {
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: token.refresh_token
        });

        await pool.query(`
            INSERT INTO tokens (user_id, access_token, refresh_token, expires_at)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id) DO UPDATE SET access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token, expires_at = EXCLUDED.expires_at
            `, [userId, response.data.access_token, response.data.refresh_token, response.data.expires_at]);

        console.log('Token was refreshed');
        return true;
    } catch (err) {
      // NOTE: No longer deleting tokens on refresh token failure as failures sometimes occur due to transient issues (rate limits)
      // await pool.query('DELETE FROM tokens WHERE user_id = $1', [userId]);

        console.error('Error refreshing token:', err.response?.data || err);
        return false;
    }
  }
  else {
    console.log('Token is still valid');
    return true;
  }
}

async function updateUserWeeklyMileage(userId, weekNum) {
    await refreshToken(userId);
    const { rows } = await pool.query('SELECT user_id, access_token, refresh_token, expires_at FROM tokens WHERE user_id = $1', [userId]);
    const token = rows[0];

    if (!token) return;

    let { start, end } = weekRanges[weekNum];

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD

    // Check if start is in the future
    if (new Date(start) > today) {
        console.log('Start date is in the future. Stopping.');
        return false;
    }

    const startUnix = Math.floor(new Date(start).getTime() / 1000);
    const endUnix = Math.floor(new Date(end).getTime() / 1000);

    let attempts = 0;
    while (attempts < 3) {
        try {
            const response = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
                headers: {
                    Authorization: `Bearer ${token.access_token}`
                },
                params: {
                    before: endUnix,
                    after: startUnix,
                    per_page: 100
                }
            });

            const activities = response.data;
            const totalMiles = activities
            .filter(activity => activity.type === 'Run')
            .reduce((sum, activity) => sum + activity.distance, 0) / 1609.34;
            const totalMilesRounded = Math.round(totalMiles * 100) / 100;

            const totalMovingTime = activities
            .filter(activity => activity.type === 'Run')
            .reduce((sum, activity) => sum + activity.moving_time, 0); // in seconds

            const numRuns = activities.filter(activity => activity.type === 'Run').length;

            await pool.query(`
                INSERT into leaderboards(user_id, week_num, mileage, moving_time, num_runs)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (user_id, week_num) DO UPDATE SET mileage = EXCLUDED.mileage, moving_time = EXCLUDED.moving_time, num_runs = EXCLUDED.num_runs
            `, [userId, weekNum, totalMilesRounded, totalMovingTime, numRuns]);
            
            console.log(`Week ${weekNum} mileage for ${userMap[userId]} (${userId}): ${totalMilesRounded} miles over ${numRuns} run(s)`);
            break;

        } catch (err) {
            attempts++;
            console.error('Error fetching activities', err.response?.data || err);

            if (attempts == 3) {
              // NOTE: No longer deleting leaderboard entries on retrieval failure as failures sometimes occur due to transient issues (rate limits)
              // await pool.query('DELETE FROM leaderboards WHERE user_id = $1', [userId]);
                
              console.error(`All 3 attempts for activity access failed for userId: ${userId}`);
              return false;
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
    }
    return true;
}

async function updateAllUsersWeeklyMileage(weekNum) {
    const errors = [];
    for (const userId of Object.keys(userMap)) {

        try {
            console.log(`↳ ${userMap[userId]} (userId: ${userId})`);
            await updateUserWeeklyMileage(userId, weekNum);

        } catch (err) {
            errors.push({ userId, error: err });
            console.error(`Failed for user ${userId}:`, err.message || err);
        }
    }
    if (errors.length > 0) {
        throw new Error(`Failed to update ${errors.length} user(s): ` +
            errors.map(e => `${userMap[e.userId]} (${e.userId})`).join(', '));
    }
}

module.exports = {
    userMap,
    weekRanges,
    updateAllUsersWeeklyMileage,
    pool
};

