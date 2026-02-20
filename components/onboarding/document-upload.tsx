"use client"

import { useState, useCallback } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { Upload, FileText, X, CheckCircle2, AlertCircle } from "lucide-react"
import { useDropzone } from "react-dropzone"

interface FileWithPreview extends File {
    preview?: string
}

interface DocumentUploadProps {
    onComplete: (files: { cv: File; coverLetters: File[] }) => Promise<void>
    onBack?: () => void
}

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ACCEPTED_FILE_TYPES = {
    'application/pdf': ['.pdf'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'application/msword': ['.doc']
}

export function DocumentUpload({ onComplete, onBack }: DocumentUploadProps) {
    const [cvFile, setCvFile] = useState<FileWithPreview | null>(null)
    const [coverLetterFiles, setCoverLetterFiles] = useState<FileWithPreview[]>([])
    const [isUploading, setIsUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)
    const [error, setError] = useState<string | null>(null)

    const validateFile = (file: File): string | null => {
        if (file.size > MAX_FILE_SIZE) {
            return `${file.name} ist zu groß. Maximum: 5MB`
        }

        const fileType = file.type
        if (!Object.keys(ACCEPTED_FILE_TYPES).includes(fileType)) {
            return `${file.name} hat ein ungültiges Format. Erlaubt: PDF, DOCX, DOC`
        }

        return null
    }

    const onCvDrop = useCallback((acceptedFiles: File[]) => {
        const file = acceptedFiles[0]
        if (!file) return

        const validationError = validateFile(file)
        if (validationError) {
            setError(validationError)
            return
        }

        setError(null)
        setCvFile(file)
    }, [])

    const onCoverLetterDrop = useCallback((acceptedFiles: File[]) => {
        setError(null)

        const validFiles: File[] = []
        for (const file of acceptedFiles) {
            const validationError = validateFile(file)
            if (validationError) {
                setError(validationError)
                return
            }
            validFiles.push(file)
        }

        const newFiles = [...coverLetterFiles, ...validFiles].slice(0, 3)
        setCoverLetterFiles(newFiles)
    }, [coverLetterFiles])

    const cvDropzone = useDropzone({
        onDrop: onCvDrop,
        accept: ACCEPTED_FILE_TYPES,
        maxFiles: 1,
        multiple: false
    })

    const coverLetterDropzone = useDropzone({
        onDrop: onCoverLetterDrop,
        accept: ACCEPTED_FILE_TYPES,
        maxFiles: 3,
        multiple: true
    })

    const removeCv = () => {
        setCvFile(null)
        setError(null)
    }

    const removeCoverLetter = (index: number) => {
        setCoverLetterFiles(prev => prev.filter((_, i) => i !== index))
        setError(null)
    }

    const canSubmit = cvFile && coverLetterFiles.length >= 1

    const handleSubmit = async () => {
        if (!canSubmit) return

        setIsUploading(true)
        setUploadProgress(0)
        setError(null)

        try {
            // Simulate upload progress
            const progressInterval = setInterval(() => {
                setUploadProgress(prev => Math.min(prev + 10, 90))
            }, 200)

            await onComplete({
                cv: cvFile,
                coverLetters: coverLetterFiles
            })

            clearInterval(progressInterval)
            setUploadProgress(100)

        } catch (err) {
            setError(err instanceof Error ? err.message : "Upload fehlgeschlagen")
            setUploadProgress(0)
        } finally {
            setIsUploading(false)
        }
    }

    return (
        <div className="flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="w-full max-w-4xl"
            >
                <Card className="bg-white border-[#E7E7E5] shadow-sm rounded-xl overflow-hidden">
                    <CardHeader className="text-center pt-8 pb-4">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.1 }}
                            className="w-12 h-12 bg-[#F0F7FF] rounded-full flex items-center justify-center mx-auto mb-4 text-[#0066FF]"
                        >
                            <Upload className="w-6 h-6" />
                        </motion.div>

                        <CardTitle className="text-2xl font-semibold text-[#37352F]">
                            Dokumente hochladen
                        </CardTitle>

                        <CardDescription className="text-[#73726E] text-base mt-2">
                            Laden Sie Ihren Lebenslauf und Anschreiben hoch
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-6 px-8">
                        {error && (
                            <Alert variant="destructive" className="bg-red-50 text-red-900 border-red-200">
                                <AlertCircle className="h-4 w-4 text-red-600" />
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        {isUploading && (
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm text-[#73726E]">
                                    <span>Uploading...</span>
                                    <span className="font-mono">{uploadProgress}%</span>
                                </div>
                                <Progress value={uploadProgress} className="h-2 bg-[#F7F7F5]" />
                            </div>
                        )}

                        {/* CV Upload */}
                        <div>
                            <label className="block text-sm font-semibold text-[#37352F] mb-2">
                                Lebenslauf (CV) <span className="text-red-500">*</span>
                            </label>

                            {!cvFile ? (
                                <div
                                    {...cvDropzone.getRootProps()}
                                    className={`
                    border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200
                    ${cvDropzone.isDragActive
                                            ? 'border-[#0066FF] bg-[#F0F7FF]'
                                            : 'border-[#E7E7E5] bg-[#FAFAF9] hover:bg-[#F5F5F4] hover:border-[#D6D6D3]'}
                  `}
                                >
                                    <input {...cvDropzone.getInputProps()} />
                                    <FileText className={`w-10 h-10 mx-auto mb-3 ${cvDropzone.isDragActive ? 'text-[#0066FF]' : 'text-[#A8A29E]'}`} />
                                    <p className="text-[#37352F] font-medium">
                                        {cvDropzone.isDragActive
                                            ? 'Datei hier ablegen...'
                                            : 'Klicken oder Datei ziehen'}
                                    </p>
                                    <p className="text-xs text-[#73726E] mt-1.5">
                                        PDF, DOC, DOCX (max. 5MB)
                                    </p>
                                </div>
                            ) : (
                                <motion.div
                                    initial={{ scale: 0.95, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="flex items-center justify-between p-3 bg-[#F0F7FF] border border-[#0066FF]/20 rounded-lg"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-white rounded-md border border-[#0066FF]/10 text-[#0066FF]">
                                            <FileText className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-[#37352F] font-medium text-sm">{cvFile.name}</p>
                                            <p className="text-xs text-[#73726E]">
                                                {(cvFile.size / 1024 / 1024).toFixed(2)} MB
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={removeCv}
                                        disabled={isUploading}
                                        className="text-[#73726E] hover:text-red-600 hover:bg-red-50"
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </motion.div>
                            )}
                        </div>

                        {/* Cover Letters Upload */}
                        <div>
                            <label className="block text-sm font-semibold text-[#37352F] mb-2">
                                Anschreiben (1-3 Stück) <span className="text-red-500">*</span>
                            </label>

                            <div
                                {...coverLetterDropzone.getRootProps()}
                                className={`
                                    border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200
                                    ${coverLetterDropzone.isDragActive
                                        ? 'border-[#0066FF] bg-[#F0F7FF]'
                                        : 'border-[#E7E7E5] bg-[#FAFAF9] hover:bg-[#F5F5F4] hover:border-[#D6D6D3]'}
                                    ${coverLetterFiles.length >= 3 ? 'opacity-50 cursor-not-allowed bg-[#F5F5F4]' : ''}
                                `}
                            >
                                <input {...coverLetterDropzone.getInputProps()} disabled={coverLetterFiles.length >= 3} />
                                <Upload className={`w-10 h-10 mx-auto mb-3 ${coverLetterDropzone.isDragActive ? 'text-[#0066FF]' : 'text-[#A8A29E]'}`} />
                                <p className="text-[#37352F] font-medium">
                                    {coverLetterFiles.length >= 3
                                        ? 'Maximum erreicht'
                                        : coverLetterDropzone.isDragActive
                                            ? 'Dateien hier ablegen...'
                                            : 'Klicken oder Dateien ziehen'}
                                </p>
                                <p className="text-xs text-[#73726E] mt-1.5">
                                    {coverLetterFiles.length}/3 hochgeladen
                                </p>
                            </div>

                            {coverLetterFiles.length > 0 && (
                                <div className="mt-4 space-y-2">
                                    {coverLetterFiles.map((file, index) => (
                                        <motion.div
                                            key={`${file.name}-${index}`}
                                            initial={{ opacity: 0, y: 5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="flex items-center justify-between p-3 bg-white border border-[#E7E7E5] rounded-lg"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-[#FAFAF9] rounded-md border border-[#E7E7E5] text-[#73726E]">
                                                    <FileText className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <p className="text-sm text-[#37352F] font-medium">{file.name}</p>
                                                    <p className="text-xs text-[#73726E]">
                                                        {(file.size / 1024 / 1024).toFixed(2)} MB
                                                    </p>
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => removeCoverLetter(index)}
                                                disabled={isUploading}
                                                className="text-[#73726E] hover:text-red-600 hover:bg-red-50"
                                            >
                                                <X className="w-4 h-4" />
                                            </Button>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="bg-[#F7F7F5] border border-[#E7E7E5] rounded-lg p-4 flex gap-3 text-sm text-[#73726E]">
                            <div className="shrink-0 pt-0.5">💡</div>
                            <p>
                                <strong>Tipp:</strong> Die Anschreiben helfen uns, Ihren persönlichen Schreibstil zu lernen.
                            </p>
                        </div>
                    </CardContent>

                    <CardFooter className="flex gap-3 px-8 pb-8 pt-2">
                        {onBack && (
                            <Button
                                variant="ghost"
                                onClick={onBack}
                                disabled={isUploading}
                                className="text-[#73726E] hover:text-[#37352F] hover:bg-[#F7F7F5]"
                            >
                                Zurück
                            </Button>
                        )}

                        <Button
                            onClick={handleSubmit}
                            disabled={!canSubmit || isUploading}
                            className={`
                                flex-1 text-white shadow-sm transition-all
                                ${!canSubmit || isUploading
                                    ? 'bg-[#E7E7E5] text-[#A8A29E]'
                                    : 'bg-[#0066FF] hover:bg-[#0052CC] hover:shadow-md'}
                            `}
                        >
                            {isUploading ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Wird hochgeladen...
                                </>
                            ) : (
                                <>Weiter zur Profilbestätigung</>
                            )}
                        </Button>
                    </CardFooter>
                </Card>
            </motion.div>
        </div>
    )
}
