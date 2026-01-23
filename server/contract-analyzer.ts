import { invokeLLM } from "./_core/llm";

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
  riskLevel: "low" | "medium" | "high";
}

/**
 * Analyzes a contract using AI to extract key information in plain English
 * @param contractText The full text of the contract
 * @returns Structured analysis results
 */
export async function analyzeContract(contractText: string): Promise<AnalysisResult> {
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

  const userPrompt = `Please analyze the following contract and provide a comprehensive breakdown in plain English.

CONTRACT TEXT:
${contractText}

Please provide your analysis in the following JSON format:

{
  "summary": "A 2-3 paragraph plain English summary of what this contract is about and its main purpose",
  "mainObligations": [
    "First main responsibility or obligation",
    "Second main responsibility or obligation",
    "Third main responsibility or obligation"
  ],
  "potentialRisks": [
    {
      "title": "Brief risk title",
      "description": "Plain English explanation of what could go wrong",
      "severity": "low|medium|high"
    }
  ],
  "redFlags": [
    {
      "category": "termination|payment|liability|other",
      "title": "Brief red flag title",
      "description": "Plain English explanation of why this is concerning"
    }
  ],
  "overallRiskLevel": "low|medium|high"
}

IMPORTANT:
- Summary should be conversational and easy to understand
- Main obligations should be written as "You will..." or "You must..." statements
- Potential risks should explain realistic scenarios that could happen
- Red flags should highlight the most concerning clauses
- Overall risk level should be based on the severity and number of issues found
- Use plain English throughout - no legal jargon`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
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
      riskLevel: ["low", "medium", "high"].includes(parsed.overallRiskLevel)
        ? parsed.overallRiskLevel
        : "medium",
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
  // For now, we'll use a placeholder
  // In production, you'd want to use a library like pdf-parse
  // or call an external service
  
  // Import pdf-parse dynamically
  try {
    const pdfParse = (await import("pdf-parse")) as any;
    const data = await pdfParse.default(pdfBuffer);
    return data.text;
  } catch (error) {
    console.error("[PDF Extraction] Error:", error);
    throw new Error("Failed to extract text from PDF. Please try uploading as text instead.");
  }
}
