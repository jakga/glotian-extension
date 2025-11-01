/**
 * Shared AI type definitions
 */

export interface RewriteLearningExpression {
  original: string;
  rewritten: string;
  explanation: string;
}

export interface RewriteResponse {
  rewrittenText: string;
  alternatives: string[];
  learningExpressions: RewriteLearningExpression[];
  processingTime: number;
  aiSource: "chrome" | "openai";
}
