const test = require('node:test');
const assert = require('node:assert/strict');

const clientConfig = require('../utils/config');
const { ADMIN_OPENIDS, isAdminOpenid, assertAdmin } = require('../cloudfunctions/api/adminAuth');
const CURRENT_ADMIN_OPENID = 'oL2oSxIzP83-8EHIoxZiH2nfmQno';

test('cloud and client use the same administrator openids', () => {
  assert.deepEqual(ADMIN_OPENIDS, clientConfig.adminOpenids);
});

test('both configured administrators are recognized', () => {
  clientConfig.adminOpenids.forEach((openid) => {
    assert.equal(isAdminOpenid(openid), true);
  });
});

test('current WeChat account is recognized as administrator', () => {
  assert.equal(isAdminOpenid(CURRENT_ADMIN_OPENID), true);
  assert.equal(clientConfig.adminOpenids.includes(CURRENT_ADMIN_OPENID), true);
});

test('non administrator is rejected before protected writes', () => {
  assert.throws(() => assertAdmin('ordinary-player'), /只有管理员/);
});
