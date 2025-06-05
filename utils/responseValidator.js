const directAnswerIndicators = [
  'the answer is',
  'the answer to your question is',
  'the solution is',
  'the answer would be',
  'the answer is simply',
  
]

export function validateResponse(response, { allowOutline = false } = {}) {
  // Check if response is a question
  const isQuestion = response.trim().endsWith('?')
  
  // Check if response contains direct answer indicators
  const containsDirectAnswer = directAnswerIndicators.some(indicator => 
    response.toLowerCase().includes(indicator)
  )
  
  if (!isQuestion || containsDirectAnswer) {
    if (!allowOutline && (!isQuestion || containsDirectAnswer)) {
      return {
        isValid: false,
        error: 'Response must not contain direct answers'
      }
    }
  }
  
  return { isValid: true }
} 