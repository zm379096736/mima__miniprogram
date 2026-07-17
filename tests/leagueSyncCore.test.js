const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeLeagueMatchIds,
  classifyPreview
} = require('../cloudfunctions/api/leagueSyncCore');

function lineup(overrides = {}) {
  const players = Array.from({ length: 10 }, (_, index) => ({
    accountId: index + 1,
    playerId: `p${index + 1}`,
    matched: true,
    ambiguous: false
  }));
  return {
    radiant: players.slice(0, 5),
    dire: players.slice(5),
    ...overrides
  };
}

test('normalizes valid unique league match IDs newest first', () => {
  assert.deepEqual(normalizeLeagueMatchIds([
    { match_id: 700001 }, { match_id: '700002' }, { match_id: 700001 },
    { match_id: 'bad' }, { match_id: '12345' }, { match_id: '123456789012345678901' }
  ]), ['700002', '700001']);
});

test('orders 20 digit league match IDs without losing numeric precision', () => {
  assert.deepEqual(normalizeLeagueMatchIds([
    { match_id: '9007199254740992' }, { match_id: '9007199254740993' }
  ]), ['9007199254740993', '9007199254740992']);
});

test('classifyPreview requires ten matched unique player cards', () => {
  const preview = lineup();
  preview.dire[4] = { accountId: 10, playerId: '', matched: false, ambiguous: false };

  assert.deepEqual(classifyPreview(preview), {
    status: 'needs_review',
    reason: 'unmatched_players',
    unmatchedAccountIds: [10]
  });
});

test('classifyPreview reports incomplete, ambiguous, and duplicate lineups', () => {
  assert.deepEqual(classifyPreview(lineup({ dire: [] })), {
    status: 'needs_review',
    reason: 'incomplete_lineup',
    unmatchedAccountIds: []
  });

  const ambiguous = lineup();
  ambiguous.radiant[0].ambiguous = true;
  assert.deepEqual(classifyPreview(ambiguous), {
    status: 'needs_review',
    reason: 'ambiguous_steam_id',
    unmatchedAccountIds: []
  });

  const duplicate = lineup();
  duplicate.dire[4].playerId = 'p1';
  assert.deepEqual(classifyPreview(duplicate), {
    status: 'needs_review',
    reason: 'duplicate_players',
    unmatchedAccountIds: []
  });
});

test('classifyPreview marks a complete unambiguous unique lineup ready', () => {
  assert.deepEqual(classifyPreview(lineup()), {
    status: 'ready',
    reason: '',
    unmatchedAccountIds: []
  });
});
