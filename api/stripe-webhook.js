import Stripe from 'stripe';

const stripe         = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ✅ Helper pour appeler /api/auth sans dupliquer du code
async function callAuth(action, email) {
  // ✅ CORRECTION : plus de fallback hardcodé — on plante clairement si la variable manque
  if (!process.env.INTERNAL_SECRET) {
    throw new Error('INTERNAL_SECRET non défini dans les variables d\'environnement Vercel !');
  }
  if (!process.env.NEXT_PUBLIC_BASE_URL) {
    throw new Error('NEXT_PUBLIC_BASE_URL non défini dans les variables d\'environnement Vercel !');
  }

  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/auth`, {
    method: 'POST',
    headers: {
      'Content-Type':       'application/json',
      'x-internal-secret':  process.env.INTERNAL_SECRET
    },
    body: JSON.stringify({ action, email })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`callAuth(${action}) échoué pour ${email} : ${body}`);
  }

  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig     = req.headers['stripe-signature'];
  const rawBody = await getRawBody(req);
  let event;

  // ✅ Vérification signature Stripe — bloque tout webhook non signé
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err) {
    console.error('[Webhook] Signature invalide:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('[Webhook] Event reçu:', event.type);

  try {
    // ── PAIEMENT RÉUSSI → activer Premium ──────────────────────────────────
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email   = session.customer_email || session.customer_details?.email;

      if (email) {
        await callAuth('activate-premium', email);
        console.log('[Webhook] ✅ Premium activé pour:', email);
      } else {
        console.warn('[Webhook] ⚠️ checkout.session.completed sans email !');
      }
    }

    // ── ABONNEMENT ANNULÉ → révoquer Premium ───────────────────────────────
    // Déclenché quand l'utilisateur annule son abonnement depuis Stripe
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      // Récupérer l'email via le customer Stripe
      const customer = await stripe.customers.retrieve(subscription.customer);
      const email    = customer.email;

      if (email) {
        await callAuth('revoke-premium', email);
        console.log('[Webhook] ✅ Premium révoqué (annulation) pour:', email);
      } else {
        console.warn('[Webhook] ⚠️ subscription.deleted sans email !');
      }
    }

    // ── PAIEMENT ÉCHOUÉ → révoquer Premium ────────────────────────────────
    // Déclenché si la carte est refusée ou expirée au renouvellement
    if (event.type === 'invoice.payment_failed') {
      const invoice  = event.data.object;
      const email    = invoice.customer_email;

      if (email) {
        await callAuth('revoke-premium', email);
        console.log('[Webhook] ✅ Premium révoqué (paiement échoué) pour:', email);
      } else {
        console.warn('[Webhook] ⚠️ invoice.payment_failed sans email !');
      }
    }

  } catch (e) {
    // On log l'erreur mais on renvoie 200 à Stripe pour éviter les retries infinis
    // (Stripe considère tout non-200 comme un échec et retente pendant 3 jours)
    console.error('[Webhook] Erreur traitement:', e.message);
  }

  // Toujours répondre 200 à Stripe
  res.status(200).json({ received: true });
}
