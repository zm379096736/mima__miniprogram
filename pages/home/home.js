const { getBootstrap } = require('../../utils/cloudStore');
const { positionText } = require('../../utils/playerProfile');
const { normalizeHonors } = require('../../utils/honorVote');

Page({
  data: {
    room: { signups: [], waitlist: [] },
    waitlistCount: 0,
    leader: {},
    leaderName: '暂无',
    honors: { mvp: null, touch: null },
    mvpText: '待投票',
    touchText: '待投票',
    topPlayers: []
  },

  async onShow() {
    await this.loadHome();
  },

  async loadHome() {
    try {
      const data = await getBootstrap(true);
      const players = data.players
        .filter((player) => player.profileCompleted)
        .map((player) => ({
          ...player,
          positionText: positionText(player.preferredPositions || [1]),
          avatarSrc: player.avatarSrc || '/images/tab.png',
          winRate: player.matches ? Math.round((player.wins / player.matches) * 100) : 0
        }))
        .sort((a, b) => b.score - a.score);
      const honors = normalizeHonors(data.room.honors);

      this.setData({
        room: data.room,
        waitlistCount: (data.room.waitlist || []).length,
        leader: players[0] || {},
        leaderName: players[0] ? players[0].name : '暂无',
        honors,
        mvpText: honors.mvp ? `${honors.mvp.name}（${honors.mvp.votes}票）` : '待投票',
        touchText: honors.touch ? `${honors.touch.name}（${honors.touch.votes}票）` : '待投票',
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
