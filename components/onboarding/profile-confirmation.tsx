"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { motion } from "framer-motion"
import { Loader2, CheckCircle2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { saveUserProfile, type ProfileData } from "@/app/actions/onboarding"
import { FormSkeleton } from "@/components/skeletons/form-skeleton"

// Schema
const profileSchema = z.object({
    firstName: z.string().min(2, "First name is required"),
    lastName: z.string().min(2, "Last name is required"),
    email: z.string().email("Invalid email address"),
    phone: z.string().min(5, "Phone number is required"),
    address: z.string().optional(),
    skills: z.string().min(2, "At least one skill is required"),
    experienceYears: z.coerce.number().min(0, "Experience years must be 0 or more"),
})

type ProfileFormValues = z.infer<typeof profileSchema>

interface ProfileConfirmationProps {
    userId: string | null
    onComplete: () => void
}

export function ProfileConfirmation({ userId, onComplete }: ProfileConfirmationProps) {
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const form = useForm<ProfileFormValues>({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            firstName: "",
            lastName: "",
            email: "",
            phone: "",
            address: "",
            skills: "",
            experienceYears: 0,
        },
    })

    const [isLoading, setIsLoading] = useState(true)

    // Mock Data Retrieval
    useEffect(() => {
        // Simulate network delay
        const timer = setTimeout(() => {
            const mockData = {
                firstName: "Alex",
                lastName: "Moran",
                email: "alex.moran@example.com",
                phone: "+1 (555) 123-4567",
                address: "San Francisco, CA",
                skills: "React, Next.js, TypeScript, Node.js",
                experienceYears: 5,
            }
            form.reset(mockData)
            setIsLoading(false)
        }, 1000)

        return () => clearTimeout(timer)
    }, [form])

    // Submit handler
    const onSubmit = async (data: ProfileFormValues) => {
        if (!userId) {
            setError("User ID is missing. Please restart onboarding.")
            return
        }

        setIsSubmitting(true)
        setError(null)

        try {
            await saveUserProfile(userId, {
                ...data,
                address: data.address || "",
            })
            onComplete()
        } catch (err) {
            console.error(err)
            setError("Failed to save profile. Please try again.")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="w-full max-w-2xl mx-auto p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <Card className="border-none shadow-lg bg-white/50 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle className="text-2xl font-bold flex items-center gap-2">
                            <CheckCircle2 className="w-6 h-6 text-green-500" />
                            Confirm Your Profile
                        </CardTitle>
                        <CardDescription>
                            We&apos;ve extracted this information from your CV. Please verify it&apos;s correct.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <FormSkeleton fields={6} />
                        ) : (
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                {/* ... form fields ... */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="firstName">First Name</Label>
                                        <Input id="firstName" {...form.register("firstName")} />
                                        {form.formState.errors.firstName && (
                                            <p className="text-sm text-red-500">{form.formState.errors.firstName.message}</p>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="lastName">Last Name</Label>
                                        <Input id="lastName" {...form.register("lastName")} />
                                        {form.formState.errors.lastName && (
                                            <p className="text-sm text-red-500">{form.formState.errors.lastName.message}</p>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="email">Email</Label>
                                        <Input id="email" type="email" {...form.register("email")} />
                                        {form.formState.errors.email && (
                                            <p className="text-sm text-red-500">{form.formState.errors.email.message}</p>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="phone">Phone</Label>
                                        <Input id="phone" type="tel" {...form.register("phone")} />
                                        {form.formState.errors.phone && (
                                            <p className="text-sm text-red-500">{form.formState.errors.phone.message}</p>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="address">Address (Optional)</Label>
                                    <Input id="address" {...form.register("address")} />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="skills">Top Skills (Comma separated)</Label>
                                    <Input id="skills" {...form.register("skills")} />
                                    {form.formState.errors.skills && (
                                        <p className="text-sm text-red-500">{form.formState.errors.skills.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="experienceYears">Years of Experience</Label>
                                    <Input id="experienceYears" type="number" min="0" {...form.register("experienceYears")} />
                                    {form.formState.errors.experienceYears && (
                                        <p className="text-sm text-red-500">{form.formState.errors.experienceYears.message}</p>
                                    )}
                                </div>

                                {error && (
                                    <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm">
                                        {error}
                                    </div>
                                )}

                                <Button type="submit" className="w-full" disabled={isSubmitting}>
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        "Save & Continue"
                                    )}
                                </Button>

                            </form>
                        )}
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    )
}
