const { getBootstrap } = require('../../utils/cloudStore');
const { positionText } = require('../../utils/playerProfile');
const { sortPlayersByScore } = require('../../utils/playerRanking');

Page({
  data: {
    podium: [],
    scoreRows: [],
    pigeonBoard: [],
    players: []
  },

  async onShow() {
    try {
      const data = await getBootstrap(true);
      const players = sortPlayersByScore(data.players
        .filter((player) => player.profileCompleted)
        .map((player) => ({
          ...player,
          mvp: Number(player.mvp || 0),
          touch: Number(player.touch || 0),
          pigeon: Number(player.pigeon || 0),
          positionText: positionText(player.preferredPositions || [1]),
          avatarSrc: player.avatarSrc || '/images/tab.png',
          losses: Math.max(0, Number(player.matches || 0) - Number(player.wins || 0)),
          winRate: player.matches ? Math.round((player.wins / player.matches) * 100) : 0
        })));
      this.setData({
        podium: players.slice(0, 3),
        scoreRows: players,
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

