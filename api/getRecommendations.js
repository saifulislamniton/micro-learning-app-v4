// api/getRecommendations.js

// This function remains the same.
async function verifyUrl(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow'
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.warn(`URL verification failed for ${url}:`, error.name);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const userInput = req.body;
    const apiKey = process.env.PERPLEXITY_API_KEY;

    if (!apiKey) {
      throw new Error("PERPLEXITY_API_KEY is not configured on the server.");
    }

    const apiUrl = 'https://api.perplexity.ai/chat/completions';

    // UPDATED PROMPT: We no longer need to instruct the AI about JSON formatting.
    // The system prompt is now simpler and just defines the AI's role.
    const systemPrompt = `You are an expert learning consultant. Your role is to generate a list of micro-learning topics.`;

    const userPrompt = `Generate 6 micro-learning topics based on this request:
      - Subject: "${userInput.subject}"
      - User Profile: "${userInput.userInfo}"
      - Experience Level: "${userInput.experienceLevel}"
      - Preferred Format: "${userInput.learningFormat}"
      
      Each topic should be learnable in about 11 minutes. For each topic, provide a topic title, a short description, and a real, working URL.
      Your output must be a JSON object with a single key "recommendations", which is an array of objects, where each object has "topic", "description", and "url" keys.`;

    // UPDATED PAYLOAD: Added the official "response_format" for JSON mode.
    const payload = {
      model: "sonar-small-online",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" } // This is the crucial fix!
    };

    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error("Perplexity API Error:", errorText);
      throw new Error(`Perplexity API request failed with status ${apiResponse.status}`);
    }

    const result = await apiResponse.json();
    
    if (result.choices && result.choices.length > 0) {
      const jsonText = result.choices[0].message.content;
      const parsedData = JSON.parse(jsonText);
      const candidateRecommendations = parsedData.recommendations || [];
      
      const verifiedRecommendations = [];
      const desiredCount = 2;

      for (const rec of candidateRecommendations) {
        if (rec.url) {
          const isUrlValid = await verifyUrl(rec.url);
          if (isUrlValid) {
            verifiedRecommendations.push(rec);
            if (verifiedRecommendations.length >= desiredCount) {
              break;
            }
          }
        }
      }
      
      if (verifiedRecommendations.length === 0) {
        throw new Error("The AI generated links, but none could be verified as active websites. Please try again.");
      }
      
      const finalResponse = {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({ recommendations: verifiedRecommendations })
            }]
          }
        }]
      };

      res.status(200).json(finalResponse);

    } else {
      throw new Error("The Perplexity API did not return any recommendations.");
    }

  } catch (error) {
    console.error('Proxy Error:', error);
    res.status(500).json({ error: error.message });
  }
}
