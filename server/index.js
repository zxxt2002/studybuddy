// server.js – token‑lean SocraticTA backend (questions array fix)
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

// Constants & model setup
const RULES = `You are a Socratic tutor. Use short, question‑driven replies. Never reveal chain‑of‑thought. Use markdown when helpful.`;

const genAI      = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const flashModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

global.fetch   = fetch;
global.Headers = Headers;

const app    = express();
const upload = multer();
app.use(express.json());

// Utility helpers
const normalizeConversation = raw => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { /* ignore */ }
  }
  return [];
};

const compressHistory = (history, maxTurns = 2) => {
  if (!history?.length) return '';
  const sys  = history[0]?.type === 'system' ? [history[0]] : [];
  const tail = history.slice(-maxTurns * 2);
  return [...sys, ...tail]
    .map(m => `${m.type === 'user' ? 'S:' : m.type === 'tutor' ? 'T:' : 'SYS:'}${m.content}`)
    .join('\n');
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

// Session & middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'socratictasecret',
  resave: false,
  saveUninitialized: true
}));

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
       notes          && `Notes: ${notes}`].filter(Boolean).join('\n')
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
  extraPromptFactory: (ctx, prob) => `${ctx}\n\n${prob}\n\nSummarize what the student knows and next steps (no questions).`
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

// Shutdown handling
const PORT   = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`🚀  http://localhost:${PORT}`));

const gracefulShutdown = signal => () => server.close(err => {
  if (err) { console.error('Shutdown error', err); process.exitCode = 1; }
  if (signal === 'SIGUSR2') process.kill(process.pid, 'SIGUSR2');
  else process.exit();
});
['SIGINT', 'SIGTERM', 'SIGUSR2'].forEach(sig => process.once(sig, gracefulShutdown(sig)));
