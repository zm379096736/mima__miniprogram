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
  if (!name) throw new Error('\u8d5e\u52a9\u5546\u540d\u5b57\u4e0d\u80fd\u4e3a\u7a7a');
  if (Array.from(name).length > MAX_NAME_LENGTH) throw new Error('\u8d5e\u52a9\u5546\u540d\u5b57\u4e0d\u80fd\u8d85\u8fc7 20 \u4e2a\u5b57');
  if (current.includes(name)) throw new Error('\u8fd9\u4f4d\u8d5e\u52a9\u5546\u5df2\u7ecf\u5728\u540d\u5355\u4e2d');
  if (current.length >= MAX_SPONSORS) throw new Error('\u6700\u591a\u6dfb\u52a0 50 \u4f4d\u8d5e\u52a9\u5546');
  return current.concat(name);
}

function removeSponsor(sponsors, value) {
  const current = normalizeSponsors(sponsors);
  const name = normalizedName(value);
  if (!current.includes(name)) throw new Error('\u6ca1\u6709\u627e\u5230\u8fd9\u4f4d\u8d5e\u52a9\u5546');
  return current.filter((item) => item !== name);
}

module.exports = { normalizeSponsors, addSponsor, removeSponsor };
