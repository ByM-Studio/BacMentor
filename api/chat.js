export default async function handler(req, res) {
  const API_KEY = process.env.GEMINI_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: 'Clé API Gemini manquante dans les variables d\'environnement Vercel.' });
  }

  const URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

  try {
    const { contents, systemInstruction } = req.body;

    const body = { contents };
    if (systemInstruction) body.systemInstruction = systemInstruction;

    const response = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    // Remonte l'erreur Gemini au frontend si besoin
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || 'Erreur API Gemini' });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
