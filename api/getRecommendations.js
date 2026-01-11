/**
 * api/getRecommendations.js
 * This serverless function acts as a proxy to Gemini, OpenAI, or Perplexity.
 * Uses the built-in 'https' module to ensure zero-dependency stability on Vercel.
 */

const https = require('https');

module.exports = async (req, res) => {
  // 1. Guard against non-POST requests
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

  let activeModel = model;
  if (learningFormat === 'Video') {
    activeModel = 'Perplexity';
  }

  if (!keys[activeModel]) {
    return res.status(500).json({ 
      error: "Configuration Error", 
      message: `The API key for ${activeModel} is missing in Vercel settings.` 
    });
  }

  const systemPrompt = `You are an elite learning curator. Find the best content.
Constraints: < 11 mins duration, 2 recommendations, valid JSON output only.
Structure: {"recommendations": [{"topic": "...", "description": "...", "url": "..."}]}`;

  const userRequest = `User Profile: ${userInfo}\nSubject: ${subject}\nLevel: ${experienceLevel}\nFormat: ${learningFormat}`;

  try {
    let url, method = 'POST', headers = { 'Content-Type': 'application/json' }, bodyData;

    if (activeModel === 'OpenAI') {
      url = 'https://api.openai.com/v1/chat/completions';
      headers['Authorization'] = `Bearer ${keys.OpenAI}`;
      bodyData = JSON.stringify({
        model: "gpt-4-turbo-preview",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userRequest }],
        response_format: { type: "json_object" }
      });
    } else if (activeModel === 'Perplexity') {
      url = 'https://api.perplexity.ai/chat/completions';
      headers['Authorization'] = `Bearer ${keys.Perplexity}`;
      bodyData = JSON.stringify({
        model: "sonar-small-online", 
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userRequest }],
        response_format: { type: "json_object" }
      });
    } else {
      url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${keys.Gemini}`;
      bodyData = JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userRequest}` }] }],
        generationConfig: { responseMimeType: "application/json" }
      });
    }

    // Helper function to handle the HTTPS request
    const makeRequest = (targetUrl, options, body) => {
      return new Promise((resolve, reject) => {
        const request = https.request(targetUrl, options, (response) => {
          let data = '';
          response.on('data', (chunk) => data += chunk);
          response.on('end', () => resolve({ status: response.statusCode, data: JSON.parse(data) }));
        });
        request.on('error', (err) => reject(err));
        request.write(body);
        request.end();
      });
    };

    const apiResult = await makeRequest(url, { method, headers }, bodyData);

    if (apiResult.status !== 200) {
      throw new Error(`API returned status ${apiResult.status}: ${JSON.stringify(apiResult.data)}`);
    }

    let standardizedResult;
    if (activeModel === 'OpenAI' || activeModel === 'Perplexity') {
      const rawJson = apiResult.data.choices?.[0]?.message?.content;
      standardizedResult = { candidates: [{ content: { parts: [{ text: rawJson }] } }] };
    } else {
      standardizedResult = apiResult.data;
    }

    res.status(200).json(standardizedResult);

  } catch (error) {
    console.error("Proxy Error:", error.message);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};
