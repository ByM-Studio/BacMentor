import Stripe from 'stripe';

export const config = { api: { bodyParser: false } };

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

async function saveToKV(email, data) {
  const KV_URL = process.env.KV_REDIS_URL;
  const restUrl = KV_URL.replace('redis://', 'https://').split('@')[1];
  const [host, token] = restUrl.split(':');

  await fetch(`https://${host}/hset/user:${email}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN || token}` },
    body: JSON.stringify(data)
  });
}

export default async function handler(req, res) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
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
      await saveToKV(email, { premium: "true", stripeCustomerId: session.customer });
    }
  }
  res.json({ received: true });
}
