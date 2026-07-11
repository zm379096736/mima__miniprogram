const { ensureSeedData } = require('./utils/storage');

App({
  onLaunch() {
    ensureSeedData();
  }
});
