import Stripe from 'stripe';

export const config = { api: { bodyParser: false } };

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// Fonction pour sauvegarder dans Redis via l'API REST
async function saveToKV(email, data) {
  // Ces noms de variables dépendent du préfixe choisi (ici KV_)
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  
  await fetch(`${url}/hset/user:${email}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data)
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = (session.customer_email || session.customer_details?.email || '').toLowerCase().trim();
    
    if (email) {
      // On enregistre les infos premium
      await saveToKV(email, {
        premium: "true",
        stripeCustomerId: session.customer
      });
      console.log(`[Redis] Premium activé pour ${email}`);
    }
  }

  res.json({ received: true });
}
