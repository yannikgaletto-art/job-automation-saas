"use client"

import { useState } from "react"
import { Button } from "@/components/motion/button"
import { RefreshCw, Copy, Download, Check } from "lucide-react"

interface CoverLetterActionsProps {
    coverLetter: string
    onRegenerate: () => Promise<void>
    isRegenerating?: boolean
}

export function CoverLetterActions({
    coverLetter,
    onRegenerate,
    isRegenerating = false
}: CoverLetterActionsProps) {
    const [copied, setCopied] = useState(false)

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(coverLetter)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (error) {
            console.error('❌ Copy failed:', error)
            alert('Failed to copy to clipboard')
        }
    }

    const handleDownload = () => {
        const blob = new Blob([coverLetter], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `cover-letter-${Date.now()}.txt`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    return (
        <div className="flex items-center gap-2 flex-wrap">
            {/* Regenerate */}
            <Button
                variant="outline"
                onClick={onRegenerate}
                disabled={isRegenerating}
                className="text-sm"
            >
                <RefreshCw className={`w-4 h-4 ${isRegenerating ? 'animate-spin' : ''}`} />
                <span className="ml-2">
                    {isRegenerating ? 'Regenerating...' : 'Regenerate'}
                </span>
            </Button>

            {/* Copy to Clipboard */}
            <Button
                variant="outline"
                onClick={handleCopy}
                disabled={copied}
                className="text-sm"
            >
                {copied ? (
                    <><Check className="w-4 h-4 text-green-600" /> <span className="ml-2">Copied!</span></>
                ) : (
                    <><Copy className="w-4 h-4" /> <span className="ml-2">Copy</span></>
                )}
            </Button>

            {/* Download as .txt */}
            <Button
                variant="outline"
                onClick={handleDownload}
                className="text-sm"
            >
                <Download className="w-4 h-4" />
                <span className="ml-2">Download</span>
            </Button>
        </div>
    )
}