const test = require('node:test');
const assert = require('node:assert/strict');

const { cleanCloudErrorMessage } = require('../utils/cloudStore');

test('cleanCloudErrorMessage turns OpenDota 404 stack into friendly text', () => {
  const message = cleanCloudErrorMessage({
    errMsg: 'cloud.callFunction:fail Error: errCode: -504002 functions execute fail | errMsg: Error: 第三方 API 请求失败 404 at IncomingMessage.<anonymous> (/var/user/index.js:170:18)'
  });
  assert.equal(message, '这场比赛还没有被 OpenDota 收录，请确认比赛 ID，或过几分钟再试。');
});

test('cleanCloudErrorMessage extracts known cloud function business message', () => {
  const message = cleanCloudErrorMessage({
    message: 'cloud.callFunction:fail Error: 这场比赛已经导入过 at confirmImportedMatch (/var/user/index.js:464:11)'
  });
  assert.equal(message, '这场比赛已经导入过');
});
