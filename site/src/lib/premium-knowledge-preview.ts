import type { KnowledgeNode } from "./knowledge/graph-types";
import { renderMarkdown } from "./markdown-lite";
import { escapePremiumHtml as e, type PremiumCatalog } from "./premium-library";
import { portraitMarkup } from "./portrait";

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

export function renderPremiumCatalogPreview(
    reference: string,
    catalog: PremiumCatalog,
    lang: "en" | "ru",
): string | undefined {
    const t = (en: string, ru: string) => (lang === "ru" ? ru : en);
    const item = Object.values(catalog.units).find((item) => item.anchor === reference || item.name === reference);
    if (item?.kit) {
        const kit = item.kit;
        return `<div class="premium-reference-unit">${portraitMarkup(item.slug, item.name, { className: "premium-portrait", eager: true })}<div><p class="premium-reference-kind">${e(item.faction)} · ${t("Level", "Уровень")} ${item.level}</p><h3>${e(item.name)}</h3></div></div><dl class="premium-reference-stats"><div><dt>${t("Health", "Здоровье")}</dt><dd>${kit.hp}</dd></div><div><dt>${t("Damage", "Урон")}</dt><dd>${e(kit.damage)}</dd></div><div><dt>${t("Armor", "Броня")}</dt><dd>${kit.armor}</dd></div><div><dt>${t("Movement", "Движение")}</dt><dd>${kit.steps}</dd></div><div><dt>${t("Initiative", "Инициатива")}</dt><dd>${kit.initiative}</dd></div><div><dt>${t("Draft stack", "В стеке")}</dt><dd>${kit.amount}</dd></div></dl><div class="premium-reference-abilities">${kit.abilities
            .slice(0, 3)
            .map(
                (ability) =>
                    `<div><img src="${e(ability.icon)}" alt="" width="30" height="30"/><span><strong>${e(ability.name)}</strong><p>${e(ability.description)}</p></span></div>`,
            )
            .join("")}</div>`;
    }
    const artifact = Object.values(catalog.artifacts).find(
        (item) => item.anchor === reference || item.name === reference,
    );
    return artifact
        ? `<div class="premium-reference-unit"><img src="${e(artifact.icon)}" alt="" width="60" height="60"/><h3>${e(artifact.name)}</h3></div><p>${e(artifact.description)}</p>`
        : undefined;
}

/** Keep readable content on screen; only content taller than the viewport needs to scroll. */
export function premiumPreviewPlacement(
    anchor: { left: number; right: number; top: number; bottom: number },
    viewport: { width: number; height: number },
    content: { width: number; height: number },
) {
    const margin = 12,
        gap = 10;
    const maxHeight = Math.max(0, viewport.height - margin * 2);
    const width = Math.min(content.width, Math.max(0, viewport.width - margin * 2));
    const height = Math.min(content.height, maxHeight);
    const clampX = (x: number) => Math.max(margin, Math.min(x, viewport.width - width - margin));
    const clampY = (y: number) => Math.max(margin, Math.min(y, viewport.height - height - margin));
    const below = viewport.height - anchor.bottom - gap - margin;
    const above = anchor.top - gap - margin;
    const right = viewport.width - anchor.right - gap - margin;
    const left = anchor.left - gap - margin;
    let x = clampX(anchor.left),
        y: number;
    if (content.height <= below) y = anchor.bottom + gap;
    else if (content.height <= above) y = anchor.top - height - gap;
    else if (right >= width || left >= width) {
        x = right >= left ? anchor.right + gap : anchor.left - gap - width;
        y = anchor.top;
    } else {
        // On narrower screens the card may overlap the trigger rather than unnecessarily crop its content.
        y = below >= above ? anchor.bottom + gap : anchor.top - height - gap;
    }
    return { left: clampX(x), top: clampY(y), maxHeight };
}

export function initPremiumKnowledgePreview(root: HTMLElement, lang: "en" | "ru", localCatalog?: PremiumCatalog) {
    let card: HTMLElement | undefined;
    let anchor: HTMLElement | undefined;
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
        const viewport = {
            width: document.documentElement.clientWidth || window.innerWidth,
            height: window.innerHeight,
        };
        const width = Math.min(440, Math.max(0, viewport.width - 24));
        const maxHeight = Math.max(0, viewport.height - 24);
        card.style.width = `${width}px`;
        card.style.maxHeight = `${maxHeight}px`;
        const naturalHeight = () => card!.scrollHeight + card!.offsetHeight - card!.clientHeight;
        if (naturalHeight() > maxHeight && viewport.width - 24 > width) {
            // More line length can eliminate a scrollbar on shorter desktop windows without shrinking type.
            card.style.width = `${Math.min(640, viewport.width - 24)}px`;
        }
        const placement = premiumPreviewPlacement(anchor.getBoundingClientRect(), viewport, {
            width: card.offsetWidth,
            height: naturalHeight(),
        });
        card.style.left = `${placement.left}px`;
        card.style.top = `${placement.top}px`;
    };
    const scheduleClose = () => {
        cancelClose();
        closeTimer = setTimeout(hide, 160);
    };
    const show = async (link: HTMLElement) => {
        const reference =
            link.getAttribute("data-knowledge-reference") ||
            knowledgeReference(link.getAttribute("href") ?? "") ||
            (link.hasAttribute("data-premium-help") ? "help" : undefined);
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
        }
        const parent = link.closest("dialog") ?? document.body;
        if (card.parentElement !== parent) parent.append(card);
        link.setAttribute("aria-describedby", card.id);
        const local = link.hasAttribute("data-premium-help")
            ? `<h3>${e(link.getAttribute("data-premium-help-title"))}</h3><p>${e(link.getAttribute("data-premium-help"))}</p>`
            : localCatalog && renderPremiumCatalogPreview(reference, localCatalog, lang);
        if (local) {
            const appliesTo = link.getAttribute("data-premium-applies-to");
            const note = link.getAttribute("data-premium-reference-note");
            card.innerHTML =
                local +
                (note ? `<p class="premium-reference-applies">${e(note)}</p>` : "") +
                (appliesTo
                    ? `<p class="premium-reference-applies"><strong>${lang === "ru" ? "В вашей армии" : "In your crew"}</strong><br>${e(appliesTo)}</p>`
                    : "");
            card.hidden = false;
            card.scrollTop = 0;
            position();
            return;
        }
        card.textContent = lang === "ru" ? "Загружаем описание…" : "Loading entry…";
        card.hidden = false;
        card.scrollTop = 0;
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
        target instanceof Element
            ? target.closest<HTMLElement>("a[href], [data-knowledge-reference], [data-premium-help]")
            : null;
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
    root.addEventListener("click", (event) => {
        const editingCrew =
            event.target instanceof Element && event.target.closest("[data-crew-slot], [data-crew-roster-pick]");
        if (anchor && (!anchor.isConnected || editingCrew)) hide();
    });
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
    root.addEventListener("close", hide, true);
    return { hide };
}
