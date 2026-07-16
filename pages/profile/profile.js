const { getBootstrap, saveCurrentProfile, uploadAvatarWithSrc } = require('../../utils/cloudStore');
const { positionText } = require('../../utils/playerProfile');

const DEFAULT_AVATAR = '/images/tab.png';

function buildPositionOptions(selected) {
  return [1, 2, 3, 4, 5].map((value) => {
    const checked = selected.includes(value);
    return {
      value: String(value),
      label: `${value}号位`,
      checked,
      className: checked ? 'position-chip active' : 'position-chip'
    };
  });
}

Page({
  data: {
    player: {},
    avatarSrc: DEFAULT_AVATAR,
    needPrivacyAuthorization: false,
    positionText: '',
    form: {
      name: '',
      score: '',
      steamId: '',
      avatarUrl: '',
      preferredPositions: []
    },
    positions: []
  },

  async onShow() {
    await this.loadPlayer();
    this.checkPrivacyAuthorization();
  },

  checkPrivacyAuthorization() {
    if (typeof wx === 'undefined' || !wx.getPrivacySetting) {
      this.setData({ needPrivacyAuthorization: false });
      return;
    }
    wx.getPrivacySetting({
      success: (result) => {
        this.setData({ needPrivacyAuthorization: Boolean(result.needAuthorization) });
      },
      fail: () => {
        this.setData({ needPrivacyAuthorization: false });
      }
    });
  },

  onAgreePrivacyAuthorization() {
    this.setData({ needPrivacyAuthorization: false });
    wx.showToast({ title: '已同意，请点击头像进行选择', icon: 'none' });
  },

  async loadPlayer() {
    try {
      const data = await getBootstrap(true);
      const player = data.currentPlayer;
      const selected = player.preferredPositions || [];
      this.setData({
        player: {
          ...player,
          points: Number(player.points || 0),
          mvp: Number(player.mvp || 0),
          touch: Number(player.touch || 0),
          pigeon: Number(player.pigeon || 0)
        },
        avatarSrc: player.avatarSrc || DEFAULT_AVATAR,
        positionText: positionText(selected),
        form: {
          name: player.name || '',
          score: String(player.score || 0),
          steamId: (player.steamIds && player.steamIds.length ? player.steamIds.join(', ') : player.steamId) || '',
          avatarUrl: player.avatarUrl || '',
          preferredPositions: selected.map(String)
        },
        positions: buildPositionOptions(selected)
      });
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    }
  },

  async onChooseAvatar(event) {
    const tempAvatarUrl = event.detail && event.detail.avatarUrl;
    if (!tempAvatarUrl) {
      wx.showToast({ title: '没有获取到头像，请重试', icon: 'none' });
      return;
    }
    try {
      wx.showLoading({ title: '头像上传中' });
      const avatar = await uploadAvatarWithSrc(tempAvatarUrl);
      this.setData({
        avatarSrc: avatar.avatarSrc || DEFAULT_AVATAR,
        'form.avatarUrl': avatar.avatarUrl
      });
      wx.hideLoading();
      wx.showToast({ title: '头像已更新', icon: 'success' });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message, icon: 'none' });
    }
  },

  onNameInput(event) {
    this.setData({ 'form.name': event.detail.value });
  },

  onScoreInput(event) {
    this.setData({ 'form.score': event.detail.value });
  },

  onSteamInput(event) {
    this.setData({ 'form.steamId': event.detail.value });
  },

  onPositionChange(event) {
    const selected = event.detail.value;
    const selectedNumbers = selected.map((value) => Number(value));
    this.setData({
      'form.preferredPositions': selected,
      positions: buildPositionOptions(selectedNumbers)
    });
  },

  async saveProfile() {
    try {
      await saveCurrentProfile(this.data.form);
      await this.loadPlayer();
      wx.showToast({ title: '卡片已保存', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    }
  }
});
