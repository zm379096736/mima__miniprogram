const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8'));
}

test('project uses root app.json and root pages', () => {
  const projectConfig = readJson('project.config.json');
  assert.ok(projectConfig.miniprogramRoot === undefined || projectConfig.miniprogramRoot === './');

  const appJson = readJson('app.json');
  assert.ok(appJson.pages.length > 0);
  appJson.pages.forEach((pagePath) => {
    assert.match(pagePath, /^pages\//, `${pagePath} should live under root pages`);
    ['js', 'json', 'wxml', 'wxss'].forEach((extension) => {
      assert.equal(fs.existsSync(path.join(projectRoot, `${pagePath}.${extension}`)), true, `${pagePath}.${extension} should exist`);
    });
  });

  appJson.tabBar.list.forEach((item) => {
    assert.ok(appJson.pages.includes(item.pagePath), `${item.pagePath} should be declared in pages`);
    assert.equal(fs.existsSync(path.join(projectRoot, item.iconPath)), true, `${item.iconPath} should exist`);
    assert.equal(fs.existsSync(path.join(projectRoot, item.selectedIconPath)), true, `${item.selectedIconPath} should exist`);
  });
});

test('all page json files are valid json', () => {
  const appJson = readJson('app.json');
  appJson.pages.forEach((pagePath) => {
    assert.doesNotThrow(() => readJson(`${pagePath}.json`), `${pagePath}.json should parse`);
  });
});
