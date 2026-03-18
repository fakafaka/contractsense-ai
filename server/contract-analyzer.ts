import { invokeLLM } from "./_core/llm";
import { PDFParse } from "pdf-parse";
import crypto from "crypto";

export type AnalysisMode = "standard";
export const MAX_ANALYSIS_PAGES = 10;
export const MAX_TEXT_CHARS_FOR_ANALYSIS = 60_000;
export const ANALYSIS_CACHE_VERSION = "v1";
export const ANALYSIS_SCOPE_NOTE =
  "Only the first 10 pages (or equivalent capped text section) were analyzed.";

export type AnalysisScopeMetadata = {
  truncated: boolean;
  pagesAnalyzed: number;
  analysisScopeNote: string;
};

export interface AnalysisResult {
  summary: string;
  mainObligations: string[];
  potentialRisks: Array<{
    title: string;
    description: string;
    severity: "low" | "medium" | "high";
  }>;
  redFlags: Array<{
    category: "termination" | "payment" | "liability" | "other";
    title: string;
    description: string;
  }>;
  mode: AnalysisMode;
  cached?: boolean;
  contentHash?: string;
  scope: AnalysisScopeMetadata;
}

/**
 * Compute SHA256 hash of normalized text for deduplication
 */
export function computeContentHash(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ").replace(/\r\n/g, "\n");
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function buildAnalysisCacheKey(
  contentType: "text" | "pdf" | "images",
  sourceText: string,
  sourceIdentity = "",
): string {
  const capped = capContractTextForV1(sourceText);
  const normalizedHash = computeContentHash(capped);
  return computeContentHash(`${ANALYSIS_CACHE_VERSION}:${contentType}:${sourceIdentity}:${normalizedHash}`);
}

export function getAnalysisScopeMetadata(text: string): AnalysisScopeMetadata {
  const pages = text.split("\f");
  const originalPages = Math.max(1, pages.filter((page) => page.trim().length > 0).length || pages.length);
  const truncatedByPages = originalPages > MAX_ANALYSIS_PAGES;
  const truncatedByChars = text.length > MAX_TEXT_CHARS_FOR_ANALYSIS;
  return {
    truncated: truncatedByPages || truncatedByChars,
    pagesAnalyzed: Math.min(MAX_ANALYSIS_PAGES, originalPages),
    analysisScopeNote: ANALYSIS_SCOPE_NOTE,
  };
}

/**
 * Analyzes a contract using AI to extract key information in plain English
 * @param contractText The full text of the contract
 * @param mode Analysis mode (single V1 mode)
 * @returns Structured analysis results
 */
export async function analyzeContract(
  contractText: string,
  mode: AnalysisMode = "standard"
): Promise<AnalysisResult> {
  const startTime = Date.now();

  // System prompt that sets the context and tone
  const systemPrompt = `You are a contract analysis assistant helping non-lawyers understand legal documents. Your goal is to explain contracts in plain English, without legal jargon.

IMPORTANT GUIDELINES:
- Use simple, everyday language
- Avoid legal terminology unless absolutely necessary (and explain it if you must use it)
- Be clear and direct
- Focus on what matters to a small business owner or freelancer
- This is NOT legal advice - you're helping people understand, not advising them legally
- Be objective and balanced - don't exaggerate risks but don't minimize them either`;

  const cappedContractText = capContractTextForV1(contractText);
  const scope = getAnalysisScopeMetadata(contractText);
  const maxTokens = 350;

  const userPrompt = `Analyze this contract BRIEFLY in plain English. Total output must be 150-220 words.

CONTRACT TEXT:
${cappedContractText}

Provide analysis in this JSON format:

{
  "summary": "2-3 sentence overview (max 50 words). If not a contract, say so briefly.",
  "mainObligations": [
    "The document states... (max 15 words)",
    "The agreement indicates... (max 15 words)",
    "This clause requires... (max 15 words)"
  ],
  "potentialRisks": [
    {
      "title": "3-5 words",
      "description": "One short sentence (max 20 words)",
      "severity": "low|medium|high"
    }
  ],
  "redFlags": [
    {
      "category": "termination|payment|liability|other",
      "title": "3-5 words",
      "description": "One short sentence (max 20 words)"
    }
  ]
}

STRICT RULES:
- Summary: 2-3 sentences max (50 words)
- Main obligations: 3-5 bullets, each max 15 words. Use NEUTRAL wording: "The document states...", "The agreement indicates...", "This clause requires...". NEVER use "You must/should/will".
- Potential risks: 3-5 items, title 3-5 words, description max 20 words. Use neutral language: "It may mean...", "This could result in..."
- Red flags: 3-5 items, title 3-5 words, description max 20 words. Use neutral language: "This clause indicates...", "The document allows..."
- NO paragraphs, NO repetition, NO extra context, NO imperative advice
- Total output: 150-220 words max
- You MUST explicitly mention that ONLY the first 10 pages were analyzed (or equivalent capped excerpt for pasted text).`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: maxTokens,
    });

    const content = response.choices[0].message.content;
    if (typeof content !== 'string') {
      throw new Error('Invalid response format from LLM');
    }
    const parsed = JSON.parse(content);

    // Validate and structure the response
    const result: AnalysisResult = {
      summary: parsed.summary || "Unable to generate summary",
      mainObligations: Array.isArray(parsed.mainObligations) ? parsed.mainObligations : [],
      potentialRisks: Array.isArray(parsed.potentialRisks)
        ? parsed.potentialRisks.map((risk: any) => ({
            title: risk.title || "Unknown Risk",
            description: risk.description || "",
            severity: ["low", "medium", "high"].includes(risk.severity) ? risk.severity : "medium",
          }))
        : [],
      redFlags: Array.isArray(parsed.redFlags)
        ? parsed.redFlags.map((flag: any) => ({
            category: ["termination", "payment", "liability", "other"].includes(flag.category)
              ? flag.category
              : "other",
            title: flag.title || "Unknown Issue",
            description: flag.description || "",
          }))
        : [],
      mode,
      contentHash: computeContentHash(cappedContractText),
      scope,
    };

    const processingTime = Date.now() - startTime;
    console.log(`[Contract Analysis] Completed in ${processingTime}ms`);

    return result;
  } catch (error) {
    console.error("[Contract Analysis] Error:", error);
    throw new Error("Failed to analyze contract. Please try again.");
  }
}

/**
 * Extracts text from PDF buffer using a simple text extraction approach
 * For production, consider using pdf-parse or similar library
 */
export async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  try {
    const parser = new PDFParse({ data: pdfBuffer });
    const textResult = await parser.getText();
    const extractedText = textResult.text?.trim() || "";
    
    // Clean up
    await parser.destroy();
    
    // Check if we actually extracted any text
    if (!extractedText || extractedText.length < 10) {
      throw new Error("NO_TEXT_FOUND");
    }
    
    const capped = capContractTextForV1(extractedText);
    console.log(`[PDF Extraction] Successfully extracted ${extractedText.length} characters (capped to ${capped.length} for V1 analysis)`);
    return capped;
  } catch (error: any) {
    console.error("[PDF Extraction] Error:", error);
    
    if (error.message === "NO_TEXT_FOUND") {
      throw new Error("This PDF contains no selectable text. Please paste the text instead.");
    }
    
    throw new Error("Failed to extract text from PDF. Please try uploading as text instead.");
  }
}

export async function extractTextFromImages(imageUrls: string[]): Promise<string> {
  if (!imageUrls.length) {
    throw new Error("No images were provided.");
  }

  const content = [
    {
      type: "text" as const,
      text:
        "Extract readable contract text from these document photos in page order. Return strict JSON: {\"text\":\"...\"}. If unreadable, return an empty string.",
    },
    ...imageUrls.map((url) => ({
      type: "image_url" as const,
      image_url: { url, detail: "high" as const },
    })),
  ];

  try {
    const response = await invokeLLM({
      messages: [{ role: "user", content }],
      response_format: { type: "json_object" },
      max_tokens: 1200,
    });
    const raw = response.choices[0].message.content;
    if (typeof raw !== "string") throw new Error("Invalid OCR response");
    const parsed = JSON.parse(raw);
    const text = String(parsed?.text || "").trim();
    if (text.length < 10) {
      throw new Error("OCR_EMPTY");
    }
    return capContractTextForV1(text);
  } catch (error: any) {
    if (error?.message === "OCR_EMPTY") {
      throw new Error("We couldn't read the document. Please try clearer photos.");
    }
    throw new Error("We couldn't read the document. Please try clearer photos.");
  }
}

export function capContractTextForV1(text: string): string {
  if (!text) return "";
  // Form feed \f is a common PDF page separator in extracted text.
  const pages = text.split("\f");
  const firstTenPages = pages.slice(0, MAX_ANALYSIS_PAGES).join("\f");
  return firstTenPages.slice(0, MAX_TEXT_CHARS_FOR_ANALYSIS).trim();
}


export type AnalysisQualityReport = {
  score: number;
  checks: {
    summaryLengthOk: boolean;
    obligationsCountOk: boolean;
    risksCountOk: boolean;
    redFlagsCountOk: boolean;
    neutralToneOk: boolean;
  };
  suggestions: string[];
};

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function hasImperativeTone(text: string) {
  return /\b(you must|you should|you need to|do not sign|never agree)\b/i.test(text);
}

export function evaluateAnalysisQuality(
  analysis: Pick<AnalysisResult, "summary" | "mainObligations" | "potentialRisks" | "redFlags" | "mode">,
): AnalysisQualityReport {
  const summaryWords = wordCount(analysis.summary || "");

  const summaryLengthOk = summaryWords >= 15 && summaryWords <= 80;
  const obligationsCountOk = analysis.mainObligations.length >= 3 && analysis.mainObligations.length <= 5;
  const risksCountOk = analysis.potentialRisks.length >= 3 && analysis.potentialRisks.length <= 5;
  const redFlagsCountOk = analysis.redFlags.length >= 3 && analysis.redFlags.length <= 5;
  const allText = [
    analysis.summary,
    ...analysis.mainObligations,
    ...analysis.potentialRisks.map((r) => `${r.title} ${r.description}`),
    ...analysis.redFlags.map((r) => `${r.title} ${r.description}`),
  ].join(" ");
  const neutralToneOk = !hasImperativeTone(allText);

  let score = 100;
  if (!summaryLengthOk) score -= 20;
  if (!obligationsCountOk) score -= 20;
  if (!risksCountOk) score -= 20;
  if (!redFlagsCountOk) score -= 20;
  if (!neutralToneOk) score -= 20;

  const suggestions: string[] = [];
  if (!summaryLengthOk) suggestions.push("Keep summary concise and within target word range.");
  if (!obligationsCountOk) suggestions.push("Return 3-5 concrete obligation bullets.");
  if (!risksCountOk) suggestions.push("Return 3-5 potential risks with short descriptions.");
  if (!redFlagsCountOk) suggestions.push("Return 3-5 red flags grouped by category.");
  if (!neutralToneOk) suggestions.push("Use neutral wording and avoid imperative legal advice statements.");

  return {
    score: Math.max(0, score),
    checks: {
      summaryLengthOk,
      obligationsCountOk,
      risksCountOk,
      redFlagsCountOk,
      neutralToneOk,
    },
    suggestions,
  };
}
