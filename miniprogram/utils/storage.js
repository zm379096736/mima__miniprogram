const seed = require('./seed');

const KEYS = {
  players: 'mima_players',
  room: 'mima_room',
  matches: 'mima_matches'
};

function canUseWxStorage() {
  return typeof wx !== 'undefined' && wx.getStorageSync && wx.setStorageSync;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function read(key, fallback) {
  if (!canUseWxStorage()) {
    return clone(fallback);
  }
  const value = wx.getStorageSync(key);
  return value || clone(fallback);
}

function write(key, value) {
  if (canUseWxStorage()) {
    wx.setStorageSync(key, value);
  }
  return value;
}

function ensureSeedData() {
  if (!canUseWxStorage()) {
    return;
  }
  if (!wx.getStorageSync(KEYS.players)) {
    wx.setStorageSync(KEYS.players, clone(seed.players));
  }
  if (!wx.getStorageSync(KEYS.room)) {
    wx.setStorageSync(KEYS.room, clone(seed.room));
  }
  if (!wx.getStorageSync(KEYS.matches)) {
    wx.setStorageSync(KEYS.matches, clone(seed.matches));
  }
}

function getPlayers() {
  return read(KEYS.players, seed.players);
}

function savePlayers(players) {
  return write(KEYS.players, players);
}

function getRoom() {
  return read(KEYS.room, seed.room);
}

function saveRoom(room) {
  return write(KEYS.room, room);
}

function getMatches() {
  return read(KEYS.matches, seed.matches);
}

function saveMatches(matches) {
  return write(KEYS.matches, matches);
}

module.exports = {
  ensureSeedData,
  getPlayers,
  savePlayers,
  getRoom,
  saveRoom,
  getMatches,
  saveMatches
};
