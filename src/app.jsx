export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { subject, userInfo, experienceLevel, learningFormat, model } = req.body;
  const systemPrompt = `You are an expert learning consultant. Generate exactly 2 micro-learning topics (< 11 mins).
  Response must be JSON: { "recommendations": [{ "topic": "...", "description": "...", "url": "..." }] }`;

  try {
    let apiUrl, headers, payload;

    if (model === 'OpenAI') {
      apiUrl = 'https://api.openai.com/v1/chat/completions';
      headers = { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` 
      };
      payload = {
        model: "gpt-4-turbo-preview",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `Subject: ${subject}` }],
        response_format: { type: "json_object" }
      };
    } else if (model === 'Perplexity') {
      apiUrl = 'https://api.perplexity.ai/chat/completions';
      headers = { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}` 
      };
      payload = {
        model: "sonar-small-online",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `Subject: ${subject}` }],
        response_format: { type: "json_object" }
      };
    } else {
      // Default to Gemini
      apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${process.env.GEMINI_API_KEY}`;
      headers = { 'Content-Type': 'application/json' };
      payload = {
        contents: [{ parts: [{ text: `${systemPrompt}\n\nSubject: ${subject}` }] }],
        generationConfig: { responseMimeType: "application/json" }
      };
    }

    const response = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
    const data = await response.json();

    // Standardize the output format for the frontend
    let finalData = data;
    if (model === 'OpenAI' || model === 'Perplexity') {
      const content = data.choices[0].message.content;
      finalData = { candidates: [{ content: { parts: [{ text: content }] } }] };
    }

    res.status(200).json(finalData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
