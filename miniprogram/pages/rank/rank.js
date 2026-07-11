const { getPlayers } = require('../../utils/storage');
const { positionText } = require('../../utils/playerProfile');

Page({
  data: {
    podium: [],
    players: []
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
      podium: players.slice(0, 3),
      players
    });
  }
});
