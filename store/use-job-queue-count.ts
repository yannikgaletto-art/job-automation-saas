import { create } from 'zustand';

interface JobQueueCountStore {
    count: number;
    setCount: (n: number) => void;
    increment: () => void;
}

export const useJobQueueCount = create<JobQueueCountStore>((set) => ({
    count: 0,
    setCount: (n) => set({ count: n }),
    increment: () => set((state) => ({ count: state.count + 1 })),
}));
