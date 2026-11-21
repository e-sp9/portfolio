export function safeGetItem(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch { }
}
