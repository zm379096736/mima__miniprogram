const test = require('node:test');
const assert = require('node:assert/strict');

const { applyAvatarTempUrls } = require('../cloudfunctions/api/avatarUrls');
const { withAvatarSrc } = require('../utils/cloudStore');

test('cloud avatar urls are mapped to every matching player', () => {
  const players = [
    { id: 'p1', avatarUrl: 'cloud://env/avatars/a.jpg' },
    { id: 'p2', avatarUrl: 'cloud://env/avatars/b.jpg' },
    { id: 'p3', avatarUrl: '' }
  ];
  const fileList = [
    { fileID: 'cloud://env/avatars/a.jpg', tempFileURL: 'https://temp/a.jpg' },
    { fileID: 'cloud://env/avatars/b.jpg', tempFileURL: 'https://temp/b.jpg' }
  ];

  assert.deepEqual(applyAvatarTempUrls(players, fileList), [
    { id: 'p1', avatarUrl: 'cloud://env/avatars/a.jpg', avatarSrc: 'https://temp/a.jpg' },
    { id: 'p2', avatarUrl: 'cloud://env/avatars/b.jpg', avatarSrc: 'https://temp/b.jpg' },
    { id: 'p3', avatarUrl: '', avatarSrc: '' }
  ]);
});

test('client preserves avatar url resolved by cloud function', async () => {
  const player = {
    id: 'p1',
    avatarUrl: 'cloud://env/avatars/a.jpg',
    avatarSrc: 'https://temp/a.jpg'
  };

  assert.deepEqual(await withAvatarSrc(player), player);
});
