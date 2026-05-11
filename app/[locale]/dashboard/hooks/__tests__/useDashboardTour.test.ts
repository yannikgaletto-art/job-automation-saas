import {
    DASHBOARD_TOUR_IDS,
    TOUR_REPLAY_SESSION_KEY,
    TOUR_RESET_EVENT,
    getTourCompletedStorageKey,
    hasRequiredTourStartGate,
    resetDashboardTourCompletion,
} from '../useDashboardTour';

function createMemoryStorage(): Storage {
    const store = new Map<string, string>();

    return {
        get length() {
            return store.size;
        },
        clear: () => store.clear(),
        getItem: (key: string) => store.get(key) ?? null,
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        removeItem: (key: string) => {
            store.delete(key);
        },
        setItem: (key: string, value: string) => {
            store.set(key, value);
        },
    };
}

describe('useDashboardTour replay storage helpers', () => {
    let localStorage: Storage;
    let sessionStorage: Storage;
    let dispatchEvent: jest.Mock;

    beforeEach(() => {
        localStorage = createMemoryStorage();
        sessionStorage = createMemoryStorage();
        dispatchEvent = jest.fn();

        (globalThis as any).window = {
            localStorage,
            sessionStorage,
            dispatchEvent,
        };
        (globalThis as any).CustomEvent = class TestCustomEvent {
            type: string;
            detail: unknown;

            constructor(type: string, init?: { detail?: unknown }) {
                this.type = type;
                this.detail = init?.detail;
            }
        };
    });

    afterEach(() => {
        delete (globalThis as any).window;
        delete (globalThis as any).CustomEvent;
    });

    it('allows onboarding-gated tours after a settings replay reset', () => {
        expect(hasRequiredTourStartGate(true)).toBe(false);

        resetDashboardTourCompletion();

        expect(sessionStorage.getItem(TOUR_REPLAY_SESSION_KEY)).toBe('1');
        expect(hasRequiredTourStartGate(true)).toBe(true);
    });

    it('clears all known tour completion keys and emits a same-tab reset event', () => {
        DASHBOARD_TOUR_IDS.forEach((tourId) => {
            localStorage.setItem(getTourCompletedStorageKey(tourId), '1');
        });

        resetDashboardTourCompletion();

        DASHBOARD_TOUR_IDS.forEach((tourId) => {
            expect(localStorage.getItem(getTourCompletedStorageKey(tourId))).toBeNull();
        });
        expect(dispatchEvent).toHaveBeenCalledTimes(1);
        expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
            type: TOUR_RESET_EVENT,
            detail: { tourIds: [...DASHBOARD_TOUR_IDS] },
        });
    });
});
