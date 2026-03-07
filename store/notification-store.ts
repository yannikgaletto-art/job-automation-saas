import { create } from 'zustand';

export interface IslandNotification {
    id: string;
    text: string;
}

interface NotificationStore {
    queue: IslandNotification[];
    current: IslandNotification | null;
    push: (text: string) => void;
    shift: () => void;
    hardReset: () => void;
}

const MAX_QUEUE = 5;

export const useNotificationStore = create<NotificationStore>((set, get) => ({
    queue: [],
    current: null,

    push: (text: string) => {
        const notification: IslandNotification = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            text,
        };

        set((state) => {
            const newQueue = [...state.queue, notification].slice(-MAX_QUEUE);

            // If nothing is currently showing, immediately pull it out as current
            if (!state.current) {
                return { queue: newQueue.slice(1), current: newQueue[0] };
            }

            return { queue: newQueue };
        });
    },

    shift: () => {
        set((state) => {
            if (state.queue.length > 0) {
                const [next, ...rest] = state.queue;
                return { current: next, queue: rest };
            }
            return { current: null };
        });
    },

    hardReset: () => {
        set({ current: null, queue: [] });
    },
}));
