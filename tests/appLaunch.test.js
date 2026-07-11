const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

test('app.js can load and seed storage without syntax errors', () => {
  const storage = new Map();
  let launched = false;

  global.wx = {
    getStorageSync(key) {
      return storage.get(key);
    },
    setStorageSync(key, value) {
      storage.set(key, value);
    },
    cloud: {
      init() {}
    }
  };

  global.App = (definition) => {
    assert.equal(typeof definition.onLaunch, 'function');
    definition.onLaunch();
    launched = true;
  };

  const appPath = path.join(projectRoot, 'app.js');
  delete require.cache[require.resolve(appPath)];
  require(appPath);

  assert.equal(launched, true);
  assert.equal(storage.get('mima_players').length, 0);
  assert.equal(storage.get('mima_room').signups.length, 0);

  delete global.wx;
  delete global.App;
});
