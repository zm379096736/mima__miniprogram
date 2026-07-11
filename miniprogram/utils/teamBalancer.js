const POSITIONS = [1, 2, 3, 4, 5];

function sumScore(players) {
  return players.reduce((total, player) => total + Number(player.score || 0), 0);
}

function positionCost(player, position) {
  const preferences = player.preferredPositions || [];
  const index = preferences.indexOf(position);
  if (index === 0) {
    return 0;
  }
  if (index > 0) {
    return 2 + index;
  }
  return 12;
}

function permutations(items) {
  if (items.length <= 1) {
    return [items];
  }
  const result = [];
  items.forEach((item, index) => {
    const rest = items.slice(0, index).concat(items.slice(index + 1));
    permutations(rest).forEach((tail) => result.push([item].concat(tail)));
  });
  return result;
}

function assignPositions(players) {
  let best = null;
  permutations(POSITIONS).forEach((positions) => {
    const assigned = players.map((player, index) => ({
      ...player,
      assignedPosition: positions[index]
    }));
    const cost = assigned.reduce((total, player) => total + positionCost(player, player.assignedPosition), 0);
    if (!best || cost < best.cost) {
      best = { cost, players: assigned };
    }
  });
  return best;
}

function combinations(items, size, start = 0, picked = [], output = []) {
  if (picked.length === size) {
    output.push(picked);
    return output;
  }
  for (let index = start; index < items.length; index += 1) {
    combinations(items, size, index + 1, picked.concat(items[index]), output);
  }
  return output;
}

function buildBalancedTeams(signups) {
  if (!Array.isArray(signups) || signups.length !== 10) {
    throw new Error('自动分队需要正好 10 位选手');
  }

  let best = null;
  const allIds = new Set(signups.map((player) => player.id));

  combinations(signups, 5).forEach((radiantRaw) => {
    const radiantIds = new Set(radiantRaw.map((player) => player.id));
    const direRaw = signups.filter((player) => allIds.has(player.id) && !radiantIds.has(player.id));
    const radiant = assignPositions(radiantRaw);
    const dire = assignPositions(direRaw);
    const radiantScore = sumScore(radiant.players);
    const direScore = sumScore(dire.players);
    const scoreGap = Math.abs(radiantScore - direScore);
    const totalCost = scoreGap * 3 + radiant.cost + dire.cost;

    if (!best || totalCost < best.totalCost) {
      best = {
        totalCost,
        scoreGap,
        radiant: {
          name: '天辉',
          totalScore: radiantScore,
          players: radiant.players.sort((a, b) => a.assignedPosition - b.assignedPosition)
        },
        dire: {
          name: '夜魇',
          totalScore: direScore,
          players: dire.players.sort((a, b) => a.assignedPosition - b.assignedPosition)
        }
      };
    }
  });

  return {
    radiant: best.radiant,
    dire: best.dire,
    scoreGap: best.scoreGap
  };
}

function applyMatchResult(players, result) {
  const winnerIds = new Set(result.winnerIds || []);
  const lateIds = new Set(result.lateIds || []);
  const pigeonIds = new Set(result.pigeonIds || []);
  const pressureIds = new Set(result.pressureIds || []);

  return players.map((player) => {
    const next = { ...player };
    next.matches = Number(next.matches || 0) + 1;
    if (winnerIds.has(next.id)) {
      next.wins = Number(next.wins || 0) + 1;
      next.score = Number(next.score || 0) + 2;
    }
    if (result.mvpId === next.id) {
      next.mvp = Number(next.mvp || 0) + 1;
      next.score = Number(next.score || 0) + 2;
    }
    if (lateIds.has(next.id)) {
      next.score = Number(next.score || 0) - 1;
    }
    if (pigeonIds.has(next.id)) {
      next.pigeon = Number(next.pigeon || 0) + 1;
      next.score = Number(next.score || 0) - 3;
    }
    if (pressureIds.has(next.id)) {
      next.pressure = Number(next.pressure || 0) + 1;
      next.score = Number(next.score || 0) - 2;
    }
    return next;
  });
}

module.exports = {
  buildBalancedTeams,
  applyMatchResult,
  sumScore
};
