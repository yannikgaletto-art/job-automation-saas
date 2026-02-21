"use client"

import { useState, useEffect } from "react"
import { CoverLetterPreview } from "@/components/cover-letter/cover-letter-preview"
import { CoverLetterActions } from "@/components/cover-letter/cover-letter-actions"
import { QualityFeedback } from "@/components/cover-letter/quality-feedback"
import { Mail, Sparkles } from "lucide-react"
import { Button } from "@/components/motion/button"
import { QualityScores } from "@/components/cover-letter/types"

interface Step4CoverLetterProps {
    jobId: string
    companyName: string
    jobTitle: string
    onComplete?: () => void
    initialData?: GenerationResult | null
}

interface GenerationResult {
    coverLetter: string
    qualityScores: QualityScores
    iterations: number
    validation?: any
}

// 🎭 DEMO MODE: Mock data for UI testing when backend is not ready
const DEMO_MODE = true; // Set to false when real backend is ready

const MOCK_COVER_LETTER = `Sehr geehrte Damen und Herren,

mit großem Interesse habe ich Ihre Stellenausschreibung für die offene Position gelesen. Als erfahrener Profi mit fundiertem Wissen in diesem Bereich möchte ich mich hiermit auf diese spannende Rolle bewerben.

In meiner bisherigen Laufbahn habe ich umfangreiche Erfahrungen gesammelt. Besonders reizvoll finde ich an Ihrem Unternehmen die Möglichkeit, an innovativen Lösungen zu arbeiten und dabei höchste Standards zu gewährleisten.

Meine technischen Fähigkeiten umfassen tiefgreifende Kenntnisse in verschiedenen Technologien und Erfahrung mit relevanten Tools. Zudem bringe ich ein starkes Verständnis für moderne Architekturen mit.

Was mich besonders begeistert, ist Ihr Engagement für Qualität und die kontinuierliche Entwicklung. Ihre kürzlich veröffentlichten Erfolge zeigen, wie Sie die Zukunft aktiv mitgestalten.

Ich bin überzeugt, dass meine Erfahrung und meine Leidenschaft für technische Exzellenz einen wertvollen Beitrag zu Ihrem Team leisten können. Gerne würde ich in einem persönlichen Gespräch mehr über die Position erfahren und meine Qualifikationen näher erläutern.

Mit freundlichen Grüßen,
Max Mustermann`;

const MOCK_RESULT: GenerationResult = {
    coverLetter: MOCK_COVER_LETTER,
    qualityScores: {
        naturalness_score: 9,
        style_match_score: 8,
        company_relevance_score: 9,
        individuality_score: 8,
        overall_score: 8.5,
        issues: [],
        suggestions: ["Consider adding a specific example of a past project", "Mention your GitHub profile if available"]
    },
    iterations: 2,
    validation: {
        isValid: true,
        stats: { wordCount: 234, companyMentions: 4, paragraphCount: 6 },
        errors: [],
        warnings: []
    }
};

export function Step4CoverLetter({
    jobId,
    companyName,
    jobTitle,
    onComplete,
    initialData
}: Step4CoverLetterProps) {
    const [result, setResult] = useState<GenerationResult | null>(initialData || null)
    const [isLoading, setIsLoading] = useState(false)
    const [isRegenerating, setIsRegenerating] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [started, setStarted] = useState(false)

    // Initial generation (auto-trigger only if no data)
    useEffect(() => {
        if (started && !result && !isLoading) {
            generateCoverLetter()
        }
    }, [jobId, started])

    const generateCoverLetter = async () => {
        try {
            // Only set major loading on first load
            if (!result) setIsLoading(true)

            setError(null)

            // 🎭 DEMO MODE: Use mock data instead of API call
            if (DEMO_MODE) {
                // Simulate API delay
                await new Promise(resolve => setTimeout(resolve, 1500));
                setResult(MOCK_RESULT);
                console.log('✅ Cover letter generated (DEMO MODE)');
                if (onComplete) onComplete();
                setIsLoading(false);
                setIsRegenerating(false);
                return;
            }

            // Real API call (when DEMO_MODE = false)
            const userId = "test-user-id"

            const response = await fetch('/api/jobs/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobId,
                    userId,
                    company: companyName,
                    jobTitle
                })
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                throw new Error(errorData.error || 'Failed to generate cover letter')
            }

            const data = await response.json()

            const scores = data.quality_scores || {};

            const qualityScores: QualityScores = {
                naturalness_score: scores.naturalness || scores.naturalness_score || 8,
                style_match_score: scores.style_match || scores.style_match_score || 8,
                company_relevance_score: scores.company_relevance || scores.company_relevance_score || 8,
                individuality_score: scores.individuality || scores.individuality_score || 8,
                overall_score: scores.overall_score || data.cover_letter_quality_score || 8,
                issues: scores.issues || [],
                suggestions: scores.suggestions || []
            };

            const mappedResult: GenerationResult = {
                coverLetter: data.coverLetter,
                qualityScores,
                iterations: data.iterations || 1,
                validation: data.validation || { isValid: true, stats: {}, errors: [], warnings: [] }
            }

            setResult(mappedResult)

            console.log('✅ Cover letter generated/fetched')

            if (onComplete) {
                onComplete()
            }

        } catch (err) {
            console.error('❌ Cover letter generation failed:', err)
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setIsLoading(false)
            setIsRegenerating(false)
        }
    }

    const handleRegenerate = async () => {
        setIsRegenerating(true)
        await generateCoverLetter()
    }

    if (!started && !result) {
        return (
            <div className="px-6 py-12 flex flex-col items-center gap-4 text-center">
                <Mail className="w-10 h-10 text-[#002e7a]" />
                <h3 className="text-lg font-semibold text-[#37352F]">Cover Letter generieren</h3>
                <p className="text-sm text-[#73726E] max-w-sm">
                    KI analysiert die Stelle und deinen Schreibstil, um ein
                    individuelles Anschreiben in deiner Stimme zu erstellen.
                </p>
                <Button variant="primary" onClick={() => setStarted(true)}>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Jetzt generieren
                </Button>
            </div>
        )
    }

    // Loading state (Skeleton)
    if (isLoading && !result) {
        return (
            <div className="space-y-6 p-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 bg-[#E7E7E5] rounded w-1/3 mb-4"></div>
                    <div className="space-y-3">
                        <div className="h-4 bg-[#E7E7E5] rounded w-full"></div>
                        <div className="h-4 bg-[#E7E7E5] rounded w-full"></div>
                        <div className="h-4 bg-[#E7E7E5] rounded w-5/6"></div>
                        <div className="h-4 bg-[#E7E7E5] rounded w-full"></div>
                        <div className="h-4 bg-[#E7E7E5] rounded w-4/5"></div>
                    </div>
                </div>
                <p className="text-sm text-[#73726E] text-center flex items-center justify-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></span>
                    ✨ Generating your personalized cover letter...
                </p>
            </div>
        )
    }

    // Error state
    if (error) {
        return (
            <div className="p-6 bg-red-50 rounded-lg border border-red-200 m-6">
                <h3 className="text-sm font-semibold text-red-800 mb-2">Generation Failed</h3>
                <p className="text-xs text-red-600 mb-4">{error}</p>
                <button
                    onClick={generateCoverLetter}
                    className="text-xs bg-white border border-red-200 text-red-600 px-3 py-1.5 rounded-md hover:bg-red-50 transition-colors"
                >
                    Try again
                </button>
            </div>
        )
    }

    // Success state
    if (result) {
        return (
            <div className="space-y-6 p-6 bg-[#FAFAF9]">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column: Preview (2/3 width) */}
                    <div className="lg:col-span-2 space-y-4">
                        <CoverLetterPreview coverLetter={result.coverLetter} />

                        <div className="pt-2">
                            <CoverLetterActions
                                coverLetter={result.coverLetter}
                                onRegenerate={handleRegenerate}
                                isRegenerating={isRegenerating}
                            />
                        </div>
                    </div>

                    {/* Right Column: Feedback (1/3 width) */}
                    <div className="space-y-4">
                        <QualityFeedback
                            scores={result.qualityScores}
                            iterations={result.iterations}
                            validation={result.validation || {
                                isValid: true,
                                stats: { wordCount: result.coverLetter.split(' ').length, companyMentions: 3, paragraphCount: 4 },
                                errors: [],
                                warnings: []
                            }}
                            showDetails={true}
                        />
                    </div>
                </div>
            </div>
        )
    }

    return null
}