const seed = require('./seed');
const { joinRoom, leaveRoom } = require('./roomSignup');
const { voteHonor } = require('./honorVote');
const { normalizeSteamIds, normalizeScore } = require('./playerProfile');
const { normalizeRoomStartTime } = require('./roomTime');
const { applyPigeonMarks, uniqueIds } = require('./pigeonStats');
const { normalizeMatchRecordId, removeMatchById } = require('./matchHistory');
const { applyFinalHonorAwards } = require('./honorStats');
const { rollbackMatchStats } = require('./matchRollback');
const { buildManualMatchRecord } = require('./manualMatchResult');
const { resolveActualLineup } = require('./actualLineup');
const { swapTeamPlayers } = require('./teamEditor');
const { resetCompetitionStats } = require('./competitionReset');

let cache = null;
let localPlayers = JSON.parse(JSON.stringify(seed.players));
let localRoom = JSON.parse(JSON.stringify(seed.room));
let localMatches = JSON.parse(JSON.stringify(seed.matches));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function canUseCloud() {
  return typeof wx !== 'undefined' && wx.cloud && wx.cloud.callFunction;
}

function cleanCloudErrorMessage(error) {
  const text = String(error && (error.errMsg || error.message || error));
  if (text.includes('\u7b2c\u4e09\u65b9 API \u8bf7\u6c42\u5931\u8d25 404')) {
    return '\u8fd9\u573a\u6bd4\u8d5b\u8fd8\u6ca1\u6709\u88ab OpenDota \u6536\u5f55\uff0c\u8bf7\u786e\u8ba4\u6bd4\u8d5b ID\uff0c\u6216\u8fc7\u51e0\u5206\u949f\u518d\u8bd5\u3002';
  }
  const knownMessages = [
    '\u8fd9\u573a\u6bd4\u8d5b\u8fd8\u6ca1\u6709\u88ab OpenDota \u6536\u5f55',
    '\u8fd9\u573a\u6bd4\u8d5b\u5728 OpenDota \u67e5\u4e0d\u5230',
    '\u6ca1\u6709\u5339\u914d\u5230\u79d8\u9a6c\u9009\u624b',
    '\u8fd9\u573a\u6bd4\u8d5b\u5df2\u7ecf\u5bfc\u5165\u8fc7',
    '\u8bf7\u8f93\u5165\u6709\u6548\u7684\u6bd4\u8d5b ID',
    '\u8fd9\u6761\u65e7\u6218\u7ee9\u7f3a\u5c11\u53c2\u4e0e\u8005\u4fe1\u606f',
    '\u8fd9\u6761\u6218\u7ee9\u4e0d\u5b58\u5728\u6216\u5df2\u7ecf\u5220\u9664'
  ];
  const known = knownMessages.find((message) => text.includes(message));
  if (known) {
    const start = text.indexOf(known);
    return text.slice(start).split(' at ')[0].trim();
  }
  return text.split(' at ')[0].replace(/^cloud\.callFunction:fail\s*/i, '').trim() || '\u8bf7\u6c42\u5931\u8d25';
}

function isCloudFileId(value) {
  return typeof value === 'string' && value.indexOf('cloud://') === 0;
}

async function getAvatarSrc(avatarUrl) {
  if (!avatarUrl) {
    return '';
  }
  if (!isCloudFileId(avatarUrl)) {
    return avatarUrl;
  }
  if (!canUseCloud() || !wx.cloud.getTempFileURL) {
    return '';
  }
  try {
    const result = await wx.cloud.getTempFileURL({ fileList: [avatarUrl] });
    const file = result.fileList && result.fileList[0];
    return (file && file.tempFileURL) || '';
  } catch (error) {
    return '';
  }
}

async function withAvatarSrc(player) {
  if (!player) {
    return player;
  }
  if (player.avatarSrc) {
    return player;
  }
  return {
    ...player,
    avatarSrc: await getAvatarSrc(player.avatarUrl)
  };
}

async function withTeamAvatarSrc(team) {
  if (!team || !Array.isArray(team.players)) {
    return team;
  }
  return {
    ...team,
    players: await Promise.all(team.players.map(withAvatarSrc))
  };
}

async function withBootstrapAvatarSrc(data) {
  const players = await Promise.all((data.players || []).map(withAvatarSrc));
  const currentPlayer = await withAvatarSrc(data.currentPlayer);
  const room = { ...data.room };
  if (room.teams) {
    room.teams = {
      ...room.teams,
      radiant: await withTeamAvatarSrc(room.teams.radiant),
      dire: await withTeamAvatarSrc(room.teams.dire)
    };
  }
  return { ...data, players, currentPlayer, room };
}

function localCurrentPlayer() {
  return localPlayers.find((player) => player.id === 'p1') || localPlayers[0];
}

function localBootstrap() {
  if (!localPlayers.find((player) => player.id === 'p1')) {
    localPlayers.unshift({
      id: 'p1',
      openid: 'local-openid',
      name: '\u79d8\u9a6c\u4e00\u53f7',
      score: 80,
      points: 0,
      matches: 0,
      wins: 0,
      mvp: 0,
      pigeon: 0,
      pressure: 0,
      preferredPositions: [1, 2, 3],
      steamId: '',
      avatarUrl: '',
      profileCompleted: false
    });
  }
  return {
    openid: 'p1',
    currentPlayer: localCurrentPlayer(),
    players: clone(localPlayers),
    room: clone(localRoom),
    matches: clone(localMatches)
  };
}

async function callApi(action, payload = {}) {
  if (!canUseCloud()) {
    return callLocal(action, payload);
  }
  try {
    const result = await wx.cloud.callFunction({
      name: 'api',
      data: { action, ...payload }
    });
    return result.result;
  } catch (error) {
    throw new Error(cleanCloudErrorMessage(error));
  }
}

async function getBootstrap(forceRefresh = false) {
  if (!forceRefresh && cache) {
    return clone(cache);
  }
  cache = await withBootstrapAvatarSrc(await callApi('bootstrap'));
  return clone(cache);
}

function clearCache() {
  cache = null;
}

async function saveCurrentProfile(form) {
  const player = await callApi('saveProfile', { form });
  clearCache();
  return player;
}

async function joinTodayRoom() {
  const room = await callApi('joinRoom');
  clearCache();
  return room;
}

async function leaveTodayRoom() {
  const room = await callApi('leaveRoom');
  clearCache();
  return room;
}

async function resetTodayRoomSignups() {
  const room = await callApi('resetRoomSignups');
  clearCache();
  return room;
}

async function adminRemoveTodaySignup(playerId) {
  const room = await callApi('adminRemoveSignup', { playerId });
  clearCache();
  return room;
}

async function saveTodayRoom(room) {
  const saved = await callApi('saveRoom', { room });
  clearCache();
  return saved;
}

async function updateTodayRoomStartTime(startTime) {
  const room = await callApi('updateStartTime', { startTime });
  clearCache();
  return room;
}

async function adminUpdatePlayerScore(playerId, score) {
  const player = await callApi('updatePlayerScore', { playerId, score });
  clearCache();
  return player;
}

async function adminSwapTeamPlayers(radiantPlayerId, direPlayerId) {
  const room = await callApi('adminSwapTeams', { radiantPlayerId, direPlayerId });
  clearCache();
  return room;
}

async function adminSaveNextRound(teams, rotationQueue) {
  const room = await callApi('adminAdvanceRound', { teams, rotationQueue });
  clearCache();
  return room;
}

async function resetAllCompetitionData() {
  const result = await callApi('resetCompetitionData');
  clearCache();
  return result;
}

async function uploadAvatar(tempFilePath) {
  if (!tempFilePath) {
    return '';
  }
  if (!canUseCloud() || !wx.cloud.uploadFile) {
    return tempFilePath;
  }
  const extensionMatch = tempFilePath.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  const extension = extensionMatch ? extensionMatch[1] : 'png';
  const random = Math.random().toString(16).slice(2);
  const cloudPath = 'avatars/' + Date.now() + '-' + random + '.' + extension;
  const result = await wx.cloud.uploadFile({ cloudPath, filePath: tempFilePath });
  return result.fileID;
}

async function uploadAvatarWithSrc(tempFilePath) {
  const avatarUrl = await uploadAvatar(tempFilePath);
  return {
    avatarUrl,
    avatarSrc: await getAvatarSrc(avatarUrl)
  };
}

async function adminCreateTemporaryPlayer(form) {
  const player = await callApi('adminCreateTemporaryPlayer', { form });
  clearCache();
  return player;
}

async function recordMatchResult(winnerSide, radiantPlayerIds, direPlayerIds) {
  const match = await callApi('recordMatchResult', { winnerSide, radiantPlayerIds, direPlayerIds });
  clearCache();
  return match;
}

async function recordRadiantWin() {
  return recordMatchResult('radiant');
}

async function voteTodayHonor(honorType, playerId) {
  const room = await callApi('voteHonor', { honorType, playerId });
  clearCache();
  return room;
}

async function previewImportedMatch(matchId) {
  return callApi('previewImportedMatch', { matchId });
}

async function confirmImportedMatch(matchId, radiantPlayerIds, direPlayerIds) {
  const match = await callApi('confirmImportedMatch', { matchId, radiantPlayerIds, direPlayerIds });
  clearCache();
  return match;
}

async function markTodayPigeons(pigeonIds) {
  const result = await callApi('markPigeons', { pigeonIds });
  clearCache();
  return result;
}

async function deleteMatchRecord(matchId) {
  const result = await callApi('deleteMatchRecord', { matchId });
  clearCache();
  return result;
}

function callLocal(action, payload) {
  const bootstrap = localBootstrap();
  if (action === 'bootstrap') {
    return bootstrap;
  }
  if (action === 'saveProfile') {
    const form = payload.form || {};
    localPlayers = localPlayers.map((player) => {
      if (player.id !== bootstrap.currentPlayer.id) {
        return player;
      }
      return {
        ...player,
        name: String(form.name || player.name || '\u5fae\u4fe1\u9009\u624b').trim() || '\u5fae\u4fe1\u9009\u624b',
        score: Math.round(Number(form.score || player.score || 80)),
        preferredPositions: (form.preferredPositions || player.preferredPositions || [1]).map(Number),
        steamId: normalizeSteamIds(form.steamIds || form.steamId || '').join(', '),
        steamIds: normalizeSteamIds(form.steamIds || form.steamId || ''),
        avatarUrl: String(form.avatarUrl || player.avatarUrl || '').trim(),
        profileCompleted: true
      };
    });
    return localCurrentPlayer();
  }
  if (action === 'joinRoom') {
    localRoom = joinRoom(localRoom, bootstrap.currentPlayer.id, bootstrap.currentPlayer);
    return clone(localRoom);
  }
  if (action === 'leaveRoom') {
    localRoom = leaveRoom(localRoom, bootstrap.currentPlayer.id);
    return clone(localRoom);
  }
  if (action === 'resetRoomSignups') {
    localPlayers = applyFinalHonorAwards(localPlayers, localRoom.honors);
    localRoom = {
      ...localRoom,
      status: '\u62a5\u540d\u4e2d',
      signups: [],
      waitlist: [],
      teams: null,
      roundNumber: 0,
      rotationQueue: [],
      votes: { mvp: {}, touch: {} },
      honors: { mvp: null, touch: null }
    };
    return clone(localRoom);
  }
  if (action === 'adminRemoveSignup') {
    localRoom = leaveRoom(localRoom, payload.playerId);
    return clone(localRoom);
  }
  if (action === 'saveRoom') {
    localRoom = clone(payload.room);
    return clone(localRoom);
  }
  if (action === 'updateStartTime') {
    localRoom = { ...localRoom, startTime: normalizeRoomStartTime(payload.startTime) };
    return clone(localRoom);
  }
  if (action === 'updatePlayerScore') {
    const score = normalizeScore(payload.score);
    const playerId = String(payload.playerId || '').trim();
    const player = localPlayers.find((item) => item.id === playerId);
    if (!player) {
      throw new Error('\u6ca1\u6709\u627e\u5230\u8fd9\u4f4d\u9009\u624b');
    }
    player.score = score;
    return clone(player);
  }
  if (action === 'adminSwapTeams') {
    localRoom = {
      ...localRoom,
      teams: swapTeamPlayers(localRoom.teams, payload.radiantPlayerId, payload.direPlayerId)
    };
    return clone(localRoom);
  }
  if (action === 'adminAdvanceRound') {
    const roundNumber = Number(localRoom.roundNumber || 1) + 1;
    localRoom = {
      ...localRoom,
      teams: clone(payload.teams),
      rotationQueue: clone(payload.rotationQueue || []),
      roundNumber,
      status: `\u7b2c ${roundNumber} \u628a\u5df2\u5206\u961f`
    };
    return clone(localRoom);
  }
  if (action === 'resetCompetitionData') {
    localPlayers = localPlayers.map(resetCompetitionStats);
    localMatches = [];
    localRoom = {
      ...localRoom,
      votes: { mvp: {}, touch: {} },
      honors: { mvp: null, touch: null }
    };
    return { reset: true };
  }
  if (action === 'adminCreateTemporaryPlayer') {
    const steamIds = normalizeSteamIds((payload.form && payload.form.steamId) || '');
    const player = {
      id: `temp-${Date.now()}`,
      openid: '',
      name: String(payload.form && payload.form.name || '\u4e34\u65f6\u9009\u624b').trim(),
      score: 80,
      points: 0,
      matches: 0,
      wins: 0,
      mvp: 0,
      touch: 0,
      pigeon: 0,
      pressure: 0,
      preferredPositions: [1, 2, 3, 4, 5],
      steamId: steamIds.join(', '),
      steamIds,
      avatarUrl: '',
      profileCompleted: true,
      temporary: true
    };
    localPlayers.push(player);
    return clone(player);
  }
  if (action === 'recordMatchResult' || action === 'recordRadiantWin') {
    const winnerSide = action === 'recordRadiantWin' ? 'radiant' : payload.winnerSide;
    const hasActualLineup = Array.isArray(payload.radiantPlayerIds) && payload.radiantPlayerIds.length
      && Array.isArray(payload.direPlayerIds) && payload.direPlayerIds.length;
    const actualLineup = hasActualLineup
      ? resolveActualLineup(localPlayers, payload.radiantPlayerIds, payload.direPlayerIds)
      : null;
    const match = buildManualMatchRecord(localRoom, winnerSide, Date.now(), actualLineup);
    match.title = '\u79d8\u9a6c\u65e5\u8d5b ' + (localMatches.length + 1);
    localMatches = [match].concat(localMatches);
    return match;
  }
  if (action === 'voteHonor') {
    localRoom = voteHonor(localRoom, payload.honorType, bootstrap.currentPlayer.id, payload.playerId, localPlayers);
    return clone(localRoom);
  }
  if (action === 'markPigeons') {
    const selected = uniqueIds(payload.pigeonIds || []);
    if (!selected.length) {
      throw new Error('\u8bf7\u5148\u9009\u62e9\u8981\u8bb0\u5f55\u7684\u9e3d\u5b50');
    }
    localPlayers = applyPigeonMarks(localPlayers, selected);
    return { pigeonIds: selected };
  }
  if (action === 'deleteMatchRecord') {
    const matchId = normalizeMatchRecordId(payload.matchId);
    const match = localMatches.find((item) => item.id === matchId);
    localPlayers = rollbackMatchStats(localPlayers, match);
    localMatches = removeMatchById(localMatches, matchId);
    return { matchId };
  }
  if (action === 'previewImportedMatch' || action === 'confirmImportedMatch') {
    throw new Error('\u672c\u5730\u9884\u89c8\u4e0d\u652f\u6301\u62c9\u53d6 Dota \u6bd4\u8d5b\uff0c\u8bf7\u542f\u7528\u4e91\u5f00\u53d1');
  }
  throw new Error('Unknown local action: ' + action);
}

module.exports = {
  getBootstrap,
  saveCurrentProfile,
  joinTodayRoom,
  leaveTodayRoom,
  resetTodayRoomSignups,
  adminRemoveTodaySignup,
  saveTodayRoom,
  updateTodayRoomStartTime,
  adminUpdatePlayerScore,
  adminSwapTeamPlayers,
  adminSaveNextRound,
  resetAllCompetitionData,
  adminCreateTemporaryPlayer,
  recordMatchResult,
  recordRadiantWin,
  voteTodayHonor,
  markTodayPigeons,
  deleteMatchRecord,
  previewImportedMatch,
  confirmImportedMatch,
  uploadAvatar,
  uploadAvatarWithSrc,
  getAvatarSrc,
  withAvatarSrc,
  cleanCloudErrorMessage,
  clearCache,
  canUseCloud
};

