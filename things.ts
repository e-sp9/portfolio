// ─────────────────────────────────────────────────────────────────────────────
// Things manifest — stuff I like, shown at /things.
// To add a thing: drop the photo into public/things/ and add one entry here.
// Entries render in order; the newest can go first or last, your call.
// ─────────────────────────────────────────────────────────────────────────────

export interface Thing {
    /** Display name */
    name: string;
    /** Category tag, shown uppercase (e.g. GAMING, DESK, AUDIO) */
    category: string;
    /** One-liner in my own words */
    note: string;
    /** Where to learn more / buy */
    link: string;
    /** URL path to the photo (served from public/) */
    image: string;
    /** Alt text for the photo (defaults to the name) */
    alt?: string;
}

export const THINGS: Thing[] = [
    {
        name: 'WALLHACK M-001',
        category: 'GAMING',
        note: '性能がいいだけじゃなく質感もいいマウスでお気に入り',
        link: 'https://wallhack.com/ja-jp/pages/campaigns/m-001',
        image: '/things/wallhack-m-001.jpg',
        alt: 'WALLHACK M-001 wireless gaming mouse, top view',
    },
];
