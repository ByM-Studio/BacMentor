import { createHash } from 'crypto';

// Configuration Redis (Vercel KV) via REST
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

// Fonctions utilitaires pour Redis
async function kvGet(email) {
  const res = await fetch(`${KV_URL}/hgetall/user:${email}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  const data = await res.json();
  // Redis REST renvoie un tableau [clé, valeur, clé, valeur] ou null
  if (!data.result || data.result.length === 0) return null;
  const obj = {};
  for (let i = 0; i < data.result.length; i += 2) {
    obj[data.result[i]] = data.result[i + 1];
  }
  return obj;
}

async function kvSet(email, userData) {
  await fetch(`${KV_URL}/hset/user:${email}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const { action, email, password } = req.body || {};
  if (!email || !action) return res.status(400).json({ error: 'Données manquantes.' });

  const emailNorm = email.toLowerCase().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(emailNorm)) return res.status(400).json({ error: 'Email invalide.' });

  // Charger l'utilisateur depuis Redis
  const user = await kvGet(emailNorm);

  // ── REGISTER ──────────────────────────────────────────────────────────────
  if (action === 'register') {
    if (!password || password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (6 caractères min).' });
    if (user) return res.status(409).json({ error: 'Ce compte existe déjà. Connecte-toi !' });
    
    const newUser = { 
      passwordHash: hashPwd(password), 
      premium: "false", 
      createdAt: new Date().toISOString() 
    };
    
    await kvSet(emailNorm, newUser);
    console.log(`[Auth] Nouveau compte Redis : ${emailNorm}`);
    return res.status(200).json({ ok: true, email: emailNorm, premium: false });
  }

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  if (action === 'login') {
    if (!password) return res.status(400).json({ error: 'Mot de passe requis.' });
    if (!user) return res.status(404).json({ error: 'Compte introuvable. Crée-en un !' });
    
    if (user.passwordHash !== hashPwd(password)) return res.status(401).json({ error: 'Mot de passe incorrect.' });
    
    const isPremium = user.premium === "true";
    console.log(`[Auth] Login : ${emailNorm} | premium: ${isPremium}`);
    return res.status(200).json({ ok: true, email: emailNorm, premium: isPremium, premiumSince: user.premiumSince || null });
  }

  // ── CHECK PREMIUM ─────────────────────────────────────────────────────────
  if (action === 'check') {
    if (!user) return res.status(200).json({ premium: false });
    return res.status(200).json({ premium: user.premium === "true", premiumSince: user.premiumSince || null });
  }

  return res.status(400).json({ error: 'Action inconnue.' });
}
