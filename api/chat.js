export default async function handler(req, res) {
  const API_KEY = process.env.GROQ_API_KEY;

  if (!API_KEY) {
    console.error('[BacMentor] GROQ_API_KEY manquante !');
    return res.status(500).json({ error: 'Clé API manquante côté serveur.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  try {
    const { contents, systemInstruction } = req.body;

    if (!contents || !Array.isArray(contents)) {
      return res.status(400).json({ error: 'Corps de requête invalide.' });
    }

    // ── 1. DÉTECTION SUJETS SENSIBLES ──────────────────────────────────────
    const lastUserMsg = [...contents].reverse().find(m => m.role === 'user');
    const lastPart    = lastUserMsg?.parts?.[0];
    const lastText    = (lastPart?.text || lastPart?.content || '').toLowerCase();

    const alertKeywords = [
      'suicide','suicidaire','me tuer','envie de mourir','plus envie de vivre',
      'harcèlement','harcelé','harcelée','on me harcèle',
      'dépression','déprimé','déprimée','je veux mourir',
      'me faire du mal','automutilation','me blesser',
      'en danger','maltraitance','violence','abus'
    ];

    if (alertKeywords.some(kw => lastText.includes(kw))) {
      return res.status(200).json({
        candidates: [{
          content: {
            parts: [{ text: `Je t'entends, et ce que tu ressens est important. 💙\n\nJe suis un coach de révision, pas un professionnel de santé — mais je veux que tu saches que tu n'es pas seul(e).\n\n**Voici des numéros qui peuvent t'aider maintenant :**\n\n📞 **3114** — Numéro national de prévention du suicide (24h/24)\n📞 **3020** — Harcèlement scolaire\n📞 **119** — Enfance en danger\n🌐 **e-enfance.gouv.fr** — Aide en ligne\n\nSi tu veux, on peut continuer à réviser ensemble quand tu te sens prêt(e). Je suis là. 🤝` }]
          }
        }]
      });
    }

    // ── 2. REDIRECTION PACKS ───────────────────────────────────────────────
    const packsKeywords = [
      'cours complet','fiche complète','fiches complètes','tous les cours',
      'document','pdf','fichier','télécharger','téléchargement',
      'pack','packs','ressource','ressources','résumé complet'
    ];

    if (packsKeywords.some(kw => lastText.includes(kw))) {
      return res.status(200).json({
        candidates: [{
          content: {
            parts: [{ text: `Bonne idée ! 📦 J'ai justement des packs de révision complets (fiches, exercices corrigés, méthodes) disponibles en téléchargement gratuit.\n\n👉 **[Voir tous les packs → /packs.html](/packs.html)**\n\nEn attendant, je peux aussi t'expliquer n'importe quelle notion directement ici — qu'est-ce que tu veux qu'on travaille ensemble ? 🎯` }]
          }
        }]
      });
    }

    // ── 3. CONSTRUCTION DES MESSAGES ───────────────────────────────────────
    const messages = [];

    // System prompt enrichi
    const baseSystem    = systemInstruction?.parts?.[0]?.text || '';
    const enrichedSystem = baseSystem + `

STYLE PÉDAGOGIQUE OBLIGATOIRE :
- Méthode socratique : guide par des questions avant de donner la réponse
- Structure tes réponses avec des titres clairs (## Titre), des étapes numérotées, et des encadrés "📌 À retenir :"
- Jamais plus de 3 points par réponse — une chose à la fois
- Langage simple, accessible à un lycéen, sans jargon inutile
- Toujours encourageant, jamais condescendant
- Pour les formules mathématiques, utilise la notation LaTeX entre $ pour inline (ex: $E=mc^2$) et $$ pour bloc
- Si l'élève se trompe, explique POURQUOI avant de donner la bonne réponse
- Termine toujours par une question ou un mini-exercice pour vérifier la compréhension`;

    messages.push({ role: 'system', content: enrichedSystem });

    // ── 4. CONSTRUCTION DE L'HISTORIQUE & DÉTECTION IMAGE ─────────────────
    // ✅ FIX CRITIQUE : l'ancienne version n'avait pas de branche "else"
    // pour les messages texte simples → Groq recevait un historique vide
    let hasImage = false;

    for (const msg of contents) {
      const role = msg.role === 'model' ? 'assistant' : 'user';

      if (msg.parts && Array.isArray(msg.parts)) {
        const contentParts = [];

        for (const part of msg.parts) {
          if (part.image_url) {
            hasImage = true;
            contentParts.push({ type: 'image_url', image_url: part.image_url });
          } else if (part.text) {
            contentParts.push({ type: 'text', text: part.text });
          }
        }

        if (contentParts.length === 0) {
          // Sécurité : message vide, on l'ignore
          continue;
        } else if (contentParts.length === 1 && contentParts[0].type === 'text') {
          // ✅ FIX : message texte simple → string directe (format Groq standard)
          messages.push({ role, content: contentParts[0].text });
        } else {
          // Message multimodal (texte + image) → tableau de parts
          messages.push({ role, content: contentParts });
        }
      } else if (typeof msg.content === 'string') {
        // Cas où le frontend envoie déjà content: string
        messages.push({ role, content: msg.content });
      }
    }

    // Choix du modèle selon présence d'image
    const model = hasImage
      ? 'meta-llama/llama-4-scout-17b-16e-instruct'
      : 'llama-3.3-70b-versatile';

    console.log(`[BacMentor] Appel Groq | modèle: ${model} | messages: ${messages.length} | image: ${hasImage}`);

    // ── 5. APPEL GROQ ──────────────────────────────────────────────────────
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens:  1024,
        temperature: 0.7
      })
    });

    const data = await groqRes.json();
    console.log('[BacMentor] Groq status:', groqRes.status);

    if (!groqRes.ok) {
      console.error('[BacMentor] Erreur Groq:', data?.error?.message);
      return res.status(groqRes.status).json({ error: data?.error?.message || 'Erreur Groq' });
    }

    const replyText = data.choices?.[0]?.message?.content || 'Pas de réponse.';

    // Conversion réponse → format Gemini (frontend inchangé)
    return res.status(200).json({
      candidates: [{
        content: {
          parts: [{ text: replyText }]
        }
      }]
    });

  } catch (error) {
    console.error('[BacMentor] Erreur serveur:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
