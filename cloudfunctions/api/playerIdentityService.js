const { normalizeSteamIds, steamIdsForPlayer } = require('./temporaryPlayer');
const {
  canonicalAccountId,
  buildSteamBindingPlan,
  mergePlayerData,
  replacePlayerIdInMatch,
  replacePlayerIdInRoom,
  assertMergeHasNoCollision
} = require('./playerIdentity');

async function readCollection(writer, name) {
  const result = await writer.collection(name).limit(100).get();
  return result && Array.isArray(result.data) ? result.data : [];
}

function documentData(value) {
  const output = { ...(value || {}) };
  delete output._id;
  return output;
}

function changed(left, right) {
  return JSON.stringify(left) !== JSON.stringify(right);
}

function mergeIds(existing, additions) {
  const output = [];
  const seen = new Set();
  steamIdsForPlayer({ steamIds: existing }).concat(normalizeSteamIds(additions)).forEach((value) => {
    const key = canonicalAccountId(value) || value;
    if (seen.has(key)) return;
    seen.add(key);
    output.push(value);
  });
  return output;
}

function createPlayerIdentityService({ db }) {
  if (!db) throw new Error('Player identity service requires a database');

  async function getPlayers(writer = db) {
    return readCollection(writer, 'players');
  }

  async function preflightPreview(preview, approvals = []) {
    return buildSteamBindingPlan(preview, await getPlayers(), approvals);
  }

  async function applyPreviewIdentity(writer, preview, approvals = []) {
    let players = await getPlayers(writer);
    const matches = await readCollection(writer, 'matches');
    const rooms = await readCollection(writer, 'rooms');
    let room = rooms.find((item) => item.id === 'today') || rooms[0] || null;
    const plan = buildSteamBindingPlan(preview, players, approvals);
    if (plan.status === 'merge_required') {
      throw new Error('临时选手合并需要管理员确认');
    }

    for (const merge of plan.merges) {
      const temporary = players.find((player) => player.id === merge.temporaryPlayerId);
      const target = players.find((player) => player.id === merge.targetPlayerId);
      if (!temporary) continue;
      if (!target || !temporary.temporary || temporary.openid || target.temporary) {
        throw new Error('临时选手合并状态已变化，请刷新后重试');
      }
      assertMergeHasNoCollision(matches, room, temporary.id, target.id);

      for (let index = 0; index < matches.length; index += 1) {
        const original = matches[index];
        const migrated = replacePlayerIdInMatch(original, temporary.id, target.id);
        if (!changed(original, migrated)) continue;
        await writer.collection('matches').doc(original._id).update({ data: documentData(migrated) });
        matches[index] = { ...original, ...migrated };
      }

      if (room) {
        const migratedRoom = replacePlayerIdInRoom(room, temporary.id, target.id);
        if (changed(room, migratedRoom)) {
          await writer.collection('rooms').doc(room._id).update({ data: documentData(migratedRoom) });
          room = { ...room, ...migratedRoom };
        }
      }

      const merged = {
        ...mergePlayerData(temporary, target),
        updatedAt: db.serverDate()
      };
      await writer.collection('players').doc(target._id).update({ data: documentData(merged) });
      await writer.collection('players').doc(temporary._id).remove();
      players = players
        .filter((player) => player.id !== temporary.id)
        .map((player) => player.id === target.id ? { ...player, ...merged } : player);
    }

    for (const binding of plan.bindings) {
      const target = players.find((player) => player.id === binding.playerId);
      if (!target) throw new Error('关联的选手卡不存在');
      const steamIds = mergeIds(steamIdsForPlayer(target), binding.accountIds);
      const data = {
        steamIds,
        steamId: steamIds.join(', '),
        updatedAt: db.serverDate()
      };
      await writer.collection('players').doc(target._id).update({ data });
      players = players.map((player) => player.id === target.id ? { ...player, ...data } : player);
    }
    return players;
  }

  async function updatePlayerSteamIds(targetPlayerId, requestedIds, approvals = []) {
    const targetId = String(targetPlayerId || '').trim();
    const players = await getPlayers();
    const target = players.find((player) => player.id === targetId);
    if (!target) throw new Error('没有找到选手卡');
    const requested = normalizeSteamIds(requestedIds);
    const rows = requested
      .map(canonicalAccountId)
      .filter(Boolean)
      .map((accountId) => ({ accountId, playerId: targetId }));
    const preview = { radiant: rows, dire: [] };
    const preflight = buildSteamBindingPlan(preview, players, approvals);
    if (preflight.status === 'merge_required') return preflight;

    const inherited = [];
    preflight.merges.forEach((merge) => {
      const temporary = players.find((player) => player.id === merge.temporaryPlayerId);
      inherited.push(...steamIdsForPlayer(temporary));
    });
    return db.runTransaction(async (transaction) => {
      const transactionPlayers = await applyPreviewIdentity(transaction, preview, approvals);
      const current = transactionPlayers.find((player) => player.id === targetId);
      if (!current) throw new Error('没有找到选手卡');
      const steamIds = mergeIds(requested, inherited);
      const data = {
        steamIds,
        steamId: steamIds.join(', '),
        updatedAt: db.serverDate()
      };
      await transaction.collection('players').doc(current._id).update({ data });
      return { status: 'updated', player: { ...current, ...data } };
    });
  }

  return {
    preflightPreview,
    applyPreviewIdentity,
    updatePlayerSteamIds
  };
}

module.exports = { createPlayerIdentityService };
