import React, { useState } from 'react';
import { Search, BookOpen, Video, Headphones, Lightbulb, AlertCircle, Loader2 } from 'lucide-react';

const App = () => {
  const [subject, setSubject] = useState('');
  const [userInfo, setUserInfo] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('Beginner');
  const [learningFormat, setLearningFormat] = useState('Text');
  const [model, setModel] = useState('Gemini');
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [error, setError] = useState(null);

  const getRecommendations = async () => {
    setLoading(true);
    setError(null);
    setRecommendations([]);

    try {
      const response = await fetch('/api/getRecommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject,
          userInfo,
          experienceLevel,
          learningFormat,
          model
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to fetch recommendations');
      }

      // Handle standardizing the response from our Proxy
      let rawText = "";
      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        rawText = data.candidates[0].content.parts[0].text;
      } else {
        throw new Error("Unexpected response format from server");
      }

      const parsedData = JSON.parse(rawText);
      setRecommendations(parsedData.recommendations || []);
    } catch (err) {
      console.error("Frontend Error:", err);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-4xl mx-auto">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-extrabold text-slate-900 mb-2 tracking-tight">
            Micro-Learning <span className="text-blue-600">Architect</span>
          </h1>
          <p className="text-slate-600">Curated 11-minute expert paths designed for you.</p>
        </header>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1.5 text-slate-700">What do you want to learn?</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                  <input
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder="e.g. Quantum Computing, Sourdough Baking..."
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5 text-slate-700">Tell us about yourself</label>
                <textarea
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all h-24 resize-none"
                  placeholder="Your background, goals, or why you're interested..."
                  value={userInfo}
                  onChange={(e) => setUserInfo(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1.5 text-slate-700">Level</label>
                  <select 
                    value={experienceLevel} 
                    onChange={(e) => setExperienceLevel(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option>Beginner</option>
                    <option>Intermediate</option>
                    <option>Advanced</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5 text-slate-700">Format</label>
                  <select 
                    value={learningFormat} 
                    onChange={(e) => setLearningFormat(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option>Text</option>
                    <option>Video</option>
                    <option>Audio</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5 text-slate-700">AI Model</label>
                <select 
                  value={model} 
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option>Gemini</option>
                  <option>OpenAI</option>
                  <option>Perplexity</option>
                </select>
              </div>

              <button
                onClick={getRecommendations}
                disabled={loading || !subject}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 mt-2"
              >
                {loading ? <Loader2 className="animate-spin h-5 w-5" /> : <Lightbulb className="h-5 w-5" />}
                {loading ? 'Curating Content...' : 'Generate My Path'}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 text-red-700 mb-8">
            <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-bold">Recommendation Error</p>
              <p className="text-sm opacity-90">{error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {recommendations.map((rec, index) => (
            <div key={index} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:border-blue-300 transition-all group">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  {learningFormat === 'Video' ? <Video size={20} /> : learningFormat === 'Audio' ? <Headphones size={20} /> : <BookOpen size={20} />}
                </div>
                <h3 className="font-bold text-lg text-slate-800">{rec.topic}</h3>
              </div>
              <p className="text-slate-600 text-sm leading-relaxed mb-6">
                {rec.description}
              </p>
              <a
                href={rec.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-blue-600 font-bold hover:text-blue-800 text-sm"
              >
                Start Learning Now →
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default App;
