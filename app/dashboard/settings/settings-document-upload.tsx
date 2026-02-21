"use client"

import { DocumentUpload } from "@/components/onboarding/document-upload"

export function SettingsDocumentUpload() {
    const handleUploadComplete = async (files: { cv: File; coverLetters: File[] }) => {
        try {
            const formData = new FormData()
            formData.append('cv', files.cv)
            files.coverLetters.forEach((file, index) => {
                formData.append(`coverLetter_${index}`, file)
            })

            const response = await fetch('/api/documents/upload', {
                method: 'POST',
                body: formData
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                console.error("Upload failed details:", errorData)
                throw new Error(errorData.details || errorData.error || 'Failed to upload documents')
            }
        } catch (error) {
            console.error('Upload error:', error)
            throw error
        }
    }

    return <DocumentUpload onComplete={handleUploadComplete} />
}
