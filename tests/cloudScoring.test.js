const test = require('node:test');
const assert = require('node:assert/strict');

const { scoreAfterMatch, scoreAfterRollback } = require('../cloudfunctions/api/matchScoring');

test('cloud scoring gives winners two and losers minus one', () => {
  assert.equal(scoreAfterMatch(80, true), 82);
  assert.equal(scoreAfterMatch(80, false), 79);
});

test('cloud scoring rollback reverses version three match points', () => {
  assert.equal(scoreAfterRollback(82, true, 3), 80);
  assert.equal(scoreAfterRollback(79, false, 3), 80);
});
