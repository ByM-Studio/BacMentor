import Stripe from 'stripe';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// Chemin vers le fichier users (en prod, remplacer par une vraie DB ou Vercel KV)
const USERS_FILE = '/tmp/bacmentor_users.json';

function loadUsers() {
  if (!existsSync(USERS_FILE)) return {};
  try { return JSON.parse(readFileSync(USERS_FILE, 'utf8')); } catch { return {}; }
}
function saveUsers(users) {
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeKey || !webhookSecret) return res.status(500).json({ error: 'Config manquante.' });

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    // req.body doit être le raw buffer (config Vercel ci-dessous)
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[Webhook] Signature invalide:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  const users = loadUsers();

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = (session.customer_email || session.customer_details?.email || '').toLowerCase().trim();
    if (email) {
      users[email] = { ...users[email], premium: true, premiumSince: new Date().toISOString(), stripeCustomerId: session.customer };
      saveUsers(users);
      console.log(`[Webhook] Premium activé pour ${email}`);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    // Trouver l'utilisateur par stripeCustomerId
    const entry = Object.entries(users).find(([, v]) => v.stripeCustomerId === sub.customer);
    if (entry) {
      users[entry[0]].premium = false;
      users[entry[0]].premiumCancelledAt = new Date().toISOString();
      saveUsers(users);
      console.log(`[Webhook] Premium annulé pour ${entry[0]}`);
    }
  }

  return res.status(200).json({ received: true });
}

// Vercel : désactiver le bodyParser pour que Stripe puisse vérifier la signature
export const config = { api: { bodyParser: false } };
