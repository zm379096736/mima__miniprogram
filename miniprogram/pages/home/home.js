const { getPlayers, getRoom } = require('../../utils/storage');
const { positionText } = require('../../utils/playerProfile');

Page({
  data: {
    room: { signups: [] },
    leader: {},
    topPlayers: []
  },

  onShow() {
    const players = getPlayers()
      .map((player) => ({
        ...player,
        positionText: positionText(player.preferredPositions || [1]),
        winRate: player.matches ? Math.round((player.wins / player.matches) * 100) : 0
      }))
      .sort((a, b) => b.score - a.score);

    this.setData({
      room: getRoom(),
      leader: players[0] || {},
      topPlayers: players.slice(0, 3)
    });
  },

  goRoom() {
    wx.switchTab({ url: '/pages/room/room' });
  }
});
