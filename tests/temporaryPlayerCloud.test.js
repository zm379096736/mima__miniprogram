const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8');

test('cloud exposes administrator-only temporary player creation', () => {
  const start = source.indexOf('async function adminCreateTemporaryPlayer');
  const end = source.indexOf('async function', start + 20);
  const block = source.slice(start, end);

  assert.ok(start >= 0);
  assert.match(block, /assertAdmin/);
  assert.match(block, /buildTemporaryPlayer/);
  assert.match(source, /action === 'adminCreateTemporaryPlayer'/);
});

test('current player lookup supports claimed temporary card ids', () => {
  const start = source.indexOf('async function ensureCurrentPlayer');
  const end = source.indexOf('async function ensureRoom');
  const block = source.slice(start, end);

  assert.match(block, /where\(\{ openid \}\)/);
  assert.match(source, /findClaimableTemporaryPlayer/);
  assert.match(source, /temporary: false/);
});
