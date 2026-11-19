import { createRequire } from 'module';
import mammoth from 'mammoth';
import AdmZip from 'adm-zip';
import { validateMagicBytes } from '../../extraction/magicBytes.js';
import { WorkerError, WORKER_ERROR_CODES } from '../../errors.js';
import type {
  NormalizedSection,
  NormalizedBlock,
  QualityScore,
  BlockType,
} from '../types.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

export interface ExtractionResult {
  title: string;
  detectedLanguage: string;
  pageCount: number;
  wordCount: number;
  sections: NormalizedSection[];
  qualityScore: QualityScore;
  warnings: string[];
}

/**
 * Strips repeated running headers, footers, and page numbers from text lines.
 */
export function removeHeadersAndFooters(lines: string[]): string[] {
  const lineCounts = new Map<string, number>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 3 && trimmed.length < 80) {
      lineCounts.set(trimmed, (lineCounts.get(trimmed) || 0) + 1);
    }
  }

  // A line appearing more than 4 times across pages is likely a running header/footer
  const isHeaderFooter = (l: string) => {
    const trimmed = l.trim();
    if (!trimmed) return false;
    // Page number patterns: e.g. "Page 1 of 10", "- 4 -", "12"
    if (/^(page\s+\d+(\s+of\s+\d+)?|-?\s*\d+\s*-?)$/i.test(trimmed)) return true;
    return (lineCounts.get(trimmed) || 0) >= 4;
  };

  return lines.filter((l) => !isHeaderFooter(l));
}

/**
 * Computes an objective Extraction Quality Score (0.0 to 1.0).
 */
export function computeQualityScore(
  rawText: string,
  pageCount: number,
  sections: NormalizedSection[]
): QualityScore {
  if (!rawText || rawText.trim().length === 0) {
    return {
      textDensity: 0,
      garbageCharRatio: 1,
      repeatedLineRatio: 0,
      languageConfidence: 0,
      structureScore: 0,
      overall: 0,
      passed: false,
    };
  }

  const words = rawText.split(/\s+/).filter(Boolean);
  const totalChars = rawText.length;

  // 1. Text Density: average words per page
  const wordsPerPage = words.length / Math.max(1, pageCount);
  const textDensityScore = Math.min(1.0, wordsPerPage / 150);

  // 2. Garbage character ratio
  const garbageChars = (rawText.match(/[\uFFFD\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g) || []).length;
  const garbageCharRatio = garbageChars / Math.max(1, totalChars);
  const cleanCharScore = Math.max(0, 1.0 - garbageCharRatio * 5);

  // 3. Repeated line ratio
  const allLines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const uniqueLines = new Set(allLines);
  const repeatedLineRatio = allLines.length > 0 ? (allLines.length - uniqueLines.size) / allLines.length : 0;
  const repetitionScore = Math.max(0, 1.0 - repeatedLineRatio * 2);

  // 4. Language Confidence (detect Latin or Devanagari printable words)
  const readableWords = words.filter((w) => /^[\p{L}\p{N}\p{P}]+$/u.test(w)).length;
  const languageConfidence = words.length > 0 ? readableWords / words.length : 0;

  // 5. Structure Score: presence of identifiable headings and multiple sections
  const structureScore = sections.length > 1 ? 0.9 : (sections[0]?.heading !== 'Overview' ? 0.7 : 0.5);

  // Weighted overall quality score
  const overall = Number(
    (
      textDensityScore * 0.25 +
      cleanCharScore * 0.25 +
      repetitionScore * 0.15 +
      languageConfidence * 0.20 +
      structureScore * 0.15
    ).toFixed(2)
  );

  const passed = overall >= 0.55 && garbageCharRatio < 0.25 && wordsPerPage >= 15;

  return {
    textDensity: Number(wordsPerPage.toFixed(1)),
    garbageCharRatio: Number(garbageCharRatio.toFixed(3)),
    repeatedLineRatio: Number(repeatedLineRatio.toFixed(3)),
    languageConfidence: Number(languageConfidence.toFixed(2)),
    structureScore: Number(structureScore.toFixed(2)),
    overall,
    passed,
  };
}

/**
 * Extracts and normalizes structured content from PDF, DOCX, PPTX, or TXT.
 */
export async function extractStructureAware(
  buffer: Buffer,
  filename: string = 'document'
): Promise<ExtractionResult> {
  const { extension } = validateMagicBytes(buffer);
  const warnings: string[] = [];

  let rawSections: Array<{ heading: string; text: string; page?: number }> = [];
  let detectedPageCount = 1;
  let title = filename.replace(/\.[^/.]+$/, '');

  if (extension === 'pdf') {
    let pdfData;
    try {
      pdfData = await pdfParse(buffer);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('password') || msg.includes('encrypted')) {
        throw new WorkerError(
          WORKER_ERROR_CODES.PASSWORD_PROTECTED,
          'This PDF is encrypted or password-protected.',
          false
        );
      }
      throw err;
    }

    const fullPdfText = (pdfData.text || '').trim();
    detectedPageCount = pdfData.numpages || 1;

    if (!fullPdfText || fullPdfText.length === 0) {
      throw new WorkerError(
        WORKER_ERROR_CODES.SCANNED_NO_TEXT,
        'This PDF contains scanned images without selectable text.',
        false
      );
    }

    // Clean running headers/footers
    const cleanedLines = removeHeadersAndFooters(fullPdfText.split(/\r?\n/));
    const cleanedText = cleanedLines.join('\n');

    // Split on section-like headings (capitalized lines, numbered headings)
    const rawParagraphs = cleanedText.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    let currentHeading = 'Introduction';
    let currentText = '';

    for (const para of rawParagraphs) {
      const trimmed = para.trim();
      // Heading heuristic: short line, starts with number or title case
      const isHeading =
        trimmed.length < 90 &&
        !trimmed.endsWith('.') &&
        (/^(Chapter|\d+\.|\d+\s+[A-Z]|[A-Z][a-zA-Z0-9\s:,-]{3,50}$)/.test(trimmed) ||
          trimmed === trimmed.toUpperCase());

      if (isHeading && currentText.trim().length > 100) {
        rawSections.push({ heading: currentHeading, text: currentText.trim() });
        currentHeading = trimmed;
        currentText = '';
      } else {
        currentText += (currentText ? '\n\n' : '') + trimmed;
      }
    }

    if (currentText.trim().length > 0) {
      rawSections.push({ heading: currentHeading, text: currentText.trim() });
    }
  } else if (extension === 'docx') {
    let docxResult;
    try {
      docxResult = await mammoth.extractRawText({ buffer });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('password') || msg.includes('encrypted')) {
        throw new WorkerError(
          WORKER_ERROR_CODES.PASSWORD_PROTECTED,
          'This Word document is password-protected.',
          false
        );
      }
      throw err;
    }

    const docxText = (docxResult.value || '').trim();
    if (!docxText) {
      throw new WorkerError(
        WORKER_ERROR_CODES.EMPTY_DOCUMENT,
        'The uploaded Word document contains no text.',
        false
      );
    }

    const paragraphs = docxText.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    detectedPageCount = Math.max(1, Math.ceil(docxText.split(/\s+/).length / 450));

    let currentHeading = 'Overview';
    let currentText = '';

    for (const para of paragraphs) {
      const trimmed = para.trim();
      const isHeading = trimmed.length < 80 && !trimmed.endsWith('.') && /^[A-Z0-9]/.test(trimmed);

      if (isHeading && currentText.trim().length > 150) {
        rawSections.push({ heading: currentHeading, text: currentText.trim() });
        currentHeading = trimmed;
        currentText = '';
      } else {
        currentText += (currentText ? '\n\n' : '') + trimmed;
      }
    }

    if (currentText.trim().length > 0) {
      rawSections.push({ heading: currentHeading, text: currentText.trim() });
    }
  } else if (extension === 'pptx') {
    const zip = new AdmZip(buffer);
    const slideEntries = zip
      .getEntries()
      .filter((e) => /^ppt\/slides\/slide\d+\.xml$/i.test(e.entryName))
      .sort((a, b) => {
        const numA = parseInt(a.entryName.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
        const numB = parseInt(b.entryName.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
        return numA - numB;
      });

    if (slideEntries.length === 0) {
      throw new WorkerError(
        WORKER_ERROR_CODES.EMPTY_DOCUMENT,
        'No presentation slides found in PPTX.',
        false
      );
    }

    detectedPageCount = slideEntries.length;

    for (let i = 0; i < slideEntries.length; i++) {
      const xml = slideEntries[i].getData().toString('utf-8');
      const textMatches = xml.match(/<a:t[^>]*>(.*?)<\/a:t>/gi) || [];
      const cleanTexts = textMatches
        .map((m) => m.replace(/<[^>]+>/g, '').trim())
        .filter((t) => t.length > 0);

      const slideTitle = cleanTexts[0] || `Slide ${i + 1}`;
      const body = cleanTexts.join('\n');
      if (body) {
        rawSections.push({ heading: slideTitle, text: body, page: i + 1 });
      }
    }
  } else {
    // Plain Text
    let txt = buffer.toString('utf-8');
    if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
    txt = txt.replace(/\r\n/g, '\n').trim();

    if (!txt) {
      throw new WorkerError(
        WORKER_ERROR_CODES.EMPTY_DOCUMENT,
        'File contains no text content.',
        false
      );
    }

    const paragraphs = txt.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    detectedPageCount = Math.max(1, Math.ceil(txt.split(/\s+/).length / 450));

    let currentHeading = 'Document';
    let currentText = '';

    for (const para of paragraphs) {
      const trimmed = para.trim();
      const isHeading = trimmed.length < 75 && !trimmed.endsWith('.') && /^[#A-Z0-9]/.test(trimmed);
      if (isHeading && currentText.trim().length > 30) {
        rawSections.push({ heading: currentHeading, text: currentText.trim() });
        currentHeading = trimmed.replace(/^#+\s*/, '');
        currentText = '';
      } else {
        currentText += (currentText ? '\n\n' : '') + trimmed;
      }
    }
    if (currentText.trim().length > 0) {
      rawSections.push({ heading: currentHeading, text: currentText.trim() });
    }
  }

  // Fallback if no sections were split
  if (rawSections.length === 0) {
    throw new WorkerError(
      WORKER_ERROR_CODES.EMPTY_DOCUMENT,
      'No extractable text sections found in document.',
      false
    );
  }

  // Map to NormalizedSection with NormalizedBlock
  const normalizedSections: NormalizedSection[] = rawSections.map((sec, idx) => {
    const sectionId = `sec_${idx + 1}`;
    const blocks: NormalizedBlock[] = sec.text
      .split(/\n\s*\n/)
      .filter((b) => b.trim().length > 0)
      .map((bText, bIdx) => {
        let bType: BlockType = 'paragraph';
        const trimmed = bText.trim();
        if (/^[-*•]\s+/.test(trimmed)) bType = 'list';
        else if (trimmed.includes('\t') || trimmed.includes('|---')) bType = 'table';
        else if (/^(```|function|class|def|import\s)/.test(trimmed)) bType = 'code';
        else if (/^["'“]/.test(trimmed) && trimmed.endsWith('"')) bType = 'quote';

        return {
          id: `${sectionId}_blk_${bIdx + 1}`,
          type: bType,
          text: trimmed,
          page: sec.page,
        };
      });

    const tokenCount = Math.ceil(sec.text.split(/\s+/).filter(Boolean).length * 1.33);

    return {
      id: sectionId,
      ordinal: idx + 1,
      heading: sec.heading,
      heading_path: [title, sec.heading],
      page_start: sec.page,
      page_end: sec.page,
      blocks,
      text: sec.text,
      token_count: tokenCount,
    };
  });

  const fullCombinedText = normalizedSections.map((s) => s.text).join('\n\n');
  const wordCount = fullCombinedText.split(/\s+/).filter(Boolean).length;

  // Quality evaluation
  const qualityScore = computeQualityScore(fullCombinedText, detectedPageCount, normalizedSections);

  // If text density is catastrophic or overall score is too low, fail with descriptive error
  if (!qualityScore.passed) {
    if (qualityScore.textDensity < 15 && extension === 'pdf') {
      throw new WorkerError(
        WORKER_ERROR_CODES.SCANNED_NO_TEXT,
        'This PDF appears to be a scanned document with insufficient selectable text.',
        false
      );
    }
    if (wordCount < 10) {
      throw new WorkerError(
        WORKER_ERROR_CODES.EMPTY_DOCUMENT,
        'The extracted document contains virtually no readable words.',
        false
      );
    }
    warnings.push(`Extraction quality score is low (${qualityScore.overall}). Output may be degraded.`);
  }

  // Detect basic language: check if Devanagari script is present
  const hasDevanagari = /[\u0900-\u097F]/.test(fullCombinedText);
  const detectedLanguage = hasDevanagari ? 'hi' : 'en';

  return {
    title,
    detectedLanguage,
    pageCount: detectedPageCount,
    wordCount,
    sections: normalizedSections,
    qualityScore,
    warnings,
  };
}
