const team1 = {
  "83165490": "Jack",
  "66978872": "Anna",
  "162093542": "Jasmine",
  "119756195": "Ricardo",
  "152828762": "Sommer",
};

const team2Base = {
  "113189520": "Noor",
  "31772969": "Carly",
  "165773731": "Hayley",
  "118539458": "Mady",
  "84566629": "Aaron", 
  "37178340": "Amy" // Amy joins from week 9 onward; adding to base so she is included in the all time leaderboards
};

// const amyId = "37178340";
// const aaronId = "84566629";

function getTeam2ForWeek(weekNum) {
  const team2 = { ...team2Base };

  if (weekNum < 9) {
    // delete team2[aaronId];
    delete team2[amyId];
  }

  return team2;
}

module.exports = { team1, getTeam2ForWeek };