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
        const rect = anchor.getBoundingClientRect();
        const width = card.offsetWidth;
        const gap = 10;
        const below = window.innerHeight - rect.bottom - gap - 12;
        const above = rect.top - gap - 12;
        const placeBelow = below >= Math.min(480, card.scrollHeight) || below >= above;
        card.style.maxHeight = `${Math.max(80, Math.min(480, placeBelow ? below : above))}px`;
        const height = card.offsetHeight;
        card.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
        card.style.top = `${Math.max(12, placeBelow ? rect.bottom + gap : rect.top - height - gap)}px`;
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
            card.innerHTML =
                local +
                (appliesTo
                    ? `<p class="premium-reference-applies"><strong>${lang === "ru" ? "В вашей армии" : "In your crew"}</strong><br>${e(appliesTo)}</p>`
                    : "");
            card.hidden = false;
            position();
            return;
        }
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
