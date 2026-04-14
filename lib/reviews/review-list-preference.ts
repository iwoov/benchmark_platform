const REVIEW_LIST_PREFERENCE_KEY_PREFIX = "review-list-preference:";
const reviewListPreferenceListeners = new Set<() => void>();

function getReviewListPreferenceKey(listPath: string) {
    return `${REVIEW_LIST_PREFERENCE_KEY_PREFIX}${listPath}`;
}

function isValidReviewListHref(listPath: string, value: string) {
    return value === listPath || value.startsWith(`${listPath}?`);
}

function emitReviewListPreferenceChange() {
    for (const listener of reviewListPreferenceListeners) {
        listener();
    }
}

export function subscribeReviewListPreference(listener: () => void) {
    reviewListPreferenceListeners.add(listener);
    window.addEventListener("storage", listener);

    return () => {
        reviewListPreferenceListeners.delete(listener);
        window.removeEventListener("storage", listener);
    };
}

export function readStoredReviewListHref(listPath: string) {
    if (typeof window === "undefined") {
        return null;
    }

    const value = window.localStorage.getItem(getReviewListPreferenceKey(listPath));

    if (!value || !isValidReviewListHref(listPath, value)) {
        return null;
    }

    return value;
}

export function writeStoredReviewListHref(listPath: string, href: string) {
    if (typeof window === "undefined" || !isValidReviewListHref(listPath, href)) {
        return;
    }

    window.localStorage.setItem(getReviewListPreferenceKey(listPath), href);
    emitReviewListPreferenceChange();
}
