const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('room page only exposes start time picker to administrators', () => {
  const view = read('pages/room/room.wxml');
  const page = read('pages/room/room.js');

  assert.match(view, /<picker wx:if="\{\{isAdmin\}\}" mode="time"/);
  assert.match(view, /wx:else class="time-picker read-only"/);
  assert.match(page, /if \(!this\.data\.isAdmin\)[\s\S]*只有管理员可以修改开 C 时间/);
  assert.match(page, /updateTodayRoomStartTime/);
});

test('administrator panel can select any player and save self rating', () => {
  const view = read('pages/room/room.wxml');
  const page = read('pages/room/room.js');

  assert.match(view, /class="admin-score-editor"/);
  assert.match(view, /bindchange="onAdminPlayerChange"/);
  assert.match(view, /bindtap="saveAdminPlayerScore"/);
  assert.match(page, /adminUpdatePlayerScore/);
  assert.match(view, /class="admin-steam-editor"/);
  assert.match(view, /bindinput="onAdminSteamIdsInput"/);
  assert.match(view, /bindtap="saveAdminPlayerSteamIds"/);
  assert.match(page, /adminUpdatePlayerSteamIds/);
  assert.match(page, /buildTemporaryMergeMessage/);
});

test('cloud protects start time and player score updates with administrator checks', () => {
  const source = read('cloudfunctions/api/index.js');
  const timeBlock = source.slice(
    source.indexOf('async function updateStartTime'),
    source.indexOf('async function updatePlayerScore')
  );
  const scoreBlock = source.slice(
    source.indexOf('async function updatePlayerScore'),
    source.indexOf('async function resetPigeonStatsOnce')
  );
  const roomBlock = source.slice(
    source.indexOf('async function updateRoom'),
    source.indexOf('async function updateStartTime')
  );

  assert.match(timeBlock, /assertAdmin\(openid/);
  assert.match(scoreBlock, /assertAdmin\(openid/);
  assert.match(roomBlock, /allowStartTimeChange \? room\.startTime : existed\.startTime/);
  assert.match(source, /action === 'updateStartTime'/);
  assert.match(source, /action === 'updatePlayerScore'/);
});
