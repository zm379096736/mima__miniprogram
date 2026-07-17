const https = require('https');

function requestJson(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: timeoutMs }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`OpenDota league request failed ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error('OpenDota returned invalid league data'));
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error('OpenDota league request timed out')));
    request.on('error', reject);
  });
}

module.exports = { requestJson };
