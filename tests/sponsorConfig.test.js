const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeSponsors,
  addSponsor,
  removeSponsor
} = require('../cloudfunctions/api/sponsorConfig');

const first = '\u5c0f\u67ff';
const second = '\u79d8\u9a6c\u4e00\u53f7';

test('normalizes sponsor names while preserving insertion order', () => {
  assert.deepEqual(normalizeSponsors([`  ${first}  `, second, first]), [first, second]);
});

test('rejects empty long duplicate and over-capacity sponsor names', () => {
  assert.throws(() => addSponsor([], '   '), /\u8d5e\u52a9\u5546\u540d\u5b57\u4e0d\u80fd\u4e3a\u7a7a/);
  assert.throws(() => addSponsor([], '\u4e00'.repeat(21)), /\u8d5e\u52a9\u5546\u540d\u5b57\u4e0d\u80fd\u8d85\u8fc7 20 \u4e2a\u5b57/);
  assert.throws(() => addSponsor([first], ` ${first} `), /\u8fd9\u4f4d\u8d5e\u52a9\u5546\u5df2\u7ecf\u5728\u540d\u5355\u4e2d/);
  assert.throws(
    () => addSponsor(Array.from({ length: 50 }, (_, i) => `\u8d5e\u52a9\u5546${i}`), '\u65b0\u8d5e\u52a9\u5546'),
    /\u6700\u591a\u6dfb\u52a0 50 \u4f4d\u8d5e\u52a9\u5546/
  );
});

test('adds and removes one exact normalized sponsor name', () => {
  assert.deepEqual(addSponsor([first], ` ${second} `), [first, second]);
  assert.deepEqual(removeSponsor([first, second], ` ${first} `), [second]);
  assert.throws(() => removeSponsor([first], '\u4e0d\u5b58\u5728'), /\u6ca1\u6709\u627e\u5230\u8fd9\u4f4d\u8d5e\u52a9\u5546/);
});
