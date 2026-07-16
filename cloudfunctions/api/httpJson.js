const http = require('http');
const https = require('https');

const DEFAULT_TIMEOUT_MS = 5000;

function timeoutError() {
  const error = new Error('\u7b2c\u4e09\u65b9 API \u8bf7\u6c42\u8d85\u65f6');
  error.code = 'UPSTREAM_TIMEOUT';
  return error;
}

function networkError() {
  return new Error('\u7b2c\u4e09\u65b9 API \u8bf7\u6c42\u5931\u8d25');
}

function requestJson(url, method = 'GET', timeoutMs = DEFAULT_TIMEOUT_MS, transportOverride) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;

    const settle = (handler, value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      handler(value);
    };

    let transport = transportOverride;
    if (!transport) {
      transport = new URL(url).protocol === 'http:' ? http : https;
    }

    let request;
    try {
      request = transport.request(url, { method }, (response) => {
        let body = '';
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            const error = networkError();
            error.statusCode = response.statusCode;
            settle(reject, error);
            return;
          }
          try {
            settle(resolve, JSON.parse(body));
          } catch (error) {
            settle(reject, new Error('\u7b2c\u4e09\u65b9 API \u8fd4\u56de\u89e3\u6790\u5931\u8d25'));
          }
        });
      });
      request.on('error', (error) => {
        settle(reject, error && error.code === 'UPSTREAM_TIMEOUT' ? error : networkError());
      });
      timer = setTimeout(() => {
        request.destroy(timeoutError());
      }, Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
      request.end();
    } catch (error) {
      settle(reject, networkError());
    }
  });
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  requestJson
};
