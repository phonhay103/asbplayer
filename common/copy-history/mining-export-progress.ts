// Tracks the newest mining-history timestamp included in a previous
// "only unexported" export. Stored in localStorage (never in IndexedDB)
// so exporting stays fully independent from the history database itself.
const storageKey = 'asbplayer.miningExport.lastExportedAt';

const storage = (): Storage | undefined => {
    try {
        return typeof localStorage === 'undefined' ? undefined : localStorage;
    } catch {
        return undefined;
    }
};

export const getLastExportedAt = (): number | undefined => {
    try {
        const raw = storage()?.getItem(storageKey);
        if (raw === null || raw === undefined) {
            return undefined;
        }
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
};

export const setLastExportedAt = (timestamp: number): void => {
    try {
        storage()?.setItem(storageKey, String(timestamp));
    } catch {
        // Storage unavailable (e.g. private mode) — incremental export just won't persist.
    }
};
