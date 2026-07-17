const LEAGUES = Object.freeze([
  Object.freeze({ id: '20040', name: '秘马内战' }),
  Object.freeze({ id: '19608', name: '斐济杯' })
]);

const FIJI_SEED_MATCH_IDS = Object.freeze(['8900989622']);
const DISCOVERY_SOURCES = new Set(['opendota', 'valve', 'seed']);

function leagueById(value) {
  const id = String(value || '');
  return LEAGUES.find((league) => league.id === id) || null;
}

function normalizeLeagueMetadata(metadata = {}) {
  const league = leagueById(metadata.leagueId || LEAGUES[0].id);
  if (!league) throw new Error('Unsupported league ID');
  const discoverySource = DISCOVERY_SOURCES.has(metadata.discoverySource)
    ? metadata.discoverySource
    : 'opendota';
  return {
    leagueId: league.id,
    leagueName: league.name,
    discoverySource
  };
}

module.exports = {
  LEAGUES,
  FIJI_SEED_MATCH_IDS,
  leagueById,
  normalizeLeagueMetadata
};
