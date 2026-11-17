// ─────────────────────────────────────────────────────────────────────────────
// Article body — turns the rich-editor HTML from microCMS into what the
// article page styles: highlighted code blocks, right-sized images, tidy links.
// Runs at build time; no script is shipped for any of it.
// ─────────────────────────────────────────────────────────────────────────────

import { type BundledLanguage, bundledLanguages, createCssVariablesTheme, createHighlighter, type Highlighter } from 'shiki';
import { esc, unesc } from './html';

/** Width of the text column in CSS px. Keep in sync with --measure in blog.css. */
const MEASURE = 720;

const IMAGE_HOST = 'images.microcms-assets.io';

/** The blog these articles were first published on; links to it are brought along */
const OLD_BLOG_HOSTS = ['www.kissa-katada.com', 'kissa-katada.com'];

// Token colours come from the --code-* custom properties in blog.css, so code
// follows the light/dark theme without a second set of markup.
const CODE_THEME = createCssVariablesTheme({ name: 'site', variablePrefix: '--code-' });

let shiki: Promise<Highlighter> | undefined;

/** The shared highlighter, with the grammars this article asks for loaded. */
async function highlighterFor(html: string): Promise<Highlighter> {
    shiki ??= createHighlighter({ themes: [CODE_THEME], langs: [] });
    const highlighter = await shiki;
    const hints = [...html.matchAll(/language-([\w+#.-]+)|data-filename="[^"]*\.(\w+)"/g)]
        .map((match) => (match[1] ?? match[2] ?? '').toLowerCase())
        .filter((hint): hint is BundledLanguage => Object.hasOwn(bundledLanguages, hint));
    await highlighter.loadLanguage(...hints);
    return highlighter;
}

function codeBlock(highlighter: Highlighter, source: string, language: string | null, filename: string | null): string {
    // The file extension stands in when no language is given. It also overrides one for
    // .tsx/.jsx files: marked as TypeScript or JavaScript, they still need the JSX grammar.
    const extension = /\.(\w+)$/.exec(filename ?? '')?.[1];
    const hint = (/^[jt]sx$/i.test(extension ?? '') ? extension : language ?? extension)?.toLowerCase() ?? '';
    // Languages Shiki doesn't know stay plain
    const lang = highlighter.getLoadedLanguages().includes(hint) ? hint : 'text';
    const code = source.replace(/\r\n/g, '\n').replace(/^\n/, '').replace(/\n+$/, '');
    const labels =
        (filename ? `<span class="code-file">${esc(filename)}</span>` : '') +
        (language ? `<span class="code-lang">${esc(language)}</span>` : '');
    return (
        '<div class="code-block">' +
        (labels && `<div class="code-head">${labels}</div>`) +
        highlighter.codeToHtml(code, { lang, theme: 'site' }) +
        '</div>'
    );
}

/** Where an image is shown: the widths to ask the image API for, and how wide it is on the page (`sizes`) */
export interface Frame {
    widths: readonly number[];
    sizes: string;
}

/** The text column. Below 860px it is the page less the margins of the screen and the sheet, which narrow at 768px (blog.css). */
const COLUMN: Frame = {
    widths: [MEASURE, MEASURE * 1.5, MEASURE * 2],
    sizes: `(min-width: 860px) ${MEASURE}px, (min-width: 769px) calc(100vw - 140px), calc(100vw - 72px)`,
};

/**
 * microCMS serves images through imgix, which makes AVIF and WebP of them at any width.
 * For an image `width` px wide shown in `frame`: the `<source>` that offers AVIF, the smaller of the
 * two, and the `src`, `srcset` and `sizes` of the `<img>` after it, which asks for WebP.
 * Escaped. Null for an image to leave as it is.
 */
export function resized(src: string, width: number, frame: Frame): { source: string; img: [string, string][] } | null {
    if (!URL.canParse(src) || !width) return null;
    const url = new URL(src);
    // GIFs would lose their animation, SVGs their vectors
    if (url.hostname !== IMAGE_HOST || /\.(gif|svg)$/i.test(url.pathname)) return null;

    const sized = (format: 'avif' | 'webp', w: number) => {
        url.searchParams.set('fm', format);
        url.searchParams.set('w', String(w));
        return esc(url.href);
    };
    // Never upscale: imgix would. Past the image's own width, the last candidate is the image at that width.
    const widths = frame.widths.filter((w) => w < width);
    if (widths.length < frame.widths.length) widths.push(width);
    if (widths.length === 1) {
        return { source: `<source type="image/avif" srcset="${sized('avif', widths[0]!)}">`, img: [['src', sized('webp', widths[0]!)]] };
    }
    const srcset = (format: 'avif' | 'webp') => widths.map((w) => `${sized(format, w)} ${w}w`).join(', ');
    return {
        source: `<source type="image/avif" srcset="${srcset('avif')}" sizes="${frame.sizes}">`,
        img: [['src', sized('webp', widths.at(-1)!)], ['srcset', srcset('webp')], ['sizes', frame.sizes]],
    };
}

/** The widest picture offered with a shared link: the size of og:image that services ask for */
const SHARED_WIDTH = 1200;

/**
 * An image from microCMS as the picture of a shared link (og:image): JPEG, which every service
 * that shows one can read, and never wider than 1200px. With its size in px; 0 when not known.
 */
export function shared(src: string, width: number, height: number): { url: string; width: number; height: number } {
    if (!URL.canParse(src) || new URL(src).hostname !== IMAGE_HOST) return { url: src, width, height };
    const url = new URL(src);
    url.searchParams.set('fm', 'jpg');
    if (width <= SHARED_WIDTH) return { url: url.href, width, height };
    url.searchParams.set('w', String(SHARED_WIDTH));
    return { url: url.href, width: SHARED_WIDTH, height: Math.round((height * SHARED_WIDTH) / width) };
}

/** Body images: AVIF or WebP at the widths the column shows. */
function sizeImage(image: HTMLRewriterTypes.Element): void {
    const sources = resized(unesc(image.getAttribute('src') ?? ''), Number(image.getAttribute('width')), COLUMN);
    if (!sources) return;
    for (const [name, value] of sources.img) image.setAttribute(name, value);
    image.before(`<picture>${sources.source}`, { html: true });
    image.after('</picture>', { html: true });
}

/**
 * Rewrites the body of one article for display.
 * `titles` maps the ID of every post to its title, to resolve links between posts.
 * Images load lazily, except the first when `eagerFirstImage`: with nothing above the
 * article's text, it is likely on the first screen, so it is fetched at once and first.
 */
export async function renderArticle(
    html: string,
    titles: ReadonlyMap<string, string>,
    { eagerFirstImage = false }: { eagerFirstImage?: boolean } = {},
): Promise<string> {
    const highlighter = await highlighterFor(html);

    // What the stream is currently inside of
    let filename: string | null = null;
    let code: { source: string; language: string | null } | null = null;
    let moved: { from: string; title: string } | null = null;
    let images = 0;

    const rewriter = new HTMLRewriter()
        // The page's h1 is the article title
        .on('h1', {
            element(el) {
                el.tagName = 'h2';
            },
        })
        // <div data-filename><pre><code class="language-…"> becomes one highlighted block.
        // The wrapper only exists for blocks that were given a file name.
        .on('div[data-filename]', {
            element(el) {
                filename = unesc(el.getAttribute('data-filename') ?? '');
                el.removeAndKeepContent();
                el.onEndTag(() => {
                    filename = null;
                });
            },
        })
        .on('pre', {
            element(el) {
                const block = (code = { source: '', language: null });
                el.removeAndKeepContent();
                el.onEndTag((end) => {
                    end.before(codeBlock(highlighter, unesc(block.source), block.language, filename), { html: true });
                    code = null;
                });
            },
            text(chunk) {
                if (code) code.source += chunk.text;
                chunk.remove();
            },
        })
        .on('pre *', {
            element(el) {
                if (!code) return;
                const language = /(?:^|\s)language-(\S+)/.exec(el.getAttribute('class') ?? '')?.[1];
                if (language) code.language = language;
                if (el.tagName === 'br') code.source += '\n';
                el.removeAndKeepContent();
            },
        })
        .on('img', {
            element(el) {
                if (eagerFirstImage && images++ === 0) {
                    // Loads at once and ahead of the others, even if the editor marked it lazy
                    el.removeAttribute('loading');
                    el.setAttribute('fetchpriority', 'high');
                } else if (!el.hasAttribute('loading')) {
                    el.setAttribute('loading', 'lazy');
                }
                el.setAttribute('decoding', 'async');
                sizeImage(el);
            },
        })
        .on('iframe', {
            element(el) {
                if (!el.hasAttribute('loading')) el.setAttribute('loading', 'lazy');
            },
        })
        // Wide tables scroll inside their own box instead of stretching the page
        .on('table', {
            element(el) {
                el.before('<div class="table-scroll">', { html: true });
                el.after('</div>', { html: true });
            },
        })
        .on('a[href]', {
            element(el) {
                const href = unesc(el.getAttribute('href') ?? '');
                if (!/^https?:\/\//i.test(href) || !URL.canParse(href)) return;
                const url = new URL(href);

                // A link to one of these posts on the old blog: keep the reader here
                const id = OLD_BLOG_HOSTS.includes(url.hostname) ? url.pathname.split('/').filter(Boolean).at(-1) : undefined;
                const title = id === undefined ? undefined : titles.get(id);
                if (title !== undefined) {
                    moved = { from: href, title };
                    el.setAttribute('href', `/blog/${id}${esc(url.hash)}`);
                    el.removeAttribute('target');
                    el.removeAttribute('rel');
                    el.onEndTag(() => {
                        moved = null;
                    });
                    return;
                }

                // Other sites open in a new tab, like every external link on this site
                el.setAttribute('target', '_blank');
                const rel = new Set((el.getAttribute('rel') ?? '').split(/\s+/).filter(Boolean)).add('noopener');
                el.setAttribute('rel', [...rel].join(' '));
            },
            text(chunk) {
                // A link written as its bare URL would still show the old address: show the title
                if (moved && unesc(chunk.text) === moved.from) chunk.replace(moved.title);
            },
        });

    return rewriter.transform(new Response(html)).text();
}
