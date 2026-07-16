function uniqueIds(values) {
  return Array.from(new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean)));
}

function shuffle(values, random) {
  const items = values.slice();
  const nextRandom = typeof random === 'function' ? random : Math.random;
  for (let index = items.length - 1; index > 0; index -= 1) {
    const target = Math.floor(nextRandom() * (index + 1));
    [items[index], items[target]] = [items[target], items[index]];
  }
  return items;
}

function selectNextRound({ registeredIds, currentRosterIds, rotationQueue, random }) {
  const registered = uniqueIds(registeredIds);
  if (registered.length < 10) {
    throw new Error('\u81f3\u5c11\u9700\u8981 10 \u4f4d\u5df2\u62a5\u540d\u9009\u624b');
  }

  const registeredSet = new Set(registered);
  const current = uniqueIds(currentRosterIds).filter((playerId) => registeredSet.has(playerId));
  if (current.length !== 10) {
    throw new Error('\u5f53\u524d\u9635\u5bb9\u4e0d\u662f\u5b8c\u6574\u7684 10 \u4eba');
  }
  const currentSet = new Set(current);
  const queued = uniqueIds(rotationQueue).filter((playerId) => registeredSet.has(playerId) && !currentSet.has(playerId));
  const queuedSet = new Set(queued);
  const newlyWaiting = registered.filter((playerId) => !currentSet.has(playerId) && !queuedSet.has(playerId));
  const waiting = queued.concat(newlyWaiting);

  const priority = waiting.slice(0, 10);
  const remainingSlots = 10 - priority.length;
  const selectedCurrent = shuffle(current, random).slice(0, remainingSlots);
  const selectedCurrentSet = new Set(selectedCurrent);
  const rosterIds = priority.concat(selectedCurrent);
  const nextQueue = waiting.slice(priority.length).concat(
    current.filter((playerId) => !selectedCurrentSet.has(playerId))
  );

  return { rosterIds, nextQueue };
}

module.exports = {
  selectNextRound
};
