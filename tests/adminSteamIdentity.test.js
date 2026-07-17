const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8');

test('administrator Steam ID action is protected and forwards merge approvals', () => {
  const start = source.indexOf('async function adminUpdatePlayerSteamIds');
  const end = source.indexOf('async function adminSwapTeams', start);
  const block = source.slice(start, end);
  assert.notEqual(start, -1);
  assert.match(block, /assertAdmin\(openid, '只有管理员可以修改选手 Steam ID'\)/);
  assert.match(block, /playerIdentityService\.updatePlayerSteamIds/);
  assert.match(block, /mergeApprovals/);
  assert.match(source, /action === 'adminUpdatePlayerSteamIds'/);
  assert.match(source, /event\.mergeApprovals \|\| \[\]/);
});
