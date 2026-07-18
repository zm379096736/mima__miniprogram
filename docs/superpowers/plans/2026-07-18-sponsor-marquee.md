# Sponsor Marquee Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home introduction hero with a synchronized two-lane sponsor marquee and let administrators add or delete sponsor names from the existing room administration panel.

**Architecture:** Store one normalized sponsor-name array in the existing `system` collection under the logical document ID `sponsors`. The protected API owns validation and persistence, bootstrap distributes the list to every client, the room page owns administrator controls, and a small client-side presenter builds duplicated marquee lanes for the home page.

**Tech Stack:** WeChat native mini program (WXML, WXSS, CommonJS JavaScript), CloudBase database and cloud functions, Node.js built-in test runner.

## Global Constraints

- Keep the existing dark, gold, and red home visual language.
- Display names only; do not store or render sponsorship amounts or messages.
- Each normalized name is non-empty and at most 20 Unicode characters.
- Preserve insertion order, reject exact duplicates after trimming, and allow at most 50 sponsors.
- Only configured administrators may add or delete sponsors.
- Use the existing `system` collection; do not add a database collection or migration.
- Empty lists render `感谢每一位支持秘马内战的朋友` without moving lanes.
- Marquee motion uses WXSS transforms only; do not add JavaScript timers.
- Do not modify or stage the unrelated untracked `assets/` directory.

---

### Task 1: Sponsor Domain Rules

**Files:**
- Create: `cloudfunctions/api/sponsorConfig.js`
- Create: `tests/sponsorConfig.test.js`

**Interfaces:**
- Produces: `normalizeSponsors(value): string[]`
- Produces: `addSponsor(sponsors, name): string[]`
- Produces: `removeSponsor(sponsors, name): string[]`

- [ ] **Step 1: Write failing normalization and mutation tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeSponsors,
  addSponsor,
  removeSponsor
} = require('../cloudfunctions/api/sponsorConfig');

test('normalizes sponsor names while preserving insertion order', () => {
  assert.deepEqual(normalizeSponsors(['  小柿  ', '秘马一号', '小柿']), ['小柿', '秘马一号']);
});

test('rejects empty long duplicate and over-capacity sponsor names', () => {
  assert.throws(() => addSponsor([], '   '), /赞助商名字不能为空/);
  assert.throws(() => addSponsor([], '一'.repeat(21)), /不能超过 20 个字/);
  assert.throws(() => addSponsor(['小柿'], ' 小柿 '), /已经在名单中/);
  assert.throws(() => addSponsor(Array.from({ length: 50 }, (_, i) => `赞助商${i}`), '新赞助商'), /最多添加 50 位/);
});

test('adds and removes one exact normalized sponsor name', () => {
  assert.deepEqual(addSponsor(['小柿'], ' 秘马一号 '), ['小柿', '秘马一号']);
  assert.deepEqual(removeSponsor(['小柿', '秘马一号'], ' 小柿 '), ['秘马一号']);
  assert.throws(() => removeSponsor(['小柿'], '不存在'), /没有找到这位赞助商/);
});
```

- [ ] **Step 2: Run the domain tests and verify RED**

Run: `node --test tests/sponsorConfig.test.js`

Expected: FAIL because `cloudfunctions/api/sponsorConfig.js` does not exist.

- [ ] **Step 3: Implement the pure sponsor rules**

```js
const MAX_SPONSORS = 50;
const MAX_NAME_LENGTH = 20;

function normalizedName(value) {
  return String(value || '').trim();
}

function normalizeSponsors(value) {
  const result = [];
  (Array.isArray(value) ? value : []).forEach((item) => {
    const name = normalizedName(item);
    if (!name || Array.from(name).length > MAX_NAME_LENGTH || result.includes(name)) return;
    if (result.length < MAX_SPONSORS) result.push(name);
  });
  return result;
}

function addSponsor(sponsors, value) {
  const current = normalizeSponsors(sponsors);
  const name = normalizedName(value);
  if (!name) throw new Error('赞助商名字不能为空');
  if (Array.from(name).length > MAX_NAME_LENGTH) throw new Error('赞助商名字不能超过 20 个字');
  if (current.includes(name)) throw new Error('这位赞助商已经在名单中');
  if (current.length >= MAX_SPONSORS) throw new Error('最多添加 50 位赞助商');
  return current.concat(name);
}

function removeSponsor(sponsors, value) {
  const current = normalizeSponsors(sponsors);
  const name = normalizedName(value);
  if (!current.includes(name)) throw new Error('没有找到这位赞助商');
  return current.filter((item) => item !== name);
}

module.exports = { normalizeSponsors, addSponsor, removeSponsor };
```

- [ ] **Step 4: Run the domain tests and verify GREEN**

Run: `node --test tests/sponsorConfig.test.js`

Expected: 3 tests pass.

- [ ] **Step 5: Commit the domain rules**

```bash
git add cloudfunctions/api/sponsorConfig.js tests/sponsorConfig.test.js
git commit -m "feat: define sponsor list rules"
```

---

### Task 2: Shared Cloud Storage And Authorization

**Files:**
- Modify: `cloudfunctions/api/index.js`
- Create: `tests/sponsorCloud.test.js`

**Interfaces:**
- Consumes: `normalizeSponsors`, `addSponsor`, and `removeSponsor` from Task 1.
- Produces: bootstrap field `sponsors: string[]`.
- Produces: protected actions `adminAddSponsor(name)` and `adminDeleteSponsor(name)`.

- [ ] **Step 1: Write failing cloud wiring tests**

```js
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8');

test('bootstrap returns normalized shared sponsors', () => {
  assert.match(source, /require\('\.\/sponsorConfig'\)/);
  assert.match(source, /const sponsorConfig = await getSponsorConfig\(\)/);
  assert.match(source, /sponsors: sponsorConfig\.sponsors/);
});

test('sponsor writes require administrator permission', () => {
  const start = source.indexOf('async function adminAddSponsor');
  const end = source.indexOf('async function getRoomDoc');
  const block = source.slice(start, end);
  assert.match(block, /assertAdmin\(openid/);
  assert.match(block, /addSponsor/);
  assert.match(block, /removeSponsor/);
  assert.match(source, /action === 'adminAddSponsor'/);
  assert.match(source, /action === 'adminDeleteSponsor'/);
});
```

- [ ] **Step 2: Run the cloud tests and verify RED**

Run: `node --test tests/sponsorCloud.test.js`

Expected: FAIL because bootstrap and protected actions are not wired.

- [ ] **Step 3: Add sponsor configuration persistence**

Import Task 1 functions and add these helpers before `bootstrap`:

```js
const {
  normalizeSponsors,
  addSponsor,
  removeSponsor
} = require('./sponsorConfig');

const SPONSOR_CONFIG_ID = 'sponsors';

async function getSponsorConfig() {
  const stored = await getById('system', SPONSOR_CONFIG_ID);
  return {
    id: SPONSOR_CONFIG_ID,
    sponsors: normalizeSponsors(stored && stored.sponsors),
    _id: stored && stored._id
  };
}

async function saveSponsorConfig(config, sponsors) {
  const data = {
    id: SPONSOR_CONFIG_ID,
    sponsors: normalizeSponsors(sponsors),
    updatedAt: db.serverDate()
  };
  if (config._id) {
    await db.collection('system').doc(config._id).update({ data });
  } else {
    await db.collection('system').doc(SPONSOR_CONFIG_ID).set({
      data: { ...data, createdAt: db.serverDate() }
    });
  }
  return data.sponsors;
}

async function adminAddSponsor(openid, name) {
  assertAdmin(openid, '只有管理员可以添加赞助商');
  const config = await getSponsorConfig();
  return saveSponsorConfig(config, addSponsor(config.sponsors, name));
}

async function adminDeleteSponsor(openid, name) {
  assertAdmin(openid, '只有管理员可以删除赞助商');
  const config = await getSponsorConfig();
  return saveSponsorConfig(config, removeSponsor(config.sponsors, name));
}
```

Load `const sponsorConfig = await getSponsorConfig();` in `bootstrap` and add `sponsors: sponsorConfig.sponsors` to the returned object. Route `adminAddSponsor` and `adminDeleteSponsor` beside the other administrator actions using `event.name`.

- [ ] **Step 4: Run sponsor and cloud tests**

Run: `node --test tests/sponsorConfig.test.js tests/sponsorCloud.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit cloud persistence**

```bash
git add cloudfunctions/api/index.js tests/sponsorCloud.test.js
git commit -m "feat: store shared sponsors"
```

---

### Task 3: Administrator Sponsor Management

**Files:**
- Modify: `utils/cloudStore.js`
- Modify: `pages/room/room.js`
- Modify: `pages/room/room.wxml`
- Modify: `pages/room/room.wxss`
- Create: `tests/sponsorAdminUi.test.js`

**Interfaces:**
- Consumes: bootstrap `sponsors` and cloud actions from Task 2.
- Produces: `adminAddSponsor(name): Promise<string[]>` and `adminDeleteSponsor(name): Promise<string[]>` client wrappers.
- Produces: room page state `sponsors: string[]` and `sponsorName: string`.

- [ ] **Step 1: Write failing administrator UI tests**

```js
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('cloud store exposes sponsor administration wrappers', () => {
  const source = read('utils/cloudStore.js');
  assert.match(source, /async function adminAddSponsor\(name\)/);
  assert.match(source, /callApi\('adminAddSponsor', \{ name \}\)/);
  assert.match(source, /async function adminDeleteSponsor\(name\)/);
});

test('administrator panel adds and confirms deletion of sponsor names', () => {
  const page = read('pages/room/room.js');
  const view = read('pages/room/room.wxml');
  assert.match(view, /wx:if="\{\{isAdmin\}\}"[\s\S]*赞助商管理/);
  assert.match(view, /bindinput="onSponsorNameInput"/);
  assert.match(view, /bindtap="addSponsor"/);
  assert.match(view, /bindtap="deleteSponsor"/);
  assert.match(page, /wx\.showModal\([\s\S]*删除赞助商/);
  assert.match(page, /sponsors: data\.sponsors \|\| \[\]/);
});
```

- [ ] **Step 2: Run the administrator UI tests and verify RED**

Run: `node --test tests/sponsorAdminUi.test.js`

Expected: FAIL because wrappers and controls do not exist.

- [ ] **Step 3: Add client wrappers and local-preview behavior**

Add `let localSponsors = [];` beside the other local state and include `sponsors: clone(localSponsors)` in `localBootstrap`. Add these branches before the final unknown-action error in `callLocal`:

```js
if (action === 'adminAddSponsor') {
  const name = String(payload.name || '').trim();
  if (!name) throw new Error('赞助商名字不能为空');
  if (Array.from(name).length > 20) throw new Error('赞助商名字不能超过 20 个字');
  if (localSponsors.includes(name)) throw new Error('这位赞助商已经在名单中');
  if (localSponsors.length >= 50) throw new Error('最多添加 50 位赞助商');
  localSponsors = localSponsors.concat(name);
  return clone(localSponsors);
}
if (action === 'adminDeleteSponsor') {
  const name = String(payload.name || '').trim();
  if (!localSponsors.includes(name)) throw new Error('没有找到这位赞助商');
  localSponsors = localSponsors.filter((item) => item !== name);
  return clone(localSponsors);
}
```

Add these cloud wrappers:

```js
async function adminAddSponsor(name) {
  const sponsors = await callApi('adminAddSponsor', { name });
  clearCache();
  return sponsors;
}

async function adminDeleteSponsor(name) {
  const sponsors = await callApi('adminDeleteSponsor', { name });
  clearCache();
  return sponsors;
}
```

Export both functions from `utils/cloudStore.js`.

- [ ] **Step 4: Add administrator state and handlers**

Import both wrappers in `pages/room/room.js`, initialize `sponsors: []` and `sponsorName: ''`, copy `data.sponsors || []` during `loadRoom`, and add:

```js
onSponsorNameInput(event) {
  this.setData({ sponsorName: event.detail.value });
},

async addSponsor() {
  if (!this.data.isAdmin) return;
  try {
    await adminAddSponsor(this.data.sponsorName);
    this.setData({ sponsorName: '' });
    await this.loadRoom();
    wx.showToast({ title: '赞助商已添加', icon: 'success' });
  } catch (error) {
    wx.showToast({ title: error.message, icon: 'none' });
  }
},

deleteSponsor(event) {
  if (!this.data.isAdmin) return;
  const name = event.currentTarget.dataset.name;
  wx.showModal({
    title: '删除赞助商',
    content: `确定从感谢名单中删除“${name}”吗？`,
    confirmText: '删除',
    confirmColor: '#e63946',
    success: async (result) => {
      if (!result.confirm) return;
      try {
        await adminDeleteSponsor(name);
        await this.loadRoom();
        wx.showToast({ title: '已删除', icon: 'success' });
      } catch (error) {
        wx.showToast({ title: error.message, icon: 'none' });
      }
    }
  });
}
```

- [ ] **Step 5: Add the compact administrator controls**

Inside the existing `wx:if="{{isAdmin}}"` panel, add:

```xml
<view class="sponsor-admin">
  <view class="section-title">赞助商管理</view>
  <view class="sponsor-add-row">
    <input class="input sponsor-input" maxlength="20" value="{{sponsorName}}" bindinput="onSponsorNameInput" placeholder="输入赞助商名字" />
    <button class="primary-btn sponsor-add-btn" bindtap="addSponsor">添加</button>
  </view>
  <view wx:if="{{sponsors.length}}" class="sponsor-list">
    <view wx:for="{{sponsors}}" wx:key="*this" class="sponsor-admin-row">
      <text class="sponsor-admin-name">{{item}}</text>
      <button class="remove-player-btn" data-name="{{item}}" bindtap="deleteSponsor">删除</button>
    </view>
  </view>
  <view wx:else class="subtitle">还没有添加赞助商。</view>
</view>
```

Add page-scoped WXSS:

```css
.sponsor-admin {
  border-top: 1rpx solid rgba(255, 255, 255, 0.1);
  margin-top: 28rpx;
  padding-top: 24rpx;
}

.sponsor-add-row,
.sponsor-admin-row {
  align-items: center;
  display: flex;
  gap: 14rpx;
}

.sponsor-input,
.sponsor-admin-name {
  flex: 1;
  min-width: 0;
}

.sponsor-add-btn {
  flex-shrink: 0;
  margin-top: 0;
  width: 132rpx;
}

.sponsor-list {
  margin-top: 16rpx;
}

.sponsor-admin-row {
  border-top: 1rpx solid rgba(255, 255, 255, 0.08);
  min-height: 72rpx;
}
```

- [ ] **Step 6: Run administrator UI and existing administrator tests**

Run: `node --test tests/sponsorAdminUi.test.js tests/adminSettings.test.js tests/dataSafety.test.js`

Expected: all tests pass.

- [ ] **Step 7: Commit administrator management**

```bash
git add utils/cloudStore.js pages/room/room.js pages/room/room.wxml pages/room/room.wxss tests/sponsorAdminUi.test.js
git commit -m "feat: manage sponsors as administrator"
```

---

### Task 4: Home Sponsor Marquee

**Files:**
- Create: `utils/sponsorMarquee.js`
- Modify: `pages/home/home.js`
- Modify: `pages/home/home.wxml`
- Modify: `pages/home/home.wxss`
- Create: `tests/sponsorMarquee.test.js`
- Create: `tests/sponsorHomeUi.test.js`

**Interfaces:**
- Consumes: bootstrap `sponsors: string[]` from Task 2.
- Produces: `buildSponsorMarquee(sponsors): { hasSponsors: boolean, laneA: string[], laneB: string[] }`.

- [ ] **Step 1: Write failing presenter and home markup tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSponsorMarquee } = require('../utils/sponsorMarquee');

test('empty sponsors disable moving lanes', () => {
  assert.deepEqual(buildSponsorMarquee([]), { hasSponsors: false, laneA: [], laneB: [] });
});

test('builds offset lanes and repeats one sponsor for a smooth loop', () => {
  const one = buildSponsorMarquee(['小柿']);
  assert.equal(one.hasSponsors, true);
  assert.ok(one.laneA.length >= 4);
  assert.deepEqual(new Set(one.laneA), new Set(['小柿']));

  const many = buildSponsorMarquee(['A', 'B', 'C', 'D']);
  assert.deepEqual(many.laneA, ['A', 'B', 'C', 'D']);
  assert.deepEqual(many.laneB, ['C', 'D', 'A', 'B']);
});
```

Create `tests/sponsorHomeUi.test.js` with:

```js
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('home hero renders sponsor thank-you and two CSS marquee lanes', () => {
  const view = read('pages/home/home.wxml');
  const style = read('pages/home/home.wxss');
  const page = read('pages/home/home.js');
  assert.match(view, /感谢每一位秘马赞助商/);
  assert.match(view, /wx:if="\{\{sponsorMarquee\.hasSponsors\}\}"/);
  assert.match(view, /sponsor-lane lane-a/);
  assert.match(view, /sponsor-lane lane-b/);
  assert.equal((view.match(/class="sponsor-group"/g) || []).length, 4);
  assert.match(style, /@keyframes sponsor-scroll-forward/);
  assert.match(style, /@keyframes sponsor-scroll-reverse/);
  assert.doesNotMatch(page, /setInterval|setTimeout/);
});

test('home hero has a static sponsor empty state', () => {
  const view = read('pages/home/home.wxml');
  assert.match(view, /感谢每一位支持秘马内战的朋友/);
});
```

- [ ] **Step 2: Run the home tests and verify RED**

Run: `node --test tests/sponsorMarquee.test.js tests/sponsorHomeUi.test.js`

Expected: FAIL because the presenter and home marquee do not exist.

- [ ] **Step 3: Implement the marquee presenter**

```js
function buildSponsorMarquee(sponsors) {
  const names = (Array.isArray(sponsors) ? sponsors : [])
    .map((name) => String(name || '').trim())
    .filter(Boolean);
  if (!names.length) return { hasSponsors: false, laneA: [], laneB: [] };
  const laneA = names.length === 1 ? Array(4).fill(names[0]) : names;
  const offset = Math.ceil(laneA.length / 2);
  const laneB = laneA.slice(offset).concat(laneA.slice(0, offset));
  return { hasSponsors: true, laneA, laneB };
}

module.exports = { buildSponsorMarquee };
```

- [ ] **Step 4: Replace the home hero content**

Import `buildSponsorMarquee`, initialize `sponsorMarquee: buildSponsorMarquee([])`, and set `sponsorMarquee: buildSponsorMarquee(data.sponsors)` in `loadHome`. Replace only the current hero contents with:

```xml
<view class="hero sponsor-hero">
  <view class="sponsor-copy">
    <view class="eyebrow">THANKS TO OUR SPONSORS</view>
    <view class="title">感谢每一位秘马赞助商</view>
    <view class="subtitle">每一次支持，都让秘马内战继续开 C。</view>
  </view>
  <view wx:if="{{sponsorMarquee.hasSponsors}}" class="sponsor-marquee">
    <view class="sponsor-lane lane-a">
      <view class="sponsor-track">
        <view class="sponsor-group"><text wx:for="{{sponsorMarquee.laneA}}" wx:key="index" class="sponsor-chip">{{item}}</text></view>
        <view class="sponsor-group"><text wx:for="{{sponsorMarquee.laneA}}" wx:key="index" class="sponsor-chip">{{item}}</text></view>
      </view>
    </view>
    <view class="sponsor-lane lane-b">
      <view class="sponsor-track">
        <view class="sponsor-group"><text wx:for="{{sponsorMarquee.laneB}}" wx:key="index" class="sponsor-chip">{{item}}</text></view>
        <view class="sponsor-group"><text wx:for="{{sponsorMarquee.laneB}}" wx:key="index" class="sponsor-chip">{{item}}</text></view>
      </view>
    </view>
  </view>
  <view wx:else class="sponsor-empty">感谢每一位支持秘马内战的朋友</view>
</view>
```

- [ ] **Step 5: Add restrained WXSS animation**

Keep the shared `.hero` shell and add:

```css
.sponsor-copy,
.sponsor-marquee,
.sponsor-empty {
  position: relative;
  z-index: 1;
}

.sponsor-marquee {
  margin: 24rpx -28rpx -8rpx;
}

.sponsor-lane {
  overflow: hidden;
  padding: 6rpx 0;
  white-space: nowrap;
}

.sponsor-track,
.sponsor-group {
  align-items: center;
  display: flex;
  flex-shrink: 0;
  width: max-content;
}

.sponsor-track {
  animation: sponsor-scroll-forward 20s linear infinite;
}

.lane-b .sponsor-track {
  animation: sponsor-scroll-reverse 24s linear infinite;
}

.sponsor-group {
  gap: 14rpx;
  padding-right: 14rpx;
}

.sponsor-chip {
  background: rgba(244, 196, 48, 0.1);
  border: 1rpx solid rgba(244, 196, 48, 0.4);
  border-radius: 8rpx;
  color: #ffe184;
  flex-shrink: 0;
  font-size: 24rpx;
  font-weight: 700;
  padding: 10rpx 18rpx;
}

.sponsor-empty {
  color: #d8c89f;
  font-size: 24rpx;
  margin-top: 22rpx;
}

@keyframes sponsor-scroll-forward {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

@keyframes sponsor-scroll-reverse {
  from { transform: translateX(-50%); }
  to { transform: translateX(0); }
}
```

- [ ] **Step 6: Run focused and full verification**

Run: `node --test tests/sponsorMarquee.test.js tests/sponsorHomeUi.test.js tests/sponsorConfig.test.js tests/sponsorCloud.test.js tests/sponsorAdminUi.test.js`

Expected: all sponsor tests pass.

Run: `node --test`

Expected: the complete suite passes with zero failures.

Run: `git diff --check`

Expected: exit code 0 with no whitespace errors.

- [ ] **Step 7: Commit the home marquee**

```bash
git add utils/sponsorMarquee.js pages/home/home.js pages/home/home.wxml pages/home/home.wxss tests/sponsorMarquee.test.js tests/sponsorHomeUi.test.js
git commit -m "feat: thank sponsors on home page"
```

---

## Deployment

After all tasks pass, upload and deploy `cloudfunctions/api` with cloud-side dependency installation, then compile and upload the mini-program frontend. The existing `system` collection is reused, and `cloudfunctions/leagueSync` does not need redeployment.
