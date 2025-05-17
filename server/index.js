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
    if (!req.session.parts ) {
      // Build the special one-shot outline prompt
      const seed         = problemStatement || userInput
      const outlinePrompt = buildOutlinePrompt(seed, fileContent)
      const outlineResp   = await proseModel.generateContent(outlinePrompt)
      const outlineText = outlineResp.response.text().trim()

      // Split on any line of three or more dashes/equals
      const parts = outlineText
        .split(/^[-=]{3,}$/m)
        .map(p => p.trim())
        .filter(Boolean)

      // Store outline parts in session
      req.session.parts     = parts
      req.session.partIndex = 1
      req.session.currentPart = parts[0]
      req.session.currentIndex = 0

        const content = parts[0]
        const more = parts.length > 1
      // Return full outline and ask to step through
      console.log('→ entering outline mode', parts)
      return res.json({
        reply: 
          `### Part 1 / ${parts.length}\n\n` +
          `${content}\n\n` +
          `Move on to the next part? (yes/no)`
      })
    }

    //navigation through outline parts
    if (req.session.parts) {
      const answer = userInput.toLowerCase()
      const yesTriggers = ['yes', 'next', 'move into', 'next part']
      const wantsNext = yesTriggers.some(t => answer.includes(t))
      if (wantsNext) {
        const idx = req.session.partIndex
        if (idx < req.session.parts.length) {
          const content = req.session.parts[idx]
          req.session.currentPart = content
          req.session.currentIndex = idx
          req.session.partIndex++
          const more = req.session.partIndex < req.session.parts.length
          const qPrompt = `
You are a Socratic tutor. Based only on the conversation, ask a clear, guiding question that
helps a student understand it better, without giving away the answer. Give the student feedback
on their answers before asking the next question.

--- BEGIN PART ---
${content}
--- END PART ---
`
          const qResp = await flashModel.generateContent(qPrompt)
          const question = qResp.response.text().trim()
          return res.json({
            reply: 
              `### Part ${idx + 1} / ${req.session.parts.length}\n\n` +
              `${content}\n\n` +
              `**Tutor:** ${question}` +
              (more
                ? '\n\nMove on to the next part? (yes/no)'
                : '\n\nYou’ve completed all parts.')
          })
        }
      }
      //repond with no intention go on next part
      if (req.session.currentPart) {
        const idx        = req.session.currentIndex ?? 0
        const content    = req.session.currentPart
        const more       = req.session.partIndex < req.session.parts.length

        const repeatPrompt = `
You are still discussing the part below. Respond with guiding question that
helps the student think deeper, without revealing the answer.

--- BEGIN PART ---
${content}
--- END PART ---
`
        const qResp   = await flashModel.generateContent(repeatPrompt)
        const question = qResp.response.text().trim()

        return res.json({
          reply:
            `### Part ${idx + 1} / ${req.session.parts.length}\n\n` +
            `${content}\n\n` +
            `**Tutor:** ${question}` +
            (more
              ? '\n\nMove on to the next part? (yes/no)'
              : '\n\nYou’ve completed all parts.')
        })
      }

    }

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
    // If we’re inside a part-by-part walk-through, give the model that part, too
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
            `${req.session.currentPart}\n\n` +
            `**Tutor:** ${question}` +
            (moreParts ? '\n\nMove on to the next part?' : '\n\nYou’ve completed all parts.')
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
Don't start with Hint:. The student is asking for a hint, probably about your previous question. Provide a concise, clear hint that points them toward the solution without giving it away. Should not be a question. Provide facts and notes and examples. And make sure these are all connected to help the student with what they are confused on.
`;

  const combinedPrompt = buildPrompt(
    prompt.trim(),
    /* fileContent */ '',               // whoever parses req.file
    `${conversationContext}\n\nProblem: ${problemStatement}${extra}`
  );

  // 3) call your model
  const response = await flashModel.generateContent(combinedPrompt);
  // NOTE: adjust this to whatever your model returns!
  const hint = response.choices?.[0]?.text?.trim() ??  
               response.response?.text?.().trim() ??
               'Sorry, no hint right now.';

  res.json({ hint });
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