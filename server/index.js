import multer from 'multer';
import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import fetch, { Headers } from 'node-fetch';
import pdfjs from 'pdfjs-dist/legacy/build/pdf.js';
const { getDocument } = pdfjs;
import { createWorker } from 'tesseract.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildPrompt, buildRetryPrompt, buildContextPrompt } from '../utils/promptEngineer.js';
import { validateResponse } from '../utils/responseValidator.js';
import session from 'express-session';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

// Constants & model setup
const RULES = `Use markdown formatting always and useful formatting to enhance clarity. You are a Socratic tutor. Use short, question‑driven replies.`;

const genAI      = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const flashModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

global.fetch   = fetch;
global.Headers = Headers;

const app    = express();
const upload = multer();

// Configure CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Configure session middleware first
app.use(session({
  secret: process.env.SESSION_SECRET || 'socratictasecret',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  }
}));

// Then configure other middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory user store (replace with database in production)
const users = new Map();

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// UTILITY FUNCTIONS - Add these before endpoints
async function parseUploadedFile(file) {
  if (!file) return '';

  const mimeType = file.mimetype;

  if (mimeType === 'application/pdf') {
    try {
      const loadingTask = getDocument({ data: file.buffer });
      const pdfDocument = await loadingTask.promise;

      let textContent = '';
      const maxPages = Math.min(pdfDocument.numPages, 5); // Limit to 5 pages

      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const text = await page.getTextContent();
        const pageText = text.items.map(item => item.str).join(' ');
        textContent += pageText + '\n';
      }

      return textContent.trim().substring(0, 3000); // Limit to 3000 chars
    } catch (err) {
      console.error('PDF parsing error:', err);
      return '[PDF could not be parsed]';
    }
  } else if (mimeType.startsWith('image/')) {
    try {
      const worker = await createWorker('eng');
      const { data: { text } } = await worker.recognize(file.buffer);
      await worker.terminate();
      return text.trim().substring(0, 1500); // Limit OCR text
    } catch (err) {
      console.error('Image OCR error:', err);
      return '[Image could not be processed]';
    }
  } else if (mimeType.startsWith('text/')) {
    return file.buffer.toString('utf-8').trim().substring(0, 2000); // Limit text files
  } else {
    return '[Unsupported file type]';
  }
}

// Helper function to parse context response
function parseContextResponse(responseText) {
  const openingMatch = responseText.match(/\*\*OPENING_QUESTION:\*\*\s*\n(.*?)(?=\*\*ESSENTIAL_QUESTIONS:\*\*)/s);
  const questionsMatch = responseText.match(/\*\*ESSENTIAL_QUESTIONS:\*\*\s*\n(.*?)$/s);
  
  const openingQuestion = openingMatch ? openingMatch[1].trim() : responseText;
  
  let essentialQuestions = [];
  if (questionsMatch) {
    essentialQuestions = questionsMatch[1]
      .split('\n')
      .map(line => line.replace(/^\d+\.\s*/, '').trim())
      .filter(line => line.length > 0)
      .slice(0, 5);
  }
  
  return { openingQuestion, essentialQuestions };
}

// Utility helpers
const normalizeConversation = raw => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { /* ignore */ }
  }
  return [];
};

const compressHistory = (history, maxTurns = 8) => { // Increased from 2 to 8
  if (!history?.length) return '';
  const sys  = history[0]?.type === 'system' ? [history[0]] : [];
  const tail = history.slice(-maxTurns * 2); // This will keep last 16 messages instead of 4
  return [...sys, ...tail]
    .map(m => `${m.type === 'user' ? 'S:' : m.type === 'tutor' ? 'T:' : 'SYS:'}${m.content}`)
    .join('\n');
};

// Get next unaddressed question - KEEP ONLY THIS ONE
function getNextEssentialQuestion(session) {
  if (!session.essentialQuestions || !session.questionProgress) return null;
  
  const nextIndex = session.questionProgress.findIndex(addressed => !addressed);
  return nextIndex !== -1 ? {
    question: session.essentialQuestions[nextIndex],
    index: nextIndex
  } : null;
}

// Authentication endpoints
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    if (!username || !password || !email) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (Array.from(users.values()).some(u => u.username === username || u.email === email)) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const userId = uuidv4();
    const user = {
      id: userId,
      username,
      email,
      password: hashedPassword,
      createdAt: new Date()
    };
    
    users.set(userId, user);
    req.session.userId = userId;
    
    res.json({ 
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (err) {
    console.error('[register]', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = Array.from(users.values()).find(u => u.username === username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    req.session.userId = user.id;
    
    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const user = users.get(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  
  res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email
    }
  });
});

// Main endpoints
app.post('/api/context', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const { description = '', priorKnowledge = '', courseInfo = '', notes = '' } = req.body;
    const fileText = await parseUploadedFile(req.file);

    const systemMsg = { type: 'system', content: RULES };
    
    const tutorIntroPrompt = buildContextPrompt(
      description,
      fileText,
      [priorKnowledge && `Prior knowledge: ${priorKnowledge}`,
       courseInfo     && `Course: ${courseInfo}`,
       notes          && `Notes: ${notes}`].filter(Boolean).join('\n')
    );

    const ai = await flashModel.generateContent(tutorIntroPrompt);
    const responseText = ai.response.text().trim();
    
    const { openingQuestion, essentialQuestions } = parseContextResponse(responseText);
    
    const tutorMsg = { type: 'tutor', content: openingQuestion };

    req.session.conversation = [systemMsg, tutorMsg];
    req.session.context = { description, priorKnowledge, courseInfo, notes, fileText };
    req.session.essentialQuestions = essentialQuestions;
    req.session.questionProgress = essentialQuestions.map(() => false);
    req.session.contextSummary = `Problem: ${description}. ${fileText ? 'File uploaded with relevant content.' : ''}`;

    res.json({ 
      conversation: req.session.conversation.slice(1), 
      problemStatement: description,
      essentialQuestions: essentialQuestions 
    });
  } catch (err) {
    console.error('[context]', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/conversation', requireAuth, (req, res) => {
  const conversation = req.session.conversation || [];
  const conversationWithoutSystem = conversation.slice(conversation[0]?.type === 'system' ? 1 : 0);
  
  console.log('GET /api/conversation - total messages:', conversation.length, 'returned:', conversationWithoutSystem.length);
  
  res.json({
    conversation: conversationWithoutSystem,
    problemStatement: req.session.context?.description || '',
    essentialQuestions: req.session.essentialQuestions || [],
    questionProgress: req.session.questionProgress || []
  });
});


// Use different compression levels for different endpoints

function commonEndpointBuilder({ resultKey, extraPromptFactory }) {
  return async (req, res) => {
    try {
      const { prompt = '', conversation = [], problemStatement = '' } = req.body;
      const history = normalizeConversation(conversation.length ? conversation : req.session.conversation);
      
      // Use more context for hints and summaries
      const baseCtx = compressHistory(history, 6); // Keep last 12 messages

      const combined = buildPrompt(
        prompt.trim(), 
        '',
        extraPromptFactory(baseCtx, req.session.contextSummary || problemStatement, req.body)
      );
      
      const ai   = await flashModel.generateContent(combined);
      let  text  = ai.response.text().trim();

      if (resultKey === 'questions') {
        text = text.split('\n').map(q => q.trim()).filter(Boolean).slice(0, 5);
      }

      if (resultKey === 'reply') {
        req.session.conversation = [...history,
          { type: 'user',  content: prompt.trim() },
          { type: 'tutor', content: text }];
      }

      res.json({ [resultKey]: text });
    } catch (err) {
      console.error(`[${resultKey}]`, err);
      res.status(500).json({ error: err.message });
    }
  };
}

app.post('/api/chat', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const { prompt = '', conversation = [], problemStatement = '' } = req.body;
    const history = normalizeConversation(conversation.length ? conversation : req.session.conversation);
    
    // Use full conversation context instead of compressed
    const fullContext = history
      .filter(m => m.type !== 'system') // Remove system message
      .map(m => `${m.type === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
      .join('\n');

    const newFileContent = req.file ? await parseUploadedFile(req.file) : '';
    
    const combined = buildPrompt(
      prompt.trim(), 
      newFileContent,
      fullContext, // Use full context instead of compressed
      req.session.essentialQuestions || []
    );
    
    const ai = await flashModel.generateContent(combined);
    const text = ai.response.text().trim();

    req.session.conversation = [...history,
      { type: 'user',  content: prompt.trim() },
      { type: 'tutor', content: text }];

    res.json({ reply: text });
  } catch (err) {
    console.error('[chat]', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/essential-questions', requireAuth, async (req, res) => {
  try {
    const questions = req.session.essentialQuestions || [];
    const progress = req.session.questionProgress || [];
    
    res.json({ 
      questions,
      progress
    });
  } catch (err) {
    console.error('Error getting essential questions:', err);
    res.status(500).json({ error: 'Failed to get essential questions' });
  }
});

app.post('/api/essential-questions/toggle', requireAuth, async (req, res) => {
  try {
    const { questionIndex } = req.body;
    
    if (!req.session.questionProgress) {
      req.session.questionProgress = req.session.essentialQuestions?.map(() => false) || [];
    }
    
    if (questionIndex >= 0 && questionIndex < req.session.questionProgress.length) {
      const wasCompleted = req.session.questionProgress[questionIndex];
      req.session.questionProgress[questionIndex] = !req.session.questionProgress[questionIndex];
      
      // If user just marked a question as complete, guide to next question
      if (!wasCompleted && req.session.questionProgress[questionIndex]) {
        const nextIncompleteIndex = req.session.questionProgress.findIndex(
          (completed, index) => !completed && index > questionIndex
        );
        
        let tutorMessage = '';
        if (nextIncompleteIndex !== -1) {
          const nextQuestion = req.session.essentialQuestions[nextIncompleteIndex];
          tutorMessage = `**Great progress!** 🎉\n\nLet's move on to the next essential concept:\n\n**${nextQuestion}**\n\nWhat do you think about this?`;
        } else {
          // Check if all questions are complete
          const allComplete = req.session.questionProgress.every(completed => completed);
          if (allComplete) {
            tutorMessage = `**🎉 Excellent! You've covered all the essential questions for this topic!**\n\nYou've demonstrated understanding of:\n${req.session.essentialQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nWhat would you like to explore further, or do you have any remaining questions about this topic?`;
          }
        }
        
        // Add tutor message to conversation
        if (tutorMessage) {
          req.session.conversation = req.session.conversation || [];
          req.session.conversation.push({
            type: 'tutor',
            content: tutorMessage,
            timestamp: new Date().toLocaleTimeString()
          });
          
          console.log(`Added next question message to conversation`);
        }
      }
      
      console.log(`Toggled question ${questionIndex + 1} to ${req.session.questionProgress[questionIndex]}`);
    }
    
    res.json({ 
      questions: req.session.essentialQuestions || [],
      progress: req.session.questionProgress || [],
      conversation: (req.session.conversation || []).slice(1) // Remove system message
    });
  } catch (err) {
    console.error('Error toggling question progress:', err);
    res.status(500).json({ error: 'Failed to toggle question progress' });
  }
});

app.post('/api/chat/regenerate', requireAuth, commonEndpointBuilder({
  resultKey: 'reply',
  extraPromptFactory: (ctx, prob, { complexity = '' }) => {
    const map = { simpler: 'Simplify.', more_complex: 'Deepen.', different: 'Rephrase.' };
    return `${ctx}\n\n${prob}\n\n${map[complexity] || ''}`;
  }
}));

app.post('/api/hint', requireAuth, commonEndpointBuilder({
  resultKey: 'hint',
  extraPromptFactory: (ctx, prob) => `${ctx}\n\n${prob}\n\nGive a single guiding fact (no questions, no "Hint:" prefix).`
}));

app.post('/api/summary', requireAuth, commonEndpointBuilder({
  resultKey: 'summary',
  extraPromptFactory: (ctx, prob) => `${ctx}\n\n${prob}\n\nThe user is asking for a summary. Use sections and headers like conversation so far, what you know, what you should study more, etc.. Summarize what the student knows and next steps (no questions).`
}));

app.post('/api/parse', requireAuth, upload.single('file'), async (req, res) => {
  try {
    res.json({ parsedText: await parseUploadedFile(req.file) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Shutdown handling
const PORT   = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`🚀  http://localhost:${PORT}`));

const gracefulShutdown = signal => () => server.close(err => {
  if (err) { console.error('Shutdown error', err); process.exitCode = 1; }
  if (signal === 'SIGUSR2') process.kill(process.pid, 'SIGUSR2');
  else process.exit();
});
['SIGINT', 'SIGTERM', 'SIGUSR2'].forEach(sig => process.once(sig, gracefulShutdown(sig)));
