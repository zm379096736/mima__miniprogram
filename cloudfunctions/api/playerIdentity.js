const { normalizeSteamIds, steamIdsForPlayer } = require('./temporaryPlayer');

const STEAM64_OFFSET = 76561197960265728n;
const MAX_ACCOUNT_ID = 4294967295n;
const COUNTER_FIELDS = ['points', 'matches', 'wins', 'mvp', 'touch', 'pigeon', 'pressure'];

function canonicalAccountId(value) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  if (!/^\d+$/.test(text)) return '';
  try {
    const raw = BigInt(text);
    if (raw <= MAX_ACCOUNT_ID) return String(raw);
    const accountId = raw - STEAM64_OFFSET;
    return accountId >= 0n && accountId <= MAX_ACCOUNT_ID ? String(accountId) : '';
  } catch (error) {
    return '';
  }
}

function unique(values) {
  return (values || []).filter((value, index, list) => value && list.indexOf(value) === index);
}

function canonicalIdsForPlayer(player) {
  return unique(steamIdsForPlayer(player).map(canonicalAccountId));
}

function approvalKey(temporaryPlayerId, targetPlayerId) {
  return `${String(temporaryPlayerId || '')}->${String(targetPlayerId || '')}`;
}

function importedRows(preview) {
  return (Array.isArray(preview && preview.radiant) ? preview.radiant : [])
    .concat(Array.isArray(preview && preview.dire) ? preview.dire : []);
}

function buildSteamBindingPlan(preview, players, approvals = []) {
  const playerList = Array.isArray(players) ? players : [];
  const playerById = {};
  const ownersByAccountId = {};
  playerList.forEach((player) => {
    const id = String(player && player.id || '').trim();
    if (!id) return;
    playerById[id] = player;
    canonicalIdsForPlayer(player).forEach((accountId) => {
      ownersByAccountId[accountId] = (ownersByAccountId[accountId] || []).concat(player);
    });
  });

  const approved = new Set((approvals || []).map((item) => (
    approvalKey(item && item.temporaryPlayerId, item && item.targetPlayerId)
  )));
  const bindingsByPlayer = {};
  const mergesByKey = {};

  importedRows(preview).forEach((row) => {
    const accountId = canonicalAccountId(row && row.accountId);
    const targetPlayerId = String(row && row.playerId || '').trim();
    if (!accountId || !targetPlayerId) return;
    const target = playerById[targetPlayerId];
    if (!target) throw new Error('关联的选手卡不存在');

    const owners = ownersByAccountId[accountId] || [];
    if (owners.some((owner) => owner.id === targetPlayerId)) return;
    const permanentOwner = owners.find((owner) => !owner.temporary);
    if (permanentOwner) {
      throw new Error(`Steam ID ${accountId} 已绑定正式选手“${permanentOwner.name || permanentOwner.id}”，请先解除后再操作`);
    }
    if (owners.length) {
      const temporaryOwner = owners[0];
      if (owners.length > 1 || !temporaryOwner.temporary || temporaryOwner.openid) {
        throw new Error(`Steam ID ${accountId} 的临时选手归属异常，请管理员检查`);
      }
      if (target.temporary) {
        throw new Error(`Steam ID ${accountId} 已绑定其他临时选手，请先合并到正式选手`);
      }
      const key = approvalKey(temporaryOwner.id, targetPlayerId);
      const merge = mergesByKey[key] || {
        temporaryPlayerId: temporaryOwner.id,
        temporaryName: temporaryOwner.name || temporaryOwner.id,
        targetPlayerId,
        targetName: target.name || targetPlayerId,
        accountIds: []
      };
      merge.accountIds = unique(merge.accountIds.concat(accountId));
      mergesByKey[key] = merge;
      return;
    }
    bindingsByPlayer[targetPlayerId] = unique((bindingsByPlayer[targetPlayerId] || []).concat(accountId));
  });

  const merges = Object.values(mergesByKey);
  const pendingMergeKeys = merges
    .map((merge) => approvalKey(merge.temporaryPlayerId, merge.targetPlayerId))
    .filter((key) => !approved.has(key));
  return {
    status: pendingMergeKeys.length ? 'merge_required' : 'ready',
    bindings: Object.keys(bindingsByPlayer).map((playerId) => ({
      playerId,
      accountIds: bindingsByPlayer[playerId]
    })),
    merges
  };
}

function mergeSteamIds(target, temporary) {
  const output = [];
  const seen = new Set();
  steamIdsForPlayer(target).concat(steamIdsForPlayer(temporary)).forEach((steamId) => {
    const canonical = canonicalAccountId(steamId) || steamId;
    if (seen.has(canonical)) return;
    seen.add(canonical);
    output.push(steamId);
  });
  return normalizeSteamIds(output);
}

function mergePlayerData(temporary, target) {
  const steamIds = mergeSteamIds(target, temporary);
  const merged = {
    ...target,
    steamIds,
    steamId: steamIds.join(', '),
    temporary: false
  };
  COUNTER_FIELDS.forEach((field) => {
    merged[field] = Number(target && target[field] || 0) + Number(temporary && temporary[field] || 0);
  });
  return merged;
}

function replaceId(value, fromId, toId) {
  return String(value || '') === fromId ? toId : value;
}

function replaceArray(values, fromId, toId) {
  return unique((Array.isArray(values) ? values : []).map((value) => replaceId(value, fromId, toId)));
}

function replacePlayerIdInMatch(match, fromValue, toValue) {
  const fromId = String(fromValue || '');
  const toId = String(toValue || '');
  const replaceRows = (rows) => (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    playerId: replaceId(row && row.playerId, fromId, toId)
  }));
  return {
    ...match,
    participantIds: replaceArray(match && match.participantIds, fromId, toId),
    winnerIds: replaceArray(match && match.winnerIds, fromId, toId),
    plannedParticipantIds: replaceArray(match && match.plannedParticipantIds, fromId, toId),
    radiant: replaceRows(match && match.radiant),
    dire: replaceRows(match && match.dire),
    mvpId: replaceId(match && match.mvpId, fromId, toId),
    pressureId: replaceId(match && match.pressureId, fromId, toId)
  };
}

function replaceVotes(votes, fromId, toId) {
  const output = {};
  Object.entries(votes || {}).forEach(([voterId, playerId]) => {
    output[replaceId(voterId, fromId, toId)] = replaceId(playerId, fromId, toId);
  });
  return output;
}

function replacePlayerIdInRoom(room, fromValue, toValue) {
  const fromId = String(fromValue || '');
  const toId = String(toValue || '');
  const replaceTeam = (team) => team ? {
    ...team,
    players: (team.players || []).map((player) => ({
      ...player,
      id: replaceId(player && player.id, fromId, toId),
      playerId: replaceId(player && player.playerId, fromId, toId)
    }))
  } : team;
  const replaceHonor = (honor) => honor ? {
    ...honor,
    playerId: replaceId(honor.playerId, fromId, toId)
  } : honor;
  return {
    ...room,
    signups: replaceArray(room && room.signups, fromId, toId),
    waitlist: replaceArray(room && room.waitlist, fromId, toId),
    rotationQueue: replaceArray(room && room.rotationQueue, fromId, toId),
    teams: room && room.teams ? {
      ...room.teams,
      radiant: replaceTeam(room.teams.radiant),
      dire: replaceTeam(room.teams.dire)
    } : room && room.teams,
    votes: room && room.votes ? {
      ...room.votes,
      mvp: replaceVotes(room.votes.mvp, fromId, toId),
      touch: replaceVotes(room.votes.touch, fromId, toId)
    } : room && room.votes,
    honors: room && room.honors ? {
      ...room.honors,
      mvp: replaceHonor(room.honors.mvp),
      touch: replaceHonor(room.honors.touch)
    } : room && room.honors
  };
}

function matchIds(match) {
  return unique((match && match.participantIds || [])
    .concat((match && match.radiant || []).map((row) => row && row.playerId))
    .concat((match && match.dire || []).map((row) => row && row.playerId)));
}

function teamIds(room) {
  if (!room || !room.teams) return [];
  return (room.teams.radiant && room.teams.radiant.players || [])
    .concat(room.teams.dire && room.teams.dire.players || [])
    .map((player) => String(player && (player.id || player.playerId) || ''));
}

function assertMergeHasNoCollision(matches, room, fromValue, toValue) {
  const fromId = String(fromValue || '');
  const toId = String(toValue || '');
  const conflictingMatch = (matches || []).find((match) => {
    const ids = matchIds(match);
    return ids.includes(fromId) && ids.includes(toId);
  });
  if (conflictingMatch) {
    throw new Error(`临时选手和正式选手出现在同一场历史比赛 ${conflictingMatch.matchId || conflictingMatch.id || ''}，请管理员检查`);
  }
  const activeIds = teamIds(room);
  if (activeIds.includes(fromId) && activeIds.includes(toId)) {
    throw new Error('临时选手和正式选手同时出现在当前分队，请管理员先调整阵容');
  }
}

module.exports = {
  canonicalAccountId,
  buildSteamBindingPlan,
  mergePlayerData,
  replacePlayerIdInMatch,
  replacePlayerIdInRoom,
  assertMergeHasNoCollision
};
