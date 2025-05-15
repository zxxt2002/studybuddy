
export function buildOutlinePrompt(userInput, fileContent = '', conversationContext = '', problemStatement = '') {
  return `
now i want the answer in socratic style, give me all the needed knowledge and hint in one reply, but separate the answer into parts based on the knowledge type, with a obvious separation line.


${problemStatement ? `Main Problem/Topic:\n${problemStatement}\n\n` : ''}
${conversationContext ? `Previous Conversation:\n${conversationContext}\n\n` : ''}
Current Context:
User's question: "${userInput}"
${fileContent ? `\nAttached file:\n${fileContent}` : ''}
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
You are a Socratic AI tutor that **never** gives direct answers.
Reply with clear, guiding question and hints not directly lead to answer that helps the student think.

${conversationContext ? `Conversation so far:\n${conversationContext}\n` : ''}
Student: ${userInput}
${fileContent ? `\nAttached file:\n${fileContent}` : ''}

Tutor:`.trim()
}