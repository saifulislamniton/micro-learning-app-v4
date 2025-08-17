import React, { useState, useCallback } from 'react';

// --- Helper Components ---

// Displays a loading spinner
const LoadingSpinner = () => (
  <div className="flex flex-col items-center justify-center p-8">
    <svg className="animate-spin -ml-1 mr-3 h-10 w-10 text-sky-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="http://www.w3.org/2000/svg">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    <p className="mt-4 text-slate-400">Crafting personalized micro-learnings...</p>
  </div>
);

// Displays an error message
const ErrorMessage = ({ message }) => (
  <div className="bg-red-900/50 border border-red-600 text-red-300 px-4 py-3 rounded-lg relative" role="alert">
    <strong className="font-bold">Oops! </strong>
    <span className="block sm:inline">{message}</span>
  </div>
);

// Displays a single recommendation card
const RecommendationCard = ({ topic, description, index }) => (
    <div 
        className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 shadow-lg transform hover:scale-105 transition-transform duration-300 ease-in-out"
        style={{ animationDelay: `${index * 100}ms` }}
    >
        <h3 className="text-lg font-bold text-sky-400 mb-2">{topic}</h3>
        <p className="text-slate-300 text-sm">{description}</p>
    </div>
);


// --- Main App Component ---

const App = () => {
  // --- State Management ---
  const [userInput, setUserInput] = useState({
    subject: 'Quantum Computing',
    userInfo: 'A software developer interested in new technologies.',
    experienceLevel: 'Beginner',
    learningFormat: 'Text',
  });
  const [recommendations, setRecommendations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [displaySubject, setDisplaySubject] = useState('');

  // --- API Call to Gemini ---
  const fetchRecommendations = useCallback(async () => {
    if (!userInput.subject) return;

    setIsLoading(true);
    setError(null);
    setRecommendations([]);

    const apiUrl = '/api/getRecommendations'; 

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userInput)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API request failed with status ${response.status}`);
      }

      const result = await response.json();
      
      // ADDED THIS LINE FOR DEBUGGING
      console.log("Raw API Response:", JSON.stringify(result, null, 2));

      if (result.candidates && result.candidates.length > 0 && result.candidates[0].content.parts.length > 0) {
        const jsonText = result.candidates[0].content.parts[0].text;
        const parsedData = JSON.parse(jsonText);
        setRecommendations(parsedData.recommendations || []);
        setDisplaySubject(userInput.subject);
      } else {
        const responseText = result.promptFeedback?.blockReason?.toString() || "No valid content received from the API.";
        throw new Error(`The model could not generate a response. Reason: ${responseText}. Please adjust your input.`);
      }

    } catch (err) {
      console.error("Error fetching recommendations:", err);
      setError(err.message || "An unknown error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [userInput]);
  
  // --- Event Handlers ---
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setUserInput(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    fetchRecommendations();
  };

  // --- Render Method ---
  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-sky-400">
            Micro-Learning Navigator
          </h1>
          <p className="text-slate-400 mt-2">Your daily dose of knowledge, one small step at a time.</p>
        </header>

        <form onSubmit={handleSubmit} className="bg-slate-800/50 p-6 rounded-xl shadow-2xl border border-slate-700 space-y-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="subject" className="block text-sm font-medium text-slate-300 mb-2">
                What do you want to learn about?
              </label>
              <input
                type="text"
                id="subject"
                name="subject"
                value={userInput.subject}
                onChange={handleInputChange}
                className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-sky-500 transition"
                placeholder="e.g., 'Ancient Roman History'"
                required
              />
            </div>
            <div>
              <label htmlFor="userInfo" className="block text-sm font-medium text-slate-300 mb-2">
                Tell us about yourself
              </label>
              <input
                type="text"
                id="userInfo"
                name="userInfo"
                value={userInput.userInfo}
                onChange={handleInputChange}
                className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-sky-500 transition"
                placeholder="e.g., 'A high school history enthusiast'"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Your Experience Level</label>
            <div className="flex flex-wrap gap-4">
              {['Beginner', 'Intermediate', 'Advanced'].map(level => (
                <label key={level} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="experienceLevel"
                    value={level}
                    checked={userInput.experienceLevel === level}
                    onChange={handleInputChange}
                    className="form-radio h-4 w-4 text-sky-600 bg-slate-700 border-slate-600 focus:ring-sky-500"
                  />
                  <span className="text-slate-300">{level}</span>
                </label>
              ))}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Preferred Learning Format</label>
            <div className="flex flex-wrap gap-4">
              {['Text', 'Audio', 'Video'].map(format => (
                <label key={format} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="learningFormat"
                    value={format}
                    checked={userInput.learningFormat === format}
                    onChange={handleInputChange}
                    className="form-radio h-4 w-4 text-sky-600 bg-slate-700 border-slate-600 focus:ring-sky-500"
                  />
                  <span className="text-slate-300">{format}</span>
                </label>
              ))}
            </div>
          </d