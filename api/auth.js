import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';

const USERS_FILE = '/tmp/bacmentor_users.json';

function loadUsers() {
  if (!existsSync(USERS_FILE)) return {};
  try { return JSON.parse(readFileSync(USERS_FILE, 'utf8')); } catch { return {}; }
}
function saveUsers(u) { writeFileSync(USERS_FILE, JSON.stringify(u, null, 2)); }
function hashPwd(pwd) { return createHash('sha256').update(pwd + process.env.PWD_SALT || 'bacmentor2026').digest('hex'); }

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

  const users = loadUsers();

  // ── REGISTER ──────────────────────────────────────────────────────────────
  if (action === 'register') {
    if (!password || password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (6 caractères min).' });
    if (users[emailNorm]) return res.status(409).json({ error: 'Ce compte existe déjà. Connecte-toi !' });
    users[emailNorm] = { passwordHash: hashPwd(password), premium: false, createdAt: new Date().toISOString() };
    saveUsers(users);
    console.log(`[Auth] Nouveau compte : ${emailNorm}`);
    return res.status(200).json({ ok: true, email: emailNorm, premium: false });
  }

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  if (action === 'login') {
    if (!password) return res.status(400).json({ error: 'Mot de passe requis.' });
    const user = users[emailNorm];
    if (!user) return res.status(404).json({ error: 'Compte introuvable. Crée-en un !' });
    if (user.passwordHash !== hashPwd(password)) return res.status(401).json({ error: 'Mot de passe incorrect.' });
    console.log(`[Auth] Login : ${emailNorm} | premium: ${user.premium}`);
    return res.status(200).json({ ok: true, email: emailNorm, premium: !!user.premium, premiumSince: user.premiumSince || null });
  }

  // ── CHECK PREMIUM ─────────────────────────────────────────────────────────
  if (action === 'check') {
    const user = users[emailNorm];
    if (!user) return res.status(200).json({ premium: false });
    return res.status(200).json({ premium: !!user.premium, premiumSince: user.premiumSince || null });
  }

  return res.status(400).json({ error: 'Action inconnue.' });
}
