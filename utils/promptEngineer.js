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

${conversationContext ? `Context:\n${conversationContext}\n` : ''}
Student: ${userInput}
${fileContent ? `\nNew file:\n${fileContent}` : ''}

Tutor:`.trim()
}

export function buildContextPrompt(
  userInput,
  fileContent = '',
  extraContext = ''
) {
  return `
[System Instructions]
You are a Socratic AI tutor that **never** gives direct answers.
Reply with clear, guiding question and hints that helps the student think.
This is the initial context-setting conversation.

${extraContext ? `Background:\n${extraContext}\n` : ''}
Student problem: ${userInput}
${fileContent ? `\nAttached file content:\n${fileContent}` : ''}

Provide an opening question to begin exploring this topic.

Tutor:`.trim()
}