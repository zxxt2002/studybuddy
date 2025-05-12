import express from 'express'
import multer from 'multer'
import dotenv from 'dotenv'
import fetch, { Headers } from 'node-fetch'
import pdfjs from 'pdfjs-dist/legacy/build/pdf.js'
const { getDocument } = pdfjs
import { createWorker } from 'tesseract.js'
import { GoogleGenAI } from "@google/genai"
import { buildPrompt, buildRetryPrompt } from '../utils/promptEngineer.js'
import { validateResponse } from '../utils/responseValidator.js'

// Set up global fetch and Headers
global.fetch = fetch
global.Headers = Headers

dotenv.config()

// …

const app = express()
const upload = multer()
// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY
// })

// Import Google Gemini client:
import pkg from '@google-ai/generativelanguage';
const { v1beta3 } = pkg;
const { TextServiceClient } = v1beta3;
// If you're using API-key instead of service account, pass it in options:
const gemini = new TextServiceClient({ apiKey: process.env.GOOGLE_API_KEY, fallback: true });

// **New**: instantiate the GenAI SDK
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

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

app.post('/api/chat', upload.single('file'), async (req, res) => {
  try {
    const { prompt, conversation } = req.body
    const fileContent = await parseUploadedFile(req.file)
    
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

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: combinedPrompt,
    })
    
    const reply = response.text
    const validation = validateResponse(reply)
    
    if (!validation.isValid) {
      const retryPrompt = buildRetryPrompt(combinedPrompt)
      const retryResponse = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: retryPrompt,
      })
      res.json({ reply: retryResponse.text })
    } else {
      res.json({ reply })
    }
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

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
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
})
