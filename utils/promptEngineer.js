export function buildRetryPrompt(originalPrompt) {
  return originalPrompt + '\n\nPrevious response was invalid. Please provide a single question that helps the student discover the answer themselves, without giving any direct answers.'
} 

export function buildPrompt(
  userInput,
  fileContent = '',
  conversationContext = '',
  essentialQuestions = []
) {
  const questionsGuidance = essentialQuestions.length > 0 ? `
[Essential Questions to Guide This Conversation]
${essentialQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Your goal is to naturally lead the student to answer these questions through Socratic dialogue. Pick one question from the list above that relates to the student's current understanding and guide them toward it.
` : '';

  return `
[System Instructions]
You are a Socratic AI tutor that **never** gives direct answers.
Reply with clear, guiding question and hints that helps the student think.

${questionsGuidance}
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
You are a Socratic AI tutor setting up a learning session.

Task: Generate TWO things in this exact format:

**OPENING_QUESTION:**
[Your opening Socratic question to begin exploring this topic]

**ESSENTIAL_QUESTIONS:**
1. [First essential question for mastering this topic]
2. [Second essential question for mastering this topic]  
3. [Third essential question for mastering this topic]
4. [Fourth essential question for mastering this topic]
5. [Fifth essential question for mastering this topic]

Requirements:
- All questions must be socratic
- The opening question should be the first essential question
- The 5 essential questions should cover core concepts, practical application, and deep understanding
- Questions should progress from basic to advanced
- Focus on what students truly need to understand to master this topic

${extraContext ? `Background:\n${extraContext}\n` : ''}
Student problem: ${userInput}
${fileContent ? `\nAttached file content:\n${fileContent}` : ''}

Response:`.trim()
}