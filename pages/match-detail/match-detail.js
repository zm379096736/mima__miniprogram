const {
  getBootstrap,
  refreshImportedMatchDetail,
  withMatchAvatarSrc
} = require('../../utils/cloudStore');
const { buildMatchDetail, needsImportedDetailRepair } = require('../../utils/matchDetail');

Page({
  data: {
    loading: true,
    detail: null
  },

  async onLoad(options) {
    const matchId = decodeURIComponent(options.id || '');
    try {
      const data = await getBootstrap(true);
      let match = (data.matches || []).find((item) => item.id === matchId);
      if (!match) {
        throw new Error('\u8fd9\u6761\u6218\u7ee9\u4e0d\u5b58\u5728\u6216\u5df2\u88ab\u5220\u9664');
      }
      if (needsImportedDetailRepair(match)) {
        try {
          match = await refreshImportedMatchDetail(match.id);
        } catch (error) {
          // Keep the saved record readable when both external sources are unavailable.
        }
      }
      match = await withMatchAvatarSrc(match, data.players || []);
      this.setData({
        loading: false,
        detail: buildMatchDetail(match, data.players || [])
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showModal({
        title: '\u65e0\u6cd5\u6253\u5f00\u6218\u7ee9',
        content: error.message,
        showCancel: false,
        success: () => wx.navigateBack()
      });
    }
  }
});
