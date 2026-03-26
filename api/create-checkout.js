import Stripe from 'stripe';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return res.status(500).json({ error: 'Configuration paiement manquante.' });
  }

  try {
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
    const { email } = req.body || {};

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      || `https://${req.headers.host}`
      || 'https://bac-mentor.vercel.app';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'paypal'], // Combiné ici
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'BacMentor Premium',
            description: 'Messages illimités · Upload de cours · Fiches IA · Simulations d\'épreuves',
          },
          unit_amount: 500, // 5,00 €
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      // Très important pour l'UX et le Webhook
      customer_email: email ? email.toLowerCase().trim() : undefined,
      
      success_url: `${baseUrl}/?payment=success`,
      cancel_url:  `${baseUrl}/?payment=cancelled`,
      locale: 'fr',
      metadata: { 
        source: 'bacmentor_landing',
        customer_email: email ? email.toLowerCase().trim() : '' // On double la sécurité ici
      },
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('[BacMentor] Stripe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
