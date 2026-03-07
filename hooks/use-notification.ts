import { useNotificationStore } from '@/store/notification-store';

/**
 * Hook to push notifications to the Dynamic Island.
 * Usage: const notify = useNotification();
 *        notify('Steckbrief erstellt');
 */
export function useNotification() {
    const push = useNotificationStore((s) => s.push);
    return push;
}
