import type { KnowledgeNode } from "./knowledge/graph-types";
import { renderMarkdown } from "./markdown-lite";
import { escapePremiumHtml as e } from "./premium-library";

type PreviewEntry = Pick<KnowledgeNode, "id" | "name" | "nameRu" | "type" | "href" | "hrefRu" | "text" | "textRu">;

export function knowledgeReference(href: string): string | undefined {
    try {
        const url = new URL(href, "https://heroesofcrypto.io");
        if (
            url.protocol !== "https:" ||
            (url.hostname !== "heroesofcrypto.io" && !url.hostname.endsWith(".heroesofcrypto.io")) ||
            !/^\/(?:ru\/)?knowledge-base\/?$/.test(url.pathname)
        )
            return undefined;
        return url.searchParams.get("entry") || decodeURIComponent(url.hash.slice(1)) || undefined;
    } catch {
        return undefined;
    }
}

export function findKnowledgePreview(entries: PreviewEntry[], reference: string): PreviewEntry | undefined {
    return entries.find(
        (entry) =>
            entry.id.replace(":", "-") === reference ||
            knowledgeReference(entry.href) === reference ||
            (entry.hrefRu && knowledgeReference(entry.hrefRu) === reference) ||
            entry.name.toLocaleLowerCase() === reference.toLocaleLowerCase(),
    );
}

export function renderKnowledgePreview(entry: PreviewEntry, lang: "en" | "ru"): string {
    return (
        '<p class="premium-reference-kind">' +
        e(entry.type) +
        "</p><h3>" +
        e(lang === "ru" ? (entry.nameRu ?? entry.name) : entry.name) +
        '</h3><div class="premium-reference-content">' +
        renderMarkdown(lang === "ru" ? (entry.textRu ?? entry.text) : entry.text) +
        "</div>"
    );
}

let catalog: Promise<PreviewEntry[]> | undefined;
const loadCatalog = (): Promise<PreviewEntry[]> => {
    catalog ??= fetch("/knowledge-preview.json", { cache: "no-cache" })
        .then(async (response) => {
            if (!response.ok) throw new Error("Knowledge preview unavailable");
            const data = (await response.json()) as { entries: PreviewEntry[] };
            if (!Array.isArray(data.entries)) throw new Error("Knowledge preview unavailable");
            return data.entries;
        })
        .catch((error: unknown) => {
            catalog = undefined;
            throw error;
        });
    return catalog;
};

export function initPremiumKnowledgePreview(root: HTMLElement, lang: "en" | "ru") {
    let card: HTMLElement | undefined;
    let anchor: HTMLAnchorElement | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    let version = 0;
    const cancelClose = () => clearTimeout(closeTimer);
    const hide = () => {
        cancelClose();
        version++;
        anchor?.removeAttribute("aria-describedby");
        anchor = undefined;
        if (card) card.hidden = true;
    };
    const position = () => {
        if (!anchor || !card || card.hidden) return;
        if (!anchor.isConnected) return hide();
        const rect = anchor.getBoundingClientRect();
        const width = card.offsetWidth;
        const height = card.offsetHeight;
        const gap = 10;
        const below = window.innerHeight - rect.bottom - gap;
        card.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
        card.style.top = `${Math.max(12, below >= height || below >= rect.top ? Math.min(rect.bottom + gap, window.innerHeight - height - 12) : rect.top - height - gap)}px`;
    };
    const scheduleClose = () => {
        cancelClose();
        closeTimer = setTimeout(hide, 160);
    };
    const show = async (link: HTMLAnchorElement) => {
        const reference = knowledgeReference(link.getAttribute("href") ?? "");
        if (!reference) return;
        cancelClose();
        if (anchor === link && card && !card.hidden) return;
        hide();
        const requestVersion = version;
        anchor = link;
        if (!card) {
            card = document.createElement("aside");
            card.className = "premium-reference-preview";
            card.id = "premium-reference-preview";
            card.setAttribute("role", "tooltip");
            card.addEventListener("pointerenter", cancelClose);
            card.addEventListener("pointerleave", scheduleClose);
            document.body.append(card);
        }
        link.setAttribute("aria-describedby", card.id);
        card.textContent = lang === "ru" ? "Загружаем описание…" : "Loading entry…";
        card.hidden = false;
        position();
        try {
            const entry = findKnowledgePreview(await loadCatalog(), reference);
            if (version !== requestVersion || anchor !== link) return;
            card.innerHTML = entry
                ? renderKnowledgePreview(entry, lang)
                : lang === "ru"
                  ? "Описание недоступно. Нажмите, чтобы открыть базу знаний."
                  : "Preview unavailable. Click to open the knowledge base.";
            position();
        } catch {
            if (version !== requestVersion || anchor !== link) return;
            card.textContent =
                lang === "ru"
                    ? "Не удалось загрузить описание. Нажмите, чтобы открыть базу знаний."
                    : "Could not load this entry. Click to open the knowledge base.";
            position();
        }
    };
    const linkAt = (target: EventTarget | null) =>
        target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
    root.addEventListener("pointerover", (event) => {
        if (event.pointerType === "touch" || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
        const link = linkAt(event.target);
        if (link) void show(link);
    });
    root.addEventListener("pointerout", (event) => {
        const link = linkAt(event.target);
        if (link === anchor && !link?.contains(event.relatedTarget as Node | null)) scheduleClose();
    });
    root.addEventListener("focusin", (event) => {
        const link = linkAt(event.target);
        if (link) void show(link);
    });
    root.addEventListener("focusout", scheduleClose);
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") hide();
    });
    window.addEventListener("resize", hide);
    window.addEventListener(
        "scroll",
        (event) => {
            if (card && event.target instanceof Node && card.contains(event.target)) return;
            hide();
        },
        true,
    );
    window.addEventListener("pagehide", hide);
    return { hide };
}
