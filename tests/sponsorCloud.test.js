const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSponsors } = require('../cloudfunctions/api/sponsorConfig');

const source = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8');

test('bootstrap returns normalized shared sponsors', () => {
  assert.match(source, /require\('\.\/sponsorConfig'\)/);
  assert.match(source, /const sponsorConfig = await getSponsorConfig\(\)/);
  assert.match(source, /sponsors: sponsorConfig\.sponsors/);
});

test('sponsor writes require administrator permission', () => {
  const start = source.indexOf('async function adminAddSponsor');
  const end = source.indexOf('async function bootstrap');
  const block = source.slice(start, end);
  const authorization = block.indexOf('assertAdmin(openid');
  const transaction = block.indexOf('db.runTransaction');
  assert.ok(authorization >= 0);
  assert.ok(transaction >= 0);
  assert.ok(authorization < transaction);
  assert.match(block, /addSponsor/);
  assert.match(block, /removeSponsor/);
  assert.match(block, /db\.runTransaction\(async \(transaction\) =>/);
  assert.match(block, /const sponsorRef = transaction\.collection\('system'\)\.doc\(SPONSOR_CONFIG_ID\)/);
  assert.match(block, /await readSponsorConfig\(sponsorRef\)/);
  assert.match(block, /await sponsorRef\.(?:set|update)\(/);
  assert.match(source, /action === 'adminAddSponsor'/);
  assert.match(source, /action === 'adminDeleteSponsor'/);
});

test('normalizes a missing sponsor configuration to an empty list', () => {
  assert.deepEqual(normalizeSponsors(undefined), []);
});
