// api/getRecommendations.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const userInput = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("API key is not configured.");
    }

    const prompt = `
      As an expert learning consultant, generate exactly 5 micro-learning topics for the following user and request:
      - Subject: "${userInput.subject}"
      - User Profile: "${userInput.userInfo}"
      - Experience Level: "${userInput.experienceLevel}"
      - Preferred Format: "${userInput.learningFormat}"

      A micro-learning topic must be a small, specific concept that can be learned in 10-15 minutes. 
      For each topic, provide a compelling, one-sentence description that is tailored to the user's profile and preferred learning format. 
      For example, if the format is 'Audio', suggest a podcast idea. If 'Video', a short explainer video concept. If 'Text', a blog post or article idea.
    `;

    // CORRECTED SCHEMA
    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            "recommendations": {
              "type": "ARRAY",
              "items": {
                "type": "OBJECT",
                "properties": {
                  "topic": { "type": "STRING" },
                  "description": { "type": "STRING" }
                },
                "required": ["topic", "description"]
              }
            }
          },
          "required": ["recommendations"]
        }
      }
    };
    
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error("Gemini API Error:", errorText);
      throw new Error(`Gemini API request failed with status ${apiResponse.status}`);
    }

    const result = await apiResponse.json();
    res.status(200).json(result);

  } catch (error) {
    console.error('Proxy Error:', error);
    res.status(500).json({ error: error.message });
  }
}