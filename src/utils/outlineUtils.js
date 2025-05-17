// parses replies like "### Part 3 / 5\n\nHere is the content…"
export function parseOutline(replyText) {
  // 1) match the header
  const headerRe = /^###\s*Part\s*(\d+)\s*\/\s*(\d+)/m;
  const match    = replyText.match(headerRe);

  if (!match) {
    // not an outline reply → return nulls and the full text
    return { part: null, total: null, content: replyText };
  }

  const part  = parseInt(match[1], 10);
  const total = parseInt(match[2], 10);

  // 2) strip out the entire header line
  const content = replyText.replace(headerRe, '').trim();

  return { part, total, content };
}