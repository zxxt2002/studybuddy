import express from 'express'
import multer from 'multer'
import dotenv from 'dotenv'
//import OpenAI from 'openai'
import pdfjs from 'pdfjs-dist/legacy/build/pdf.js';
const { getDocument } = pdfjs;
import { createWorker } from 'tesseract.js'
import { GoogleGenAI } from "@google/genai";

dotenv.config()

const app = express()
const upload = multer()
// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY
// })

// Import Google Gemini client:
import pkg from '@google-ai/generativelanguage';
const { v1beta3 } = pkg;
const { TextServiceClient } = v1beta3;
// If you’re using API-key instead of service account, pass it in options:
const gemini = new TextServiceClient({ apiKey: process.env.GOOGLE_API_KEY, fallback: true });

// **New**: instantiate the GenAI SDK
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

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
[Follow-Up Instructions]
You are a Socratic AI tutor
1. Ask a single, focused question that drills deeper into the student’s last reply about one of those topics.  
2. Never introduce or teach anything outside the approved topics.  
3. If the student’s answer implies a missing prerequisite, you *may* offer:  
   “It looks like you’re using [prerequisite]. Would you like a one-sentence refresher, or keep focusing on [currentTopic]?”  
4. If you ever stray, immediately ask:  
   “How does that relate back to [currentTopic]?”  
5. Continue until student indicates an established understanding of the topic
6. Don't dwell too much on the small details, make sure you still challenge the student to learn the described material.
7. If a student says no, or they don't understand, don't ask them why, try to find a simpler question to help them out.

Now, based on the student’s last message below, produce your next question only.

User question:
"${userInput}"

${fileContent ? `Attached file content:\n${fileContent}` : ''}

Please provide a clear and complete answer.
  `.trim()
}

app.post('/api/chat', upload.single('file'), async (req, res) => {
  try {
    const { prompt } = req.body
    const fileContent    = await parseUploadedFile(req.file)
    const combinedPrompt = buildPrompt(prompt || '', fileContent)

    // ← REPLACED: use GoogleGenAI.generateContent instead of gemini.generateText
    const response = await ai.models.generateContent({
      model:    "gemini-2.0-flash",
      contents: combinedPrompt,
    });
    const reply = response.text

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
