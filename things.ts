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
        note: '性能だけじゃなく質感もいいマウス。お気に入り',
        link: 'https://wallhack.com/ja-jp/pages/campaigns/m-001',
        image: '/things/wallhack-m-001.jpg',
        alt: 'WALLHACK M-001 wireless gaming mouse, top view',
    },
    {
        name: 'MacBook Pro (14インチ, M5)',
        category: 'WORK',
        note: '仕事道具',
        link: 'https://www.apple.com/jp/macbook-pro/',
        image: '/things/macbook-pro-14-m5.jpg',
        alt: 'MacBook Pro laptops, open, front view',
    },
    {
        name: 'Studio Display',
        category: 'WORK',
        note: '仕事道具',
        link: 'https://www.apple.com/jp/studio-display/',
        image: '/things/studio-display.jpg',
        alt: 'Apple Studio Display, front view',
    },
    {
        name: 'Even Realities G2',
        category: 'WEARABLE',
        note: '散歩のときも、AIエージェントと会話しながら',
        link: 'https://www.evenrealities.com/smart-glasses',
        image: '/things/even-realities-g2.jpg',
        alt: 'Even Realities G2 smart glasses, folded, front view',
    },
    {
        name: 'Isamu Noguchi AKARI',
        category: 'LIGHTING',
        note: '大好きな空間',
        link: 'https://akari-ozeki.com/lineup/#pendant',
        image: '/things/isamu-noguchi-akari.jpg',
        alt: 'Isamu Noguchi AKARI pendant light, a round washi paper shade, lit',
    },
    {
        name: 'ZENAIM KEYBOARD',
        category: 'GAMING',
        note: 'ミニマルでロープロファイルなゲーミングキーボード。気に入ってる',
        link: 'https://zenaim.com/products/keyboard-tkl-jis',
        image: '/things/zenaim-keyboard.jpg',
        alt: 'ZENAIM KEYBOARD tenkeyless gaming keyboard, carried under an arm',
    },
    {
        name: 'FiiO K9 Pro ESS',
        category: 'AUDIO',
        note: '解像度高めの音楽が聴けてお気に入り',
        link: 'https://www.fiio.com/k9proess',
        image: '/things/fiio-k9-pro-ess.jpg',
        alt: 'FiiO K9 Pro ESS desktop DAC and headphone amplifier, front three-quarter view',
    },
    {
        name: 'Sennheiser IE 900',
        category: 'AUDIO',
        note: 'イヤホンなのに、着けているのを忘れて音楽に没頭できちゃう',
        link: 'https://jp.sennheiser-hearing.com/ja/products/ie-900',
        image: '/things/sennheiser-ie-900.jpg',
        alt: 'Sennheiser IE 900 in-ear earphone, side view',
    },
];
