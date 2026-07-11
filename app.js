const { cloudEnvId } = require('./utils/config');
const { ensureSeedData } = require('./utils/storage');

App({
  onLaunch() {
    if (typeof wx !== 'undefined' && wx.cloud) {
      wx.cloud.init({
        env: cloudEnvId === 'YOUR_CLOUD_ENV_ID' ? undefined : cloudEnvId,
        traceUser: true
      });
    }
    ensureSeedData();
  }
});
