import multer from 'multer'
import dotenv from 'dotenv'
dotenv.config()
import express from 'express'
import fetch, { Headers } from 'node-fetch'
import pdfjs from 'pdfjs-dist/legacy/build/pdf.js'
const { getDocument } = pdfjs
import { createWorker } from 'tesseract.js'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { buildPrompt, buildRetryPrompt } from '../utils/promptEngineer.js'
import { validateResponse } from '../utils/responseValidator.js'
import session from 'express-session';

const genAI        = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY) // constructor
const flashModel   = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' }) // helper
const proseModel   = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })       // for generation
// Set up global fetch and Headers
global.fetch = fetch
global.Headers = Headers

// …

const app = express()
const upload = multer()

app.use(express.json())

// Helper function to parse uploaded file
async function parseUploadedFile(file) {
  if (!file) return ''

  const mimeType = file.mimetype

  if (mimeType === 'application/pdf') {
    // New parse logic using pdfjs-dist
    const loadingTask = getDocument({ data: file.buffer });
    const pdfDocument = await loadingTask.promise;

    let textContent = '';

    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const text = await page.getTextContent();
      const pageText = text.items.map(item => item.str).join(' ');
      textContent += pageText + '\n';
    }

    return textContent.trim();
  } else if (mimeType.startsWith('image/')) {
    const worker = await createWorker('eng')
    const { data: { text } } = await worker.recognize(file.buffer)
    await worker.terminate()
    return text.trim()
  } else if (mimeType.startsWith('text/')) {
    return file.buffer.toString('utf-8').trim()
  } else {
    return '[Unsupported file type uploaded]'
  }
}

app.use(session({
  secret: process.env.SESSION_SECRET || 'socratictasecret',
  resave: false,
  saveUninitialized: true,
}));

app.post('/api/chat', upload.single('file'), async (req, res) => {
  try {
    const { prompt, conversation, problemStatement } = req.body
    const fileContent = await parseUploadedFile(req.file)
    const userInput = (prompt || '').trim()

    // Parse conversation history if it exists
    let conversationHistory = []
    try {
      conversationHistory = conversation ? JSON.parse(conversation) : []
    } catch (e) {
      console.error('Error parsing conversation history:', e)
    }

    // Build conversation context
    const conversationContext = conversationHistory
      .map(msg => `${msg.type === 'user' ? 'Student' : 'Tutor'}: ${msg.content}`)
      .join('\n')

    const combinedPrompt = buildPrompt(prompt || '', fileContent, conversationContext)

    const response = await flashModel.generateContent(combinedPrompt)
    const question = response.response.text().trim()
    const validation = validateResponse(question, {})
    
    if (!validation.isValid) {
      const retryPrompt = buildRetryPrompt(combinedPrompt)
      const retryResp = await flashModel.generateContent(retryPrompt)
      return res.json({ reply: retryResp.response.text().trim() })
    } else {
      // normal chat
      res.json({ reply: question })
    }
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/context', upload.single('file'), async (req, res) => {
  try {
    // 1. Extract form fields
    const {
      description = '',
      priorKnowledge = '',
      courseInfo = '',
      notes = ''
    } = req.body;

    // 2. Parse the uploaded file, if any
    const fileText = await parseUploadedFile(req.file);

    // 3. Build a little "extra context" blob
    const extraContext = [
      priorKnowledge && `Prior knowledge: ${priorKnowledge}`,
      courseInfo     && `Course / context: ${courseInfo}`,
      notes          && `Additional notes: ${notes}`,
      fileText       && `\n---\n${fileText}`
    ].filter(Boolean).join('\n');

    // 4. Seed / reset session state
    req.session.context = { description, priorKnowledge, courseInfo, notes, fileText };

    // 5. Build the initial LLM prompt
    const initialPrompt = buildPrompt(
      description,
      fileText,
      extraContext
    );

    // 6. Fire off the tutor model for your first message
    const aiResp = await flashModel.generateContent(initialPrompt);
    const firstTutorMessage = aiResp.response
      ? aiResp.response.text().trim()
      : aiResp.choices?.[0]?.text?.trim() ??
        'Hello! What would you like to explore today?';

    // 7. Initialize session conversation history
    req.session.conversation = [
      { type: 'tutor', content: firstTutorMessage }
    ];

    // 8. Return both conversation and problemStatement to the client
    res.json({
      conversation: req.session.conversation,
      problemStatement: description
    });

  } catch (err) {
    console.error('[/api/context] error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/conversation', (req, res) => {
  res.json({
    conversation: req.session.conversation || [],
    problemStatement: req.session.context?.description || ''
  });
});

// Testing endpoint: Parse file and return parsed text (no OpenAI)
app.post('/api/parse', upload.single('file'), async (req, res) => {
  const userInput = (prompt || '').trim()
  try {
    const parsedText = await parseUploadedFile(req.file)
    res.json({ parsedText })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/hint', async (req, res) => {
  const { prompt = '', conversation, problemStatement = '' } = req.body;

  // 1) normalize conversationHistory
  let conversationHistory = [];
  if (Array.isArray(conversation)) {
    conversationHistory = conversation;
  } else if (typeof conversation === 'string') {
    try {
      conversationHistory = JSON.parse(conversation);
    } catch {
      conversationHistory = [];
    }
  }

  // 2) build context
  const conversationContext = conversationHistory
    .map(msg => `${msg.type === 'user' ? 'Student' : 'Tutor'}: ${msg.content}`)
    .join('\n');

  const extra = `
Do not start with Hint:. Only give the hint text. Only give the student guidance related to what you have talked about with them. It's okay not to ask questions now. You should not ask any questions, but a hint. The hint should be a guiding fact/statement that helps the student think deeper about the problem. If you don't have enough information in the conversation, it's okay to say that.`;

  const combinedPrompt = buildPrompt(
    prompt.trim(),
    '',
    `${extra}\n\nContext: ${conversationContext}\n\nProblem: ${problemStatement}. Do not ask any questions.`
  );

  // 3) call your model
  const response = await flashModel.generateContent(combinedPrompt);
  const hint = response.choices?.[0]?.text?.trim() ??  
               response.response?.text?.().trim() ??
               'Sorry, no hint available right now.';

  res.json({ hint });
});

app.post('/api/summary', async (req, res) => {
  const { prompt = '', conversation, problemStatement = '' } = req.body;

  // 1) normalize conversationHistory
  let conversationHistory = [];
  if (Array.isArray(conversation)) {
    conversationHistory = conversation;
  } else if (typeof conversation === 'string') {
    try {
      conversationHistory = JSON.parse(conversation);
    } catch {
      conversationHistory = [];
    }
  }

  // 2) build context
  const conversationContext = conversationHistory
    .map(msg => `${msg.type === 'user' ? 'Student' : 'Tutor'}: ${msg.content}`)
    .join('\n');

  const extra = `
Summarize the conversation so far. Make sure to tell the student what they seem to know and what they could work more on. Do not use any questions and give them a useful summary.
`;
  const combinedPrompt = buildPrompt(
    prompt.trim(),
    /* fileContent */ '',               // whoever parses req.file
    `${conversationContext}\n\nProblem: ${problemStatement}${extra}`
  );

  // 3) call your model
  const response = await flashModel.generateContent(combinedPrompt);
  // NOTE: adjust this to whatever your model returns!
  const summary = response.choices?.[0]?.text?.trim() ??  
                  response.response?.text?.().trim() ??
                  'Sorry, no summary right now.';

  res.json({ summary });
}
);

app.post('/api/chat/regenerate', async (req, res) => {
  try {
    const { prompt, conversation, problemStatement, complexity } = req.body;
    
    // Build conversation context
    const conversationContext = conversation
      .map(msg => `${msg.type === 'user' ? 'Student' : 'Tutor'}: ${msg.content}`)
      .join('\n');

    // Add complexity instruction to the prompt
    const complexityInstruction = {
      'simpler': 'Please provide a simpler explanation with basic concepts and examples.',
      'more_complex': 'Please provide a more detailed explanation with advanced concepts and deeper analysis.',
      'different': 'Please explain this concept in a different way, using alternative examples or analogies.'
    }[complexity] || '';

    const combinedPrompt = buildPrompt(
      prompt || '',
      '', // No file content for regeneration
      `${conversationContext}\n\nProblem: ${problemStatement}\n\n${complexityInstruction}`
    );

    const response = await flashModel.generateContent(combinedPrompt);
    const question = response.response.text().trim();
    
    res.json({ reply: question });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/essential-questions', async (req, res) => {
  try {
    const { conversation = [], problemStatement = '' } = req.body;

    // Normalize conversation history
    let conversationHistory = [];
    if (Array.isArray(conversation)) {
      conversationHistory = conversation;
    } else if (typeof conversation === 'string') {
      try {
        conversationHistory = JSON.parse(conversation);
      } catch (e) {
        conversationHistory = [];
      }
    }

    // Build context from conversation
    const conversationContext = conversationHistory
      .map(msg => `${msg.type === 'user' ? 'Student' : 'Tutor'}: ${msg.content}`)
      .join('\n');

    const prompt = `
Based on the following problem statement and conversation, generate exactly 5 essential questions that a student needs to be able to answer to demonstrate complete understanding of this topic. 

These questions should:
1. Cover the core concepts and principles
2. Test practical application
3. Ensure deep understanding rather than memorization
4. Be specific to the topic being discussed
5. Progress from basic to advanced understanding

Problem Statement: ${problemStatement}

Conversation Context:
${conversationContext}

Please provide exactly 5 questions, each on a new line, without numbering or bullet points. Focus on what the student truly needs to understand to master this topic.
`;

    const response = await flashModel.generateContent(prompt);
    const questionsText = response.response?.text?.() || '';
    
    // Parse the questions (split by lines and filter out empty ones)
    const questions = questionsText
      .split('\n')
      .map(q => q.trim())
      .filter(q => q.length > 0)
      .slice(0, 5); // Ensure we only get 5 questions

    // Store questions in session for future reference
    if (!req.session.essentialQuestions) {
      req.session.essentialQuestions = questions;
    }

    res.json({ questions });
  } catch (err) {
    console.error('Error generating essential questions:', err);
    res.status(500).json({ error: 'Failed to generate essential questions' });
  }
});

const PORT = process.env.PORT || 3000
const server = app.listen(PORT, () =>
  console.log(`🚀  Server running on http://localhost:${PORT}`)
)

function gracefulShutdown(signal) {
  return () =>
    server.close(err => {
      if (err) {
        console.error('Error during shutdown', err)
        process.exitCode = 1
      }
      // If nodemon triggered the signal, tell it we're done
      if (signal === 'SIGUSR2') {
        process.kill(process.pid, 'SIGUSR2')
      } else {
        process.exit()
      }
    })
}

process.once('SIGINT',  gracefulShutdown('SIGINT'))   // ^C
process.once('SIGTERM', gracefulShutdown('SIGTERM'))  // Docker/Heroku
process.once('SIGUSR2', gracefulShutdown('SIGUSR2'))  // nodemon restart