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
  "84566629": "Aaron" // Aaron is on team 2 for weeks 0-8, then Amy replaces him from week 9 due to injury
};

const amyId = "37178340";
const aaronId = "84566629";

function getTeam2ForWeek(weekNum) {
  const team2 = { ...team2Base };

  if (weekNum >= 9) {
    delete team2[aaronId];
    team2[amyId] = "Amy";
  }

  return team2;
}

module.exports = { team1, getTeam2ForWeek };