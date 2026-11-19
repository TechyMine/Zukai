import type { ScriptSegment, MustPreserveFact, DocumentChunk } from '../types.js';

export interface VerificationResult {
  passed: boolean;
  claimSupportRate: number; // 0.0 to 1.0
  unsupportedClaims: string[];
  preservedFactsChecked: number;
  reasons: string[];
}

const FORBIDDEN_AUDIO_PATTERNS = [
  /as shown (?:above|below)/i,
  /refer to (?:figure|table|page)/i,
  /see (?:diagram|image|appendix)/i,
  /in the following table/i,
  /click (?:here|link)/i,
  /https?:\/\//i,
  /^[*•-]\s+/m, // markdown bullets
  /```/, // code fences
  /\|.*?\|/, // markdown table rows
];

/**
 * Deterministic and semantic critic verifier for spoken script segments.
 */
export function verifyChapterScript(
  segments: ScriptSegment[],
  sourceChunks: DocumentChunk[],
  mustPreserveFacts: MustPreserveFact[] = []
): VerificationResult {
  const reasons: string[] = [];
  const unsupportedClaims: string[] = [];

  const fullSpokenText = segments.map((s) => s.text).join(' ');
  const combinedSourceText = sourceChunks.map((c) => c.text).join(' ').toLowerCase();

  // 1. Forbidden spoken artifacts check
  for (const pattern of FORBIDDEN_AUDIO_PATTERNS) {
    if (pattern.test(fullSpokenText)) {
      reasons.push(`Forbidden spoken formatting detected matching pattern: ${pattern}`);
    }
  }

  // 2. Deterministic Number & Metric Verification
  // Extract all numbers from script (e.g. 99%, $50M, 42.5, 2026)
  const scriptNumbers = fullSpokenText.match(/(?:[\$₹€]\s*)?\b\d+(?:\.\d+)?(?:%|[KMBkmb]\b)?/g) || [];
  let numbersVerified = 0;

  for (const num of scriptNumbers) {
    const rawDigits = num.replace(/[^\d.]/g, '');
    if (rawDigits.length > 0 && !['1', '2', '3', '4', '5'].includes(rawDigits)) {
      // Small integers (1, 2, 3) are allowed for general discourse, larger numbers must be grounded
      if (!combinedSourceText.includes(num.toLowerCase()) && !combinedSourceText.includes(rawDigits)) {
        unsupportedClaims.push(`Potentially hallucinated number "${num}" not found in source evidence.`);
      } else {
        numbersVerified++;
      }
    }
  }

  // 3. Must-Preserve Facts Check
  let preservedFactsChecked = 0;
  for (const fact of mustPreserveFacts) {
    const lowerFact = fact.fact.toLowerCase();
    if (fullSpokenText.toLowerCase().includes(lowerFact)) {
      preservedFactsChecked++;
    } else {
      // If a required fact is omitted, note it
      if (fact.required) {
        reasons.push(`Mandatory fact "${fact.fact}" was omitted from the spoken script.`);
      }
    }
  }

  // 4. Sentence Length Check (spoken audio threshold: sentences > 45 words are hard to listen to)
  const sentences = fullSpokenText.split(/[.?!]\s+/);
  for (const sentence of sentences) {
    const wordCount = sentence.split(/\s+/).filter(Boolean).length;
    if (wordCount > 45) {
      reasons.push(`Sentence is too long for spoken clarity (${wordCount} words): "${sentence.slice(0, 50)}..."`);
      break;
    }
  }

  // Compute claim support rate
  const totalChecks = Math.max(1, scriptNumbers.length);
  const claimSupportRate = Math.max(
    0,
    Number(((totalChecks - unsupportedClaims.length) / totalChecks).toFixed(2))
  );

  const passed = unsupportedClaims.length === 0 && reasons.length <= 1;

  return {
    passed,
    claimSupportRate,
    unsupportedClaims,
    preservedFactsChecked,
    reasons,
  };
}
