/**
 * Auto-tagging fallback with heuristics
 *
 * Used when Chrome Prompt API is unavailable
 */

import type { AutoTagRequest, AutoTagResponse } from "@/types";

// Common domains by keywords
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  technology: [
    "computer",
    "software",
    "app",
    "web",
    "code",
    "program",
    "tech",
    "digital",
  ],
  business: [
    "company",
    "business",
    "market",
    "sales",
    "client",
    "customer",
    "profit",
  ],
  education: [
    "school",
    "learn",
    "teach",
    "student",
    "study",
    "education",
    "class",
  ],
  travel: [
    "travel",
    "trip",
    "flight",
    "hotel",
    "tourist",
    "vacation",
    "destination",
  ],
  food: ["food", "eat", "cook", "restaurant", "meal", "dish", "recipe"],
  health: [
    "health",
    "doctor",
    "hospital",
    "medicine",
    "patient",
    "treatment",
    "cure",
  ],
  sports: ["sport", "game", "play", "team", "match", "player", "score"],
  entertainment: [
    "movie",
    "music",
    "show",
    "watch",
    "listen",
    "entertainment",
    "actor",
  ],
};

/**
 * Fallback auto-tagging using simple heuristics
 */
export function autoTagWithFallback(request: AutoTagRequest): AutoTagResponse {
  console.log("[Glotian Auto-Tag Fallback] Using heuristic tagging");

  const text = request.text.toLowerCase();
  const words = text.split(/\s+/).filter((w) => w.length > 3);

  // Detect domain
  let domain = "general";
  let maxScore = 0;

  for (const [domainName, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const textWords = new Set(text.split(/\W+/));
    const score = keywords.filter((keyword) => textWords.has(keyword)).length;
    if (score > maxScore) {
      maxScore = score;
      domain = domainName;
    }
  }

  // Extract tags (most frequent words > 4 chars)
  const wordFreq = new Map<string, number>();
  words.forEach((word) => {
    if (word.length > 4 && !isCommonWord(word)) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
  });

  const tags = Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  // Extract keywords (unique words > 3 chars)
  const keywords = [...new Set(words)]
    .filter((word) => word.length > 3 && !isCommonWord(word))
    .slice(0, 5);

  // Estimate CEFR level based on text complexity
  const cefrLevel = estimateCEFRLevel(request.text);

  return {
    tags: tags.length > 0 ? tags : ["general"],
    keywords: keywords.length > 0 ? keywords : ["text"],
    cefrLevel,
    domain,
  };
}

/**
 * Estimate CEFR level based on text complexity
 */
function estimateCEFRLevel(
  text: string,
): "A1" | "A2" | "B1" | "B2" | "C1" | "C2" {
  const words = text
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    return "A1";
  }

  const totalWordLength = words.reduce((sum, word) => sum + word.length, 0);
  const avgWordLength = totalWordLength / words.length;

  const sentences = text
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
  const sentenceCount = Math.max(sentences.length, 1);
  const avgSentenceLength = words.length / sentenceCount;

  // Simple heuristic based on average word and sentence length
  if (avgWordLength < 5 && avgSentenceLength < 10) {
    return "A1";
  } else if (avgWordLength < 6 && avgSentenceLength < 12) {
    return "A2";
  } else if (avgWordLength < 7 && avgSentenceLength < 15) {
    return "B1";
  } else if (avgWordLength < 8 && avgSentenceLength < 18) {
    return "B2";
  } else if (avgWordLength < 9 && avgSentenceLength < 22) {
    return "C1";
  } else {
    return "C2";
  }
}

/**
 * Check if word is a common stop word
 */
function isCommonWord(word: string): boolean {
  const stopWords = new Set([
    "the",
    "be",
    "to",
    "of",
    "and",
    "a",
    "in",
    "that",
    "have",
    "i",
    "it",
    "for",
    "not",
    "on",
    "with",
    "he",
    "as",
    "you",
    "do",
    "at",
    "this",
    "but",
    "his",
    "by",
    "from",
    "they",
    "we",
    "say",
    "her",
    "she",
    "or",
    "an",
    "will",
    "my",
    "one",
    "all",
    "would",
    "there",
    "their",
    "what",
  ]);

  return stopWords.has(word);
}
