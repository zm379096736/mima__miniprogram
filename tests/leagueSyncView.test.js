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
  assert.equal(view.pendingText, '待确认 1 场');
  assert.equal(view.queue[0].reasonText, '有选手尚未关联');
  assert.equal(view.queue[0].statusText, '待管理员确认');
  assert.equal(view.queue[0].matchedText, '已关联 9 / 10');
  assert.equal(view.queue[0].canReview, true);
  assert.equal(view.queue[0].leagueLabel, '斐济杯 · Valve');
  assert.equal(view.queue.length, 1);
});

test('sanitizes state errors without leaking raw upstream details', () => {
  const view = buildLeagueSyncView({
    enabled: false,
    lastError: 'request failed https://api.opendota.com/api/matches/7002?api_key=secret'
  });

  assert.equal(view.statusText, '自动同步已暂停');
  assert.equal(view.errorText.includes('http'), false);
});

test('hides every queue status that does not need administrator confirmation', () => {
  const view = buildLeagueSyncView({
    pendingCount: 1,
    queuePreview: [
      { matchId: '7001', status: 'waiting_data' },
      { matchId: '7002', status: 'ignored_before_start' },
      { matchId: '7003', status: 'failed' },
      { matchId: '7004', status: 'processing' },
      { matchId: '7005', status: 'discovered' },
      { matchId: '7006', status: 'imported' },
      { matchId: '7007', status: 'needs_review', preview: { matchedCount: 8 } }
    ]
  });

  assert.deepEqual(view.queue.map((row) => row.matchId), ['7007']);
  assert.equal(view.queue[0].canReview, true);
});

test('labels automatic, imported, and manual match sources', () => {
  assert.equal(matchSourceText({ source: 'league-auto' }), '联赛自动导入');
  assert.equal(matchSourceText({ source: 'league-auto', leagueName: '斐济杯' }), '斐济杯 · 自动导入');
  assert.equal(matchSourceText({ source: 'manual-import', imported: true }), '比赛 ID 导入');
  assert.equal(matchSourceText({ source: 'manual-entry' }), '管理员手动录入');
});
