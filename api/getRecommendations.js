/**
 * api/getRecommendations.js
 * This serverless function handles requests for learning recommendations
 * by routing them to Gemini, OpenAI, or Perplexity based on user choice.
 */

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { subject, userInfo, experienceLevel, learningFormat, model } = req.body;

  // 1. Determine which model to actually use. 
  // Per your requirement: Default to Perplexity for Video to get accurate TikTok/YouTube links.
  let activeModel = model;
  if (learningFormat === 'Video') {
    activeModel = 'Perplexity';
  }

  // 2. Construct the "Judgment" Prompt
  // This tells the AI to judge the best content and enforce the < 11-minute rule.
  const systemPrompt = `You are an elite learning curator.
Your goal: Find the single best learning content for the user's specific profile.
Constraints:
- Duration: The content must be learnable in approximately 11 minutes or less.
- Quality: You must judge which specific link (Text, Audio, or Video) provides the most value for a ${experienceLevel} level.
- Format: Return exactly 2 highly-vetted recommendations.
- Output: You MUST return a valid JSON object only. No conversational text.

JSON Structure:
{
  "recommendations": [
    {
      "topic": "Concise Title",
      "description": "One sentence explaining why this is the best 11-minute resource for this user.",
      "url": "Direct working link"
    }
  ]
}`;

  const userRequest = `User Profile: ${userInfo}
Subject: ${subject}
Experience: ${experienceLevel}
Format: ${learningFormat}`;

  try {
    let apiUrl, headers, body;

    // --- CASE 1: OPENAI ---
    if (activeModel === 'OpenAI') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OpenAI API Key missing in Vercel settings.");

      apiUrl = 'https://api.openai.com/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      };
      body = JSON.stringify({
        model: "gpt-4-turbo-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userRequest }
        ],
        response_format: { type: "json_object" }
      });

    // --- CASE 2: PERPLEXITY (Great for Real-Time Links/Video) ---
    } else if (activeModel === 'Perplexity') {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (!apiKey) throw new Error("Perplexity API Key missing in Vercel settings.");

      apiUrl = 'https://api.perplexity.ai/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      };
      body = JSON.stringify({
        model: "sonar-small-online", 
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userRequest }
        ],
        response_format: { type: "json_object" }
      });

    // --- CASE 3: GEMINI (Default) ---
    } else {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("Gemini API Key missing in Vercel settings.");

      // Updated to the latest stable preview model version to avoid deprecation warnings
      apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
      headers = { 'Content-Type': 'application/json' };
      body = JSON.stringify({
        contents: [{
          parts: [{ text: `${systemPrompt}\n\n${userRequest}` }]
        }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      });
    }

    // Execute the fetch
    const response = await fetch(apiUrl, { method: 'POST', headers, body });
    const data = await response.json();

    if (!response.ok) {
      console.error(`${activeModel} Error:`, data);
      throw new Error(`${activeModel} API error: ${response.status}`);
    }

    // 3. Standardize the Output
    let standardizedResult;

    if (activeModel === 'OpenAI' || activeModel === 'Perplexity') {
      const rawJson = data.choices?.[0]?.message?.content;
      if (!rawJson) throw new Error(`Invalid response from ${activeModel}`);
      
      standardizedResult = {
        candidates: [{
          content: {
            parts: [{ text: rawJson }]
          }
        }]
      };
    } else {
      // Ensure Gemini data is valid before assigning
      if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error("Invalid response structure from Gemini");
      }
      standardizedResult = data;
    }

    res.status(200).json(standardizedResult);

  } catch (error) {
    console.error("Proxy Error:", error);
    res.status(500).json({ error: error.message });
  }
}
}
