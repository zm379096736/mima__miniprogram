const { getBootstrap } = require('../../utils/cloudStore');
const { positionText } = require('../../utils/playerProfile');

Page({
  data: {
    podium: [],
    pigeonBoard: [],
    players: []
  },

  async onShow() {
    try {
      const data = await getBootstrap(true);
      const players = data.players
        .filter((player) => player.profileCompleted)
        .map((player) => ({
          ...player,
          mvp: Number(player.mvp || 0),
          touch: Number(player.touch || 0),
          pigeon: Number(player.pigeon || 0),
          positionText: positionText(player.preferredPositions || [1]),
          avatarSrc: player.avatarSrc || '/images/tab.png',
          winRate: player.matches ? Math.round((player.wins / player.matches) * 100) : 0
        }))
        .sort((a, b) => b.score - a.score);
      this.setData({
        podium: players.slice(0, 3),
        pigeonBoard: players
          .filter((player) => Number(player.pigeon || 0) > 0)
          .sort((a, b) => Number(b.pigeon || 0) - Number(a.pigeon || 0) || b.score - a.score)
          .slice(0, 5),
        players
      });
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    }
  }
});

