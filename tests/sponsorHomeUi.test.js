const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('home hero renders sponsor thank-you and two CSS marquee lanes', () => {
  const view = read('pages/home/home.wxml');
  const style = read('pages/home/home.wxss');
  const page = read('pages/home/home.js');
  assert.match(view, /感谢每一位秘马赞助商/);
  assert.match(view, /wx:if="\{\{sponsorMarquee\.hasSponsors\}\}"/);
  assert.match(view, /sponsor-lane lane-a/);
  assert.match(view, /sponsor-lane lane-b/);
  assert.equal((view.match(/class="sponsor-group"/g) || []).length, 4);
  assert.equal((view.match(/wx:for="\{\{sponsorMarquee\.lane[AB]\}\}" wx:key="id"/g) || []).length, 4);
  assert.match(view, /\{\{item\.name\}\}/);
  assert.doesNotMatch(view, /wx:key="index"/);
  assert.match(style, /@keyframes sponsor-scroll-forward/);
  assert.match(style, /@keyframes sponsor-scroll-reverse/);
  assert.match(style, /\.sponsor-chip\s*\{[^}]*min-width:\s*96rpx;/s);
  assert.match(style, /\.sponsor-chip\s*\{[^}]*text-align:\s*center;/s);
  assert.doesNotMatch(page, /setInterval|setTimeout/);
});

test('home hero has a static sponsor empty state', () => {
  const view = read('pages/home/home.wxml');
  assert.match(view, /感谢每一位支持秘马内战的朋友/);
});
