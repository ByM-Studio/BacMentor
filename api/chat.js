export default async function handler(req, res) {
  const API_KEY = process.env.GROQ_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'Clé API manquante.' });

  try {
    const { contents, systemInstruction } = req.body;
    
    // Formatage pour Groq
    let messages = [{ role: "system", content: systemInstruction }];
    contents.forEach(msg => {
        messages.push({
            role: msg.role === 'model' ? 'assistant' : 'user',
            content: msg.parts[0].text
        });
    });

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages,
        temperature: 0.7
      })
    });

    const data = await groqRes.json();
    const replyText = data.choices?.[0]?.message?.content || 'Erreur de réponse.';
    return res.status(200).json({ text: replyText });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
