import React, { useState, useEffect } from 'react';

export default function ChatStartPage({ onStart }) {
  const [showContextForm, setShowContextForm] = useState(false);

  const handleStart = () => {
    setShowContextForm(true);
  };

  return (
    <div className="flex items-center justify-center h-full">
      {!showContextForm ? (
        <button
          className="px-6 py-3 rounded-md shadow-lg hover:shadow-xl transition"
          onClick={handleStart}
        >
          Start Chat
        </button>
      ) : (
        <ContextForm onSubmit={onStart} />
      )}
    </div>
  );
}

function ContextForm({ onSubmit }) {
    const [helpType, setHelpType] = useState('concept');
    const [topic, setTopic] = useState('');
    const [levels, setLevels] = useState([]);
    const [selectedLevel, setSelectedLevel] = useState('');
    const [file, setFile] = useState(null);
    const [loadingLevels, setLoadingLevels] = useState(false);
  
    useEffect(() => {
      // only fetch levels when helpType is concept and a topic is provided
      if (helpType === 'concept' && topic) {
        setLoadingLevels(true);
        fetch('/api/breakdown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic })
        })
          .then(res => res.json())
          .then(data => {
            setLevels(data.levels || []);
            setLoadingLevels(false);
          })
          .catch(() => setLoadingLevels(false));
      }
    }, [helpType, topic]);
  
    const handleFileChange = (e) => {
      setFile(e.target.files[0]);
    };
  
    const handleSubmit = (e) => {
      e.preventDefault();
      // Build form data
      const formData = new FormData();
      formData.append('helpType', helpType);
      formData.append('topic', topic);
      formData.append('understandingLevel', selectedLevel);
      if (file) formData.append('file', file);
  
      onSubmit(formData);
    };
  
    return (
      <form onSubmit={handleSubmit} className="space-y-4 p-4 max-w-md mx-auto">
        <label className="block">
          <span>What kind of help do you need?</span>
          <select
            value={helpType}
            onChange={e => setHelpType(e.target.value)}
            className="mt-1 block w-full"
          >
            <option value="concept">Help with understanding a concept</option>
            <option value="problem">Help with a specific problem</option>
          </select>
        </label>
  
        {helpType === 'concept' && (
          <>
            <label className="block">
              <span>Topic</span>
              <input
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g., Fourier transforms"
                className="mt-1 block w-full"
              />
            </label>
  
            {loadingLevels && <p>Loading levels...</p>}
  
            {!loadingLevels && levels.length > 0 && (
              <label className="block">
                <span>Choose your desired depth</span>
                {levels.map((lvl, idx) => (
                  <div key={idx} className="mt-1">
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        name="level"
                        value={lvl}
                        onChange={() => setSelectedLevel(lvl)}
                        className="mr-2"
                      />
                      {lvl}
                    </label>
                  </div>
                ))}
              </label>
            )}
          </>
        )}
  
        {helpType === 'problem' && (
          <label className="block">
            <span>Describe the problem</span>
            <textarea
              onChange={e => setTopic(e.target.value)}
              placeholder="Type your question or paste code..."
              className="mt-1 block w-full h-24"
            />
          </label>
        )}
  
        <label className="block">
          <span>Optional: Upload file for context</span>
          <input type="file" onChange={handleFileChange} className="mt-1" />
        </label>
  
        <button
          type="submit"
          disabled={helpType === 'concept' && !selectedLevel}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
        >
          Start Chat
        </button>
      </form>
    );
  }