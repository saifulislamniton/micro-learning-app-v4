/**
 * api/getRecommendations.js
 * This serverless function handles requests for learning recommendations.
 * Updated to use 'require' and 'module.exports' for stable Vercel deployment.
 */

const axios = require('axios');

module.exports = async (req, res) => {
  // 1. Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { subject, userInfo, experienceLevel, learningFormat, model } = req.body;

  // 2. Validate Environment Variables
  const keys = {
    OpenAI: process.env.OPENAI_API_KEY,
    Perplexity: process.env.PERPLEXITY_API_KEY,
    Gemini: process.env.GEMINI_API_KEY
  };

  // 3. Logic: Force Perplexity for Video format to ensure real-time link accuracy
  let activeModel = model;
  if (learningFormat === 'Video') {
    activeModel = 'Perplexity';
  }

  // Safety check: ensure the required key exists for the chosen model
  if (!keys[activeModel]) {
    console.error(`Missing API key for model: ${activeModel}`);
    return res.status(500).json({ 
      error: "Configuration Error", 
      message: `The API key for ${activeModel} is missing in your Vercel project settings.` 
    });
  }

  const systemPrompt = `You are an elite learning curator. 
Find the absolute best content for this specific user.
Constraints:
- Content must be learnable in < 11 minutes.
- Return exactly 2 high-quality recommendations.
- Output MUST be valid JSON only. No extra text.

JSON Structure:
{
  "recommendations": [
    {
      "topic": "Concise Title",
      "description": "One sentence explaining why this fits the user.",
      "url": "Direct URL"
    }
  ]
}`;

  const userRequest = `User Info: ${userInfo}\nSubject: ${subject}\nLevel: ${experienceLevel}\nFormat: ${learningFormat}`;

  try {
    let apiResponse;

    if (activeModel === 'OpenAI') {
      apiResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: "gpt-4-turbo-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userRequest }
        ],
        response_format: { type: "json_object" }
      }, {
        headers: { 'Authorization': `Bearer ${keys.OpenAI}` }
      });

    } else if (activeModel === 'Perplexity') {
      apiResponse = await axios.post('https://api.perplexity.ai/chat/completions', {
        model: "sonar-small-online", 
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userRequest }
        ],
        response_format: { type: "json_object" }
      }, {
        headers: { 'Authorization': `Bearer ${keys.Perplexity}` }
      });

    } else {
      // Default: Gemini
      apiResponse = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${keys.Gemini}`,
        {
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userRequest}` }] }],
          generationConfig: { responseMimeType: "application/json" }
        }
      );
    }

    // 4. Extract and Standardize Data
    const data = apiResponse.data;
    let standardizedResult;

    if (activeModel === 'OpenAI' || activeModel === 'Perplexity') {
      const rawJson = data.choices?.[0]?.message?.content;
      if (!rawJson) throw new Error(`Empty response content from ${activeModel}`);
      
      standardizedResult = {
        candidates: [{
          content: {
            parts: [{ text: rawJson }]
          }
        }]
      };
    } else {
      // Gemini response format
      standardizedResult = data;
    }

    return res.status(200).json(standardizedResult);

  } catch (error) {
    console.error("API Error Detail:", error.response?.data || error.message);
    
    return res.status(500).json({ 
      error: "Proxy execution failed", 
      message: error.message,
      details: error.response?.data || null
    });
  }
};
