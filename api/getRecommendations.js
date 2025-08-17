// api/getRecommendations.js

/**
 * An advanced helper function to verify a URL.
 * It uses a fast HEAD request for general sites.
 * For YouTube links, it performs a GET request and checks the page content for signs of an unavailable video.
 * @param {string} url The URL to verify.
 * @returns {Promise<boolean>} True if the URL is valid and content is available, false otherwise.
 */
async function verifyUrl(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second timeout

    // Special handling for YouTube URLs
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      const response = await fetch(url, {
        method: 'GET', // We need the body for YouTube
        signal: controller.signal,
        redirect: 'follow'
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return false; // The page itself doesn't exist (e.g., 404)
      }

      const pageText = await response.text();
      // Check for common "video unavailable" messages in the page's content or title
      const isUnavailable = 
        pageText.includes("Video unavailable") || 
        pageText.includes("This video is private") ||
        pageText.includes("This video is unlisted") ||
        pageText.includes("This video has been removed");

      return !isUnavailable; // Return true only if the "unavailable" text is NOT found
    }

    // Standard, fast HEAD request for all other URLs
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