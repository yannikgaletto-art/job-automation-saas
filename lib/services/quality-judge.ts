import Anthropic from "@anthropic-ai/sdk"

export interface QualityScores {
    naturalness_score: number          // 0-10: No AI language, varied sentences
    style_match_score: number          // 0-10: Matches reference style
    company_relevance_score: number    // 0-10: Relevant and subtle
    individuality_score: number        // 0-10: Concrete, not generic
    overall_score: number              // Average of above
    issues: string[]                   // What's wrong?
    suggestions: string[]              // How to improve?
}

export async function judgeQuality(
    coverLetter: string,
    referenceStyle: string,
    companyValues: string[],
    jobDescription: string
): Promise<QualityScores> {

    const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
    })

    const judgment = await anthropic.messages.create({
        model: "claude-3-haiku-20240307", // Using specific model ID for stability
        max_tokens: 1500,
        messages: [{
            role: "user",
            content: `You are a strict quality judge for cover letters.
      
      **COVER LETTER TO JUDGE:**
      ${coverLetter}
      
      **REFERENCE STYLE (the goal):**
      ${referenceStyle}
      
      **COMPANY VALUES:**
      ${companyValues.join(", ")}
      
      **JOB DESCRIPTION:**
      ${jobDescription}
      
      **EVALUATE (score 0-10 for each):**
      
      1. Naturalness (no AI language):
         - At least 3 sentences start with conjunctions? (Daher, Deshalb, Gleichzeitig)
         - Sentence length varies? (15-25 words avg, some shorter)
         - No clichés? ("freue mich auf", "hiermit bewerbe ich mich", etc.)
         - Sounds human, not robot?
      
      2. Style Congruence (matches reference):
         - Tone matches reference?
         - User's voice recognizable?
         - Paragraph structure followed?
         - Conjunctions used like in reference?
      
      3. Company Relevance (relevant but subtle):
         - Values mentioned naturally?
         - News/research integrated (if fitting)?
         - Not generic (could apply to any company)?
         - Specific to this company?
      
      4. Individuality (unique to user):
         - Concrete examples from user's CV?
         - Not interchangeable with another candidate?
         - Personal achievements mentioned?
         - Quantified results included?
      
      **OUTPUT FORMAT (JSON ONLY, no other text):**
      {
        "naturalness_score": 8,
        "style_match_score": 7,
        "company_relevance_score": 9,
        "individuality_score": 8,
        "overall_score": 8,
        "issues": [
          "Only 1 sentence starts with conjunction (need 3+)",
          "Phrase 'freue mich auf' sounds standard"
        ],
        "suggestions": [
          "Start more sentences with Daher/Deshalb",
          "Replace 'freue mich auf' with more personal closing"
        ]
      }
      `
        }]
    })

    // Parse JSON response safely
    try {
        const content = judgment.content[0].type === 'text' ? judgment.content[0].text : ''
        const scores = JSON.parse(content)
        return scores
    } catch (error) {
        console.error("Failed to parse judgment scores:", error)
        // Fallback or re-throw
        return {
            naturalness_score: 0,
            style_match_score: 0,
            company_relevance_score: 0,
            individuality_score: 0,
            overall_score: 0,
            issues: ["Failed to parse AI judgment"],
            suggestions: ["Retry generation"]
        }
    }
}
