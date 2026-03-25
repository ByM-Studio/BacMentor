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

    // Conversion format Gemini → format OpenAI
    const messages = [];

    // Ajout du system prompt
    if (systemInstruction?.parts?.[0]?.text) {
      messages.push({
        role: 'system',
        content: systemInstruction.parts[0].text
      });
    }

    // Conversion des messages (Gemini: parts[].text → OpenAI: content)
    for (const msg of contents) {
      messages.push({
        role: msg.role === 'model' ? 'assistant' : 'user',
        content: msg.parts?.[0]?.text || ''
      });
    }

    console.log('[BacMentor] Appel Groq | messages:', messages.length);

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: 1024,
        temperature: 0.7
      })
    });

    const data = await groqRes.json();
    console.log('[BacMentor] Groq status:', groqRes.status);

    if (!groqRes.ok) {
      console.error('[BacMentor] Erreur Groq:', data?.error?.message);
      return res.status(groqRes.status).json({ error: data?.error?.message || 'Erreur Groq' });
    }

    // Conversion réponse Groq → format Gemini (pour ne pas toucher au frontend)
    const replyText = data.choices?.[0]?.message?.content || 'Pas de réponse.';
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
