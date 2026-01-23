const { randomUUID } = require('crypto');

function mapRow(row) {
  return row || null;
}

async function getUserByEmail(db, email) {
  const { rows } = await db.query('SELECT id, email FROM public.users WHERE email = $1 LIMIT 1', [email]);
  return mapRow(rows[0]);
}

async function getResellersByUserId(db, userId) {
  const { rows } = await db.query('SELECT * FROM public.resellers WHERE user_id = $1', [userId]);
  return rows;
}

async function updateResellerDiscordId(db, userId, discordId) {
  await db.query('UPDATE public.resellers SET discord_id = $1 WHERE user_id = $2', [discordId, userId]);
}

async function getResellerByDiscordAndProduct(db, discordId, productId) {
  const { rows } = await db.query(
    'SELECT * FROM public.resellers WHERE discord_id = $1 AND product_id = $2 LIMIT 1',
    [discordId, productId]
  );
  return mapRow(rows[0]);
}

async function getResellersByDiscordId(db, discordId) {
  const { rows } = await db.query('SELECT * FROM public.resellers WHERE discord_id = $1', [discordId]);
  return rows;
}

async function getProductBySlug(db, slug) {
  const { rows } = await db.query('SELECT * FROM public.products WHERE slug = $1 LIMIT 1', [slug]);
  return mapRow(rows[0]);
}

async function getResellerBalancesByDiscordId(db, discordId) {
  const { rows } = await db.query(
    `SELECT
      r.product_id,
      p.name AS product_name,
      p.slug AS product_slug,
      b.day,
      b.week,
      b.month,
      b.lifetime
    FROM public.resellers r
    LEFT JOIN public.products p ON p.id = r.product_id
    LEFT JOIN public.reseller_balances b ON b.reseller_id = r.id AND b.product_id = r.product_id
    WHERE r.discord_id = $1`,
    [discordId]
  );
  return rows;
}

async function getResellerBalance(db, resellerId, productId) {
  const { rows } = await db.query(
    'SELECT * FROM public.reseller_balances WHERE reseller_id = $1 AND product_id = $2 LIMIT 1',
    [resellerId, productId]
  );
  return mapRow(rows[0]);
}

async function ensureResellerBalance(db, resellerId, productId) {
  const existing = await getResellerBalance(db, resellerId, productId);
  if (existing) return existing;
  const id = randomUUID();
  await db.query(
    'INSERT INTO public.reseller_balances (id, reseller_id, product_id, day, week, month, lifetime) VALUES ($1, $2, $3, 0, 0, 0, 0)',
    [id, resellerId, productId]
  );
  return getResellerBalance(db, resellerId, productId);
}

async function incrementBalances(db, resellerId, productId, deltas) {
  const fields = ['day', 'week', 'month', 'lifetime'];
  const sets = [];
  const values = [];
  let index = 1;

  for (const field of fields) {
    const delta = deltas[field] || 0;
    if (delta !== 0) {
      sets.push(`${field} = ${field} + $${index}`);
      values.push(delta);
      index += 1;
    }
  }

  if (!sets.length) return;

  values.push(resellerId, productId);
  await db.query(
    `UPDATE public.reseller_balances SET ${sets.join(', ')} WHERE reseller_id = $${index} AND product_id = $${
      index + 1
    }`,
    values
  );
}

async function decrementBalances(db, resellerId, productId, deltas) {
  const fields = ['day', 'week', 'month', 'lifetime'];
  const sets = [];
  const values = [];
  let index = 1;

  for (const field of fields) {
    const delta = deltas[field] || 0;
    if (delta !== 0) {
      sets.push(`${field} = ${field} - $${index}`);
      values.push(delta);
      index += 1;
    }
  }

  if (!sets.length) return;

  values.push(resellerId, productId);
  await db.query(
    `UPDATE public.reseller_balances SET ${sets.join(', ')} WHERE reseller_id = $${index} AND product_id = $${
      index + 1
    }`,
    values
  );
}

async function insertProductKey(db, payload) {
  const {
    id,
    productId,
    key,
    tier,
    duration,
    isUsed,
    usedBy,
    usedAt,
    generatedBy,
    expiresAt,
  } = payload;

  await db.query(
    `INSERT INTO public.product_keys
      (id, product_id, key, created_at, tier, duration, is_used, used_by, used_at, generated_by, expires_at)
     VALUES
      ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      productId,
      key,
      tier,
      duration,
      isUsed,
      usedBy,
      usedAt,
      generatedBy,
      expiresAt,
    ]
  );
}

module.exports = {
  getUserByEmail,
  getResellersByUserId,
  updateResellerDiscordId,
  getResellerByDiscordAndProduct,
  getResellersByDiscordId,
  getProductBySlug,
  getResellerBalancesByDiscordId,
  getResellerBalance,
  ensureResellerBalance,
  incrementBalances,
  decrementBalances,
  insertProductKey,
};
