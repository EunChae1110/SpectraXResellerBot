const { randomInt } = require('crypto');

function hasRole(interaction, roleId) {
  const member = interaction.member;
  if (!member || !roleId) return false;
  return member.roles?.cache?.has(roleId) || false;
}

function parseBalanceDeltas(options) {
  const fields = ['day', 'week', 'month', 'lifetime'];
  const deltas = {};
  let hasAny = false;

  for (const field of fields) {
    const value = options.getInteger(field);
    if (value === null || value === undefined) continue;
    if (value <= 0) {
      return { error: '数量必须为正整数。' };
    }
    deltas[field] = value;
    hasAny = true;
  }

  if (!hasAny) {
    return { error: '请至少填写一个数量（day/week/month/lifetime）。' };
  }

  return { deltas, hasAny };
}

function parseSingleDuration(options) {
  const fields = ['day', 'week', 'month', 'lifetime'];
  let picked = null;
  let count = 0;

  for (const field of fields) {
    const value = options.getInteger(field);
    if (value === null || value === undefined) continue;
    if (value <= 0) {
      return { error: '数量必须为正整数。' };
    }
    if (picked) {
      return { error: '只能选择一种时长类型（day/week/month/lifetime）。' };
    }
    picked = field;
    count = value;
  }

  if (!picked) {
    return { error: '请填写一种时长类型（day/week/month/lifetime）。' };
  }

  return { type: picked, count };
}

function formatBalanceDelta(deltas) {
  const parts = [];
  for (const [key, value] of Object.entries(deltas)) {
    if (value) {
      parts.push(`${key}=${value}`);
    }
  }
  return parts.join(' ');
}

function generateKeyFromMask(mask) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (const char of mask) {
    if (char === '*') {
      result += alphabet[randomInt(0, alphabet.length)];
    } else {
      result += char;
    }
  }
  return result;
}

function computeExpiresAt(type, count) {
  if (type === 'lifetime') return null;
  const now = new Date();
  const days = type === 'day' ? count : type === 'week' ? count * 7 : count * 30;
  now.setUTCDate(now.getUTCDate() + days);
  return now;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

module.exports = {
  hasRole,
  parseBalanceDeltas,
  parseSingleDuration,
  formatBalanceDelta,
  generateKeyFromMask,
  computeExpiresAt,
  chunkArray,
};
