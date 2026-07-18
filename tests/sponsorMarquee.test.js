const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSponsorMarquee } = require('../utils/sponsorMarquee');

test('empty sponsors disable moving lanes', () => {
  assert.deepEqual(buildSponsorMarquee([]), { hasSponsors: false, laneA: [], laneB: [] });
});

test('builds offset lanes with uniquely keyed sponsor items', () => {
  const one = buildSponsorMarquee(['小柒']);
  assert.equal(one.hasSponsors, true);
  assert.ok(one.laneA.length >= 10);
  assert.deepEqual(new Set(one.laneA.map((item) => item.name)), new Set(['小柒']));
  assert.equal(new Set(one.laneA.map((item) => item.id)).size, one.laneA.length);

  const many = buildSponsorMarquee(['A', 'B', 'C', 'D']);
  assert.deepEqual(many.laneA.slice(0, 4).map((item) => item.name), ['A', 'B', 'C', 'D']);
  assert.deepEqual(many.laneB.slice(0, 4).map((item) => item.name), ['C', 'D', 'A', 'B']);
});

test('repeats short sponsor lists in order and offsets the second lane', () => {
  const marquee = buildSponsorMarquee(['A', 'B', 'C']);
  const laneANames = marquee.laneA.map((item) => item.name);
  const laneBNames = marquee.laneB.map((item) => item.name);

  assert.ok(laneANames.length >= 10);
  assert.deepEqual(laneANames, Array.from(
    { length: laneANames.length },
    (_, index) => ['A', 'B', 'C'][index % 3]
  ));
  assert.equal(new Set(marquee.laneA.map((item) => item.id)).size, marquee.laneA.length);
  assert.equal(new Set(marquee.laneB.map((item) => item.id)).size, marquee.laneB.length);
  assert.deepEqual(laneBNames, laneANames.slice(7).concat(laneANames.slice(0, 7)));
});
