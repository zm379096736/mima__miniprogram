const { EventEmitter } = require('node:events');
const test = require('node:test');
const assert = require('node:assert/strict');

const { requestJson } = require('../cloudfunctions/api/httpJson');

test('requestJson aborts an upstream request at its own deadline', async () => {
  const transport = {
    request() {
      const request = new EventEmitter();
      request.end = () => {};
      request.destroy = (error) => {
        request.emit('error', error);
      };
      return request;
    }
  };
  const startedAt = Date.now();

  await assert.rejects(
    requestJson('https://example.invalid/match', 'GET', 30, transport),
    (error) => {
      assert.equal(error.code, 'UPSTREAM_TIMEOUT');
      assert.match(error.message, /第三方 API 请求超时/);
      return true;
    }
  );

  assert.ok(Date.now() - startedAt < 250);
});
