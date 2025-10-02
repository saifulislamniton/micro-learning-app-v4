// api/getRecommendations.js

// We no longer need the verifyUrl function, as Google Search grounding is more reliable.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const userInput = req.body;
    // --- Using the Gemini Key Again ---
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured on the server.");
    }

    const prompt = `
      As an expert learning consultant, generate 2 micro-learning topics for the following user and request:
      - Subject: "${userInput.subject}"
      - User Profile: "${userInput.userInfo}"
      - Experience Level: "${userInput.experienceLevel}"
      - Preferred Format: "${userInput.learningFormat}"

      A micro-learning topic must be a small, specific concept that can be learned in approximately 11 minutes. 
      For each topic, provide a compelling, one-sentence description and a real, publicly accessible URL from your search results.
    `;

    // --- Using the Gemini API again, with the crucial "tools" property for grounding ---
    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      // THIS IS THE KEY: It forces the model to use Google Search
      tools: [{
        "google_search": {}
      }],
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
                  "description": { "type": "STRING" },
                  "url": { "type": "STRING" }
                },
                "required": ["topic", "description", "url"]
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

    const responseBodyText = await apiResponse.text();

    if (!apiResponse.ok) {
      console.error("Gemini API Error Body:", responseBodyText);
      throw new Error(`Gemini API request failed with status ${apiResponse.status}. Check Vercel logs.`);
    }

    // The rest of the logic can remain simple because the frontend expects the Gemini format.
    const result = JSON.parse(responseBodyText);
    res.status(200).json(result);

  } catch (error) {
    console.error('Proxy Error:', error);
    res.status(500).json({ error: error.message });
  }
}
