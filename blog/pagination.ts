export const POSTS_PER_PAGE = 10;

export function blogPagePath(page: number): string {
    return page === 1 ? '/blog' : `/blog/page/${page}`;
}

export function paginate<T>(items: T[], page = 1) {
    const pageCount = Math.max(1, Math.ceil(items.length / POSTS_PER_PAGE));
    if (!Number.isInteger(page) || page < 1 || page > pageCount) {
        throw new RangeError(`No blog page ${page}`);
    }
    return {
        items: items.slice((page - 1) * POSTS_PER_PAGE, page * POSTS_PER_PAGE),
        page,
        pageCount,
        paths: Array.from({ length: pageCount }, (_, index) => blogPagePath(index + 1)),
    };
}

export function renderPagination(page: number, paths: string[]): string {
    if (paths.length <= 1) return '';
    const previous = page > 1
        ? `<a href="${paths[page - 2]}" rel="prev">Prev</a>`
        : '<span aria-disabled="true">Prev</span>';
    const next = page < paths.length
        ? `<a href="${paths[page]}" rel="next">Next</a>`
        : '<span aria-disabled="true">Next</span>';
    return `<nav class="blog-pagination" aria-label="Blog pagination">
            ${previous}
            ${paths.map((path, index) => index + 1 === page
                ? `<span aria-current="page">${page}</span>`
                : `<a href="${path}" aria-label="Page ${index + 1}">${index + 1}</a>`).join('\n            ')}
            ${next}
        </nav>`;
}
