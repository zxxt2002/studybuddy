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
const flashModel   = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }) // helper
const proseModel   = genAI.getGenerativeModel({ model: 'gemini-pro' })       // for outlines
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
    const { prompt, conversation } = req.body
    const fileContent = await parseUploadedFile(req.file)
    const userInput = (prompt || '').trim()

    //initial outline request
    if (!req.session.parts && userInput.toLowerCase().startsWith('now i want the answer in socratic style')) {
      // Build the special one-shot outline prompt
      const outlinePrompt = buildOutlinePrompt(userInput, fileContent)
      const outlineResp   = await proseModel.generateContent(outlinePrompt)
      const outlineText = outlineResp.response.text().trim()

      // Split on any line of three or more dashes/equals
      const parts = outlineText
        .split(/^[-=]{3,}$/m)
        .map(p => p.trim())
        .filter(Boolean)

      // Store outline parts in session
      req.session.parts     = parts
      req.session.partIndex = 0

      // Return full outline and ask to step through
      return res.json({
        reply: outlineText +
          '\n\nWould you like to go through these parts one by one? (yes/no)'
      })
    }

    //navigation through outline parts
    if (req.session.parts) {
      const answer = userInput.toLowerCase()
      const yesTriggers = ['yes', 'next', 'move into', 'next part']
      if (yesTriggers.some(t => answer === t)) {
        const idx = req.session.partIndex
        if (idx < req.session.parts.length) {
          const content = req.session.parts[idx]
          req.session.currentPart = content
          req.session.currentIndex = idx
          req.session.partIndex++
          const more = req.session.partIndex < req.session.parts.length
          const qPrompt = `
You are a Socratic tutor. Based only on the text below, ask clear, guiding question that
helps a student understand it better, without giving away the answer.

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
  try {
    const parsedText = await parseUploadedFile(req.file)
    res.json({ parsedText })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

const PORT = process.env.PORT || 3000
const server = app.listen(PORT, () =>
  console.log(`🚀  Server running on http://localhost:${PORT}`)
)

//Ensure nodemon restarts don’t leave the old process hanging on port 3000
for (const sig of ['SIGINT', 'SIGTERM', 'SIGUSR2']) {
  process.once(sig, () => server.close(() => process.exit(0)))
}
