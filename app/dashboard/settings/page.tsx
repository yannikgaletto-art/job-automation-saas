"use client"

import { DocumentUpload } from "@/components/onboarding/document-upload"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2, FileText, Settings as SettingsIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

export default function SettingsPage() {
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [uploadSuccess, setUploadSuccess] = useState(false)

    const handleUploadComplete = async (files: { cv: File; coverLetters: File[] }) => {
        setIsSubmitting(true)
        try {
            const formData = new FormData()
            // TODO: Get actual user ID from auth context
            formData.append('user_id', 'temp-user-id')
            formData.append('cv', files.cv)
            files.coverLetters.forEach((file, index) => {
                formData.append(`coverLetter_${index}`, file)
            })

            const response = await fetch('/api/documents/upload', {
                method: 'POST',
                body: formData
            })

            if (!response.ok) {
                throw new Error('Failed to upload documents')
            }

            setUploadSuccess(true)
            toast.success("Documents uploaded successfully!", {
                description: "Your CV and cover letters have been processed."
            })
        } catch (error) {
            console.error('Upload error:', error)
            toast.error("Upload failed", {
                description: error instanceof Error ? error.message : "Please try again later",
                action: {
                    label: "Retry",
                    onClick: () => handleUploadComplete(files)
                }
            })
            throw error
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="p-8 max-w-5xl mx-auto">
            {/* Page Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <SettingsIcon className="h-8 w-8 text-[#0066FF]" />
                    <h1 className="text-3xl font-bold text-[#37352F]">Settings</h1>
                </div>
                <p className="text-[#73726E]">
                    Manage your documents and personal information
                </p>
            </div>

            {/* Success Message */}
            {uploadSuccess && (
                <Alert className="mb-6 bg-green-50 text-green-900 border-green-200">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription>
                        Your documents have been successfully uploaded and processed!
                    </AlertDescription>
                </Alert>
            )}

            {/* Document Upload Section */}
            <Card className="bg-white border-[#E7E7E5] shadow-sm mb-8">
                <CardHeader>
                    <CardTitle className="text-xl text-[#37352F] flex items-center gap-2">
                        <FileText className="h-5 w-5 text-[#0066FF]" />
                        Document Management
                    </CardTitle>
                    <CardDescription className="text-[#73726E]">
                        Upload or update your CV and cover letter samples. These documents help us personalize your job applications.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <DocumentUpload
                        onComplete={handleUploadComplete}
                    />
                </CardContent>
            </Card>

            {/* Additional Settings Placeholder */}
            <Card className="bg-white border-[#E7E7E5] shadow-sm">
                <CardHeader>
                    <CardTitle className="text-xl text-[#37352F]">Additional Settings</CardTitle>
                    <CardDescription className="text-[#73726E]">
                        More configuration options coming soon...
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="bg-[#F7F7F5] border border-[#E7E7E5] rounded-lg p-8 text-center">
                        <p className="text-[#73726E]">
                            🚀 Stay tuned for profile preferences, notification settings, and more!
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
