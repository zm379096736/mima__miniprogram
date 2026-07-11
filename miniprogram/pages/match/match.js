const { getPlayers, savePlayers, getRoom, getMatches, saveMatches } = require('../../utils/storage');
const { applyMatchResult } = require('../../utils/teamBalancer');

Page({
  data: {
    teams: null,
    matches: []
  },

  onShow() {
    const room = getRoom();
    this.setData({
      teams: room.teams,
      matches: getMatches()
    });
  },

  recordRadiantWin() {
    const teams = this.data.teams;
    if (!teams) {
      wx.showToast({ title: '请先完成分队', icon: 'none' });
      return;
    }

    const winnerIds = teams.radiant.players.map((player) => player.id);
    const mvpId = teams.radiant.players[0].id;
    const pressureIds = [teams.dire.players[0].id];
    const players = applyMatchResult(getPlayers(), {
      winnerIds,
      mvpId,
      lateIds: [],
      pigeonIds: [],
      pressureIds
    });
    savePlayers(players);

    const nextMatch = {
      id: `m${Date.now()}`,
      title: `秘马日赛 ${getMatches().length + 1}`,
      winner: '天辉',
      mvp: teams.radiant.players[0].name,
      scoreGap: teams.scoreGap
    };
    const matches = [nextMatch].concat(getMatches());
    saveMatches(matches);
    this.setData({ matches });
    wx.showToast({ title: '录入完成', icon: 'success' });
  }
});
