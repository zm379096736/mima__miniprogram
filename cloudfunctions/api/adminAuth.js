const ADMIN_OPENIDS = [
  'ouIhh3OLQF1kavr5Y75T8x9QzMJk',
  'o6zAJszkWm_0D63PwmVC2hCZw_Yc'
];

function isAdminOpenid(openid) {
  return ADMIN_OPENIDS.includes(String(openid || ''));
}

function assertAdmin(openid, message = '只有管理员可以操作') {
  if (!isAdminOpenid(openid)) {
    throw new Error(message);
  }
}

module.exports = {
  ADMIN_OPENIDS,
  isAdminOpenid,
  assertAdmin
};
