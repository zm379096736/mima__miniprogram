const {
  getBootstrap,
  joinTodayRoom,
  leaveTodayRoom,
  resetTodayRoomSignups,
  saveTodayRoom,
  markTodayPigeons
} = require('../../utils/cloudStore');
const { buildBalancedTeams, getBalanceReadiness } = require('../../utils/teamBalancer');
const { isSignedUp, getSignupState } = require('../../utils/roomSignup');
const { updateRoomStartTime } = require('../../utils/roomTime');
const { isAdminOpenid } = require('../../utils/adminRoom');
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
    isAdmin: false,
    room: {},
    startTime: '21:30',
    signups: [],
    waitlist: [],
    pigeonCandidates: [],
    selectedPigeonIds: [],
    teams: null,
    scoreGap: 0,
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
      const teams = data.room.teams ? {
        radiant: decorateTeam(data.room.teams.radiant),
        dire: decorateTeam(data.room.teams.dire),
        scoreGap: data.room.teams.scoreGap
      } : null;

      this.setData({
        currentPlayer: data.currentPlayer,
        isAdmin: resolveAdmin(data),
        room: data.room,
        startTime: data.room.startTime || '21:30',
        signups,
        waitlist,
        pigeonCandidates: signups.concat(waitlist),
        selectedPigeonIds: [],
        teams,
        scoreGap: teams ? teams.scoreGap : 0,
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
    try {
      const nextRoom = updateRoomStartTime(this.data.room, event.detail.value);
      await saveTodayRoom(nextRoom);
      this.setData({
        room: nextRoom,
        startTime: nextRoom.startTime
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
          content: '保存选手名、积分和偏好位置后才能报名。头像可以使用默认头像。',
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

  onPigeonChange(event) {
    this.setData({ selectedPigeonIds: event.detail.value || [] });
  },

  async markPigeons() {
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
      await saveTodayRoom({ ...data.room, teams: cleanForSave, status: '已分队' });
      this.setData({ teams: decorated, scoreGap: teams.scoreGap });
      wx.showToast({ title: '分队完成', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    }
  }
});
