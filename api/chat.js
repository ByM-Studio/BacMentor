export default async function handler(req, res) {
  const API_KEY = process.env.GEMINI_API_KEY;
 
  // 1. Vérif clé API
  if (!API_KEY) {
    console.error('[BacMentor] GEMINI_API_KEY manquante !');
    return res.status(500).json({ error: 'Clé API manquante côté serveur.' });
  }
 
  // 2. Vérif méthode
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }
 
  const MODEL = 'gemini-2.0-flash';
  const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
 
  try {
    const { contents, systemInstruction } = req.body;
 
    if (!contents || !Array.isArray(contents)) {
      return res.status(400).json({ error: 'Corps de requête invalide : "contents" manquant.' });
    }
 
    const geminiBody = { contents };
    if (systemInstruction) geminiBody.systemInstruction = systemInstruction;
 
    // 3. Appel Gemini
    console.log('[BacMentor] Appel Gemini →', MODEL, '| messages:', contents.length);
    const geminiRes = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody)
    });
 
    const data = await geminiRes.json();
 
    // 4. Log de la réponse brute (visible dans les logs Vercel)
    console.log('[BacMentor] Réponse Gemini status:', geminiRes.status);
    console.log('[BacMentor] Réponse Gemini data:', JSON.stringify(data).slice(0, 500));
 
    // 5. Erreur côté Gemini (quota dépassé, clé invalide, etc.)
    if (!geminiRes.ok) {
      const errMsg = data?.error?.message || `Erreur Gemini ${geminiRes.status}`;
      console.error('[BacMentor] Erreur Gemini:', errMsg);
      return res.status(geminiRes.status).json({ error: errMsg });
    }
 
    // 6. Réponse bloquée par les filtres de sécurité
    if (data.promptFeedback?.blockReason) {
      console.warn('[BacMentor] Bloqué par safety filter:', data.promptFeedback.blockReason);
      return res.status(200).json({
        candidates: [{
          content: { parts: [{ text: "Je ne peux pas répondre à cette question. Reformule ta demande !" }] }
        }]
      });
    }
 
    // 7. Pas de candidates dans la réponse
    if (!data.candidates || data.candidates.length === 0) {
      console.error('[BacMentor] Pas de candidates dans la réponse:', JSON.stringify(data));
      return res.status(200).json({
        candidates: [{
          content: { parts: [{ text: "Réponse vide de l'IA. Réessaie !" }] }
        }]
      });
    }
 
    return res.status(200).json(data);
 
  } catch (error) {
    console.error('[BacMentor] Erreur serveur:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
