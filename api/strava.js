const path = require('path');

require('dotenv').config({ 
    path: path.join(__dirname, '../.env')
});

const Database = require('better-sqlite3');

const dbTokensPath = path.join(__dirname, '../tokens.db');
const db = new Database(dbTokensPath);

const axios = require('axios');

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
  "105307293": "Greg"
};

// 2. Week label to date range mapping
const weekRanges = {
    0:  { start: "2024-10-06T23:59", end: "2024-10-14T00:00" },
    1:  { start: "2024-10-13T23:59", end: "2024-10-21T00:00" },
    2:  { start: "2024-10-20T23:59", end: "2024-10-28T00:00" },
    3:  { start: "2024-10-27T23:59", end: "2024-11-04T00:00" },
    4:  { start: "2024-11-03T23:59", end: "2024-11-11T00:00" },
    5:  { start: "2024-11-10T23:59", end: "2024-11-18T00:00"},
    6:  { start: "2025-06-01T23:59", end: "2025-06-09T00:00" }
    // 1:  { start: "2025-07-27T23:59", end: "2025-08-04T00:00" },
    // 2:  { start: "2025-08-03T23:59", end: "2025-08-11T00:00" },
    // 3:  { start: "2025-08-10T23:59", end: "2025-08-18T00:00" },
    // 4:  { start: "2025-08-17T23:59", end: "2025-08-25T00:00" },
    // 5:  { start: "2025-08-24T23:59", end: "2025-09-01T00:00" },
    // 6:  { start: "2025-08-31T23:59", end: "2025-09-08T00:00" },
    // 7:  { start: "2025-09-07T23:59", end: "2025-09-15T00:00" },
    // 8:  { start: "2025-09-14T23:59", end: "2025-09-22T00:00" },
    // 9:  { start: "2025-09-21T23:59", end: "2025-09-29T00:00" },
    // 10: { start: "2025-09-28T23:59", end: "2025-10-06T00:00" },
    // 11: { start: "2025-10-05T23:59", end: "2025-10-13T00:00" },
    // 12: { start: "2025-10-12T23:59", end: "2025-10-20T00:00" },
    // 13: { start: "2025-10-19T23:59", end: "2025-10-27T00:00" },
    // 14: { start: "2025-10-26T23:59", end: "2025-11-03T00:00" },
    // 15: { start: "2025-11-02T23:59", end: "2025-11-10T00:00" },
    // 16: { start: "2025-11-09T23:59", end: "2025-11-17T00:00" },
    // 17: { start: "2025-11-16T23:59", end: "2025-11-24T00:00" }
};


async function refreshToken(userId) {
  const token = db.prepare('SELECT userId, access_token, refresh_token, expires_at FROM tokens WHERE userId = ?').get(userId);
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

        db.prepare(`
            INSERT OR REPLACE INTO tokens (userId, access_token, refresh_token, expires_at)
            VALUES (?, ?, ?, ?)
        `).run(
            userId,
            response.data.access_token,
            response.data.refresh_token,
            response.data.expires_at
        );

        console.log('Token was refreshed');
        return true;
    } catch (err) {
        db.prepare('DELETE FROM tokens WHERE userId = ?').run(userId);
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
    const token = db.prepare('SELECT userId, access_token, refresh_token, expires_at FROM tokens WHERE userId = ?').get(userId);
    if (!token) return;

    const dbLeaderboardsPath = path.join(__dirname, '../leaderboards.db');
    const leaderboards_db = new Database(dbLeaderboardsPath);

    // Create table if not exists
    leaderboards_db.prepare(`
    CREATE TABLE IF NOT EXISTS leaderboards (
        userId TEXT NOT NULL,
        weekNum INTEGER NOT NULL,
        mileage REAL NOT NULL,
        movingTime REAL,
        numRuns INTEGER,
        PRIMARY KEY (userId, weekNum)
    )
    `).run();

    let { start, end } = weekRanges[weekNum];

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD

    // Check if start is in the future
    if (new Date(start) > today) {
        console.log('Start date is in the future. Stopping.');
        return false;
    }

    // If end is in the future, set it to today
    if (new Date(end) > today) {
        end = todayStr;
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

            leaderboards_db.prepare(`
                INSERT INTO leaderboards (userId, weekNum, mileage, movingTime, numRuns)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(userId, weekNum) DO UPDATE SET mileage = excluded.mileage, movingTime = excluded.movingTime, numRuns = excluded.numRuns;
            `).run(userId, weekNum, totalMilesRounded, totalMovingTime, numRuns);

            break;

        } catch (err) {
            attempts++;
            console.error('Error fetching activities', err.response?.data || err);

            if (attempts == 3) {
                leaderboards_db.prepare(`
                    DELETE FROM leaderboards WHERE userId = ?
                `).run(userId); 
                
                console.error(`All 3 attempts failed. Deleted leaderboard entries for userId: ${userId}`);
                break;
            }
            
            // Delay before retry
            await new Promise(resolve => setTimeout(resolve, 500 * attempts));
        }
    }
}

async function updateAllUsersWeeklyMileage(weekNum) {
    for (const userId of Object.keys(userMap)) {
        await updateUserWeeklyMileage(userId, weekNum);
    }
}

module.exports = {
    userMap,
    weekRanges,
    updateUserWeeklyMileage
};

