const cloud = require('wx-server-sdk');
const https = require('https');
const { isAdminOpenid, assertAdmin } = require('./adminAuth');
const { needsPigeonReset } = require('./pigeonReset');
const { uniqueAvatarFileIds, applyAvatarTempUrls } = require('./avatarUrls');
const { scoreAfterMatch, scoreAfterRollback } = require('./matchScoring');
const { removeSignupFromRoom } = require('./adminSignup');
const { swapTeamPlayers } = require('./teamEditor');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const PIGEON_RESET_VERSION = 1;

function emptyVotes() {
  return { mvp: {}, touch: {} };
}

function emptyHonors() {
  return { mvp: null, touch: null };
}

const STEAM64_OFFSET = 76561197960265728n;

function isMissingCollectionError(error) {
  const message = String(error && (error.errMsg || error.message || error));
  return message.includes('DATABASE_COLLECTION_NOT_EXIST') || message.includes('collection not exists') || message.includes('Db or Table not exist');
}

async function ensureCollection(name) {
  try {
    await db.collection(name).limit(1).get();
  } catch (error) {
    if (!isMissingCollectionError(error)) {
      throw error;
    }
    if (typeof db.createCollection !== 'function') {
      throw new Error(`\u4e91\u6570\u636e\u5e93\u96c6\u5408 ${name} \u4e0d\u5b58\u5728\uff0c\u8bf7\u5148\u5728\u4e91\u5f00\u53d1\u63a7\u5236\u53f0\u521b\u5efa`);
    }
    try {
      await db.createCollection(name);
    } catch (createError) {
      const message = String(createError && (createError.errMsg || createError.message || createError));
      if (!message.includes('already exists') && !message.includes('DATABASE_COLLECTION_ALREADY_EXIST')) {
        throw createError;
      }
    }
  }
}

async function ensureCollections() {
  await ensureCollection('players');
  await ensureCollection('rooms');
  await ensureCollection('matches');
}

function normalizeScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value) || value < 0 || value > 150) {
    throw new Error('\u5206\u6570\u8303\u56f4\u9700\u8981\u5728 0 \u5230 150 \u4e4b\u95f4');
  }
  return Math.round(value);
}

function normalizeStartTime(value) {
  const text = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(text)) {
    throw new Error('\u8bf7\u9009\u62e9\u6709\u6548\u7684\u5f00 C \u65f6\u95f4');
  }
  const [hour, minute] = text.split(':').map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error('\u8bf7\u9009\u62e9\u6709\u6548\u7684\u5f00 C \u65f6\u95f4');
  }
  return text;
}

function normalizeMatchId(value) {
  const text = String(value || '').trim();
  if (!/^\d{6,20}$/.test(text)) {
    throw new Error('\u8bf7\u8f93\u5165\u6709\u6548\u7684\u6bd4\u8d5b ID');
  }
  return text;
}

function accountIdFromSteamId(value) {
  const text = String(value || '').trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }
  const raw = BigInt(text);
  if (raw <= 4294967295n) {
    return Number(raw);
  }
  const accountId = raw - STEAM64_OFFSET;
  if (accountId < 0n || accountId > 4294967295n) {
    return null;
  }
  return Number(accountId);
}

function normalizeSteamIds(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[\s,，;；]+/);
  const ids = [];
  raw.forEach((item) => {
    const text = String(item || '').trim();
    if (/^\d+$/.test(text) && !ids.includes(text)) {
      ids.push(text);
    }
  });
  return ids;
}

function playerSteamIds(player) {
  return normalizeSteamIds([])
    .concat(normalizeSteamIds(player.steamIds || []))
    .concat(normalizeSteamIds(player.steamId || ''))
    .concat(normalizeSteamIds(player.accountId || ''))
    .concat(normalizeSteamIds(player.dotaAccountId || ''))
    .filter((id, index, list) => list.indexOf(id) === index);
}

function buildAccountMap(players) {
  const map = {};
  (players || []).forEach((player) => {
    playerSteamIds(player).forEach((steamId) => {
      const accountId = accountIdFromSteamId(steamId);
      if (accountId !== null) {
        map[String(accountId)] = player;
      }
    });
  });
  return map;
}

function decorateApiPlayer(apiPlayer, accountMap) {
  const accountId = Number(apiPlayer.account_id || 0);
  const matched = accountMap[String(accountId)];
  return {
    accountId,
    playerId: matched ? matched.id : '',
    name: matched ? matched.name : `Dota ${accountId || '\u533f\u540d'}`,
    matched: Boolean(matched),
    heroId: apiPlayer.hero_id || 0,
    kills: Number(apiPlayer.kills || 0),
    deaths: Number(apiPlayer.deaths || 0),
    assists: Number(apiPlayer.assists || 0)
  };
}

function buildImportedMatchPreview(apiMatch, players) {
  if (!apiMatch || !Array.isArray(apiMatch.players)) {
    throw new Error('\u6bd4\u8d5b\u6570\u636e\u4e0d\u5b8c\u6574');
  }
  const accountMap = buildAccountMap(players);
  const decorated = apiMatch.players.map((player) => decorateApiPlayer(player, accountMap));
  const radiant = decorated.filter((player, index) => index < 5);
  const dire = decorated.filter((player, index) => index >= 5);
  const radiantKills = radiant.reduce((total, player) => total + player.kills, 0);
  const direKills = dire.reduce((total, player) => total + player.kills, 0);
  const radiantWin = Boolean(apiMatch.radiant_win);
  return {
    matchId: String(apiMatch.match_id || ''),
    radiantWin,
    winner: radiantWin ? '\u5929\u8f89' : '\u591c\u9b47',
    duration: Number(apiMatch.duration || 0),
    radiantKills,
    direKills,
    radiant,
    dire,
    matchedCount: decorated.filter((player) => player.matched).length
  };
}

function importedMatchToRecord(preview) {
  return {
    id: `imported-${preview.matchId}`,
    matchId: preview.matchId,
    title: `Dota \u6bd4\u8d5b ${preview.matchId}`,
    winner: preview.winner,
    mvp: '\u5f85\u6295\u7968',
    scoreGap: Math.abs(Number(preview.radiantKills || 0) - Number(preview.direKills || 0)),
    scoringVersion: 3,
    imported: true,
    radiantWin: Boolean(preview.radiantWin),
    radiant: preview.radiant,
    dire: preview.dire,
    createdAt: db.serverDate()
  };
}

function requestJson(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const request = https.request(url, { method }, (response) => {
      let body = '';
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(`\u7b2c\u4e09\u65b9 API \u8bf7\u6c42\u5931\u8d25 ${response.statusCode}`);
          error.statusCode = response.statusCode;
          error.body = body;
          reject(error);
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error('\u7b2c\u4e09\u65b9 API \u8fd4\u56de\u89e3\u6790\u5931\u8d25'));
        }
      });
    });
    request.on('error', () => {
      reject(new Error('\u7b2c\u4e09\u65b9 API \u8bf7\u6c42\u5931\u8d25'));
    });
    request.end();
  });
}

async function fetchJson(url) {
  return requestJson(url, 'GET');
}

async function requestOpenDotaParse(matchId) {
  try {
    await requestJson(`https://api.opendota.com/api/request/${matchId}`, 'POST');
    return true;
  } catch (error) {
    return false;
  }
}

function normalizePositions(positions) {
  const valid = Array.from(new Set((positions || []).map(Number))).filter((position) => [1, 2, 3, 4, 5].includes(position));
  if (!valid.length) {
    throw new Error('\u81f3\u5c11\u9009\u62e9\u4e00\u4e2a\u504f\u597d\u4f4d\u7f6e');
  }
  return valid.sort((a, b) => a - b);
}

function getVoteOptions(room, players) {
  const ids = new Set(room && Array.isArray(room.signups) ? room.signups : []);
  if (room && room.teams) {
    ((room.teams.radiant && room.teams.radiant.players) || []).forEach((player) => ids.add(player.id));
    ((room.teams.dire && room.teams.dire.players) || []).forEach((player) => ids.add(player.id));
  }
  return (players || []).filter((player) => ids.has(player.id));
}

function tallyOne(votesByVoter, players) {
  const counts = {};
  Object.keys(votesByVoter || {}).forEach((voterId) => {
    const playerId = votesByVoter[voterId];
    counts[playerId] = (counts[playerId] || 0) + 1;
  });
  const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
  if (!sorted.length) {
    return null;
  }
  const player = (players || []).find((item) => item.id === sorted[0]) || { id: sorted[0], name: '\u672a\u77e5\u9009\u624b' };
  return {
    playerId: player.id,
    name: player.name,
    votes: counts[player.id]
  };
}

function tallyHonors(votes, players) {
  const normalized = { ...emptyVotes(), ...(votes || {}) };
  return {
    mvp: tallyOne(normalized.mvp, players),
    touch: tallyOne(normalized.touch, players)
  };
}

function uniqueIds(ids) {
  return Array.from(new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean)));
}

function normalizeMatchRecordId(matchId) {
  const id = String(matchId || '').trim();
  if (!id) {
    throw new Error('\u8bf7\u9009\u62e9\u8981\u5220\u9664\u7684\u6218\u7ee9');
  }
  return id;
}

function normalizeWinnerSide(winnerSide) {
  if (winnerSide === 'radiant' || winnerSide === 'dire') {
    return winnerSide;
  }
  throw new Error('\u672a\u77e5\u7684\u80dc\u65b9');
}

function teamIds(team) {
  return ((team && team.players) || []).map((player) => player.id).filter(Boolean);
}

function snapshotTeam(team) {
  return ((team && team.players) || []).map((player) => {
    const snapshot = { playerId: player.id, name: player.name };
    if (player.assignedPosition) {
      snapshot.assignedPosition = player.assignedPosition;
    }
    if (player.score !== undefined) {
      snapshot.score = player.score;
    }
    return snapshot;
  });
}

function buildManualMatchUpdate(room, winnerSide) {
  const side = normalizeWinnerSide(winnerSide);
  if (!room.teams || !room.teams.radiant || !room.teams.dire) {
    throw new Error('\u8fd8\u6ca1\u6709\u5b8c\u6210\u5206\u961f');
  }
  const winnerTeam = room.teams[side];
  return {
    participantIds: teamIds(room.teams.radiant).concat(teamIds(room.teams.dire)),
    winnerIds: teamIds(winnerTeam),
    mvpId: '',
    pressureId: '',
    winnerName: side === 'radiant' ? '\u5929\u8f89' : '\u591c\u9b47',
    mvpName: '\u5f85\u6295\u7968'
  };
}

function deriveRollbackIds(match) {
  if (match && match.imported) {
    const radiant = match.radiant || [];
    const dire = match.dire || [];
    return {
      participantIds: radiant.concat(dire).map((player) => player.playerId).filter(Boolean),
      winnerIds: (match.radiantWin ? radiant : dire).map((player) => player.playerId).filter(Boolean),
      mvpId: '',
      pressureId: ''
    };
  }

  return {
    participantIds: match && match.participantIds,
    winnerIds: match && match.winnerIds,
    mvpId: match && match.mvpId,
    pressureId: match && match.pressureId
  };
}

async function getById(collection, id) {
  const result = await db.collection(collection).where({ id }).limit(1).get();
  return result.data[0] || null;
}

async function ensureCurrentPlayer(openid) {
  const existed = await getById('players', openid);
  if (existed) {
    return existed;
  }
  const player = {
    id: openid,
    openid,
    name: '\u5fae\u4fe1\u9009\u624b',
    score: 80,
    points: 0,
    matches: 0,
    wins: 0,
    mvp: 0,
    touch: 0,
    pigeon: 0,
    pressure: 0,
    preferredPositions: [1, 2, 3],
    steamId: '',
    avatarUrl: '',
    profileCompleted: false,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  };
  const result = await db.collection('players').add({ data: player });
  return { ...player, _id: result._id };
}

async function ensureRoom() {
  const existed = await getById('rooms', 'today');
  if (existed) {
    return existed;
  }
  const room = {
    id: 'today',
    title: '\u4eca\u665a\u79d8\u9a6c\u5f00 C',
    status: '\u62a5\u540d\u4e2d',
    startTime: '21:30',
    signups: [],
    waitlist: [],
    teams: null,
    roundNumber: 0,
    rotationQueue: [],
    votes: emptyVotes(),
    honors: emptyHonors(),
    pigeonResetVersion: 0,
    updatedAt: db.serverDate()
  };
  const result = await db.collection('rooms').add({ data: room });
  return { ...room, _id: result._id };
}

async function ensureMatches() {
  return true;
}

async function withPlayerAvatarSrc(players) {
  const fileIds = uniqueAvatarFileIds(players);
  if (!fileIds.length) {
    return applyAvatarTempUrls(players, []);
  }

  const fileList = [];
  for (let index = 0; index < fileIds.length; index += 50) {
    try {
      const result = await cloud.getTempFileURL({
        fileList: fileIds.slice(index, index + 50)
      });
      fileList.push(...(result.fileList || []));
    } catch (error) {
      // A missing legacy file should not block the rest of bootstrap.
    }
  }
  return applyAvatarTempUrls(players, fileList);
}

function withTeamAvatarSrc(room, players) {
  if (!room.teams) {
    return room;
  }
  const avatarByPlayerId = {};
  players.forEach((player) => {
    avatarByPlayerId[player.id] = player.avatarSrc || '';
  });
  const decorateTeam = (team) => ({
    ...team,
    players: (team.players || []).map((player) => ({
      ...player,
      avatarSrc: avatarByPlayerId[player.id] || ''
    }))
  });
  return {
    ...room,
    teams: {
      ...room.teams,
      radiant: decorateTeam(room.teams.radiant),
      dire: decorateTeam(room.teams.dire)
    }
  };
}

async function bootstrap(openid) {
  const currentPlayer = await ensureCurrentPlayer(openid);
  let room = await ensureRoom();
  room = await resetPigeonStatsOnce(openid, room);
  await ensureMatches();
  const players = await withPlayerAvatarSrc((await db.collection('players').limit(100).get()).data.map((player) => ({
    ...player,
    points: Number(player.points || 0)
  })));
  const playerWithAvatar = players.find((player) => player.id === openid) || currentPlayer;
  room = withTeamAvatarSrc(room, players);
  const matches = (await db.collection('matches').orderBy('createdAt', 'desc').limit(50).get()).data;
  return {
    openid,
    currentPlayer: { ...playerWithAvatar, isAdmin: isAdminOpenid(openid) },
    players,
    room,
    matches,
    isAdmin: isAdminOpenid(openid)
  };
}

async function getRoomDoc() {
  const room = await getById('rooms', 'today');
  if (!room) {
    return ensureRoom();
  }
  return room;
}

async function updateRoom(room, options = {}) {
  const existed = await getRoomDoc();
  const allowStartTimeChange = Boolean(options.allowStartTimeChange);
  const cleanRoom = {
    id: 'today',
    title: room.title || existed.title,
    status: room.status || existed.status,
    startTime: allowStartTimeChange ? room.startTime : existed.startTime,
    signups: room.signups || existed.signups || [],
    waitlist: room.waitlist || existed.waitlist || [],
    teams: room.teams || null,
    roundNumber: Number(room.roundNumber ?? existed.roundNumber ?? 0),
    rotationQueue: room.rotationQueue || existed.rotationQueue || [],
    votes: room.votes || existed.votes || emptyVotes(),
    honors: room.honors || existed.honors || emptyHonors(),
    cleanupVersion: room.cleanupVersion || existed.cleanupVersion || 0,
    pigeonResetVersion: room.pigeonResetVersion || existed.pigeonResetVersion || 0,
    competitionResetAt: room.competitionResetAt || existed.competitionResetAt || null,
    updatedAt: db.serverDate()
  };
  await db.collection('rooms').doc(existed._id).update({
    data: {
      ...cleanRoom,
      teams: _.set(cleanRoom.teams),
      rotationQueue: _.set(cleanRoom.rotationQueue),
      votes: _.set(cleanRoom.votes),
      honors: _.set(cleanRoom.honors)
    }
  });
  return { ...existed, ...cleanRoom };
}

async function updateStartTime(openid, startTime) {
  assertAdmin(openid, '\u53ea\u6709\u7ba1\u7406\u5458\u53ef\u4ee5\u4fee\u6539\u5f00 C \u65f6\u95f4');
  const room = await getRoomDoc();
  return updateRoom(
    { ...room, startTime: normalizeStartTime(startTime) },
    { allowStartTimeChange: true }
  );
}

async function updatePlayerScore(openid, playerId, score) {
  assertAdmin(openid, '\u53ea\u6709\u7ba1\u7406\u5458\u53ef\u4ee5\u4fee\u6539\u9009\u624b\u81ea\u8bc4\u5206');
  const targetId = String(playerId || '').trim();
  const player = await getById('players', targetId);
  if (!player) {
    throw new Error('\u6ca1\u6709\u627e\u5230\u8fd9\u4f4d\u9009\u624b');
  }
  const nextScore = normalizeScore(score);
  await db.collection('players').doc(player._id).update({
    data: { score: nextScore, updatedAt: db.serverDate() }
  });
  return { ...player, score: nextScore };
}

async function adminSwapTeams(openid, radiantPlayerId, direPlayerId) {
  assertAdmin(openid, '\u53ea\u6709\u7ba1\u7406\u5458\u53ef\u4ee5\u8c03\u6574\u961f\u4f0d');
  const room = await getRoomDoc();
  const teams = swapTeamPlayers(room.teams, radiantPlayerId, direPlayerId);
  return updateRoom({ ...room, teams, status: '\u5df2\u5206\u961f' });
}

function validateRoundTeams(teams, registeredIds) {
  const radiant = (teams && teams.radiant && teams.radiant.players) || [];
  const dire = (teams && teams.dire && teams.dire.players) || [];
  const players = radiant.concat(dire);
  const playerIds = players.map((player) => player.id).filter(Boolean);
  const registered = new Set(registeredIds);
  if (radiant.length !== 5 || dire.length !== 5 || new Set(playerIds).size !== 10) {
    throw new Error('\u4e0b\u4e00\u628a\u9635\u5bb9\u5fc5\u987b\u662f\u4e0d\u91cd\u590d\u7684 10 \u4eba');
  }
  if (playerIds.some((playerId) => !registered.has(playerId))) {
    throw new Error('\u4e0b\u4e00\u628a\u9635\u5bb9\u5305\u542b\u672a\u62a5\u540d\u9009\u624b');
  }
  const positionsComplete = [radiant, dire].every((side) => (
    side.map((player) => Number(player.assignedPosition)).sort().join(',') === '1,2,3,4,5'
  ));
  if (!positionsComplete) {
    throw new Error('\u6bcf\u961f\u5fc5\u987b\u5305\u542b 1\u30012\u30013\u30014\u30015 \u53f7\u4f4d');
  }
  return new Set(playerIds);
}

async function adminAdvanceRound(openid, payload) {
  assertAdmin(openid, '\u53ea\u6709\u7ba1\u7406\u5458\u53ef\u4ee5\u751f\u6210\u4e0b\u4e00\u628a\u9635\u5bb9');
  const room = await getRoomDoc();
  if (!room.teams) {
    throw new Error('\u8fd8\u6ca1\u6709\u5f53\u524d\u5206\u961f');
  }
  const registeredIds = [...(room.signups || []), ...(room.waitlist || [])];
  const rosterIds = validateRoundTeams(payload.teams, registeredIds);
  const rotationQueue = uniqueIds(payload.rotationQueue || []).filter((playerId) => (
    registeredIds.includes(playerId) && !rosterIds.has(playerId)
  ));
  const roundNumber = Number(room.roundNumber || 1) + 1;
  return updateRoom({
    ...room,
    teams: payload.teams,
    rotationQueue,
    roundNumber,
    status: `\u7b2c ${roundNumber} \u628a\u5df2\u5206\u961f`
  });
}

async function resetCompetitionData(openid) {
  assertAdmin(openid, '\u53ea\u6709\u7ba1\u7406\u5458\u53ef\u4ee5\u91cd\u7f6e\u5168\u90e8\u6bd4\u8d5b\u6570\u636e');

  await db.collection('players').where({ _id: _.exists(true) }).update({
    data: {
      points: 0,
      matches: 0,
      wins: 0,
      mvp: 0,
      touch: 0,
      pressure: 0,
      updatedAt: db.serverDate()
    }
  });
  await db.collection('matches').where({ _id: _.exists(true) }).remove();

  const room = await getRoomDoc();
  await updateRoom({
    ...room,
    votes: emptyVotes(),
    honors: emptyHonors(),
    competitionResetAt: db.serverDate()
  });
  return { reset: true };
}

async function resetPigeonStatsOnce(openid, room) {
  if (!isAdminOpenid(openid) || !needsPigeonReset(room, PIGEON_RESET_VERSION)) {
    return room;
  }

  await db.collection('players').where({ pigeon: _.gt(0) }).update({
    data: {
      pigeon: 0,
      updatedAt: db.serverDate()
    }
  });

  return updateRoom({
    ...room,
    pigeonResetVersion: PIGEON_RESET_VERSION
  });
}

async function voteHonor(openid, honorType, playerId) {
  const room = await getRoomDoc();
  const players = (await db.collection('players').limit(100).get()).data;
  const options = getVoteOptions(room, players);
  if (!options.some((player) => player.id === playerId)) {
    throw new Error('\u53ea\u80fd\u6295\u7ed9\u4eca\u65e5\u5f00 C \u9009\u624b');
  }
  const votes = { ...emptyVotes(), ...(room.votes || {}) };
  votes[honorType] = {
    ...(votes[honorType] || {}),
    [openid]: playerId
  };
  return updateRoom({
    ...room,
    votes,
    honors: tallyHonors(votes, players)
  });
}

async function settleHonorAwards(honors) {
  const awardsByPlayer = {};
  const addAward = (field, honor) => {
    const playerId = honor && honor.playerId;
    if (!playerId) {
      return;
    }
    awardsByPlayer[playerId] = { ...(awardsByPlayer[playerId] || {}), [field]: 1 };
  };
  addAward('mvp', honors && honors.mvp);
  addAward('touch', honors && honors.touch);

  if (!Object.keys(awardsByPlayer).length) {
    return;
  }
  const players = (await db.collection('players').limit(100).get()).data;
  for (const player of players) {
    const awards = awardsByPlayer[player.id];
    if (!awards) {
      continue;
    }
    const data = { updatedAt: db.serverDate() };
    if (awards.mvp) {
      data.mvp = Number(player.mvp || 0) + 1;
    }
    if (awards.touch) {
      data.touch = Number(player.touch || 0) + 1;
    }
    await db.collection('players').doc(player._id).update({ data });
  }
}

async function joinRoom(openid) {
  const current = await ensureCurrentPlayer(openid);
  if (!current.profileCompleted) {
    throw new Error('\u8bf7\u5148\u521b\u5efa\u9009\u624b\u5361');
  }
  const room = await getRoomDoc();
  const signups = room.signups || [];
  const waitlist = room.waitlist || [];
  if (signups.includes(openid) || waitlist.includes(openid)) {
    return room;
  }
  if (signups.length >= 10) {
    return updateRoom({ ...room, signups, waitlist: waitlist.concat(openid), teams: null, status: '\u5019\u8865\u4e2d' });
  }
  return updateRoom({ ...room, signups: signups.concat(openid), waitlist, teams: null, status: '\u62a5\u540d\u4e2d' });
}

async function leaveRoom(openid) {
  const room = await getRoomDoc();
  const signups = room.signups || [];
  const waitlist = room.waitlist || [];
  const wasSignup = signups.includes(openid);
  const nextSignups = signups.filter((id) => id !== openid);
  let nextWaitlist = waitlist.filter((id) => id !== openid);

  if (wasSignup && nextSignups.length < 10 && nextWaitlist.length) {
    nextSignups.push(nextWaitlist[0]);
    nextWaitlist = nextWaitlist.slice(1);
  }

  return updateRoom({ ...room, signups: nextSignups, waitlist: nextWaitlist, teams: null, status: '\u62a5\u540d\u4e2d' });
}

async function resetRoomSignups(openid) {
  assertAdmin(openid, '\u53ea\u6709\u7ba1\u7406\u5458\u53ef\u4ee5\u91cd\u5f00\u62a5\u540d');
  const room = await getRoomDoc();
  await settleHonorAwards(room.honors);
  return updateRoom({
    ...room,
    status: '\u62a5\u540d\u4e2d',
    signups: [],
    waitlist: [],
    teams: null,
    roundNumber: 0,
    rotationQueue: [],
    votes: emptyVotes(),
    honors: emptyHonors()
  });
}

async function adminRemoveSignup(openid, playerId) {
  assertAdmin(openid, '\u53ea\u6709\u7ba1\u7406\u5458\u53ef\u4ee5\u79fb\u9664\u62a5\u540d');
  const room = await getRoomDoc();
  const targetId = String(playerId || '').trim();
  if (!(room.signups || []).includes(targetId) && !(room.waitlist || []).includes(targetId)) {
    throw new Error('\u8fd9\u4f4d\u9009\u624b\u5df2\u4e0d\u5728\u62a5\u540d\u540d\u5355\u4e2d');
  }
  return updateRoom(removeSignupFromRoom(room, targetId));
}

async function markPigeons(openid, pigeonIds) {
  assertAdmin(openid, '\u53ea\u6709\u7ba1\u7406\u5458\u53ef\u4ee5\u8bb0\u5f55\u9e3d\u5b50');
  const selected = new Set(uniqueIds(pigeonIds));
  if (!selected.size) {
    throw new Error('\u8bf7\u5148\u9009\u62e9\u8981\u8bb0\u5f55\u7684\u9e3d\u5b50');
  }

  const room = await getRoomDoc();
  const roomIds = new Set([...(room.signups || []), ...(room.waitlist || [])]);
  const invalid = Array.from(selected).find((id) => !roomIds.has(id));
  if (invalid) {
    throw new Error('\u53ea\u80fd\u8bb0\u5f55\u4eca\u65e5\u62a5\u540d\u6216\u5019\u8865\u7684\u9009\u624b');
  }

  const players = (await db.collection('players').limit(100).get()).data;
  for (const player of players) {
    if (!selected.has(player.id)) {
      continue;
    }
    await db.collection('players').doc(player._id).update({
      data: {
        pigeon: Number(player.pigeon || 0) + 1,
        updatedAt: db.serverDate()
      }
    });
  }

  return { pigeonIds: Array.from(selected) };
}

async function saveProfile(openid, form) {
  const score = normalizeScore(form.score);
  const preferredPositions = normalizePositions(form.preferredPositions);
  const steamIds = normalizeSteamIds(form.steamIds || form.steamId || '');
  const current = await ensureCurrentPlayer(openid);
  const data = {
    name: String(form.name || current.name || '\u5fae\u4fe1\u9009\u624b').trim() || '\u5fae\u4fe1\u9009\u624b',
    score,
    preferredPositions,
    steamId: steamIds.join(', '),
    steamIds,
    avatarUrl: String(form.avatarUrl || current.avatarUrl || '').trim(),
    profileCompleted: true,
    updatedAt: db.serverDate()
  };
  await db.collection('players').doc(current._id).update({ data });
  return { ...current, ...data };
}

async function recordMatchResult(openid, winnerSide) {
  assertAdmin(openid, '只有管理员可以记录比赛结果');
  const room = await getRoomDoc();
  if (!room.teams) {
    throw new Error('\u8fd8\u6ca1\u6709\u5b8c\u6210\u5206\u961f');
  }
  const result = buildManualMatchUpdate(room, winnerSide);
  const participantIds = new Set(result.participantIds);
  const winnerIds = new Set(result.winnerIds);
  const players = (await db.collection('players').limit(100).get()).data;

  for (const player of players) {
    if (!participantIds.has(player.id)) {
      continue;
    }
    const data = { matches: Number(player.matches || 0) + 1, updatedAt: db.serverDate() };
    const points = scoreAfterMatch(player.points, winnerIds.has(player.id));
    if (winnerIds.has(player.id)) {
      data.wins = Number(player.wins || 0) + 1;
    }
    data.points = points;
    await db.collection('players').doc(player._id).update({ data });
  }

  const match = {
    id: `m${Date.now()}`,
    title: `\u79d8\u9a6c\u65e5\u8d5b ${Date.now()}`,
    winner: result.winnerName,
    winnerSide: normalizeWinnerSide(winnerSide),
    mvp: result.mvpName,
    participantIds: result.participantIds,
    winnerIds: result.winnerIds,
    mvpId: result.mvpId,
    pressureId: result.pressureId,
    radiant: snapshotTeam(room.teams.radiant),
    dire: snapshotTeam(room.teams.dire),
    scoreGap: room.teams.scoreGap,
    scoringVersion: 3,
    createdAt: db.serverDate()
  };
  await db.collection('matches').add({ data: match });
  return match;
}

async function recordRadiantWin(openid) {
  return recordMatchResult(openid, 'radiant');
}

async function previewImportedMatch(matchId) {
  const normalizedMatchId = normalizeMatchId(matchId);
  let apiMatch = null;
  try {
    apiMatch = await fetchJson(`https://api.opendota.com/api/matches/${normalizedMatchId}`);
  } catch (error) {
    if (error.statusCode === 404) {
      const requested = await requestOpenDotaParse(normalizedMatchId);
      if (requested) {
        throw new Error('\u8fd9\u573a\u6bd4\u8d5b\u8fd8\u6ca1\u6709\u88ab OpenDota \u6536\u5f55\uff0c\u5df2\u63d0\u4ea4\u89e3\u6790\u8bf7\u6c42\uff0c\u8bf7\u8fc7\u51e0\u5206\u949f\u518d\u8bd5');
      }
      throw new Error('\u8fd9\u573a\u6bd4\u8d5b\u5728 OpenDota \u67e5\u4e0d\u5230\uff0c\u8bf7\u786e\u8ba4\u6bd4\u8d5b ID \u6216\u7a0d\u540e\u518d\u8bd5');
    }
    throw error;
  }
  const players = (await db.collection('players').limit(100).get()).data;
  const preview = buildImportedMatchPreview(apiMatch, players);
  if (!preview.matchedCount) {
    throw new Error('\u6ca1\u6709\u5339\u914d\u5230\u79d8\u9a6c\u9009\u624b\uff0c\u8bf7\u5148\u5728\u9009\u624b\u5361\u586b\u5199 Dota account_id');
  }
  return preview;
}

async function confirmImportedMatch(matchId) {
  const preview = await previewImportedMatch(matchId);
  const existed = await getById('matches', `imported-${preview.matchId}`);
  if (existed) {
    throw new Error('\u8fd9\u573a\u6bd4\u8d5b\u5df2\u7ecf\u5bfc\u5165\u8fc7');
  }

  const winnerIds = new Set((preview.radiantWin ? preview.radiant : preview.dire).map((player) => player.playerId).filter(Boolean));
  const participantIds = new Set(preview.radiant.concat(preview.dire).map((player) => player.playerId).filter(Boolean));
  const players = (await db.collection('players').limit(100).get()).data;

  for (const player of players) {
    if (!participantIds.has(player.id)) {
      continue;
    }
    const data = {
      matches: Number(player.matches || 0) + 1,
      points: scoreAfterMatch(player.points, winnerIds.has(player.id)),
      updatedAt: db.serverDate()
    };
    if (winnerIds.has(player.id)) {
      data.wins = Number(player.wins || 0) + 1;
    }
    await db.collection('players').doc(player._id).update({ data });
  }

  const match = importedMatchToRecord(preview);
  await db.collection('matches').add({ data: match });
  return match;
}

async function deleteMatchRecord(matchId) {
  const normalizedMatchId = normalizeMatchRecordId(matchId);
  const match = await getById('matches', normalizedMatchId);
  if (!match) {
    throw new Error('\u8fd9\u6761\u6218\u7ee9\u4e0d\u5b58\u5728\u6216\u5df2\u7ecf\u5220\u9664');
  }
  const rollback = deriveRollbackIds(match);
  const participantIds = new Set(rollback.participantIds || []);
  const winnerIds = new Set(rollback.winnerIds || []);
  const scoringVersion = Number(match.scoringVersion || 0);
  const usesWinLossScoring = scoringVersion >= 2;
  const usesSeparatePoints = scoringVersion >= 3;
  if (!participantIds.size) {
    throw new Error('\u8fd9\u6761\u65e7\u6218\u7ee9\u7f3a\u5c11\u53c2\u4e0e\u8005\u4fe1\u606f\uff0c\u65e0\u6cd5\u51c6\u786e\u56de\u6eda\u9009\u624b\u6570\u636e');
  }

  const players = (await db.collection('players').limit(100).get()).data;
  for (const player of players) {
    if (!participantIds.has(player.id)) {
      continue;
    }

    const data = {
      matches: Math.max(0, Number(player.matches || 0) - 1),
      updatedAt: db.serverDate()
    };
    let score = Number(player.score || 0);
    if (usesSeparatePoints) {
      data.points = scoreAfterRollback(player.points, winnerIds.has(player.id), scoringVersion);
    } else {
      score = scoreAfterRollback(player.score, winnerIds.has(player.id), scoringVersion);
    }

    if (winnerIds.has(player.id)) {
      data.wins = Math.max(0, Number(player.wins || 0) - 1);
    }
    if (rollback.mvpId && player.id === rollback.mvpId) {
      data.mvp = Math.max(0, Number(player.mvp || 0) - 1);
      if (!usesWinLossScoring) score -= 2;
    }
    if (rollback.pressureId && player.id === rollback.pressureId) {
      data.pressure = Math.max(0, Number(player.pressure || 0) - 1);
      if (!usesWinLossScoring) score += 2;
    }

    if (!usesSeparatePoints) data.score = score;
    await db.collection('players').doc(player._id).update({ data });
  }

  await db.collection('matches').doc(match._id).remove();
  return { matchId: normalizedMatchId };
}

exports.main = async (event) => {
  await ensureCollections();
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action;

  if (action === 'bootstrap') {
    return bootstrap(openid);
  }
  if (action === 'saveProfile') {
    return saveProfile(openid, event.form || {});
  }
  if (action === 'joinRoom') {
    return joinRoom(openid);
  }
  if (action === 'leaveRoom') {
    return leaveRoom(openid);
  }
  if (action === 'resetRoomSignups') {
    return resetRoomSignups(openid);
  }
  if (action === 'adminRemoveSignup') {
    return adminRemoveSignup(openid, event.playerId);
  }
  if (action === 'saveRoom') {
    return updateRoom(event.room || {});
  }
  if (action === 'updateStartTime') {
    return updateStartTime(openid, event.startTime);
  }
  if (action === 'updatePlayerScore') {
    return updatePlayerScore(openid, event.playerId, event.score);
  }
  if (action === 'adminSwapTeams') {
    return adminSwapTeams(openid, event.radiantPlayerId, event.direPlayerId);
  }
  if (action === 'adminAdvanceRound') {
    return adminAdvanceRound(openid, event);
  }
  if (action === 'resetCompetitionData') {
    return resetCompetitionData(openid);
  }
  if (action === 'recordRadiantWin') {
    return recordRadiantWin(openid);
  }
  if (action === 'recordMatchResult') {
    return recordMatchResult(openid, event.winnerSide);
  }
  if (action === 'voteHonor') {
    throw new Error('投票功能暂未开放');
  }
  if (action === 'markPigeons') {
    return markPigeons(openid, event.pigeonIds || []);
  }
  if (action === 'previewImportedMatch') {
    return previewImportedMatch(event.matchId);
  }
  if (action === 'confirmImportedMatch') {
    return confirmImportedMatch(event.matchId);
  }
  if (action === 'deleteMatchRecord') {
    return deleteMatchRecord(event.matchId);
  }
  throw new Error(`Unknown action: ${action}`);
};
