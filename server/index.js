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

// Authentication endpoints
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    // Basic validation
    if (!username || !password || !email) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user already exists
    if (Array.from(users.values()).some(u => u.username === username || u.email === email)) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const userId = uuidv4();
    const user = {
      id: userId,
      username,
      email,
      password: hashedPassword,
      createdAt: new Date()
    };
    
    users.set(userId, user);
    
    // Set session
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
    
    // Find user
    const user = Array.from(users.values()).find(u => u.username === username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Set session
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

// Utility helpers
const normalizeConversation = raw => {
  // Normalize conversation history to ensure consistent structure
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { /* ignore */ }
  }
  return [];
};

const compressHistory = (history, maxTurns = 2) => {
  // Compress conversation history to the last few turns
  if (!history?.length) return '';
  const sys  = history[0]?.type === 'system' ? [history[0]] : [];
  const tail = history.slice(-maxTurns * 2);
  return [...sys, ...tail] // Ensure we always have the system message first
    .map(m => `${m.type === 'user' ? 'S:' : m.type === 'tutor' ? 'T:' : 'SYS:'}${m.content}`)
    .join('\n');
  // Format: S: for student, T: for tutor, SYS: for system
};

async function parseUploadedFile(file) {
  if (!file) return '';
  const { mimetype } = file;
  if (mimetype === 'application/pdf') {
    const pdfDoc = await getDocument({ data: file.buffer }).promise;
    let out = '';
    for (let p = 1; p <= Math.min(pdfDoc.numPages, 5); p++) { // Limit to 5 pages
      const page = await pdfDoc.getPage(p);
      const txt  = await page.getTextContent();
      out += txt.items.map(i => i.str).join(' ') + '\n';
    }
    return out.trim().substring(0, 3000); // Limit to 3000 chars
  }
  if (mimetype.startsWith('image/')) {
    const worker = await createWorker('eng');
    const { data: { text } } = await worker.recognize(file.buffer);
    await worker.terminate();
    return text.trim().substring(0, 1500); // Limit OCR text
  }
  if (mimetype.startsWith('text/')) {
    return file.buffer.toString('utf-8').trim().substring(0, 2000); // Limit text files
  }
  return '[Unsupported file type]';
}

app.use((req, _res, next) => {
  if (!req.session.system) req.session.system = RULES;
  next();
});

// Endpoints
app.post('/api/context', upload.single('file'), async (req, res) => {
  try {
    const { description = '', priorKnowledge = '', courseInfo = '', notes = '' } = req.body;
    const fileText = await parseUploadedFile(req.file);

    const systemMsg = { type: 'system', content: req.session.system };
    
    // Use special context prompt that includes file content
    const tutorIntroPrompt = buildContextPrompt(
      description,
      fileText,
      [priorKnowledge && `Prior knowledge: ${priorKnowledge}`,
       courseInfo     && `Course: ${courseInfo}`,
       notes          && `Notes: ${notes}`].filter(Boolean).join('\n'),
       `Ask open-ended questions that target the student's reasoning ("Why do you think that works?") rather than their recall of facts. Then follow up by probing assumptions or implications ("If that's true, what would we expect to see next?") to guide them toward deeper insight without giving the answer away.`
    );

    const ai       = await flashModel.generateContent(tutorIntroPrompt);
    const tutorMsg = { type: 'tutor', content: ai.response.text().trim() };

    req.session.conversation = [systemMsg, tutorMsg];
    req.session.context      = { description, priorKnowledge, courseInfo, notes, fileText };
    
    // Store essential context summary for future queries
    req.session.contextSummary = `Problem: ${description}. ${fileText ? 'File uploaded with relevant content.' : ''}`;

    res.json({ conversation: req.session.conversation.slice(1), problemStatement: description });
  } catch (err) {
    console.error('[context]', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/conversation', (req, res) => {
  res.json({
    conversation: (req.session.conversation || []).slice(1),
    problemStatement: req.session.context?.description || ''
  });
});

function commonEndpointBuilder({ resultKey, extraPromptFactory }) {
  return async (req, res) => {
    try {
      const { prompt = '', conversation = [], problemStatement = '' } = req.body;
      const history = normalizeConversation(conversation.length ? conversation : req.session.conversation);
      const baseCtx = compressHistory(history);

      // Use lightweight prompt without file content
      const combined = buildPrompt(
        prompt.trim(), 
        '', // No file content in regular queries
        extraPromptFactory(baseCtx, req.session.contextSummary || problemStatement, req.body)
      );
      
      const ai   = await flashModel.generateContent(combined);
      let  text  = ai.response.text().trim();

      // special case: essential‑questions should return an array
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

app.post('/api/chat', upload.single('file'), async (req, res) => {
  try {
    const { prompt = '', conversation = [], problemStatement = '' } = req.body;
    const history = normalizeConversation(conversation.length ? conversation : req.session.conversation);
    const baseCtx = compressHistory(history);

    // Only parse file if one is uploaded with this specific message
    const newFileContent = req.file ? await parseUploadedFile(req.file) : '';
    
    const combined = buildPrompt(
      prompt.trim(), 
      newFileContent, // Only include new file content
      baseCtx
    );
    
    const ai   = await flashModel.generateContent(combined);
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

app.post('/api/chat/regenerate', commonEndpointBuilder({
  resultKey: 'reply',
  extraPromptFactory: (ctx, prob, { complexity = '' }) => {
    const map = { simpler: 'Simplify.', more_complex: 'Deepen.', different: 'Rephrase.' };
    return `${ctx}\n\n${prob}\n\n${map[complexity] || ''}`;
  }
}));

app.post('/api/hint', commonEndpointBuilder({
  resultKey: 'hint',
  extraPromptFactory: (ctx, prob) => `${ctx}\n\n${prob}\n\nGive a single guiding fact (no questions, no "Hint:" prefix).`
}));

app.post('/api/summary', commonEndpointBuilder({
  resultKey: 'summary',
  extraPromptFactory: (ctx, prob) => `${ctx}\n\n${prob}\n\nThe user is asking for a summary. Use sections and headers like conversation so far, what you know, what you should study more, etc.. Summarize what the student knows and next steps (no questions).`
}));

app.post('/api/essential-questions', commonEndpointBuilder({
  resultKey: 'questions',
  extraPromptFactory: (ctx, prob) => `From the dialog below, produce 5 essential questions (newline‑sep, no bullets).\n\n${prob}\n\n${ctx}`
}));

app.post('/api/parse', upload.single('file'), async (req, res) => {
  try {
    res.json({ parsedText: await parseUploadedFile(req.file) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Protect existing endpoints
app.use('/api/context', requireAuth);
app.use('/api/chat', requireAuth);
app.use('/api/chat/regenerate', requireAuth);
app.use('/api/hint', requireAuth);
app.use('/api/summary', requireAuth);
app.use('/api/essential-questions', requireAuth);
app.use('/api/parse', requireAuth);

// Shutdown handling
const PORT   = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`🚀  http://localhost:${PORT}`));

const gracefulShutdown = signal => () => server.close(err => {
  if (err) { console.error('Shutdown error', err); process.exitCode = 1; }
  if (signal === 'SIGUSR2') process.kill(process.pid, 'SIGUSR2');
  else process.exit();
});
['SIGINT', 'SIGTERM', 'SIGUSR2'].forEach(sig => process.once(sig, gracefulShutdown(sig)));
