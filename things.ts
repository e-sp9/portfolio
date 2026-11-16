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
        note: '性能も質感もいいマウス。引き算の哲学が好き。',
        link: 'https://wallhack.com/ja-jp/pages/campaigns/m-001',
        image: '/things/wallhack-m-001.jpg',
        alt: 'WALLHACK M-001 wireless gaming mouse, top view',
    },
    {
        name: '14インチMacBook Pro（M5）',
        category: 'WORK',
        note: 'これ1台あればなんでもできる仕事道具。頼れる相棒。',
        link: 'https://www.apple.com/jp/macbook-pro/',
        image: '/things/macbook-pro-14-m5.jpg',
        alt: 'MacBook Pro laptops, open, front view',
    },
    {
        name: 'Studio Display',
        category: 'WORK',
        note: 'インテリアとしても気に入ってる仕事道具。実は音もいい。',
        link: 'https://www.apple.com/jp/studio-display/',
        image: '/things/studio-display.jpg',
        alt: 'Apple Studio Display, front view',
    },
    {
        name: 'Even Realities G2',
        category: 'WEARABLE',
        note: '散歩しながらAIエージェントと会話できる未来のメガネ。',
        link: 'https://www.evenrealities.com/smart-glasses',
        image: '/things/even-realities-g2.jpg',
        alt: 'Even Realities G2 smart glasses, folded, front view',
    },
    {
        name: 'Isamu Noguchi AKARI',
        category: 'LIGHTING',
        note: '大好きな空間を演出してくれるライト。家に大きさ違いでふたつある。',
        link: 'https://akari-ozeki.com/lineup/#pendant',
        image: '/things/isamu-noguchi-akari.jpg',
        alt: 'Isamu Noguchi AKARI pendant light, a round washi paper shade, lit',
    },
    {
        name: 'ZENAIM KEYBOARD',
        category: 'GAMING',
        note: 'ミニマルでロープロファイルなゲーミングキーボード。光らないのが好き。',
        link: 'https://zenaim.com/products/keyboard-tkl-jis',
        image: '/things/zenaim-keyboard.jpg',
        alt: 'ZENAIM KEYBOARD tenkeyless gaming keyboard, carried under an arm',
    },
    {
        name: 'FiiO K9 Pro ESS',
        category: 'AUDIO',
        note: 'でかいけど、解像感のある音を楽しめる。鳴らしにくいヘッドホンもちゃんと鳴る。',
        link: 'https://www.fiio.com/k9proess',
        image: '/things/fiio-k9-pro-ess.jpg',
        alt: 'FiiO K9 Pro ESS desktop DAC and headphone amplifier, front three-quarter view',
    },
    {
        name: 'Sennheiser IE 900',
        category: 'AUDIO',
        note: '着け心地のよさと、音場の広いリアルな音が気に入りすぎてる。耳が痛くても着ける。',
        link: 'https://jp.sennheiser-hearing.com/ja/products/ie-900',
        image: '/things/sennheiser-ie-900.jpg',
        alt: 'Sennheiser IE 900 in-ear earphone, side view',
    },
    {
        name: 'Option-O LAGOM Casa（シルバー）',
        category: 'COFFEE',
        note: 'グラインダーの質は、コーヒー豆の品質と同じくらい大事だと思っている。自宅用なら十分なスペック。',
        link: 'https://www.option-o.com/shop/p/lagom-casa',
        image: '/things/option-o-lagom-casa.jpg',
        alt: 'Option-O LAGOM Casa coffee grinder in silver, front view',
    },
    {
        name: 'Bambu Lab A1 mini',
        category: 'TOOLS',
        note: 'ちょっとした小物から自作キーボードまで、なんでも作れる。ミニマルさもお気に入り。',
        link: 'https://jp.store.bambulab.com/products/a1-mini',
        image: '/things/bambu-lab-a1-mini.jpg',
        alt: 'Bambu Lab A1 mini 3D printer, front view',
    },
    {
        name: 'RX-802AS（太洋電機産業 goot）',
        category: 'TOOLS',
        note: '絶対にオーバースペックだけど、それがいい。性能はもちろん、所有欲も満たしてくれる最高のハンダゴテ。',
        link: 'https://www.goot.jp/products/detail/rx_802as',
        image: '/things/goot-rx-802as.jpg',
        alt: 'goot RX-802AS soldering station with its iron and iron stand',
    },
    {
        name: 'HIOKI DT4282',
        category: 'TOOLS',
        note: 'なんだかんだ電子工作で一番使うツール。計測がほんの少し速いだけで、減るストレスは計り知れない。',
        link: 'https://www.hioki.com/jp-ja/products/testers/dmm-4/id_5803',
        image: '/things/hioki-dt4282.jpg',
        alt: 'HIOKI DT4282 digital multimeter, front view',
    },
];
