const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildTemporaryMergeMessage,
  approvalsFromMerges
} = require('../utils/temporaryMergePrompt');

test('temporary merge prompt names every source and target', () => {
  assert.equal(buildTemporaryMergeMessage([{
    temporaryName: '临时 A', targetName: '正式 B', accountIds: ['12345']
  }]), '临时选手“临时 A”将合并到正式选手“正式 B”（Steam ID 12345）。是否继续？');
});

test('merge approvals contain ids only', () => {
  assert.deepEqual(approvalsFromMerges([{
    temporaryPlayerId: 'temp', temporaryName: '临时',
    targetPlayerId: 'real', targetName: '正式', accountIds: ['12345']
  }]), [{ temporaryPlayerId: 'temp', targetPlayerId: 'real' }]);
});
