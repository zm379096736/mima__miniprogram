function selectedPlayerIds(players) {
  return (players || []).map((player) => String(player && player.playerId || '').trim());
}

function buildSettlement(preview, players, metadata = {}) {
  const radiant = Array.isArray(preview && preview.radiant) ? preview.radiant : [];
  const dire = Array.isArray(preview && preview.dire) ? preview.dire : [];
  const participantIds = selectedPlayerIds(radiant).concat(selectedPlayerIds(dire));
  if (radiant.length !== 5 || dire.length !== 5 || participantIds.length !== 10
    || participantIds.some((id) => !id) || new Set(participantIds).size !== 10) {
    throw new Error('Imported match must contain 10 distinct players');
  }

  const playerById = {};
  (players || []).forEach((player) => {
    playerById[String(player && player.id || '').trim()] = player;
  });
  const winnerSide = preview.radiantWin ? 'radiant' : 'dire';
  const winnerIds = selectedPlayerIds(winnerSide === 'radiant' ? radiant : dire);
  const winnerIdSet = new Set(winnerIds);
  const snapshotRows = (rows) => rows.map((row) => {
    const player = playerById[String(row && row.playerId || '').trim()];
    return {
      ...row,
      name: String(player && player.name || row.name || ''),
      score: Number(player && player.score || 0),
      avatarUrl: String(player && player.avatarUrl || ''),
      temporary: Boolean(player && player.temporary)
    };
  });
  const playerUpdates = participantIds.map((id) => {
    const player = playerById[id];
    if (!player) {
      throw new Error('Imported match contains a player that does not exist');
    }
    const won = winnerIdSet.has(id);
    return {
      _id: player._id,
      id,
      points: Number(player.points || 0) + (won ? 2 : -1),
      matches: Number(player.matches || 0) + 1,
      wins: Number(player.wins || 0) + (won ? 1 : 0)
    };
  });
  const matchId = String(preview.matchId || '').trim();
  const source = String(metadata.source || 'manual-import');
  const leagueId = metadata.leagueId === undefined || metadata.leagueId === null
    ? ''
    : String(metadata.leagueId);
  const match = {
    id: `imported-${matchId}`,
    matchId,
    title: `Dota \u6bd4\u8d5b ${matchId}`,
    winner: preview.winner || (preview.radiantWin ? '\u5929\u8f89' : '\u591c\u9b47'),
    winnerSide,
    mvp: '\u5f85\u6295\u7968',
    scoreGap: Math.abs(Number(preview.radiantKills || 0) - Number(preview.direKills || 0)),
    scoringVersion: 3,
    imported: true,
    source,
    leagueId,
    lineupSource: source === 'league-auto' ? 'league-auto' : 'import-reconciled',
    radiantWin: Boolean(preview.radiantWin),
    duration: Number(preview.duration || 0),
    startTime: Number(preview.startTime || 0),
    radiant: snapshotRows(radiant),
    dire: snapshotRows(dire),
    participantIds,
    winnerIds
  };
  if (metadata.leagueName) match.leagueName = String(metadata.leagueName);
  if (metadata.discoverySource) match.discoverySource = String(metadata.discoverySource);
  return { match, playerUpdates };
}

function documentData(result) {
  return result && result.data ? result.data : null;
}

function isMissingMatchDocumentError(error) {
  const message = String(error && (error.errMsg || error.message || error)).toLowerCase();
  return message.includes('document.get:fail document not exists')
    || message.includes('document_not_exist')
    || message.includes('document not exists');
}

async function readExistingMatch(matchRef) {
  try {
    return documentData(await matchRef.get());
  } catch (error) {
    if (isMissingMatchDocumentError(error)) {
      return null;
    }
    throw error;
  }
}

async function settleImportedMatch(preview, metadata = {}, dependencies = {}) {
  const db = dependencies.db;
  if (!db) {
    throw new Error('Imported match settlement requires a database');
  }
  const players = metadata.players || (await db.collection('players').limit(100).get()).data;
  const settlement = buildSettlement(preview, players, metadata);
  const plannedParticipantIds = Array.isArray(metadata.plannedParticipantIds)
    ? metadata.plannedParticipantIds
    : [];
  const persist = async (writer) => {
    const matchRef = writer.collection('matches').doc(settlement.match.id);
    if (await readExistingMatch(matchRef)) {
      throw new Error('\u8fd9\u573a\u6bd4\u8d5b\u5df2\u7ecf\u5bfc\u5165\u8fc7');
    }

    for (const update of settlement.playerUpdates) {
      const playerRef = writer.collection('players').doc(update._id);
      const player = documentData(await playerRef.get());
      if (!player) {
        throw new Error('Imported match contains a player that does not exist');
      }
      const won = settlement.match.winnerIds.includes(update.id);
      await playerRef.update({
        data: {
          points: Number(player.points || 0) + (won ? 2 : -1),
          matches: Number(player.matches || 0) + 1,
          wins: Number(player.wins || 0) + (won ? 1 : 0),
          updatedAt: db.serverDate()
        }
      });
    }

    const match = {
      ...settlement.match,
      plannedParticipantIds,
      createdAt: db.serverDate()
    };
    await matchRef.set({ data: match });
    return match;
  };

  if (typeof db.runTransaction === 'function') {
    return db.runTransaction(async (transaction) => persist(transaction));
  }

  // Unit-test stubs may not implement CloudBase transactions.
  return persist(db);
}

module.exports = { buildSettlement, settleImportedMatch };
