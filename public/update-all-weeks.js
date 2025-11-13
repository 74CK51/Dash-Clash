const path = require('path');

const stravaPath = path.resolve(__dirname, '../api', 'strava');
const { updateAllUsersWeeklyMileage, updateUserWeeklyMileage, userMap, weekRanges } = require(stravaPath); // adjust path as needed

function getCurrentWeekIndex() {
  const today = new Date();
  const weekNums = Object.keys(weekRanges).map(Number).sort((a, b) => a - b);

  for (let weekNum of weekNums) {
    const { start, end } = weekRanges[weekNum];
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (today >= startDate && today <= endDate) {
      return weekNum;
    }
  }
  // If before all weeks
  const firstWeekStart = new Date(weekRanges[weekNums[0]].start);
  if (today < firstWeekStart) return "before";
  // If after all weeks
  const lastWeekNum = weekNums[weekNums.length - 1];
  const lastWeekEnd = new Date(weekRanges[lastWeekNum].end);
  if (today > lastWeekEnd) return "after";
  return null;
}

// Go through all weeks starting from first week and update all users' weekly mileage
// until we reach a week that is in the future (beyond today).
async function updateAllUsersUpToToday() {
  const weekNums = Object.keys(weekRanges).map(Number).sort((a, b) => a - b);

  for (let weekNum of weekNums) {
    const { start } = weekRanges[weekNum];
    const today = new Date();
    if (new Date(start) > today) {
      console.log(`🛑 Stopped at week ${weekNum} (future week detected).`);
      break;
    }

    console.log(`📆 Updating week ${weekNum}...`);
    try {
      await updateAllUsersWeeklyMileage(weekNum);
    } catch (err) {
      console.error(`❌ Errors occurred while updating week ${weekNum}:`, err.message || err);
      // Continue to next week unless you want to break here on error
    }
  }

  console.log("✅ All valid weeks up to today have been updated.");
}

async function updateUserUpToToday(userId) {
  console.log(`🔄 Updating all weeks for userId: ${userId} (${userMap[userId]})`);
  const weekNums = Object.keys(weekRanges).map(Number).sort((a, b) => a - b);

  for (let weekNum of weekNums) {
    const { start } = weekRanges[weekNum];
    const today = new Date();
    if (new Date(start) > today) {
      console.log(`🛑 Stopped at week ${weekNum} (future week detected).`);
      break;
    }

    console.log(`📆 Updating week ${weekNum}...`);
    try {
      await updateUserWeeklyMileage(userId, weekNum);
    } catch (err) {
      console.error(`❌ Errors occurred while updating week ${weekNum}:`, err.message || err);
      // Continue to next week unless you want to break here on error
    }
  }

  console.log("✅ All valid weeks up to today have been updated.");
}

async function updateUserThisWeek(userId) {
    // Get the current week number
    const today = new Date();
    const weekNums = Object.keys(weekRanges).map(Number).sort((a, b) => a - b);

    let currentWeekNum = null;
    for (let weekNum of weekNums) {
        const { start, end } = weekRanges[weekNum];
        const startDate = new Date(start);
        const endDate = new Date(end);
        if (today >= startDate && today <= endDate) {
            currentWeekNum = weekNum;
            break;
        }
    }

    if (!currentWeekNum) {
        console.log('No current week found for today.');
        return false;
    }

    console.log(`Updating user ${userMap[userId]} (${userId}) for week ${currentWeekNum}`);
    return await updateUserWeeklyMileage(userId, currentWeekNum);
}

async function updateAllUsersThisWeek() {
    const today = new Date();
    const weekNums = Object.keys(weekRanges).map(Number).sort((a, b) => a - b);

    let currentWeekNum = null;
    for (let weekNum of weekNums) {
        const { start, end } = weekRanges[weekNum];
        const startDate = new Date(start);
        const endDate = new Date(end);
        if (today >= startDate && today <= endDate) {
            currentWeekNum = weekNum;
            break;
        }
    }

    if (!currentWeekNum) {
        console.log('No current week found for today.');
        return false;
    }

    console.log(`Updating all users for week ${currentWeekNum}`);
    return await updateAllUsersWeeklyMileage(currentWeekNum);
}


module.exports = {
    getCurrentWeekIndex,
    updateAllUsersUpToToday,
    updateUserUpToToday,
    updateUserThisWeek,
    updateAllUsersThisWeek
}

if (require.main === module) {
  updateAllUsersThisWeek()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

