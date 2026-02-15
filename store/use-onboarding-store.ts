
import { create } from 'zustand'

interface OnboardingState {
    // State
    selectedTemplateId: string
    userId: string | null

    // Actions
    setTemplateId: (id: string) => void
    setUserId: (id: string) => void
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
    // Initial State
    selectedTemplateId: 'notion_modern', // Default selection
    userId: null,

    // Actions
    setTemplateId: (id) => set({ selectedTemplateId: id }),
    setUserId: (id) => set({ userId: id }),
}))
