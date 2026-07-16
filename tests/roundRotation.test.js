const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { selectNextRound } = require('../utils/roundRotation');

function ids(prefix, count, start = 1) {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + start}`);
}

test('next round prioritizes benched players and randomly fills remaining slots', () => {
  const current = ids('p', 10);
  const waiting = ['p11', 'p12', 'p13'];
  const result = selectNextRound({
    registeredIds: current.concat(waiting),
    currentRosterIds: current,
    rotationQueue: waiting,
    random: () => 0
  });

  assert.deepEqual(result.rosterIds.slice(0, 3), waiting);
  assert.equal(result.rosterIds.length, 10);
  assert.equal(new Set(result.rosterIds).size, 10);
  assert.equal(result.nextQueue.length, 3);
  result.nextQueue.forEach((playerId) => assert.ok(current.includes(playerId)));
});

test('waiting queue over ten keeps overflow players first for the following round', () => {
  const current = ids('p', 10);
  const waiting = ids('p', 12, 11);
  const result = selectNextRound({
    registeredIds: current.concat(waiting),
    currentRosterIds: current,
    rotationQueue: waiting,
    random: () => 0.5
  });

  assert.deepEqual(result.rosterIds, waiting.slice(0, 10));
  assert.deepEqual(result.nextQueue.slice(0, 2), waiting.slice(10));
  assert.equal(result.nextQueue.length, 12);
});

test('third round prioritizes everyone who missed the second round', () => {
  const registered = ids('p', 13);
  const roundOne = ids('p', 10);
  const roundTwo = selectNextRound({
    registeredIds: registered,
    currentRosterIds: roundOne,
    rotationQueue: ['p11', 'p12', 'p13'],
    random: () => 0
  });
  const roundThree = selectNextRound({
    registeredIds: registered,
    currentRosterIds: roundTwo.rosterIds,
    rotationQueue: roundTwo.nextQueue,
    random: () => 0
  });

  assert.deepEqual(roundThree.rosterIds.slice(0, roundTwo.nextQueue.length), roundTwo.nextQueue);
});

test('room page and cloud expose administrator-only next round action', () => {
  const view = fs.readFileSync(path.join(__dirname, '../pages/room/room.wxml'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, '../pages/room/room.js'), 'utf8');
  const cloud = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8');
  const block = cloud.slice(
    cloud.indexOf('async function adminAdvanceRound'),
    cloud.indexOf('async function resetPigeonStatsOnce')
  );

  assert.match(view, /bindtap="generateNextRound"/);
  assert.match(page, /adminSaveNextRound/);
  assert.match(block, /assertAdmin\(openid/);
  assert.match(cloud, /action === 'adminAdvanceRound'/);
});
