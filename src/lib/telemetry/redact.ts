/** Best effort, bounded work; arbitrary names/context are deliberately not classified. */
export function redactQuery(query: string) {
  // Omit rather than partially inspect an input that would monopolize edge CPU.
  if (query.length > 16_384) throw new Error("Query exceeds sanitization budget");
  let text = query.normalize("NFKC");
  const patterns = [
    /\b(?:https?:\/\/|www\.)[^\s<>]+/giu,
    /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/giu,
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    /(?<![\w:])(?:[a-f\d]{1,4}:){2,}[a-f\d:]*(?:%[\w]+)?(?![\w:])/gi,
    /(?<![\w:])::(?:[a-f\d]{1,4}:?)+\b/gi,
    /\b(?:bearer\s+\S+|(?:api[_-]?key|token|password|secret)\s*[:=]\s*(?:"[^"]*"|'[^']*'|\S+))/gi,
    /\b(?:sk[-_]|gh[pousr]_|github_pat_|ph[cx]_|AKIA)[a-z\d_-]{8,}\b/gi,
    /\beyJ[a-z\d_-]+\.[a-z\d_-]+\.[a-z\d_-]+\b/gi,
    // Seven-plus digits, with phone separators, but not dotted versions or short standards.
    /(?<![\w.])\+?\d[\d ()-]{5,}\d(?![\w.])/g,
  ];
  let redacted = false;
  for (const [index, pattern] of patterns.entries()) {
    text = text.replace(pattern, (match) => {
      if (index === patterns.length - 1 && match.replace(/\D/g, "").length < 7) return match;
      redacted = true;
      return "[redacted]";
    });
  }
  text = text
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const points = [...text];
  return { text: points.slice(0, 256).join(""), redacted, truncated: points.length > 256 };
}
