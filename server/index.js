import multer from 'multer'
import dotenv from 'dotenv'
dotenv.config()
import express from 'express'
import fetch, { Headers } from 'node-fetch'
import pdfjs from 'pdfjs-dist/legacy/build/pdf.js'
const { getDocument } = pdfjs
import { createWorker } from 'tesseract.js'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { buildPrompt, buildRetryPrompt, buildOutlinePrompt } from '../utils/promptEngineer.js'
import { validateResponse } from '../utils/responseValidator.js'
import session from 'express-session';

const genAI        = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY) // onstructor
const flashModel   = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' }) // helper
const proseModel   = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })       // for outlines
// Set up global fetch and Headers
global.fetch = fetch
global.Headers = Headers


// …

const app = express()
const upload = multer()
// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY
// })

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

    //initial outline request
    // if (!req.session.parts ) {
    //   // Build the special one-shot outline prompt
    //   const outlinePrompt = buildOutlinePrompt(
    //     userInput,          // student's current question (may be empty)
    //     fileContent,        // any uploaded/parsed file
    //     /* conversationContext */ '',
    //     problemStatement    // main problem/topic (may be empty)
    //   )
    //   const outlineResp   = await proseModel.generateContent(outlinePrompt)
    //   const outlineText = outlineResp.response.text().trim()

    //   // Split on any line of three or more dashes/equals
    //   const parts = outlineText
    //     .split(/(?:^|\n)(?=\s*(?:\*\*|__|#+)?\s*part\s+\d+\b)|^[-=]{3,}$/gim)
    //     .map(p => p.trim())
    //     .filter(Boolean)

    //   // Store outline parts in session
    //   req.session.parts     = parts
    //   req.session.partIndex = 1
    //   req.session.currentPart = parts[0]
    //   req.session.currentIndex = 0

    //     const content = parts[0]
    //     const more = parts.length > 1
    //   // Return full outline and ask to step through
    //   console.log('→ entering outline mode', parts)
    //   return res.json({
    //     reply: 
    //       `### Part 1 / ${parts.length}\n\n` +
    //       `${content}\n\n` +
    //       `Move on to the next part? (yes/no)`
    //   })
    // }

    //navigation through outline parts
//     if (req.session.parts) {
//       const answer = userInput.toLowerCase()
//       const yesTriggers = ['yes', 'next', 'move into', 'next part']
//       const wantsNext = yesTriggers.some(t => answer.includes(t))
//       if (wantsNext) {
//         const idx = req.session.partIndex
//         if (idx < req.session.parts.length) {
//           const content = req.session.parts[idx]
//           req.session.currentPart = content
//           req.session.currentIndex = idx
//           req.session.partIndex++
//           const more = req.session.partIndex < req.session.parts.length
//           const qPrompt = `
// You are a Socratic tutor. Based only on the conversation, ask a clear, guiding question that
// helps a student understand it better, without giving away the answer. Give the student feedback
// on their answers before asking the next question.

// --- BEGIN PART ---
// ${content}
// --- END PART ---
// `
//           const qResp = await flashModel.generateContent(qPrompt)
//           const question = qResp.response.text().trim()
//           return res.json({
//             reply: 
//               `### Part ${idx + 1} / ${req.session.parts.length}\n\n` +
//               `${content}\n\n` +
//               `**Tutor:** ${question}` +
//               (more
//                 ? '\n\nMove on to the next part? (yes/no)'
//                 : '\n\nYou have completed all parts.')
//           })
//         }
//       }
//       //repond with no intention go on next part
//       if (req.session.currentPart) {
//         const idx        = req.session.currentIndex ?? 0
//         const content    = req.session.currentPart
//         const more       = req.session.partIndex < req.session.parts.length

//         const repeatPrompt = `
// You are still discussing the part below. Respond with guiding question that
// helps the student think deeper, without revealing the answer.

// --- BEGIN PART ---
// ${content}
// --- END PART ---
// `
//         const qResp   = await flashModel.generateContent(repeatPrompt)
//         const question = qResp.response.text().trim()

//         return res.json({
//           reply:
//             `### Part ${idx + 1} / ${req.session.parts.length}\n\n` +
//             `**Tutor:** ${question}` +
//             (more
//               ? '\n\nMove on to the next part? (yes/no)'
//               : '\n\nYou have completed all parts.')
//         })
//       }

//     }

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


    //const combinedPrompt = buildPrompt(prompt || '', fileContent, conversationContext)
    // If we're inside a part-by-part walk-through, give the model that part, too
    const combinedPrompt = buildPrompt(
      prompt || '',
      fileContent,
      conversationContext +
        (req.session.currentPart
          ? `\n\nCurrent outline part:\n${req.session.currentPart}`
          : '')
    )


    const response = await flashModel.generateContent(combinedPrompt)
    const question = response.response.text().trim()
    const allowOutline = !!(req.session.parts && req.session.partIndex === 0)
    const validation = validateResponse(question, { allowOutline })
    
    if (!validation.isValid) {
      const retryPrompt = buildRetryPrompt(combinedPrompt)
      const retryResp = await flashModel.generateContent(retryPrompt)
      return res.json({ reply: retryResp.response.text().trim() })
    } else {
      if (req.session.currentPart) {
        const partNum   = (req.session.currentIndex ?? 0) + 1
        const total     = req.session.parts.length
        const moreParts = req.session.partIndex < total

        return res.json({
          reply:
            `### Part ${partNum} / ${total}\n\n` +
            `**Tutor:** ${question}` +
            (moreParts ? '\n\nMove on to the next part?' : '\n\nYou have completed all parts.')
        })
      }

      // normal chat outside outline-mode
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

    // 3. Build a little “extra context” blob
    const extraContext = [
      priorKnowledge && `Prior knowledge: ${priorKnowledge}`,
      courseInfo     && `Course / context: ${courseInfo}`,
      notes          && `Additional notes: ${notes}`,
      fileText       && `\n---\n${fileText}`
    ].filter(Boolean).join('\n');

    // 4. Seed / reset session state
    req.session.context = { description, priorKnowledge, courseInfo, notes, fileText };
    // clear any outline‐mode state
    req.session.parts = null;
    req.session.partIndex = 0;
    req.session.currentPart = null;

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


app.post('/api/outline/reset', (req, res) => {
  req.session.parts = null;
  req.session.partIndex = 0;
  res.json({ success: true });
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
    /* fileContent */ '',               // whoever parses req.file
    `${extra}\n\nContext: ${conversationContext}\n\nProblem: ${problemStatement}. Do not ask any questions.`
  );

  // 3) call your model
  const response = await flashModel.generateContent(combinedPrompt);
  // NOTE: adjust this to whatever your model returns!
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