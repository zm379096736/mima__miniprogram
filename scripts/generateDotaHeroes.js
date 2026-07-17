const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');

const DATA_URL = 'https://www.dota2.com/datafeed/herolist?language=schinese';
const IMAGE_BASE = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/';

function requestJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Valve hero data request failed ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error('Valve hero data is not valid JSON'));
        }
      });
    }).on('timeout', function onTimeout() {
      this.destroy(new Error('Valve hero data request timed out'));
    }).on('error', reject);
  });
}

function moduleSource(rows) {
  return `const IMAGE_BASE = '${IMAGE_BASE}';\n\n`
    + `const HEROES = ${JSON.stringify(rows, null, 2)};\n\n`
    + `const HERO_BY_ID = Object.fromEntries(HEROES.map((hero) => [String(hero.id), hero]));\n\n`
    + `function heroById(value) {\n`
    + `  const id = Number(value || 0);\n`
    + `  const hero = HERO_BY_ID[String(id)];\n`
    + `  if (!hero) return { id, name: \`未知英雄 #\${id}\`, slug: '', imageUrl: '' };\n`
    + `  return { ...hero, imageUrl: \`\${IMAGE_BASE}\${hero.slug}.png\` };\n`
    + `}\n\n`
    + `function decorateHero(target = {}) {\n`
    + `  const hero = heroById(target.heroId);\n`
    + `  return { ...target, heroName: hero.name, heroImage: hero.imageUrl };\n`
    + `}\n\n`
    + `module.exports = { HEROES, heroById, decorateHero };\n`;
}

async function main() {
  const payload = await requestJson(DATA_URL);
  const sourceRows = payload && payload.result && payload.result.data && payload.result.data.heroes;
  if (!Array.isArray(sourceRows) || sourceRows.length < 100) {
    throw new Error('Valve hero data is incomplete');
  }
  const rows = sourceRows.map((row) => ({
    id: Number(row.id),
    name: String(row.name_loc || ''),
    slug: String(row.name || '').replace(/^npc_dota_hero_/, '')
  })).filter((row) => row.id > 0 && row.name && row.slug)
    .sort((left, right) => left.id - right.id);
  const outputPath = path.join(__dirname, '../utils/dotaHeroes.js');
  fs.writeFileSync(outputPath, moduleSource(rows), 'utf8');
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
