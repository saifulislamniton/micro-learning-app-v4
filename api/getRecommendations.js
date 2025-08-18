// api/getRecommendations.js

/**
 * A reliable helper function to verify a URL's existence.
 * It uses a fast HEAD request, which is less likely to be blocked by bot detection.
 * @param {string} url The URL to verify.
 * @returns {Promise<boolean>} True if the URL exists and returns a 2xx status code, false otherwise.
 */
async function verifyUrl(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second timeout

    const response = await fetch(url, {
      method: 'HEAD', // Reverting to HEAD - it's more reliable against bot detection.
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
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("API key is not configured on the server.");
    }

    const prompt = `
      As an expert learning consultant, generate 6 micro-learning topics for the following user and request:
      - Subject: "${userInput.subject}"
      - User Profile: "${userInput.userInfo}"
      - Experience Level: "${userInput.experienceLevel}"
      - Preferred Format: "${userInput.learningFormat}"

      A micro-learning topic must be a small, specific concept that can be learned in approximately 11 minutes. 
      For each topic:
      1.  Provide a compelling, one-sentence description tailored to the user.
      2.  Provide a real, publicly accessible, and relevant URL (like a Wikipedia article, a YouTube video, a blog post, or a specific documentation page) where the user can learn about this topic.
    `;

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

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error("Gemini API Error:", errorText);
      throw new Error(`Gemini API request failed with status ${apiResponse.status}`);
    }

    const result = await apiResponse.json();

    // --- Verification Logic ---
    if (result.candidates && result.candidates.length > 0) {
      const jsonText = result.candidates[0].content.parts[0].text;
      const parsedData = JSON.parse(jsonText);
      const candidateRecommendations = parsedData.recommendations || [];
      
      const verifiedRecommendations = [];
      const desiredCount = 2;

      for (const rec of candidateRecommendations) {
        if (rec.url) {
          console.log(`Verifying URL: ${rec.url}`);
          const isUrlValid = await verifyUrl(rec.url);
          if (isUrlValid) {
            console.log(`---> URL is VALID: ${rec.url}`);
            verifiedRecommendations.push(rec);
            if (verifiedRecommendations.length >= desiredCount) {
              break;
            }
          } else {
            console.log(`---> URL is INVALID: ${rec.url}`);
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
      const responseText = result.promptFeedback?.blockReason?.toString() || "The AI model did not return any recommendations.";
      throw new Error(responseText);
    }

  } catch (error) {
    console.error('Proxy Error:', error);
    res.status(500).json({ error: error.message });
  }
}