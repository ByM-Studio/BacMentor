import Stripe from 'stripe';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// Configuration Vercel pour recevoir le corps brut (indispensable pour Stripe)
export const config = {
  api: {
    bodyParser: false,
  },
};

// Fonction utilitaire pour lire le buffer brut de la requête
async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

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

  if (!stripeKey || !webhookSecret) {
    console.error('Config manquante : STRIPE_SECRET_KEY ou STRIPE_WEBHOOK_SECRET');
    return res.status(500).json({ error: 'Config manquante.' });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    // ÉTAPE CRUCIALE : On récupère le corps brut ici
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error(`[Webhook] Erreur de signature: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const users = loadUsers();

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = (session.customer_email || session.customer_details?.email || '').toLowerCase().trim();
    if (email) {
      users[email] = { 
        ...users[email], 
        premium: true, 
        premiumSince: new Date().toISOString(), 
        stripeCustomerId: session.customer 
      };
      saveUsers(users);
      console.log(`[Webhook] Premium activé pour ${email}`);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const entry = Object.entries(users).find(([, v]) => v.stripeCustomerId === sub.customer);
    if (entry) {
      users[entry[0]].premium = false;
      users[entry[0]].premiumCancelledAt = new Date().toISOString();
      saveUsers(users);
      console.log(`[Webhook] Premium annulé pour ${entry[0]}`);
    }
  }

  res.json({ received: true });
}
