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

/** microCMS serves images through imgix: ask for WebP at the widths the column shows (1x and 2x). */
function sizeImage(image: HTMLRewriterTypes.Element): void {
    const src = unesc(image.getAttribute('src') ?? '');
    const width = Number(image.getAttribute('width'));
    if (!URL.canParse(src) || !width) return;
    const url = new URL(src);
    // GIFs would lose their animation, SVGs their vectors
    if (url.hostname !== IMAGE_HOST || /\.(gif|svg)$/i.test(url.pathname)) return;

    const sized = (w: number) => {
        url.searchParams.set('fm', 'webp');
        url.searchParams.set('w', String(w));
        return esc(url.href);
    };
    // Never upscale: the last candidate is the image at its own width
    const widths = [MEASURE, MEASURE * 2].filter((w) => w < width);
    if (widths.length < 2) widths.push(width);
    image.setAttribute('src', sized(widths.at(-1)!));
    if (widths.length > 1) {
        image.setAttribute('srcset', widths.map((w) => `${sized(w)} ${w}w`).join(', '));
        image.setAttribute('sizes', `(min-width: ${MEASURE + 80}px) ${MEASURE}px, 100vw`);
    }
}

/**
 * Rewrites the body of one article for display.
 * `titles` maps the ID of every post to its title, to resolve links between posts.
 */
export async function renderArticle(html: string, titles: ReadonlyMap<string, string>): Promise<string> {
    const highlighter = await highlighterFor(html);

    // What the stream is currently inside of
    let filename: string | null = null;
    let code: { source: string; language: string | null } | null = null;
    let moved: { from: string; title: string } | null = null;

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
                if (!el.hasAttribute('loading')) el.setAttribute('loading', 'lazy');
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
