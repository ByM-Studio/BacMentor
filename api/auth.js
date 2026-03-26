import { createHash } from 'crypto';

// On utilise l'URL Redis que Vercel t'a donnée
const KV_URL = process.env.KV_REDIS_URL; 

async function kvGet(email) {
  // On transforme l'URL redis:// en https:// pour l'API REST
  const restUrl = KV_URL.replace('redis://', 'https://').split('@')[1];
  const [host, token] = restUrl.split(':');
  
  const res = await fetch(`https://${host}/hgetall/user:${email}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN || token}` }
  });
  const data = await res.json();
  if (!data.result || data.result.length === 0) return null;
  const obj = {};
  for (let i = 0; i < data.result.length; i += 2) { obj[data.result[i]] = data.result[i + 1]; }
  return obj;
}

async function kvSet(email, userData) {
  const restUrl = KV_URL.replace('redis://', 'https://').split('@')[1];
  const [host, token] = restUrl.split(':');
  
  await fetch(`https://${host}/hset/user:${email}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN || token}` },
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
  
  const { action, email, password } = req.body || {};
  const emailNorm = (email || '').toLowerCase().trim();
  const user = await kvGet(emailNorm);

  if (action === 'register') {
    if (user) return res.status(409).json({ error: 'Compte déjà existant.' });
    await kvSet(emailNorm, { passwordHash: hashPwd(password), premium: "false" });
    return res.status(200).json({ ok: true, email: emailNorm, premium: false });
  }

  if (action === 'login') {
    if (!user || user.passwordHash !== hashPwd(password)) return res.status(401).json({ error: 'Identifiants incorrects.' });
    return res.status(200).json({ ok: true, email: emailNorm, premium: user.premium === "true" });
  }

  if (action === 'check') {
    return res.status(200).json({ premium: user?.premium === "true" });
  }
  return res.status(400).json({ error: 'Action inconnue' });
}
