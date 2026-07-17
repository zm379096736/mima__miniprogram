const test = require('node:test');
const assert = require('node:assert/strict');

const { heroById, decorateHero } = require('../utils/dotaHeroes');

test('maps Dota hero ids to Chinese names and remote portraits', () => {
  assert.deepEqual(heroById(39), {
    id: 39,
    name: '痛苦女王',
    slug: 'queenofpain',
    imageUrl: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/queenofpain.png'
  });
  assert.equal(heroById(36).name, '瘟疫法师');
});

test('unknown hero ids have a stable display fallback', () => {
  assert.deepEqual(heroById(999), {
    id: 999,
    name: '未知英雄 #999',
    slug: '',
    imageUrl: ''
  });
  assert.deepEqual(decorateHero({ heroId: 999 }), {
    heroId: 999,
    heroName: '未知英雄 #999',
    heroImage: ''
  });
});
