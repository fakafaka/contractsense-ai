import { invokeLLM } from "./_core/llm";
import { PDFParse } from "pdf-parse";
import crypto from "crypto";

export type AnalysisMode = "quick" | "deep";

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
}

/**
 * Compute SHA256 hash of normalized text for deduplication
 */
export function computeContentHash(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ").replace(/\r\n/g, "\n");
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * Analyzes a contract using AI to extract key information in plain English
 * @param contractText The full text of the contract
 * @param mode Analysis mode: "quick" (default, strict limits) or "deep" (longer output)
 * @returns Structured analysis results
 */
export async function analyzeContract(
  contractText: string,
  mode: AnalysisMode = "quick"
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

  const isQuick = mode === "quick";
  const maxWords = isQuick ? 200 : 400;
  const maxTokens = isQuick ? 300 : 600;

  const userPrompt = `Analyze this contract BRIEFLY in plain English. Total output must be ${isQuick ? "150-200" : "250-400"} words max.

CONTRACT TEXT:
${contractText}

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
- Total output: 250-400 words max`;

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
      contentHash: computeContentHash(contractText),
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
    
    console.log(`[PDF Extraction] Successfully extracted ${extractedText.length} characters`);
    return extractedText;
  } catch (error: any) {
    console.error("[PDF Extraction] Error:", error);
    
    if (error.message === "NO_TEXT_FOUND") {
      throw new Error("This PDF contains no selectable text. Please paste the text instead.");
    }
    
    throw new Error("Failed to extract text from PDF. Please try uploading as text instead.");
  }
}
