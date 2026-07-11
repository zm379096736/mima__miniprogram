function isCloudFileId(value) {
  return typeof value === 'string' && value.indexOf('cloud://') === 0;
}

function uniqueAvatarFileIds(players) {
  return Array.from(new Set(
    (players || [])
      .map((player) => player && player.avatarUrl)
      .filter(isCloudFileId)
  ));
}

function applyAvatarTempUrls(players, fileList) {
  const urlByFileId = {};
  (fileList || []).forEach((file) => {
    if (file && file.fileID && file.tempFileURL) {
      urlByFileId[file.fileID] = file.tempFileURL;
    }
  });
  return (players || []).map((player) => ({
    ...player,
    avatarSrc: urlByFileId[player.avatarUrl] || ''
  }));
}

module.exports = {
  isCloudFileId,
  uniqueAvatarFileIds,
  applyAvatarTempUrls
};
