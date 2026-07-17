function matchRows(match) {
  return (Array.isArray(match && match.radiant) ? match.radiant : [])
    .concat(Array.isArray(match && match.dire) ? match.dire : []);
}

function needsImportedDetailRepair(match) {
  if (!match || !match.imported || match.detailsRefreshedAt) return false;
  const rows = matchRows(match);
  if (rows.length !== 10) return true;
  const hasMissingProperty = rows.some((row) => !Object.prototype.hasOwnProperty.call(row || {}, 'goldPerMin')
    || !Object.prototype.hasOwnProperty.call(row || {}, 'xpPerMin'));
  const allEconomyValuesAreZero = rows.every((row) => Number(row && row.goldPerMin || 0) <= 0
    && Number(row && row.xpPerMin || 0) <= 0);
  return hasMissingProperty || allEconomyValuesAreZero;
}

function mergeSide(storedRows, freshRows) {
  if (!Array.isArray(storedRows) || !Array.isArray(freshRows)
    || storedRows.length !== 5 || freshRows.length !== 5) {
    throw new Error('Imported match detail repair requires ten player slots');
  }
  return storedRows.map((stored, index) => {
    const fresh = freshRows[index] || {};
    return {
      ...stored,
      accountId: Number(fresh.accountId || stored.accountId || 0),
      playerSlot: Number(fresh.playerSlot || stored.playerSlot || 0),
      heroId: Number(fresh.heroId || 0),
      kills: Number(fresh.kills || 0),
      deaths: Number(fresh.deaths || 0),
      assists: Number(fresh.assists || 0),
      goldPerMin: Number(fresh.goldPerMin || 0),
      xpPerMin: Number(fresh.xpPerMin || 0)
    };
  });
}

function mergeImportedMatchDetails(storedMatch, freshPreview, source) {
  return {
    radiant: mergeSide(storedMatch && storedMatch.radiant, freshPreview && freshPreview.radiant),
    dire: mergeSide(storedMatch && storedMatch.dire, freshPreview && freshPreview.dire),
    duration: Number(freshPreview && freshPreview.duration || storedMatch && storedMatch.duration || 0),
    startTime: Number(freshPreview && freshPreview.startTime || storedMatch && storedMatch.startTime || 0),
    radiantKills: Number(freshPreview && freshPreview.radiantKills || 0),
    direKills: Number(freshPreview && freshPreview.direKills || 0),
    detailSource: String(source || '')
  };
}

module.exports = {
  needsImportedDetailRepair,
  mergeImportedMatchDetails
};
