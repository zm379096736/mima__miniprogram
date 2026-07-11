const { getPlayers, savePlayers } = require('../../utils/storage');
const { updatePlayerProfile, positionText } = require('../../utils/playerProfile');

const CURRENT_PLAYER_ID = 'p1';

Page({
  data: {
    player: {},
    positionText: '',
    form: {
      score: '',
      steamId: '',
      preferredPositions: []
    },
    positions: []
  },

  onShow() {
    this.loadPlayer();
  },

  loadPlayer() {
    const players = getPlayers();
    const player = players.find((item) => item.id === CURRENT_PLAYER_ID) || players[0];
    const selected = player.preferredPositions || [];
    this.setData({
      player,
      positionText: positionText(selected),
      form: {
        score: String(player.score || 0),
        steamId: player.steamId || '',
        preferredPositions: selected.map(String)
      },
      positions: [1, 2, 3, 4, 5].map((value) => ({
        value: String(value),
        label: `${value}号位`,
        checked: selected.includes(value)
      }))
    });
  },

  onScoreInput(event) {
    this.setData({ 'form.score': event.detail.value });
  },

  onSteamInput(event) {
    this.setData({ 'form.steamId': event.detail.value });
  },

  onPositionChange(event) {
    const selected = event.detail.value;
    this.setData({
      'form.preferredPositions': selected,
      positions: this.data.positions.map((item) => ({
        ...item,
        checked: selected.includes(item.value)
      }))
    });
  },

  saveProfile() {
    try {
      const players = updatePlayerProfile(getPlayers(), this.data.player.id, this.data.form);
      savePlayers(players);
      this.loadPlayer();
      wx.showToast({ title: '卡片已保存', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    }
  }
});
