const {
  getBootstrap,
  adminCreateTemporaryPlayer,
  recordMatchResult,
  previewImportedMatch: fetchImportedMatch,
  confirmImportedMatch: saveImportedMatch,
  deleteMatchRecord
} = require('../../utils/cloudStore');

function buildPlayerOptions(players) {
  const selectable = (players || [])
    .filter((player) => player && (player.profileCompleted || player.temporary))
    .slice()
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'zh-CN'));

  return [{ id: '', label: '请选择选手' }].concat(selectable.map((player) => ({
    id: player.id,
    label: `${player.name || '未命名选手'}${player.temporary ? '（临时）' : ''}`
  })));
}

function findPickerIndex(options, playerId) {
  const index = (options || []).findIndex((option) => option.id === playerId);
  return index >= 0 ? index : 0;
}

function buildLineupRows(playerIds, side, options) {
  const ids = Array.isArray(playerIds) ? playerIds : [];
  return Array.from({ length: 5 }, (_, index) => {
    const playerId = ids[index] || '';
    return {
      rowKey: `${side}-${index}`,
      side,
      slot: index + 1,
      playerId,
      pickerIndex: findPickerIndex(options, playerId)
    };
  });
}

function teamPlayerIds(teams, side) {
  const team = teams && teams[side];
  return team && Array.isArray(team.players)
    ? team.players.map((player) => player.id).filter(Boolean)
    : [];
}

Page({
  data: {
    isAdmin: false,
    teams: null,
    matches: [],
    players: [],
    playerOptions: [{ id: '', label: '请选择选手' }],
    lineupInitialized: false,
    actualRadiantRows: buildLineupRows([], 'radiant', [{ id: '', label: '请选择选手' }]),
    actualDireRows: buildLineupRows([], 'dire', [{ id: '', label: '请选择选手' }]),
    importMatchId: '',
    importPreview: null,
    importWinnerText: '',
    importMatchedText: ''
  },

  async onShow() {
    await this.loadMatches();
  },

  selectedIds(rows) {
    return this.rowPlayerIds(rows).filter(Boolean);
  },

  rowPlayerIds(rows) {
    return (rows || []).map((row) => row.playerId || '');
  },

  applyBootstrap(data) {
    const players = data.players || [];
    const playerOptions = buildPlayerOptions(players);
    const teams = data.room && data.room.teams ? data.room.teams : null;
    const radiantIds = this.data.lineupInitialized
      ? this.rowPlayerIds(this.data.actualRadiantRows)
      : teamPlayerIds(teams, 'radiant');
    const direIds = this.data.lineupInitialized
      ? this.rowPlayerIds(this.data.actualDireRows)
      : teamPlayerIds(teams, 'dire');
    const importPreview = this.data.importPreview
      ? this.decorateImportPreview(this.data.importPreview, playerOptions)
      : null;

    this.setData({
      isAdmin: Boolean(data.isAdmin || (data.currentPlayer && data.currentPlayer.isAdmin)),
      teams,
      matches: data.matches || [],
      players,
      playerOptions,
      lineupInitialized: true,
      actualRadiantRows: buildLineupRows(radiantIds, 'radiant', playerOptions),
      actualDireRows: buildLineupRows(direIds, 'dire', playerOptions),
      importPreview,
      importMatchedText: importPreview ? this.importMatchedText(importPreview) : ''
    });
  },

  async loadMatches() {
    try {
      this.applyBootstrap(await getBootstrap(true));
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    }
  },

  onActualPlayerChange(event) {
    const side = event.currentTarget.dataset.side;
    const rowIndex = Number(event.currentTarget.dataset.index);
    const option = this.data.playerOptions[Number(event.detail.value)] || this.data.playerOptions[0];
    const key = side === 'dire' ? 'actualDireRows' : 'actualRadiantRows';
    const rows = this.data[key].map((row, index) => (
      index === rowIndex
        ? { ...row, playerId: option.id, pickerIndex: findPickerIndex(this.data.playerOptions, option.id) }
        : row
    ));
    this.setData({ [key]: rows });
  },

  async recordRadiantWin() {
    await this.recordWinner('radiant', '天辉');
  },

  async recordDireWin() {
    await this.recordWinner('dire', '夜魇');
  },

  async recordWinner(winnerSide, winnerName) {
    if (!this.data.isAdmin) {
      wx.showModal({
        title: '仅管理员可操作',
        content: '请通知管理员核对实际参赛阵容并提交比赛结果。',
        showCancel: false
      });
      return;
    }

    const lineup = {
      radiantPlayerIds: this.selectedIds(this.data.actualRadiantRows),
      direPlayerIds: this.selectedIds(this.data.actualDireRows)
    };
    wx.showModal({
      title: '确认本场结果',
      content: `确定记录${winnerName}胜利吗？积分将按上方实际参赛的 10 位选手结算。`,
      success: async (result) => {
        if (!result.confirm) {
          return;
        }
        try {
          await recordMatchResult(winnerSide, lineup.radiantPlayerIds, lineup.direPlayerIds);
          await this.loadMatches();
          wx.showToast({ title: '战绩已录入', icon: 'success' });
        } catch (error) {
          wx.showToast({ title: error.message, icon: 'none' });
        }
      }
    });
  },

  importMatchedText(preview) {
    const matchedCount = (preview.radiant || []).concat(preview.dire || [])
      .filter((player) => player.selectedPlayerId)
      .length;
    return `已关联 ${matchedCount} / 10`;
  },

  decorateImportPreview(preview, options) {
    const playerOptions = options || this.data.playerOptions;
    const decorate = (players, side, badgeClass) => (players || []).map((player, index) => {
      const selectedPlayerId = player.selectedPlayerId || player.playerId || '';
      return {
        ...player,
        rowKey: `${side}-${index}-${player.accountId || 'unknown'}`,
        side,
        rowIndex: index,
        selectedPlayerId,
        pickerIndex: findPickerIndex(playerOptions, selectedPlayerId),
        matchBadgeText: selectedPlayerId ? '已关联' : '待关联',
        matchBadgeClass: selectedPlayerId ? badgeClass : 'badge'
      };
    });

    return {
      ...preview,
      radiant: decorate(preview.radiant, 'radiant', 'badge blue'),
      dire: decorate(preview.dire, 'dire', 'badge red')
    };
  },

  onImportMatchIdInput(event) {
    this.setData({ importMatchId: event.detail.value });
  },

  async previewImportedMatch() {
    try {
      wx.showLoading({ title: '拉取比赛中' });
      const preview = this.decorateImportPreview(
        await fetchImportedMatch(this.data.importMatchId),
        this.data.playerOptions
      );
      wx.hideLoading();
      this.setData({
        importPreview: preview,
        importWinnerText: preview.winner,
        importMatchedText: this.importMatchedText(preview)
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

  onImportPlayerChange(event) {
    const side = event.currentTarget.dataset.side;
    const rowIndex = Number(event.currentTarget.dataset.index);
    const option = this.data.playerOptions[Number(event.detail.value)] || this.data.playerOptions[0];
    const preview = {
      ...this.data.importPreview,
      radiant: (this.data.importPreview.radiant || []).map((player) => ({ ...player })),
      dire: (this.data.importPreview.dire || []).map((player) => ({ ...player }))
    };
    preview[side][rowIndex].selectedPlayerId = option.id;
    const decorated = this.decorateImportPreview(preview, this.data.playerOptions);
    this.setData({
      importPreview: decorated,
      importMatchedText: this.importMatchedText(decorated)
    });
  },

  promptTemporaryPlayerName(defaultName) {
    return new Promise((resolve) => {
      wx.showModal({
        title: '建立临时选手卡',
        content: defaultName || '',
        editable: true,
        placeholderText: '输入临时选手名',
        success: (result) => {
          if (!result.confirm) {
            resolve('');
            return;
          }
          resolve(String(result.content || '').trim());
        },
        fail: () => resolve('')
      });
    });
  },

  async createManualTemporaryPlayer() {
    if (!this.data.isAdmin) {
      return;
    }
    const name = await this.promptTemporaryPlayerName('');
    if (!name) {
      return;
    }
    try {
      await adminCreateTemporaryPlayer({ name, steamId: '' });
      await this.loadMatches();
      wx.showToast({ title: '临时选手已建立', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    }
  },

  async createImportedTemporaryPlayer(event) {
    if (!this.data.isAdmin || !this.data.importPreview) {
      return;
    }
    const side = event.currentTarget.dataset.side;
    const rowIndex = Number(event.currentTarget.dataset.index);
    const accountId = String(event.currentTarget.dataset.accountid || '');
    const defaultName = String(event.currentTarget.dataset.name || '');
    const name = await this.promptTemporaryPlayerName(defaultName);
    if (!name) {
      return;
    }

    try {
      const player = await adminCreateTemporaryPlayer({ name, steamId: accountId });
      const data = await getBootstrap(true);
      const playerOptions = buildPlayerOptions(data.players || []);
      const preview = {
        ...this.data.importPreview,
        radiant: (this.data.importPreview.radiant || []).map((item) => ({ ...item })),
        dire: (this.data.importPreview.dire || []).map((item) => ({ ...item }))
      };
      preview[side][rowIndex].selectedPlayerId = player.id;
      const decorated = this.decorateImportPreview(preview, playerOptions);
      this.setData({
        players: data.players || [],
        playerOptions,
        matches: data.matches || [],
        importPreview: decorated,
        importMatchedText: this.importMatchedText(decorated),
        actualRadiantRows: buildLineupRows(
          this.rowPlayerIds(this.data.actualRadiantRows),
          'radiant',
          playerOptions
        ),
        actualDireRows: buildLineupRows(
          this.rowPlayerIds(this.data.actualDireRows),
          'dire',
          playerOptions
        )
      });
      wx.showToast({ title: '已建立并关联', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    }
  },

  async confirmImportedMatch() {
    if (!this.data.isAdmin) {
      wx.showModal({
        title: '仅管理员可操作',
        content: '请通知管理员核对实际参赛阵容并提交比赛结果。',
        showCancel: false
      });
      return;
    }
    if (!this.data.importPreview) {
      wx.showToast({ title: '请先拉取比赛预览', icon: 'none' });
      return;
    }

    const radiantPlayerIds = this.selectedIds(this.data.importPreview.radiant.map((player) => ({
      playerId: player.selectedPlayerId
    })));
    const direPlayerIds = this.selectedIds(this.data.importPreview.dire.map((player) => ({
      playerId: player.selectedPlayerId
    })));

    try {
      wx.showLoading({ title: '导入战绩中' });
      await saveImportedMatch(this.data.importPreview.matchId, radiantPlayerIds, direPlayerIds);
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

  openMatchDetail(event) {
    const matchId = event.currentTarget.dataset.id;
    if (!matchId) {
      return;
    }
    wx.navigateTo({
      url: `/pages/match-detail/match-detail?id=${encodeURIComponent(matchId)}`
    });
  },

  async deleteMatch(event) {
    const matchId = event.currentTarget.dataset.id;
    const title = event.currentTarget.dataset.title || '这条战绩';
    wx.showModal({
      title: '删除历史战绩',
      content: `确定删除“${title}”吗？会同时回滚这场比赛实际参赛选手的积分、场次和胜场。`,
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
  }
});
