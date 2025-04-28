import express from 'express'
import multer from 'multer'
import dotenv from 'dotenv'
//import OpenAI from 'openai'
import pdfjs from 'pdfjs-dist/legacy/build/pdf.js';
const { getDocument } = pdfjs;
import { createWorker } from 'tesseract.js'

dotenv.config()

const app = express()
const upload = multer()
// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY
// })

// Import Google Gemini client:
import pkg from '@google-ai/generativelanguage';
const {v1beta3} = pkg;
const {TextServiceClient} = v1beta3;
// If you’re using API-key instead of service account, pass it in options:
const gemini = new TextServiceClient({
  libOptions: { apiKey: process.env.GOOGLE_API_KEY }
});

app.use(express.json())
app.use(express.static('public'))

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


// Helper function for prompt engineering
function buildPrompt(userInput, fileContent) {
  return `
You are a helpful assistant.

User question:
"${userInput}"

${fileContent ? `Attached file content:\n${fileContent}` : ''}

Please provide a clear and complete answer.
  `.trim()
}

app.post('/api/chat', upload.single('file'), async (req, res) => {
  try {
    const { prompt } = req.body
    const fileContent = await parseUploadedFile(req.file)
    const combinedPrompt = buildPrompt(prompt || '', fileContent)

    // const completion = await openai.chat.completions.create({
    //   model: 'gpt-4o-mini',
    //   messages: [{ role: 'user', content: combinedPrompt }],
    // })

    // res.json({ reply: completion.choices?.[0]?.message?.content ?? '' })

    // Call Gemini (chat-bison-001 is Gemini “chat” model)
    const [response] = await gemini.generateText({
      model: 'models/chat-bison-001',
      prompt: { text: combinedPrompt },
      temperature: 0.7,
      candidateCount: 1,
    })
    const reply = response.candidates?.[0]?.content || ''
    res.json({ reply })
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

