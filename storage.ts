/** Persistence is optional: blocked storage must not interrupt the page. */
export function readStorage(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function writeStorage(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch { }
}
