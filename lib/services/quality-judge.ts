import Anthropic from "@anthropic-ai/sdk"

export interface QualityScores {
    naturalness_score: number          // 0-10: No AI language, varied sentences
    style_match_score: number          // 0-10: Matches reference style
    company_relevance_score: number    // 0-10: Relevant and subtle
    individuality_score: number        // 0-10: Concrete, not generic
    overall_score: number              // Average of above
    issues: string[]                   // What's wrong?
    suggestions: string[]              // How to improve?

    // NEW: Quote-Aware Judge Extensions (Agent 2.5)
    quote_integration?: {
        has_quote: boolean
        quote_source: string | null
        quote_relevance: number // 1-10
        quote_bridge: boolean
        quote_quality_note: string
    }

    company_specificity?: {
        company_name_count: number
        has_specific_values: boolean
        has_location: boolean
        has_specific_project: boolean
        specificity_score: number // 1-10
        specificity_note: string
    }

    tone_check?: {
        opening_score: number // 1-10
        closing_score: number // 1-10
        is_generic_opening: boolean
        is_overly_enthusiastic_closing: boolean
        tone_note: string
    }
}

export async function judgeQuality(
    coverLetter: string,
    referenceStyle: string,
    companyValues: string[],
    jobDescription: string,
    companyName: string = "Company"
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

        // NEW: Quote-Aware Judge Extensions (Agent 2.5)
        const companySpecificity = evaluateCompanySpecificity(coverLetter, companyName)
        const toneCheck = evaluateTone(coverLetter)
        const quoteIntegration = evaluateQuoteIntegration(coverLetter)

        // Add specificity feedback to issues/suggestions
        if (companySpecificity.specificity_score < 7) {
            scores.issues.push(companySpecificity.specificity_note)
        }
        if (toneCheck.is_generic_opening) {
            scores.suggestions.push("Avoid generic opening phrases. Start with quote or direct value connection.")
        }
        if (quoteIntegration.has_quote && !quoteIntegration.quote_bridge) {
            scores.suggestions.push("Connect your quote more strongly to company values.")
        }

        return {
            ...scores,
            company_specificity: companySpecificity,
            tone_check: toneCheck,
            quote_integration: quoteIntegration.has_quote ? quoteIntegration : undefined
        }
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

/**
 * Evaluates how specific the cover letter is to the target company
 */
function evaluateCompanySpecificity(
    coverLetter: string,
    companyName: string
): NonNullable<QualityScores['company_specificity']> {
    // Count company name mentions
    const namePattern = new RegExp(companyName, 'gi')
    const nameCount = (coverLetter.match(namePattern) || []).length

    // Check for generic phrases
    const genericPhrases = [
        "innovative kultur",
        "spannendes team",
        "tolle atmosphäre",
        "interessante projekte"
    ]
    const hasGenericOnly = genericPhrases.some(phrase =>
        coverLetter.toLowerCase().includes(phrase)
    )

    // Check for location mention
    const locationPatterns = [
        /Berlin|München|Hamburg|Köln|Frankfurt|Stuttgart|Prenzlauer Berg|Leipziger Platz/gi,
        /Office|Standort/gi
    ]
    const hasLocation = locationPatterns.some(pattern => pattern.test(coverLetter))

    // Check for specific projects/initiatives
    const projectKeywords = [
        "initiative",
        "proptech",
        "govtech",
        "projekt",
        "programm"
    ]
    const hasSpecificProject = projectKeywords.some(keyword =>
        coverLetter.toLowerCase().includes(keyword)
    )

    // Calculate specificity score
    let score = 0
    if (nameCount >= 2) score += 4
    else if (nameCount >= 1) score += 2

    if (!hasGenericOnly) score += 3
    if (hasLocation) score += 2
    if (hasSpecificProject) score += 1

    const issues = []
    if (nameCount < 2) issues.push("Company name mentioned less than 2 times")
    if (hasGenericOnly) issues.push("Uses generic phrases")
    if (!hasLocation) issues.push("No office location mentioned")

    return {
        company_name_count: nameCount,
        has_specific_values: !hasGenericOnly,
        has_location: hasLocation,
        has_specific_project: hasSpecificProject,
        specificity_score: Math.min(score, 10),
        specificity_note: issues.length > 0
            ? `Issues: ${issues.join('; ')}`
            : 'Strong company-specific content'
    }
}

/**
 * Evaluates authenticity of opening and closing
 */
function evaluateTone(coverLetter: string): NonNullable<QualityScores['tone_check']> {
    const opening = coverLetter.slice(0, 200).toLowerCase()
    const closing = coverLetter.slice(-150).toLowerCase()

    // Check for generic opening
    const genericOpenings = [
        "hiermit bewerbe ich mich",
        "mit großem interesse habe ich",
        "ich bewerbe mich um"
    ]
    const isGenericOpening = genericOpenings.some(phrase => opening.includes(phrase))

    // Check for overly enthusiastic closing
    const enthusiasticPhrases = [
        "würde mich sehr freuen!!!",
        "stehe jederzeit zur verfügung",
        "ich hoffe auf eine positive antwort"
    ]
    const isOverlyEnthusiastic = enthusiasticPhrases.some(phrase => closing.includes(phrase))

    // Score opening
    let openingScore = 10
    if (isGenericOpening) openingScore -= 5
    if (opening.includes("zitat") || opening.includes("liebes")) openingScore = 10

    // Score closing
    let closingScore = 10
    if (isOverlyEnthusiastic) closingScore -= 4
    if (closing.includes("beste grüße") && !isOverlyEnthusiastic) closingScore = 10

    const notes = []
    if (isGenericOpening) notes.push("Generic opening detected")
    if (isOverlyEnthusiastic) notes.push("Closing too eager")

    return {
        opening_score: openingScore,
        closing_score: closingScore,
        is_generic_opening: isGenericOpening,
        is_overly_enthusiastic_closing: isOverlyEnthusiastic,
        tone_note: notes.length > 0 ? notes.join('; ') : 'Authentic tone'
    }
}

/**
 * Detects and evaluates quote integration (optional)
 */
function evaluateQuoteIntegration(coverLetter: string): NonNullable<QualityScores['quote_integration']> {
    // Check for quote patterns
    const quotePattern = /["„"](.{20,200})[""]|«(.{20,200})»/g
    const matches = coverLetter.match(quotePattern)

    if (!matches || matches.length === 0) {
        return {
            has_quote: false,
            quote_source: null,
            quote_relevance: 0,
            quote_bridge: false,
            quote_quality_note: "No quote found (optional)"
        }
    }

    // Check for source attribution
    const sourcePattern = /[-–—]\s*([A-Z][a-z]+\s[A-Z][a-z']+)|von\s+([A-Z][a-z]+\s[A-Z][a-z']+)/
    const sourceMatch = coverLetter.match(sourcePattern)
    const quoteSource = sourceMatch ? (sourceMatch[1] || sourceMatch[2]) : null

    // Check for bridge phrases
    const bridgePhrases = [
        "resoniert",
        "erinnert mich an",
        "passt zu",
        "spiegelt wider",
        "schnittmengen",
        "maxime",
        "mission"
    ]
    const hasBridge = bridgePhrases.some(phrase =>
        coverLetter.toLowerCase().includes(phrase.toLowerCase())
    )

    // Score relevance
    let relevanceScore = 5
    if (quoteSource) relevanceScore += 2
    if (hasBridge) relevanceScore += 3

    const note = quoteSource
        ? `Quote from ${quoteSource}. ${hasBridge ? 'Well connected.' : 'Add stronger bridge.'}`
        : 'Quote found but no source cited.'

    return {
        has_quote: true,
        quote_source: quoteSource,
        quote_relevance: Math.min(relevanceScore, 10),
        quote_bridge: hasBridge,
        quote_quality_note: note
    }
}
