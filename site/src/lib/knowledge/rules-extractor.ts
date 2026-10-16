/**
 * Pulls the rules prose out of the RENDERED Knowledge Base page.
 *
 * The rules live as Astro markup in RulesPage.astro with the numbers computed from common at build time,
 * so the rendered HTML is the one place where the complete, current text exists. The build reads
 * `dist/knowledge-base/index.html` (and the Russian page), cuts out every `<section id="rule-…">` block
 * and converts it to Markdown that keeps the structure a player sees: headings, lists, the augment and
 * doctrine tables, the definition lists of key numbers.
 *
 * Deliberately dependency-free: Astro's output is well-formed, so a small tag scanner is enough, and the
 * converter is a pure function that the tests drive with fixture markup.
 */

export interface ExtractedRuleSection {
    /** The section's DOM id, e.g. `rule-morale`. */
    id: string;
    /** The section's own heading (first h2/h3 inside it), or the id when it has none. */
    title: string;
    /** The category label rendered above the heading (`<p class="eyebrow">`), when present. */
    eyebrow?: string;
    /** The section body as Markdown. */
    markdown: string;
}

const VOID_TAGS = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "source",
    "track",
    "wbr",
]);
const SKIP_TAGS = new Set([
    "audio",
    "canvas",
    "iframe",
    "input",
    "noscript",
    "script",
    "select",
    "style",
    "svg",
    "template",
    "textarea",
    "video",
]);
const BLOCK_TAGS = new Set([
    "address",
    "article",
    "aside",
    "blockquote",
    "details",
    "div",
    "fieldset",
    "figcaption",
    "figure",
    "footer",
    "form",
    "header",
    "main",
    "nav",
    "p",
    "pre",
    "section",
    "summary",
]);
const HEADING_LEVEL: Record<string, number> = { h1: 2, h2: 2, h3: 3, h4: 4, h5: 5, h6: 5 };

const NAMED_ENTITIES: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    laquo: "«",
    lt: "<",
    mdash: "—",
    nbsp: " ",
    ndash: "–",
    quot: '"',
    raquo: "»",
    times: "×",
};

export function decodeEntities(text: string): string {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
        if (entity[0] === "#") {
            const code =
                entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
            return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
        }
        return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    });
}

const TAG_PATTERN =
    /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|<!--[\s\S]*?-->/g;

function readAttribute(attributes: string, name: string): string | undefined {
    const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(attributes);
    if (!match) return undefined;
    return decodeEntities(match[1] ?? match[2] ?? match[3] ?? "");
}

interface Frame {
    tag: string;
    /** Inline text collected directly inside this element. */
    buf: string;
    /** Block content rendered by children (lists inside a list item, paragraphs inside a cell). */
    blocks: string[];
    /** True right after a child element contributed to `buf`, so adjacent words get a separating space. */
    afterChild?: boolean;
    href?: string;
    cells?: string[];
    rows?: string[][];
    headerRowCount?: number;
    caption?: string;
    counter?: number;
}

const isTableCell = (tag: string): boolean => tag === "td" || tag === "th";

const escapeCell = (text: string): string => text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

const collapse = (text: string): string => text.replace(/\s+/g, " ");

const WORDISH = /[\p{L}\p{N}*_`[]$/u;
const WORDISH_START = /^[\p{L}\p{N}*_`[(]/u;

/** Append inline text produced by a child element, separating it from the surrounding words. */
function appendInline(parent: Frame, chunk: string): void {
    if (!chunk) return;
    if (parent.buf && WORDISH.test(parent.buf) && WORDISH_START.test(chunk)) parent.buf += " ";
    parent.buf += chunk;
    parent.afterChild = true;
}

function inlineOf(frame: Frame, joiner = " · "): string {
    const parts = [frame.buf.trim(), ...frame.blocks.map((block) => block.trim())].filter(Boolean);
    return collapse(parts.join(joiner)).trim();
}

const stripBold = (text: string): string => text.replace(/\*\*/g, "");

function tableMarkdown(frame: Frame): string {
    const rows = (frame.rows ?? []).filter((row) => row.some((cell) => cell.length > 0));
    if (rows.length === 0) return frame.caption ? `**${frame.caption}**` : "";
    const width = Math.max(...rows.map((row) => row.length));
    const pad = (row: string[]): string[] => [...row, ...Array(width - row.length).fill("")];
    // Markdown tables need a header row; a table without <thead> gets a blank one so no data row is promoted.
    const hasHeader = (frame.headerRowCount ?? 0) > 0;
    const header = hasHeader ? pad(rows[0]) : Array(width).fill("");
    const lines = [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`];
    for (const row of rows.slice(hasHeader ? Math.min(frame.headerRowCount ?? 1, rows.length) : 0)) {
        lines.push(`| ${pad(row).join(" | ")} |`);
    }
    return `${frame.caption ? `**${frame.caption}**\n\n` : ""}${lines.join("\n")}`;
}

function isSafeHref(href: string): boolean {
    return /^(?:https?:\/\/|\/|#)/i.test(href);
}

/** Convert an HTML fragment to Markdown. Presentation-only elements (svg, img, script, style) are dropped. */
export function htmlToMarkdown(html: string): string {
    const root: Frame = { tag: "#root", buf: "", blocks: [] };
    const stack: Frame[] = [root];
    let skipDepth = 0;
    let skipTag = "";
    let lastIndex = 0;

    const top = (): Frame => stack[stack.length - 1];

    const appendBlock = (frame: Frame, block: string): void => {
        const trimmed = block.trim();
        if (!trimmed) return;
        frame.blocks.push(trimmed);
        // Block content after inline text: keep them apart when the parent is rendered inline.
    };

    const emitText = (raw: string): void => {
        if (skipDepth > 0) return;
        const text = decodeEntities(raw);
        if (!text) return;
        const frame = top();
        const normalized = collapse(text);
        if (!normalized.trim()) {
            if (frame.buf && !frame.buf.endsWith(" ")) frame.buf += " ";
            frame.afterChild = false;
            return;
        }
        if (frame.afterChild && WORDISH.test(frame.buf) && WORDISH_START.test(normalized)) frame.buf += " ";
        frame.buf += normalized;
        frame.afterChild = false;
    };

    const openTag = (tag: string, attributes: string, selfClosing: boolean): void => {
        if (skipDepth > 0) {
            if (tag === skipTag && !selfClosing && !VOID_TAGS.has(tag)) skipDepth += 1;
            return;
        }
        if (SKIP_TAGS.has(tag)) {
            if (!selfClosing && !VOID_TAGS.has(tag)) {
                skipDepth = 1;
                skipTag = tag;
            }
            return;
        }
        if (tag === "br") {
            top().buf += " ";
            return;
        }
        if (tag === "hr") {
            appendBlock(top(), "---");
            return;
        }
        if (VOID_TAGS.has(tag) || selfClosing) return;
        const frame: Frame = { tag, buf: "", blocks: [] };
        if (tag === "a") frame.href = readAttribute(attributes, "href");
        if (tag === "table") {
            frame.rows = [];
            frame.headerRowCount = 0;
        }
        if (tag === "tr") frame.cells = [];
        if (tag === "ol" || tag === "ul") frame.counter = 0;
        stack.push(frame);
    };

    const closeTag = (tag: string): void => {
        if (skipDepth > 0) {
            if (tag === skipTag) skipDepth -= 1;
            return;
        }
        // Find the matching open frame; unmatched closers are ignored, and any frames above are closed too.
        let index = stack.length - 1;
        while (index > 0 && stack[index].tag !== tag) index -= 1;
        if (index === 0) return;
        while (stack.length - 1 >= index) {
            const frame = stack.pop() as Frame;
            const parent = top();
            renderClosed(frame, parent);
        }
    };

    const renderClosed = (frame: Frame, parent: Frame): void => {
        const tag = frame.tag;
        switch (tag) {
            case "strong":
            case "b": {
                const inner = stripBold(inlineOf(frame, " "));
                if (inner) appendInline(parent, `**${inner}**`);
                return;
            }
            case "em":
            case "i": {
                const inner = inlineOf(frame, " ");
                if (inner) appendInline(parent, `*${inner}*`);
                return;
            }
            case "code":
            case "kbd": {
                const inner = inlineOf(frame, " ");
                if (inner) appendInline(parent, `\`${inner.replace(/`/g, "'")}\``);
                return;
            }
            case "a": {
                const inner = inlineOf(frame, " ");
                if (!inner) return;
                const href = frame.href?.trim();
                appendInline(parent, href && isSafeHref(href) ? `[${inner}](${href})` : inner);
                return;
            }
            case "li": {
                const listFrame = parent;
                const ordered = listFrame.tag === "ol";
                listFrame.counter = (listFrame.counter ?? 0) + 1;
                const marker = ordered ? `${listFrame.counter}. ` : "- ";
                const inlineParts = [frame.buf.trim()];
                const nested: string[] = [];
                for (const block of frame.blocks) {
                    if (/^(?:- |\d+\. )/m.test(block)) nested.push(block);
                    else inlineParts.push(block.replace(/^#+\s+(.*)$/s, "**$1**"));
                }
                let head = collapse(inlineParts.filter(Boolean).join(" ")).trim();
                // A decorative step number inside an ordered item repeats the marker; drop it.
                if (ordered && head.startsWith(`${listFrame.counter} `))
                    head = head.slice(String(listFrame.counter).length + 1);
                const lines = [`${marker}${head}`];
                for (const block of nested) {
                    lines.push(
                        block
                            .split("\n")
                            .map((line) => `  ${line}`)
                            .join("\n"),
                    );
                }
                appendBlock(listFrame, lines.join("\n"));
                return;
            }
            case "ul":
            case "ol": {
                const rendered = frame.blocks.join("\n");
                if (rendered.trim()) appendBlock(parent, rendered);
                return;
            }
            case "table": {
                appendBlock(parent, tableMarkdown(frame));
                return;
            }
            case "caption": {
                if (parent.tag === "table") parent.caption = inlineOf(frame);
                else appendBlock(parent, `**${inlineOf(frame)}**`);
                return;
            }
            case "thead":
            case "tbody":
            case "tfoot": {
                // Rows were pushed straight onto the table; nothing to render here.
                return;
            }
            case "tr": {
                let table: Frame | undefined;
                for (let i = stack.length - 1; i >= 0; i -= 1) {
                    if (stack[i].tag === "table") {
                        table = stack[i];
                        break;
                    }
                }
                if (!table) {
                    appendBlock(parent, (frame.cells ?? []).join(" | "));
                    return;
                }
                table.rows = table.rows ?? [];
                table.rows.push(frame.cells ?? []);
                if (parent.tag === "thead") table.headerRowCount = (table.headerRowCount ?? 0) + 1;
                return;
            }
            case "td":
            case "th": {
                const cell = escapeCell(inlineOf(frame));
                if (parent.tag === "tr") (parent.cells = parent.cells ?? []).push(cell);
                else parent.buf += ` ${cell} `;
                return;
            }
            case "dl": {
                const rendered = frame.blocks.join("\n");
                if (rendered.trim()) appendBlock(parent, rendered);
                return;
            }
            case "dt": {
                const inner = stripBold(inlineOf(frame, " "));
                if (inner) appendBlock(parent, `- **${inner}**`);
                return;
            }
            case "dd": {
                const inner = inlineOf(frame);
                if (!inner) return;
                const previous = parent.blocks[parent.blocks.length - 1];
                if (previous && previous.startsWith("- **") && !previous.includes("**: ")) {
                    parent.blocks[parent.blocks.length - 1] = `${previous}: ${inner}`;
                } else {
                    appendBlock(parent, `- ${inner}`);
                }
                return;
            }
            default:
                break;
        }
        if (HEADING_LEVEL[tag]) {
            const inner = inlineOf(frame, " ");
            if (inner) appendBlock(parent, `${"#".repeat(HEADING_LEVEL[tag])} ${inner}`);
            return;
        }
        if (BLOCK_TAGS.has(tag)) {
            if (
                isTableCell(parent.tag) ||
                parent.tag === "li" ||
                parent.tag === "dt" ||
                parent.tag === "dd" ||
                HEADING_LEVEL[parent.tag]
            ) {
                // Inline hosts keep their children as separate inline parts.
                const inline = frame.buf.trim();
                if (inline) parent.blocks.push(collapse(inline));
                parent.blocks.push(...frame.blocks);
                return;
            }
            const inline = frame.buf.trim();
            if (inline) appendBlock(parent, collapse(inline));
            for (const block of frame.blocks) appendBlock(parent, block);
            return;
        }
        // Transparent inline wrapper (span, buttons, labels, ...).
        if (frame.buf.trim()) appendInline(parent, frame.buf.trim());
        else if (frame.buf && parent.buf && !parent.buf.endsWith(" ")) parent.buf += " ";
        if (frame.blocks.length) {
            if (isTableCell(parent.tag) || parent.tag === "li" || parent.tag === "dt" || parent.tag === "dd") {
                parent.blocks.push(...frame.blocks);
            } else {
                for (const block of frame.blocks) appendBlock(parent, block);
            }
        }
    };

    TAG_PATTERN.lastIndex = 0;
    for (let match = TAG_PATTERN.exec(html); match; match = TAG_PATTERN.exec(html)) {
        if (match.index > lastIndex) emitText(html.slice(lastIndex, match.index));
        lastIndex = TAG_PATTERN.lastIndex;
        if (match[0].startsWith("<!--")) continue;
        const closing = match[1] === "/";
        const tag = match[2].toLowerCase();
        if (closing) closeTag(tag);
        else openTag(tag, match[3] ?? "", match[4] === "/");
    }
    if (lastIndex < html.length) emitText(html.slice(lastIndex));
    while (stack.length > 1) {
        const frame = stack.pop() as Frame;
        renderClosed(frame, top());
    }

    const parts = [root.buf.trim(), ...root.blocks].filter(Boolean);
    return parts
        .join("\n\n")
        .split("\n")
        .map((line) => line.replace(/[ \t]+$/g, ""))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/** The balanced `<section …>` block starting at `start`, or null when the markup is broken. */
function balancedSection(html: string, start: number): string | null {
    const pattern = /<(\/?)section\b[^>]*>/g;
    pattern.lastIndex = start;
    let depth = 0;
    for (let match = pattern.exec(html); match; match = pattern.exec(html)) {
        depth += match[1] === "/" ? -1 : 1;
        if (depth === 0) return html.slice(start, match.index + match[0].length);
    }
    return null;
}

const firstMatch = (html: string, pattern: RegExp): string | undefined => {
    const match = pattern.exec(html);
    return match
        ? htmlToMarkdown(match[1])
              .replace(/^#+\s*/, "")
              .trim() || undefined
        : undefined;
};

/**
 * Every `<section id="rule-…">` on a rendered Knowledge Base page as Markdown, in page order.
 * Nested helper sections (key-number references, placement comparisons) stay inside their parent rule.
 */
export function extractRuleSections(html: string, idPrefix = "rule-"): ExtractedRuleSection[] {
    const results: ExtractedRuleSection[] = [];
    const seen = new Set<string>();
    const opener = /<section\b[^>]*\bid="([^"]+)"[^>]*>/g;
    for (let match = opener.exec(html); match; match = opener.exec(html)) {
        const id = decodeEntities(match[1]);
        if (!id.startsWith(idPrefix) || seen.has(id)) continue;
        const block = balancedSection(html, match.index);
        if (!block) continue;
        seen.add(id);
        const eyebrow = firstMatch(block, /<p\b[^>]*\bclass="[^"]*\beyebrow\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
        const title = firstMatch(block, /<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/i) ?? id;
        let markdown = htmlToMarkdown(block);
        if (eyebrow) {
            const eyebrowLine = eyebrow.trim();
            markdown = markdown
                .split("\n\n")
                .filter((paragraph, index) => !(index < 2 && paragraph.trim() === eyebrowLine))
                .join("\n\n");
        }
        results.push({ id, title, eyebrow, markdown });
        opener.lastIndex = match.index + block.length;
    }
    return results;
}
