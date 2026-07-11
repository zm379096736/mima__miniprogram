const test = require('node:test');
const assert = require('node:assert/strict');

const clientConfig = require('../utils/config');
const { ADMIN_OPENIDS, isAdminOpenid, assertAdmin } = require('../cloudfunctions/api/adminAuth');

test('cloud and client use the same administrator openids', () => {
  assert.deepEqual(ADMIN_OPENIDS, clientConfig.adminOpenids);
});

test('both configured administrators are recognized', () => {
  clientConfig.adminOpenids.forEach((openid) => {
    assert.equal(isAdminOpenid(openid), true);
  });
});

test('non administrator is rejected before protected writes', () => {
  assert.throws(() => assertAdmin('ordinary-player'), /只有管理员/);
});
