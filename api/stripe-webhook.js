import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig     = req.headers['stripe-signature'];
  const rawBody = await getRawBody(req);
  let event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err) {
    console.error('[Webhook] Signature invalide:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email   = session.customer_email || session.customer_details?.email;

    if (email) {
      try {
        // ✅ Activer le premium via auth.js
        await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'https://bacmentor.vercel.app'}/api/auth`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': process.env.INTERNAL_SECRET || 'bacmentor-internal-2026'
          },
          body: JSON.stringify({ action: 'activate-premium', email })
        });
        console.log('[Webhook] Premium activé pour:', email);
      } catch (e) {
        console.error('[Webhook] Erreur activation:', e.message);
      }
    }
  }

  res.status(200).json({ received: true });
}
