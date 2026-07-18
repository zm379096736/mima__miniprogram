const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('cloud store exposes sponsor administration wrappers', () => {
  const source = read('utils/cloudStore.js');
  assert.match(source, /async function adminAddSponsor\(name\)/);
  assert.match(source, /callApi\('adminAddSponsor', \{ name \}\)/);
  assert.match(source, /async function adminDeleteSponsor\(name\)/);
  assert.match(source, /callApi\('adminDeleteSponsor', \{ name \}\)/);
});

test('administrator panel adds and confirms deletion of sponsor names', () => {
  const page = read('pages/room/room.js');
  const view = read('pages/room/room.wxml');
  assert.match(view, /wx:if="\{\{isAdmin\}\}"[\s\S]*\u8d5e\u52a9\u5546\u7ba1\u7406/);
  assert.match(view, /bindinput="onSponsorNameInput"/);
  assert.match(view, /bindtap="addSponsor"/);
  assert.match(view, /bindtap="deleteSponsor"/);
  assert.match(page, /wx\.showModal\([\s\S]*\u5220\u9664\u8d5e\u52a9\u5546/);
  assert.match(page, /sponsors: data\.sponsors \|\| \[\]/);
});
