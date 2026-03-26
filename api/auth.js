import { createHash } from 'crypto';

// Utilisation directe des variables REST créées par Vercel
const KV_REST_URL = process.env.KV_REST_API_URL;
const KV_REST_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvGet(email) {
  if (!KV_REST_URL || !KV_REST_TOKEN) throw new Error("Config Redis manquante");
  
  const res = await fetch(`${KV_REST_URL}/hgetall/user:${email}`, {
    headers: { Authorization: `Bearer ${KV_REST_TOKEN}` }
  });
  
  const data = await res.json();
  if (!data.result || data.result.length === 0) return null;
  
  const obj = {};
  for (let i = 0; i < data.result.length; i += 2) {
    obj[data.result[i]] = data.result[i + 1];
  }
  return obj;
}

async function kvSet(email, userData) {
  await fetch(`${KV_REST_URL}/hset/user:${email}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_REST_TOKEN}` },
    body: JSON.stringify(userData)
  });
}

function hashPwd(pwd) { 
  return createHash('sha256').update(pwd + (process.env.PWD_SALT || 'bacmentor2026')).digest('hex'); 
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  try {
    const { action, email, password } = req.body || {};
    const emailNorm = (email || '').toLowerCase().trim();
    if (!emailNorm) return res.status(400).json({ error: 'Email manquant' });

    const user = await kvGet(emailNorm);

    if (action === 'register') {
      if (user) return res.status(409).json({ error: 'Compte déjà existant.' });
      await kvSet(emailNorm, { passwordHash: hashPwd(password), premium: "false" });
      return res.status(200).json({ ok: true });
    }

    if (action === 'login') {
      if (!user || user.passwordHash !== hashPwd(password)) return res.status(401).json({ error: 'Identifiants incorrects.' });
      return res.status(200).json({ ok: true, email: emailNorm, premium: user.premium === "true" });
    }

    if (action === 'check') {
      return res.status(200).json({ premium: user?.premium === "true" });
    }
    
    return res.status(400).json({ error: 'Action inconnue' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erreur serveur Redis" });
  }
}
