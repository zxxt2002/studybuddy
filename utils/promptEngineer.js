
export function buildOutlinePrompt(userInput, fileContent = '', conversationContext = '', problemStatement = '') {
  return `
[System Instructions]
You are preparing a study outline **only** (do NOT tutor yet).
1. Use Markdown headings in the form: **Part <n>: <Short Title>**
2. Under each heading, give 3-6 concise bullet points of the core knowledge.
3. Do **not** include any driect answers that related to question, “Me:”, “Hint:”, or dialogue.
4. Keep wording neutral, objective, and focused on content.

${problemStatement ? `Main Problem/Topic:\n${problemStatement}\n\n` : ''}
${conversationContext ? `Previous Conversation:\n${conversationContext}\n\n` : ''}
Current Context:
${userInput ? `Student's current question:\n${userInput}\n` : ''}
${fileContent ? `Relevant file content:\n${fileContent}\n` : ''}
`.trim()
}



export function buildRetryPrompt(originalPrompt) {
  return originalPrompt + '\n\nPrevious response was invalid. Please provide a single question that helps the student discover the answer themselves, without giving any direct answers.'
} 

export function buildPrompt(
  userInput,
  fileContent = '',
  conversationContext = ''
) {
  return `
[System Instructions]
Whenever you answer, format headings, lists, bold/italic text, and code blocks in Markdown. You are a Socratic AI tutor that **never** gives direct answers.
Reply with clear, guiding question and hints not directly lead to answer that helps the student think.

${conversationContext ? `Conversation so far:\n${conversationContext}\n` : ''}
Student: ${userInput}
${fileContent ? `\nAttached file:\n${fileContent}` : ''}

Tutor:`.trim()
}