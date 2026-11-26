/**
 * Related products = the next few products after this one in its category,
 * wrapping around, rather than the category's first four.
 *
 * Taking the first four gave those four a link from every sibling PDP while
 * the rest of the category got none — about half the catalogue was linked from
 * exactly one page (its category), which is what "Discovered/Crawled –
 * currently not indexed" feeds on. Rotating means every product in a category
 * of five or more is linked from four sibling PDPs, and the choice is stable
 * per product so the cached page doesn't reshuffle between renders.
 */
export function pickRelated<T extends { id: number | string }>(
    productId: T["id"],
    siblings: T[],
    fallback: T[],
    count: number,
): T[] {
    const idx = siblings.findIndex((p) => p.id === productId);
    const ordered = idx >= 0 ? [...siblings.slice(idx + 1), ...siblings.slice(0, idx)] : siblings;
    const out: T[] = [];
    const seen = new Set<T["id"]>([productId]);
    for (const p of [...ordered, ...fallback]) {
        if (out.length >= count) break;
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        out.push(p);
    }
    return out;
}

/**
 * "More for your <car>": the next products in the same car category, skipping
 * the ones the "You may also like" row already shows so the two rows never
 * repeat a card. Same rotation as pickRelated, so every product in the car
 * category gets inbound links from its neighbours.
 */
export function pickRelatedByCar<T extends { id: number | string }>(
    productId: T["id"],
    carSiblings: T[],
    alreadyShown: T[],
    count: number,
): T[] {
    const shown = new Set<T["id"]>(alreadyShown.map((p) => p.id));
    return pickRelated(productId, carSiblings, [], count + shown.size).filter((p) => !shown.has(p.id)).slice(0, count);
}
