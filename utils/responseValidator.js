const directAnswerIndicators = [
  'the answer is',
  'here is how',
  'you should',
  'you need to',
  'you must',
  'the solution is',
  'here\'s what',
  'here\'s how',
  'this is how',
  'this is what'
]

export function validateResponse(response) {
  // Check if response is a question
  const isQuestion = response.trim().endsWith('?')
  
  // Check if response contains direct answer indicators
  const containsDirectAnswer = directAnswerIndicators.some(indicator => 
    response.toLowerCase().includes(indicator)
  )
  
  if (!isQuestion || containsDirectAnswer) {
    return {
      isValid: false,
      error: 'Response must be a question and not contain direct answers'
    }
  }
  
  return { isValid: true }
} 