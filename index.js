// index.js
import express from 'express'
import multer from 'multer'
import dotenv from 'dotenv'
import OpenAI from 'openai'            // ← default export

dotenv.config()

const app = express()
const upload = multer()
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY  // defaults to this env var if omitted
})

app.use(express.json())
app.use(express.static('public'))

app.post('/api/chat', upload.single('file'), async (req, res) => {
  try {
    const { prompt } = req.body
    let combined = prompt || ''
    if (req.file) {
      const text = req.file.buffer.toString('utf-8')
      combined += `\n\n--- Attached file contents: ---\n${text}`
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: combined }],
    })

    res.json({ reply: completion.choices?.[0]?.message?.content ?? '' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
})
