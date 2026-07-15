const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('mini program pages expose no voting controls or voting copy', () => {
  const pageMarkup = fs.readdirSync(path.join(__dirname, '../pages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => read(`pages/${entry.name}/${entry.name}.wxml`))
    .join('\n');

  assert.doesNotMatch(pageMarkup, /投票|投给/);
  assert.doesNotMatch(read('pages/match/match.wxml'), /voteMvp|voteTouch|mvpText|touchText/);
  assert.doesNotMatch(read('pages/home/home.wxml'), /今日 MVP|今日大触/);
});

test('match and home pages no longer load voting behavior', () => {
  const matchPage = read('pages/match/match.js');
  const homePage = read('pages/home/home.js');

  assert.doesNotMatch(matchPage, /voteTodayHonor|voteHonor|voteMvp|voteTouch/);
  assert.doesNotMatch(homePage, /normalizeHonors|mvpText|touchText/);
});

test('cloud rejects voting calls from older mini program versions', () => {
  const source = read('cloudfunctions/api/index.js');
  const actionBlock = source.slice(source.indexOf("if (action === 'voteHonor')"));

  assert.match(actionBlock, /throw new Error\('投票功能暂未开放'\)/);
});
