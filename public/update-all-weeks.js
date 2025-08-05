const path = require('path');

const stravaPath = path.resolve(__dirname, '../api', 'strava');
const { updateUserWeeklyMileage, userMap, weekRanges } = require(stravaPath); // adjust path as needed

// async function getCurrentWeekIndex() {
//   const today = new Date();

//   for (let weekNum = 0; weekNum <= Object.keys(weekRanges).length - 1; weekNum++) {
//     const { start, end } = weekRanges[weekNum];
//     const startDate = new Date(start);
//     const endDate = new Date(end);

//     if (today >= startDate && today <= endDate) {
//       return weekNum;
//     }
//   }
//   return null; // No current week found
// }

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
    console.log(`📆 Updating week ${weekNum}...`);
    let shouldContinue = true;
    for (const userId of Object.keys(userMap)) {
      console.log(`↳ ${userMap[userId]} (userId: ${userId})`);
      const result = await updateUserWeeklyMileage(userId, weekNum);
      if (result === false) {
        shouldContinue = false;
        break;
      }
    }
    if (!shouldContinue) {
      console.log(`🛑 Stopped at week ${weekNum} (future week detected).`);
      break;
    }
  }

  console.log("✅ All valid weeks up to today have been updated.");
}

module.exports = {
    getCurrentWeekIndex,
    updateAllUsersUpToToday
}

// updateAllUsersUpToToday();

