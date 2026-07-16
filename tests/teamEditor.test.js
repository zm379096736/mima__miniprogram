const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { swapTeamPlayers } = require('../utils/teamEditor');

function sampleTeams() {
  return {
    radiant: {
      totalScore: 170,
      players: [
        { id: 'r1', score: 90, assignedPosition: 1 },
        { id: 'r2', score: 80, assignedPosition: 2 }
      ]
    },
    dire: {
      totalScore: 150,
      players: [
        { id: 'd1', score: 70, assignedPosition: 1 },
        { id: 'd2', score: 80, assignedPosition: 2 }
      ]
    },
    scoreGap: 20
  };
}

test('swapTeamPlayers exchanges players into the opposite slots and recalculates scores', () => {
  const swapped = swapTeamPlayers(sampleTeams(), 'r1', 'd2');

  assert.deepEqual(swapped.radiant.players, [
    { id: 'd2', score: 80, assignedPosition: 1 },
    { id: 'r2', score: 80, assignedPosition: 2 }
  ]);
  assert.deepEqual(swapped.dire.players, [
    { id: 'd1', score: 70, assignedPosition: 1 },
    { id: 'r1', score: 90, assignedPosition: 2 }
  ]);
  assert.equal(swapped.radiant.totalScore, 160);
  assert.equal(swapped.dire.totalScore, 160);
  assert.equal(swapped.scoreGap, 0);
});

test('swapTeamPlayers rejects missing or same-side selections', () => {
  assert.throws(() => swapTeamPlayers(sampleTeams(), '', 'd1'), /各选择一名/);
  assert.throws(() => swapTeamPlayers(sampleTeams(), 'r1', 'r2'), /没有找到/);
});

test('room page exposes administrator-only cross-team swap controls', () => {
  const view = fs.readFileSync(path.join(__dirname, '../pages/room/room.wxml'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, '../pages/room/room.js'), 'utf8');

  assert.match(view, /wx:if="\{\{isAdmin\}\}" class="team-select-btn/);
  assert.match(view, /bindtap="swapSelectedPlayers"/);
  assert.match(page, /adminSwapTeamPlayers/);
});

test('cloud swap action checks administrator permission', () => {
  const source = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8');
  const block = source.slice(
    source.indexOf('async function adminSwapTeams'),
    source.indexOf('async function resetPigeonStatsOnce')
  );

  assert.match(block, /assertAdmin\(openid/);
  assert.match(source, /action === 'adminSwapTeams'/);
});
