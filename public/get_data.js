const path = require('path');

require('dotenv').config({ 
    path: path.join(__dirname, '../.env')
});

const axios = require('axios');

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const fs = require('fs');
const stravaPath = path.resolve(__dirname, '../api', 'strava');
const { userMap } = require(stravaPath); // adjust path as needed


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

async function getData(userId, outFile = null) {
    await refreshToken(userId);
    const { rows } = await pool.query('SELECT user_id, access_token, refresh_token, expires_at FROM tokens WHERE user_id = $1', [userId]);
    const token = rows[0];

    if (!token) return;

    let start = "2025-08-04T03:59Z";
    let end =  "2025-11-24T05:00Z"

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

            if (outFile) {
                fs.writeFileSync(outFile, JSON.stringify(activities, null, 2));
                console.log(`Activities for userId: ${userId} written to ${outFile}`);
            } else {
                console.log(JSON.stringify(activities, null, 2));
            }

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

// Add this main function at the end of the file
if (require.main === module) {

    (async () => {
        for (const userId of Object.keys(userMap)) {
            const outPath = path.join(__dirname, '../data', `${userMap[userId]}.json`);
            console.log(userId, outPath)
            await getData(userId, outPath);
        }
        process.exit(0);

    })();
//   const readline = require('readline');

//   const rl = readline.createInterface({
//     input: process.stdin,
//     output: process.stdout
//   });

//   rl.question('Enter userId: ', async (userId) => {
//     await getData(userId.trim());
//     rl.close();
//     process.exit(0);
//   });
}