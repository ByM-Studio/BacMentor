import Stripe from 'stripe';

export default async function handler(req, res) {
  // CORS basique
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.error('[BacMentor] STRIPE_SECRET_KEY manquante !');
    return res.status(500).json({ error: 'Configuration paiement manquante.' });
  }

  try {
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
    const { email } = req.body || {};

    // URL de base : utilise l'en-tête Host ou la variable d'env NEXT_PUBLIC_BASE_URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      || `https://${req.headers.host}`
      || 'https://bac-mentor.vercel.app';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],          // carte bancaire via Stripe
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'BacMentor Premium',
            description: 'Messages illimités · Upload de cours · Fiches IA · Simulations d\'épreuves',
            images: [`${baseUrl}/og-image.png`],   // facultatif — ajoute une image dans le tunnel si tu en as une
          },
          unit_amount: 500,          // 5,00 € en centimes
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      // Pré-remplir l'email si fourni (meilleure UX)
      ...(email ? { customer_email: email } : {}),
      // Activer PayPal via Stripe (disponible dans certaines régions — France ✅)
      payment_method_types: ['card', 'paypal'],
      success_url: `${baseUrl}/?payment=success`,
      cancel_url:  `${baseUrl}/?payment=cancelled`,
      locale: 'fr',
      metadata: { source: 'bacmentor_landing' },
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('[BacMentor] Stripe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
