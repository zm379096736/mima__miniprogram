const { getBootstrap } = require('../../utils/cloudStore');
const { positionText } = require('../../utils/playerProfile');
const { sortPlayersByPoints } = require('../../utils/playerRanking');

Page({
  data: {
    room: { signups: [], waitlist: [] },
    waitlistCount: 0,
    leader: {},
    leaderName: '暂无',
    topPlayers: []
  },

  async onShow() {
    await this.loadHome();
  },

  async loadHome() {
    try {
      const data = await getBootstrap(true);
      const players = sortPlayersByPoints(data.players
        .filter((player) => player.profileCompleted)
        .map((player) => ({
          ...player,
          points: Number(player.points || 0),
          positionText: positionText(player.preferredPositions || [1]),
          avatarSrc: player.avatarSrc || '/images/tab.png',
          winRate: player.matches ? Math.round((player.wins / player.matches) * 100) : 0
        })));
      this.setData({
        room: data.room,
        waitlistCount: (data.room.waitlist || []).length,
        leader: players[0] || {},
        leaderName: players[0] ? players[0].name : '暂无',
        topPlayers: players.slice(0, 3)
      });
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    }
  },

  goRoom() {
    wx.switchTab({ url: '/pages/room/room' });
  }
});
