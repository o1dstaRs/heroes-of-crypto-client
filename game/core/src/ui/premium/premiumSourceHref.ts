import { siteUrlBase } from "../../api/site_origin";

const ownSites = new Set([
    "heroesofcrypto.io",
    "www.heroesofcrypto.io",
    "app.heroesofcrypto.io",
    "beta.heroesofcrypto.io",
    "test.heroesofcrypto.io",
]);

export const premiumSourceHref = (href: string, base = siteUrlBase()): string | undefined => {
    if (!href || /[\s\\\u0000-\u001f\u007f]/.test(href) || href.startsWith("//")) return undefined;
    if (!/^(?:https?:\/\/|\/(?!\/)|#)/i.test(href)) return undefined;
    try {
        const url = new URL(href, base);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return undefined;
        if (ownSites.has(url.hostname)) return new URL(url.pathname + url.search + url.hash, base).href;
        return url.href;
    } catch {
        return undefined;
    }
};
