// api/getRecommendations.js

// This function remains the same. It's still a valuable check.
async function verifyUrl(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second timeout
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
    // --- CHANGE 1: Using the new environment variable ---
    const apiKey = process.env.PERPLEXITY_API_KEY;

    if (!apiKey) {
      throw new Error("PERPLEXITY_API_KEY is not configured on the server.");
    }

    // --- CHANGE 2: The API endpoint is different ---
    const apiUrl = 'https://api.perplexity.ai/chat/completions';

    // --- CHANGE 3: The prompt and payload structure are completely different for Perplexity ---
    // We create a system prompt to force the AI to return JSON.
    const systemPrompt = `You are an expert learning consultant. Your role is to generate a list of micro-learning topics. 
    Your response MUST be a single, valid JSON object and nothing else. Do not include any text before or after the JSON.
    The JSON object must have a single key called "recommendations", which is an array of objects.
    Each object in the array must have three keys: "topic", "description", and "url".`;

    const userPrompt = `Generate 6 micro-learning topics based on this request:
      - Subject: "${userInput.subject}"
      - User Profile: "${userInput.userInfo}"
      - Experience Level: "${userInput.experienceLevel}"
      - Preferred Format: "${userInput.learningFormat}"
      
      Each topic should be learnable in about 11 minutes. The URL must be a real, working link.`;

    const payload = {
      model: "sonar-small-online", // Perplexity's fast, web-connected model
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    };

    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // --- CHANGE 4: Authentication is done via a Bearer token ---
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
    
    // --- CHANGE 5: The response structure is different. We get the content from choices. ---
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
      
      // We need to re-format the response to mimic the Gemini structure the frontend expects.
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
