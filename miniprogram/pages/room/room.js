const { getPlayers, getRoom, saveRoom } = require('../../utils/storage');
const { buildBalancedTeams } = require('../../utils/teamBalancer');
const { joinRoom, leaveRoom, isSignedUp } = require('../../utils/roomSignup');

const CURRENT_PLAYER_ID = 'p1';

function withPositionText(player) {
  return {
    ...player,
    positionText: (player.preferredPositions || []).map((position) => `${position}号位`).join(' / ')
  };
}

function decorateTeam(team) {
  return {
    ...team,
    players: team.players.map(withPositionText)
  };
}

Page({
  data: {
    signups: [],
    teams: null,
    scoreGap: 0,
    signedUp: false,
    signupText: '未报名'
  },

  onShow() {
    this.loadRoom();
  },

  loadRoom() {
    const players = getPlayers();
    const room = getRoom();
    const signups = room.signups.map((id) => players.find((player) => player.id === id)).filter(Boolean);
    const signedUp = isSignedUp(room, CURRENT_PLAYER_ID);
    this.setData({
      signups: signups.map(withPositionText),
      teams: room.teams || null,
      scoreGap: room.teams ? room.teams.scoreGap : 0,
      signedUp,
      signupText: signedUp ? '已报名' : '未报名'
    });
  },

  joinTodayRoom() {
    try {
      saveRoom(joinRoom(getRoom(), CURRENT_PLAYER_ID));
      this.loadRoom();
      wx.showToast({ title: '报名成功', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    }
  },

  leaveTodayRoom() {
    saveRoom(leaveRoom(getRoom(), CURRENT_PLAYER_ID));
    this.loadRoom();
    wx.showToast({ title: '已取消报名', icon: 'none' });
  },

  autoBalance() {
    try {
      const teams = buildBalancedTeams(this.data.signups);
      const decorated = {
        radiant: decorateTeam(teams.radiant),
        dire: decorateTeam(teams.dire),
        scoreGap: teams.scoreGap
      };
      const room = getRoom();
      saveRoom({ ...room, teams: decorated, status: '已分队' });
      this.setData({ teams: decorated, scoreGap: teams.scoreGap });
      wx.showToast({ title: '分队完成', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    }
  }
});
