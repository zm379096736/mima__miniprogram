const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

test('profile avatar image is inside the chooseAvatar button', () => {
  const view = fs.readFileSync(path.join(__dirname, '../pages/profile/profile.wxml'), 'utf8');
  const buttonStart = view.indexOf('<button class="avatar-choose-btn"');
  const buttonEnd = view.indexOf('</button>', buttonStart);
  const button = view.slice(buttonStart, buttonEnd);

  assert.ok(buttonStart >= 0);
  assert.match(button, /open-type="chooseAvatar"/);
  assert.match(button, /bindchooseavatar="onChooseAvatar"/);
  assert.match(button, /<image class="avatar-preview"/);
});

test('avatar handler validates the returned temporary path', () => {
  const page = fs.readFileSync(path.join(__dirname, '../pages/profile/profile.js'), 'utf8');

  assert.match(page, /const tempAvatarUrl = event\.detail && event\.detail\.avatarUrl/);
  assert.match(page, /if \(!tempAvatarUrl\)/);
});

test('avatar picker handles WeChat privacy authorization before chooseAvatar', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../app.json'), 'utf8'));
  const view = fs.readFileSync(path.join(__dirname, '../pages/profile/profile.wxml'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, '../pages/profile/profile.js'), 'utf8');

  assert.equal(appConfig.__usePrivacyCheck__, true);
  assert.match(view, /open-type="agreePrivacyAuthorization"/);
  assert.match(view, /bindagreeprivacyauthorization="onAgreePrivacyAuthorization"/);
  assert.match(view, /wx:if="\{\{needPrivacyAuthorization\}\}"/);
  assert.match(page, /wx\.getPrivacySetting/);
  assert.match(page, /needPrivacyAuthorization/);
});
