const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

test('upload package excludes local league artwork', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../project.config.json'), 'utf8'));
  const ignored = config.packOptions && Array.isArray(config.packOptions.ignore)
    ? config.packOptions.ignore
    : [];

  assert.ok(ignored.some((entry) => entry.type === 'folder' && entry.value === 'assets'));
});
