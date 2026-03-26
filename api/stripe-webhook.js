import Stripe from 'stripe';

export const config = { api: { bodyParser: false } };

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// ✅ FIX CRITIQUE : utilise KV_REST_API_URL + KV_REST_API_TOKEN
// comme auth.js — l'ancienne version parsait KV_REDIS_URL (format natif Redis)
// ce qui échouait silencieusement à chaque paiement
async function saveToKV(email, data) {
  const KV_REST_URL   = process.env.KV_REST_API_URL;
  const KV_REST_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!KV_REST_URL || !KV_REST_TOKEN) {
    console.error('[BacMentor] Variables KV manquantes dans stripe-webhook');
    return;
  }

  const res = await fetch(`${KV_REST_URL}/hset/user:${email}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KV_REST_TOKEN}`
    },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error('[BacMentor] Erreur KV hset:', res.status, txt);
  }
}

export default async function handler(req, res) {
  const stripe        = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig           = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error('[BacMentor] Webhook signature invalide:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ✅ Activation Premium à la confirmation du paiement
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email   = (
      session.customer_email ||
      session.customer_details?.email ||
      session.metadata?.customer_email ||
      ''
    ).toLowerCase().trim();

    if (email) {
      console.log('[BacMentor] Activation Premium pour :', email);
      await saveToKV(email, {
        premium:          'true',
        premiumSince:     new Date().toISOString(),
        stripeCustomerId: session.customer || ''
      });
    } else {
      console.warn('[BacMentor] Aucun email trouvé dans la session Stripe :', session.id);
    }
  }

  // ✅ Révocation Premium à l'annulation ou l'expiration de l'abonnement
  if (
    event.type === 'customer.subscription.deleted' ||
    event.type === 'customer.subscription.paused'
  ) {
    const subscription = event.data.object;
    // Retrouver l'email via le customer Stripe
    try {
      const customer = await stripe.customers.retrieve(subscription.customer);
      const email    = (customer.email || '').toLowerCase().trim();
      if (email) {
        console.log('[BacMentor] Révocation Premium pour :', email);
        await saveToKV(email, { premium: 'false' });
      }
    } catch (err) {
      console.error('[BacMentor] Erreur récupération customer Stripe:', err.message);
    }
  }

  return res.json({ received: true });
}
