function buildSponsorMarquee(sponsors) {
  const names = (Array.isArray(sponsors) ? sponsors : [])
    .map((name) => String(name || '').trim())
    .filter(Boolean);
  if (!names.length) return { hasSponsors: false, laneA: [], laneB: [] };

  const count = Math.ceil(10 / names.length) * names.length;
  const laneANames = Array.from({ length: count }, (_, index) => names[index % names.length]);
  let offset = Math.ceil(laneANames.length / 2);
  if (names.length > 1 && offset % names.length === 0) offset += 1;
  const laneBNames = laneANames.slice(offset).concat(laneANames.slice(0, offset));
  const toLaneItems = (items, lane) => items.map((name, index) => ({
    id: `${lane}-${index}`,
    name
  }));

  return {
    hasSponsors: true,
    laneA: toLaneItems(laneANames, 'lane-a'),
    laneB: toLaneItems(laneBNames, 'lane-b')
  };
}

module.exports = { buildSponsorMarquee };
