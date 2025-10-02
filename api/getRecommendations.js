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

    // A simplified, single user prompt. This is the most basic and reliable method.
    const userPrompt = `
      Generate 6 micro-learning topics about "${userInput.subject}" for a "${userInput.experienceLevel}" user who is a "${userInput.userInfo}".
      The user prefers a "${userInput.learningFormat}" format.
      Each topic should be learnable in about 11 minutes.
      You MUST provide a real, working URL for each topic.
      Your entire response must be a single JSON object with one key "recommendations", which is an array of objects.
      Each object in the array must have three keys: "topic", "description", and "url".
    `;
    
const payload = {
    model: "sonar", // or "sonar-pro" if you want stronger search
    messages: [
      { role: "system", content: "Return ONLY valid JSON matching the provided schema." },
      { role: "user", content: userPrompt }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "recommendations_schema",
        schema: {
          type: "object",
          properties: {
            recommendations: {
              type: "array",
              minItems: 2,
              items: {
                type: "object",
                required: ["topic", "description", "url"],
                properties: {
                  topic: { type: "string" },
                  description: { type: "string" },
                  url: { type: "string", format: "uri" }
                }
              }
            }
          },
          required: ["recommendations"],
          additionalProperties: false
        },
        strict: true
      }
    }
  };


    
    const responseBodyText = await apiResponse.text();

    if (!apiResponse.ok) {
      console.error("Perplexity API Error Body:", responseBodyText);
      throw new Error(`Perplexity API request failed with status ${apiResponse.status}. Check Vercel logs for details.`);
    }

    const result = JSON.parse(responseBodyText);
    
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
        throw new Error("The AI generated links, but none could be verified as active. Please try again.");
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
