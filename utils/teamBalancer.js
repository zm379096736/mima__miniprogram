const POSITIONS = [1, 2, 3, 4, 5];

function sumScore(players) {
  return players.reduce((total, player) => total + Number(player.score || 0), 0);
}

function positionCost(player, position) {
  const preferences = player.preferredPositions || [];
  const index = preferences.indexOf(position);
  if (index === 0) return 0;
  if (index > 0) return 2 + index;
  return 12;
}

function permutations(items) {
  if (items.length <= 1) return [items];
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

function getBalanceReadiness(signups) {
  const count = Array.isArray(signups) ? signups.length : 0;
  if (count === 10) {
    return { canBalance: true, message: '' };
  }
  if (count < 10) {
    return {
      canBalance: false,
      message: `还差 ${10 - count} 位选手才能自动分队`
    };
  }
  return {
    canBalance: false,
    message: `当前已有 ${count} 位选手，请保留 10 位后再分队`
  };
}

function buildBalancedTeams(signups) {
  const readiness = getBalanceReadiness(signups);
  if (!readiness.canBalance) {
    throw new Error(readiness.message);
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
          name: '\u5929\u8f89',
          totalScore: radiantScore,
          players: radiant.players.sort((a, b) => a.assignedPosition - b.assignedPosition)
        },
        dire: {
          name: '\u591c\u9b47',
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
  const pigeonIds = new Set(result.pigeonIds || []);
  const pressureIds = new Set(result.pressureIds || []);

  return players.map((player) => {
    const next = { ...player };
    next.matches = Number(next.matches || 0) + 1;
    next.score = Number(next.score || 0) + (winnerIds.has(next.id) ? 2 : -1);
    if (winnerIds.has(next.id)) {
      next.wins = Number(next.wins || 0) + 1;
    }
    if (result.mvpId === next.id) {
      next.mvp = Number(next.mvp || 0) + 1;
    }
    if (pigeonIds.has(next.id)) {
      next.pigeon = Number(next.pigeon || 0) + 1;
    }
    if (pressureIds.has(next.id)) {
      next.pressure = Number(next.pressure || 0) + 1;
    }
    return next;
  });
}

module.exports = {
  buildBalancedTeams,
  applyMatchResult,
  getBalanceReadiness,
  sumScore
};
