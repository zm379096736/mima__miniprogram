const {
  getBootstrap,
  joinTodayRoom,
  leaveTodayRoom,
  resetTodayRoomSignups,
  adminRemoveTodaySignup,
  adminUpdatePlayerScore,
  adminSwapTeamPlayers,
  adminSaveNextRound,
  resetAllCompetitionData,
  saveTodayRoom,
  updateTodayRoomStartTime,
  markTodayPigeons
} = require('../../utils/cloudStore');
const { buildBalancedTeams, getBalanceReadiness } = require('../../utils/teamBalancer');
const { isSignedUp, getSignupState } = require('../../utils/roomSignup');
const { normalizeRoomStartTime } = require('../../utils/roomTime');
const { normalizeScore } = require('../../utils/playerProfile');
const { isAdminOpenid } = require('../../utils/adminRoom');
const { selectNextRound } = require('../../utils/roundRotation');
const { adminOpenids } = require('../../utils/config');

function withPositionText(player) {
  return {
    ...player,
    avatarSrc: player.avatarSrc || '/images/tab.png',
    positionText: (player.preferredPositions || []).map((position) => `${position}号位`).join(' / '),
    pigeon: Number(player.pigeon || 0)
  };
}

function decorateTeam(team) {
  return {
    ...team,
    players: team.players.map(withPositionText)
  };
}

function cleanTeamForSave(team) {
  return {
    ...team,
    players: team.players.map((player) => {
      const clean = { ...player };
      delete clean.avatarSrc;
      delete clean.positionText;
      return clean;
    })
  };
}

function playerListFromIds(ids, players) {
  return (ids || []).map((id) => players.find((player) => player.id === id)).filter(Boolean).map(withPositionText);
}

function resolveAdmin(data) {
  const openid = data.openid || (data.currentPlayer && (data.currentPlayer.openid || data.currentPlayer.id));
  return Boolean(data.isAdmin || (data.currentPlayer && data.currentPlayer.isAdmin) || isAdminOpenid(openid, adminOpenids));
}

Page({
  data: {
    currentPlayer: {},
    currentOpenid: '',
    isAdmin: false,
    room: {},
    startTime: '21:30',
    signups: [],
    waitlist: [],
    adminPlayers: [],
    adminPlayerNames: [],
    adminPlayerIndex: 0,
    adminPlayerId: '',
    adminScore: '',
    pigeonCandidates: [],
    selectedPigeonIds: [],
    selectedRadiantPlayerId: '',
    selectedRadiantPlayerName: '',
    selectedDirePlayerId: '',
    selectedDirePlayerName: '',
    teams: null,
    scoreGap: 0,
    roundNumber: 0,
    rotationQueueIds: [],
    rotationQueuePlayers: [],
    canBalance: false,
    balanceTip: '还差 10 位选手才能自动分队',
    signedUp: false,
    signupState: 'none',
    signupText: '未报名',
    signupBadgeClass: 'badge'
  },

  async onShow() {
    await this.loadRoom();
  },

  async loadRoom() {
    try {
      const data = await getBootstrap(true);
      const signups = playerListFromIds(data.room.signups || [], data.players);
      const waitlist = playerListFromIds(data.room.waitlist || [], data.players);
      const signupState = getSignupState(data.room, data.currentPlayer.id);
      const signedUp = isSignedUp(data.room, data.currentPlayer.id);
      const readiness = getBalanceReadiness(signups);
      const adminPlayers = (data.players || []).map(withPositionText).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
      const selectedAdminIndex = Math.max(0, adminPlayers.findIndex((player) => player.id === this.data.adminPlayerId));
      const selectedAdminPlayer = adminPlayers[selectedAdminIndex] || null;
      const teams = data.room.teams ? {
        radiant: decorateTeam(data.room.teams.radiant),
        dire: decorateTeam(data.room.teams.dire),
        scoreGap: data.room.teams.scoreGap
      } : null;
      const currentRosterIds = teams
        ? teams.radiant.players.concat(teams.dire.players).map((player) => player.id)
        : [];
      const currentRosterSet = new Set(currentRosterIds);
      const registeredIds = [...(data.room.signups || []), ...(data.room.waitlist || [])];
      const storedQueue = (data.room.rotationQueue || []).filter((playerId) => (
        registeredIds.includes(playerId) && !currentRosterSet.has(playerId)
      ));
      const storedQueueSet = new Set(storedQueue);
      const rotationQueueIds = storedQueue.concat(
        registeredIds.filter((playerId) => !currentRosterSet.has(playerId) && !storedQueueSet.has(playerId))
      );
      const rotationQueuePlayers = playerListFromIds(rotationQueueIds, data.players);

      this.setData({
        currentPlayer: data.currentPlayer,
        currentOpenid: data.openid || data.currentPlayer.openid || data.currentPlayer.id || '',
        isAdmin: resolveAdmin(data),
        room: data.room,
        startTime: data.room.startTime || '21:30',
        signups,
        waitlist,
        adminPlayers,
        adminPlayerNames: adminPlayers.map((player) => `${player.name}（${player.score}分）`),
        adminPlayerIndex: selectedAdminIndex,
        adminPlayerId: selectedAdminPlayer ? selectedAdminPlayer.id : '',
        adminScore: selectedAdminPlayer ? String(selectedAdminPlayer.score) : '',
        pigeonCandidates: signups.concat(waitlist),
        selectedPigeonIds: [],
        selectedRadiantPlayerId: '',
        selectedRadiantPlayerName: '',
        selectedDirePlayerId: '',
        selectedDirePlayerName: '',
        teams,
        scoreGap: teams ? teams.scoreGap : 0,
        roundNumber: Number(data.room.roundNumber || (teams ? 1 : 0)),
        rotationQueueIds,
        rotationQueuePlayers,
        canBalance: readiness.canBalance,
        balanceTip: readiness.message,
        signedUp,
        signupState,
        signupText: signupState === 'signup' ? '已报名' : signupState === 'waitlist' ? '候补中' : '未报名',
        signupBadgeClass: signupState === 'signup' ? 'badge blue' : signupState === 'waitlist' ? 'badge' : 'badge'
      });
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    }
  },

  async onStartTimeChange(event) {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '只有管理员可以修改开 C 时间', icon: 'none' });
      return;
    }
    try {
      const startTime = normalizeRoomStartTime(event.detail.value);
      const nextRoom = await updateTodayRoomStartTime(startTime);
      this.setData({
        room: nextRoom,
        startTime
      });
      wx.showToast({ title: '开 C 时间已更新', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    }
  },

  async joinTodayRoom() {
    try {
      if (!this.data.currentPlayer.profileCompleted) {
        wx.showModal({
          title: '先创建选手卡',
          content: '保存选手名、自评分和偏好位置后才能报名。头像可以使用默认头像。',
          confirmText: '去创建',
          success: (result) => {
            if (result.confirm) {
              wx.switchTab({ url: '/pages/profile/profile' });
            }
          }
        });
        return;
      }
      const room = await joinTodayRoom();
      await this.loadRoom();
      const state = getSignupState(room, this.data.currentPlayer.id);
      wx.showToast({ title: state === 'waitlist' ? '已加入候补' : '报名成功', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    }
  },

  async leaveTodayRoom() {
    try {
      await leaveTodayRoom();
      await this.loadRoom();
      wx.showToast({ title: '已取消报名', icon: 'none' });
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    }
  },

  async resetSignups() {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '只有管理员可以操作', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '重开报名',
      content: '确定清空正式报名、候补名单和当前分队，重新开始新一轮报名吗？',
      confirmText: '清空',
      confirmColor: '#e63946',
      success: async (result) => {
        if (!result.confirm) {
          return;
        }
        try {
          await resetTodayRoomSignups();
          await this.loadRoom();
          wx.showToast({ title: '已重开报名', icon: 'success' });
        } catch (error) {
          wx.showToast({ title: error.message, icon: 'none' });
        }
      }
    });
  },

  onAdminPlayerChange(event) {
    const index = Number(event.detail.value);
    const player = this.data.adminPlayers[index];
    if (!player) {
      return;
    }
    this.setData({
      adminPlayerIndex: index,
      adminPlayerId: player.id,
      adminScore: String(player.score)
    });
  },

  onAdminScoreInput(event) {
    this.setData({ adminScore: event.detail.value });
  },

  async saveAdminPlayerScore() {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '只有管理员可以修改选手自评分', icon: 'none' });
      return;
    }
    try {
      const score = normalizeScore(this.data.adminScore);
      await adminUpdatePlayerScore(this.data.adminPlayerId, score);
      await this.loadRoom();
      wx.showToast({ title: '选手自评分已更新', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    }
  },

  resetCompetitionData() {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '只有管理员可以重置比赛数据', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '重置全部比赛数据',
      content: '将清空所有历史战绩，并把全部选手的积分、场次、胜场、MVP和大触归零。选手资料、报名和鸽子次数会保留。此操作无法撤销。',
      confirmText: '重置',
      confirmColor: '#e63946',
      success: async (result) => {
        if (!result.confirm) {
          return;
        }
        try {
          wx.showLoading({ title: '重置中' });
          await resetAllCompetitionData();
          wx.hideLoading();
          await this.loadRoom();
          wx.showToast({ title: '比赛数据已重置', icon: 'success' });
        } catch (error) {
          wx.hideLoading();
          wx.showModal({
            title: '重置失败',
            content: error.message,
            showCancel: false
          });
        }
      }
    });
  },

  adminRemoveSignup(event) {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '只有管理员可以操作', icon: 'none' });
      return;
    }
    const playerId = event.currentTarget.dataset.playerId;
    const playerName = event.currentTarget.dataset.playerName || '这位选手';
    wx.showModal({
      title: '取消选手报名',
      content: `确定移除“${playerName}”吗？如果移除正式选手，候补第 1 位会自动递补。`,
      confirmText: '移除',
      confirmColor: '#e63946',
      success: async (result) => {
        if (!result.confirm) {
          return;
        }
        try {
          await adminRemoveTodaySignup(playerId);
          await this.loadRoom();
          wx.showToast({ title: '已取消报名', icon: 'success' });
        } catch (error) {
          wx.showToast({ title: error.message, icon: 'none' });
        }
      }
    });
  },

  onPigeonChange(event) {
    this.setData({ selectedPigeonIds: event.detail.value || [] });
  },

  async markPigeons() {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '只有管理员可以操作', icon: 'none' });
      return;
    }
    if (!this.data.selectedPigeonIds.length) {
      wx.showToast({ title: '先选择鸽子选手', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '记录鸽子次数',
      content: `确定给 ${this.data.selectedPigeonIds.length} 位选手鸽子次数 +1 吗？`,
      success: async (result) => {
        if (!result.confirm) {
          return;
        }
        try {
          await markTodayPigeons(this.data.selectedPigeonIds);
          await this.loadRoom();
          wx.showToast({ title: '已记录鸽子', icon: 'success' });
        } catch (error) {
          wx.showToast({ title: error.message, icon: 'none' });
        }
      }
    });
  },

  selectRadiantPlayer(event) {
    if (!this.data.isAdmin) {
      return;
    }
    this.setData({
      selectedRadiantPlayerId: event.currentTarget.dataset.playerId,
      selectedRadiantPlayerName: event.currentTarget.dataset.playerName
    });
  },

  selectDirePlayer(event) {
    if (!this.data.isAdmin) {
      return;
    }
    this.setData({
      selectedDirePlayerId: event.currentTarget.dataset.playerId,
      selectedDirePlayerName: event.currentTarget.dataset.playerName
    });
  },

  async swapSelectedPlayers() {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '只有管理员可以调整队伍', icon: 'none' });
      return;
    }
    const radiantId = this.data.selectedRadiantPlayerId;
    const direId = this.data.selectedDirePlayerId;
    if (!radiantId || !direId) {
      wx.showToast({ title: '请从两队各选择一名选手', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '交换选手',
      content: `确定交换天辉“${this.data.selectedRadiantPlayerName}”和夜魇“${this.data.selectedDirePlayerName}”吗？`,
      success: async (result) => {
        if (!result.confirm) {
          return;
        }
        try {
          await adminSwapTeamPlayers(radiantId, direId);
          await this.loadRoom();
          wx.showToast({ title: '队伍已调整', icon: 'success' });
        } catch (error) {
          wx.showToast({ title: error.message, icon: 'none' });
        }
      }
    });
  },

  generateNextRound() {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '只有管理员可以生成下一把', icon: 'none' });
      return;
    }
    if (!this.data.teams) {
      wx.showToast({ title: '请先完成第一把分队', icon: 'none' });
      return;
    }
    const registeredPlayers = this.data.signups.concat(this.data.waitlist);
    const registeredIds = registeredPlayers.map((player) => player.id);
    const currentRosterIds = this.data.teams.radiant.players
      .concat(this.data.teams.dire.players)
      .map((player) => player.id);
    let rotation = null;
    try {
      rotation = selectNextRound({
        registeredIds,
        currentRosterIds,
        rotationQueue: this.data.rotationQueueIds,
        random: Math.random
      });
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
      return;
    }
    const playerById = {};
    registeredPlayers.forEach((player) => {
      playerById[player.id] = player;
    });
    const nextPlayers = rotation.rosterIds.map((playerId) => playerById[playerId]).filter(Boolean);
    const nextRoundNumber = Number(this.data.roundNumber || 1) + 1;

    wx.showModal({
      title: `生成第 ${nextRoundNumber} 把`,
      content: `优先安排 ${Math.min(this.data.rotationQueueIds.length, 10)} 位轮换选手，剩余名额随机补齐并自动分队。`,
      success: async (result) => {
        if (!result.confirm) {
          return;
        }
        try {
          const teams = buildBalancedTeams(nextPlayers);
          const cleanForSave = {
            radiant: cleanTeamForSave(teams.radiant),
            dire: cleanTeamForSave(teams.dire),
            scoreGap: teams.scoreGap
          };
          await adminSaveNextRound(cleanForSave, rotation.nextQueue);
          await this.loadRoom();
          wx.showToast({ title: `第 ${nextRoundNumber} 把已生成`, icon: 'success' });
        } catch (error) {
          wx.showToast({ title: error.message, icon: 'none' });
        }
      }
    });
  },

  async autoBalance() {
    try {
      const readiness = getBalanceReadiness(this.data.signups);
      if (!readiness.canBalance) {
        wx.showModal({
          title: '暂时不能分队',
          content: readiness.message,
          showCancel: false
        });
        return;
      }
      const teams = buildBalancedTeams(this.data.signups);
      const decorated = {
        radiant: decorateTeam(teams.radiant),
        dire: decorateTeam(teams.dire),
        scoreGap: teams.scoreGap
      };
      const cleanForSave = {
        radiant: cleanTeamForSave(teams.radiant),
        dire: cleanTeamForSave(teams.dire),
        scoreGap: teams.scoreGap
      };
      const data = await getBootstrap();
      const currentRosterIds = cleanForSave.radiant.players.concat(cleanForSave.dire.players).map((player) => player.id);
      const currentRosterSet = new Set(currentRosterIds);
      const registeredIds = [...(data.room.signups || []), ...(data.room.waitlist || [])];
      await saveTodayRoom({
        ...data.room,
        teams: cleanForSave,
        roundNumber: Number(data.room.roundNumber || 1),
        rotationQueue: registeredIds.filter((playerId) => !currentRosterSet.has(playerId)),
        status: '\u7b2c 1 \u628a\u5df2\u5206\u961f'
      });
      this.setData({ teams: decorated, scoreGap: teams.scoreGap });
      wx.showToast({ title: '分队完成', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    }
  }
});
