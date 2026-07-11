const players = [
  { id: 'p1', name: '\u79d8\u9a6c\u4e00\u53f7', tier: 'SSR', score: 92, matches: 18, wins: 12, mvp: 4, pigeon: 0, pressure: 0, preferredPositions: [1, 2] },
  { id: 'p2', name: '\u4e2d\u8def\u7edd\u6d3b', tier: 'SR', score: 90, matches: 20, wins: 13, mvp: 3, pigeon: 1, pressure: 0, preferredPositions: [2] },
  { id: 'p3', name: '\u52a3\u5355\u731b\u7537', tier: 'S', score: 86, matches: 15, wins: 9, mvp: 2, pigeon: 0, pressure: 1, preferredPositions: [3] },
  { id: 'p4', name: '\u6e38\u8d70\u738b', tier: 'A', score: 80, matches: 17, wins: 9, mvp: 1, pigeon: 1, pressure: 0, preferredPositions: [4] },
  { id: 'p5', name: '\u4fdd\u4eba\u673a\u5668', tier: 'A', score: 76, matches: 16, wins: 8, mvp: 0, pigeon: 0, pressure: 0, preferredPositions: [5] },
  { id: 'p6', name: '\u540e\u671f\u8001\u677f', tier: 'SR', score: 88, matches: 14, wins: 8, mvp: 2, pigeon: 0, pressure: 0, preferredPositions: [1] },
  { id: 'p7', name: '\u4e8c\u53f7\u4f4d\u68a6\u9b47', tier: 'S', score: 83, matches: 19, wins: 10, mvp: 1, pigeon: 2, pressure: 1, preferredPositions: [2, 3] },
  { id: 'p8', name: '\u4e09\u53f7\u4f4d\u94c1\u95f8', tier: 'A', score: 79, matches: 13, wins: 7, mvp: 1, pigeon: 0, pressure: 0, preferredPositions: [3] },
  { id: 'p9', name: '\u56db\u53f7\u4f4d\u8282\u594f', tier: 'B', score: 74, matches: 11, wins: 5, mvp: 0, pigeon: 1, pressure: 0, preferredPositions: [4] },
  { id: 'p10', name: '\u4e94\u53f7\u4f4d\u9662\u957f', tier: 'B', score: 70, matches: 12, wins: 5, mvp: 0, pigeon: 0, pressure: 0, preferredPositions: [5, 4] }
];

const room = {
  id: 'today',
  title: '\u4eca\u665a\u79d8\u9a6c\u5f00 C',
  status: '\u62a5\u540d\u4e2d',
  startTime: '21:30',
  signups: players.filter((player) => player.id !== 'p1').map((player) => player.id),
  teams: null
};

const matches = [
  { id: 'm1', title: '\u79d8\u9a6c\u65e5\u8d5b 01', winner: '\u5929\u8f89', mvp: '\u79d8\u9a6c\u4e00\u53f7', scoreGap: 4 }
];

module.exports = {
  players,
  room,
  matches
};
