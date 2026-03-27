import { createHash } from 'crypto';

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvGet(email) {
  if (!KV_URL || !KV_TOKEN) throw new Error("Config Redis manquante");
  const res = await fetch(`${KV_URL}/hgetall/user:${email}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  const data = await res.json();
  if (!data.result || data.result.length === 0) return null;
  const obj = {};
  for (let i = 0; i < data.result.length; i += 2) {
    obj[data.result[i]] = data.result[i + 1];
  }
  return obj;
}

async function kvSet(email, fields) {
  const pairs = Object.entries(fields)
    .map(([k, v]) => `/${encodeURIComponent(k)}/${encodeURIComponent(v)}`)
    .join('');
  await fetch(`${KV_URL}/hset/user:${email}${pairs}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
}

function hashPwd(pwd) {
  return createHash('sha256')
    .update(pwd + (process.env.PWD_SALT || 'bacmentor2026'))
    .digest('hex');
}

export default async function handler(req, res) {
  // ✅ CORRECTION : CORS restreint au domaine de production uniquement
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://bac-mentor.vercel.app';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { action, email, password } = req.body || {};
    const emailNorm = (email || '').toLowerCase().trim();
    if (!emailNorm) return res.status(400).json({ error: 'Email manquant' });

    // ── ACTION : register ─────────────────────────────────────────────────
    if (action === 'register') {
      if (!password || password.length < 6)
        return res.status(400).json({ error: 'Mot de passe trop court.' });
      const existing = await kvGet(emailNorm);
      if (existing) return res.status(409).json({ error: 'Compte déjà existant.' });
      await kvSet(emailNorm, {
        passwordHash: hashPwd(password),
        premium: 'false',
        createdAt: Date.now().toString()
      });
      return res.status(200).json({
        ok: true,
        email: emailNorm,
        premium: false,
        premiumSince: null
      });
    }

    // ── ACTION : login ────────────────────────────────────────────────────
    if (action === 'login') {
      const user = await kvGet(emailNorm);
      if (!user || user.passwordHash !== hashPwd(password))
        return res.status(401).json({ error: 'Identifiants incorrects.' });
      return res.status(200).json({
        ok: true,
        email: emailNorm,
        premium: String(user.premium) === 'true',
        premiumSince: user.premiumSince || null
      });
    }

    // ── ACTION : check ────────────────────────────────────────────────────
    if (action === 'check') {
      const user = await kvGet(emailNorm);
      if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
      return res.status(200).json({
        ok: true,
        email: emailNorm,
        premium: String(user.premium) === 'true',
        premiumSince: user.premiumSince || null
      });
    }

    // ── ACTION : activate-premium (appelé par le webhook Stripe) ──────────
    if (action === 'activate-premium') {
      const secret = req.headers['x-internal-secret'];
      // ✅ CORRECTION : plus de fallback hardcodé — si la variable manque, on refuse
      if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET)
        return res.status(403).json({ error: 'Non autorisé.' });
      const user = await kvGet(emailNorm);
      if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
      await kvSet(emailNorm, {
        ...user,
        premium: 'true',
        premiumSince: Date.now().toString()
      });
      return res.status(200).json({ ok: true });
    }

    // ── ACTION : revoke-premium (appelé par le webhook Stripe) ────────────
   if (action === 'revoke-premium') {
  const secret = req.headers['x-internal-secret'];
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET)
    return res.status(403).json({ error: 'Non autorisé.' });
  const user = await kvGet(emailNorm);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  // ✅ FIX : on écrit chaque champ explicitement sans spread
  await kvSet(emailNorm, {
    passwordHash: user.passwordHash,
    createdAt: user.createdAt,
    premium: 'false',
    premiumSince: ''
  });
  return res.status(200).json({ ok: true });
}

    return res.status(400).json({ error: 'Action inconnue.' });

  } catch (e) {
    console.error('[BacMentor Auth]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
