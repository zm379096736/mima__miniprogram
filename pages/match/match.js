const {
  getBootstrap,
  recordMatchResult,
  voteTodayHonor,
  previewImportedMatch,
  confirmImportedMatch,
  deleteMatchRecord
} = require('../../utils/cloudStore');
const { getVoteOptions, normalizeHonors } = require('../../utils/honorVote');

Page({
  data: {
    teams: null,
    matches: [],
    voteOptions: [],
    voteOptionNames: [],
    mvpIndex: 0,
    touchIndex: 0,
    honors: { mvp: null, touch: null },
    mvpText: '暂无投票',
    touchText: '暂无投票',
    importMatchId: '',
    importPreview: null,
    importWinnerText: '',
    importMatchedText: ''
  },

  async onShow() {
    await this.loadMatches();
  },

  async loadMatches() {
    try {
      const data = await getBootstrap(true);
      const voteOptions = getVoteOptions(data.room, data.players);
      const honors = normalizeHonors(data.room.honors);
      this.setData({
        teams: data.room.teams,
        matches: data.matches,
        voteOptions,
        voteOptionNames: voteOptions.map((player) => player.name),
        honors,
        mvpText: honors.mvp ? `${honors.mvp.name}（${honors.mvp.votes}票）` : '暂无投票',
        touchText: honors.touch ? `${honors.touch.name}（${honors.touch.votes}票）` : '暂无投票'
      });
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    }
  },

  async recordRadiantWin() {
    await this.recordWinner('radiant', '天辉');
  },

  async recordDireWin() {
    await this.recordWinner('dire', '夜魇');
  },

  async recordWinner(winnerSide, winnerName) {
    wx.showModal({
      title: '确认本场结果',
      content: `确定记录 ${winnerName} 胜利吗？确认后会更新本场 10 位选手的积分和战绩。`,
      success: async (result) => {
        if (!result.confirm) {
          return;
        }
        try {
          await recordMatchResult(winnerSide);
          await this.loadMatches();
          wx.showToast({ title: '战绩已录入', icon: 'success' });
        } catch (error) {
          wx.showToast({ title: error.message, icon: 'none' });
        }
      }
    });
  },

  decorateImportPreview(preview) {
    const decorate = (players, badgeClass) => players.map((player) => ({
      ...player,
      matchBadgeText: player.matched ? '已匹配' : '未匹配',
      matchBadgeClass: player.matched ? badgeClass : 'badge'
    }));
    return {
      ...preview,
      radiant: decorate(preview.radiant || [], 'badge blue'),
      dire: decorate(preview.dire || [], 'badge red')
    };
  },

  onImportMatchIdInput(event) {
    this.setData({ importMatchId: event.detail.value });
  },

  async previewImportedMatch() {
    try {
      wx.showLoading({ title: '拉取比赛中' });
      const preview = this.decorateImportPreview(await previewImportedMatch(this.data.importMatchId));
      wx.hideLoading();
      this.setData({
        importPreview: preview,
        importWinnerText: preview.winner,
        importMatchedText: `已匹配 ${preview.matchedCount} 位秘马选手`
      });
    } catch (error) {
      wx.hideLoading();
      wx.showModal({
        title: '导入失败',
        content: error.message,
        showCancel: false
      });
    }
  },

  async confirmImportedMatch() {
    try {
      if (!this.data.importPreview) {
        wx.showToast({ title: '请先拉取比赛预览', icon: 'none' });
        return;
      }
      wx.showLoading({ title: '导入战绩中' });
      await confirmImportedMatch(this.data.importPreview.matchId);
      wx.hideLoading();
      this.setData({ importPreview: null, importMatchId: '' });
      await this.loadMatches();
      wx.showToast({ title: '比赛已导入', icon: 'success' });
    } catch (error) {
      wx.hideLoading();
      wx.showModal({
        title: '导入失败',
        content: error.message,
        showCancel: false
      });
    }
  },

  async deleteMatch(event) {
    const matchId = event.currentTarget.dataset.id;
    const title = event.currentTarget.dataset.title || '这条战绩';
    wx.showModal({
      title: '删除历史战绩',
      content: `确定删除“${title}”吗？会同时回滚这场比赛加过的选手积分、场次和胜场。`,
      confirmText: '删除',
      confirmColor: '#e63946',
      success: async (result) => {
        if (!result.confirm) {
          return;
        }
        try {
          await deleteMatchRecord(matchId);
          await this.loadMatches();
          wx.showToast({ title: '战绩已删除', icon: 'success' });
        } catch (error) {
          wx.showToast({ title: error.message, icon: 'none' });
        }
      }
    });
  },

  onMvpChange(event) {
    this.setData({ mvpIndex: Number(event.detail.value) });
  },

  onTouchChange(event) {
    this.setData({ touchIndex: Number(event.detail.value) });
  },

  async voteMvp() {
    await this.voteHonor('mvp', this.data.mvpIndex, '今日 MVP');
  },

  async voteTouch() {
    await this.voteHonor('touch', this.data.touchIndex, '今日大触');
  },

  async voteHonor(honorType, index, label) {
    try {
      const player = this.data.voteOptions[index];
      if (!player) {
        wx.showToast({ title: '暂无可投票选手', icon: 'none' });
        return;
      }
      await voteTodayHonor(honorType, player.id);
      await this.loadMatches();
      wx.showToast({ title: label + ' 已投票', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    }
  }
});
