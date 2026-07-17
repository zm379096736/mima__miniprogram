const test = require('node:test');
const assert = require('node:assert/strict');

const { buildLeagueSyncView, matchSourceText } = require('../utils/leagueSyncView');

test('formats enabled sync state and pending review rows', () => {
  const view = buildLeagueSyncView({
    enabled: true,
    pendingCount: 1,
    lastSuccessAt: '2026-07-17T02:30:00.000Z',
    queuePreview: [
      {
        matchId: '7002',
        leagueId: '19608',
        leagueName: '斐济杯',
        discoverySource: 'valve',
        status: 'needs_review',
        reviewReason: 'unmatched_players',
        preview: { matchedCount: 9 }
      },
      { matchId: '7001', status: 'imported' }
    ]
  });

  assert.equal(view.statusText, '自动同步已开启');
  assert.equal(view.pendingText, '待处理 1 场');
  assert.equal(view.queue[0].reasonText, '有选手尚未关联');
  assert.equal(view.queue[0].statusText, '待管理员确认');
  assert.equal(view.queue[0].matchedText, '已关联 9 / 10');
  assert.equal(view.queue[0].canReview, true);
  assert.equal(view.queue[0].leagueLabel, '斐济杯 · Valve');
  assert.equal(view.queue.length, 1);
});

test('formats retryable failures without leaking raw upstream details', () => {
  const view = buildLeagueSyncView({
    enabled: false,
    lastError: 'request failed https://api.opendota.com/api/matches/7002?api_key=secret',
    queuePreview: [{ matchId: '7002', status: 'failed', error: 'socket at /var/user/index.js:10' }]
  });

  assert.equal(view.statusText, '自动同步已暂停');
  assert.equal(view.errorText.includes('http'), false);
  assert.equal(view.queue[0].canRetry, true);
  assert.equal(view.queue[0].errorText.includes('/var/user'), false);
});

test('labels automatic, imported, and manual match sources', () => {
  assert.equal(matchSourceText({ source: 'league-auto' }), '联赛自动导入');
  assert.equal(matchSourceText({ source: 'league-auto', leagueName: '斐济杯' }), '斐济杯 · 自动导入');
  assert.equal(matchSourceText({ source: 'manual-import', imported: true }), '比赛 ID 导入');
  assert.equal(matchSourceText({ source: 'manual-entry' }), '管理员手动录入');
});
