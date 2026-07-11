const test = require('node:test');
const assert = require('node:assert/strict');

const seed = require('../utils/seed');

test('local seed starts without test players or fake matches', () => {
  assert.deepEqual(seed.players, []);
  assert.deepEqual(seed.room.signups, []);
  assert.deepEqual(seed.room.waitlist, []);
  assert.deepEqual(seed.matches, []);
});
