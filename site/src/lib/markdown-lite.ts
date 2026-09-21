/**
 * A small, safe Markdown renderer for the AI answers on the Knowledge Base page.
 *
 * The assistant writes plain Markdown (paragraphs, headings, bullet and numbered lists, tables, bold,
 * italics, inline code, links). Everything is HTML-escaped before any markup is added, so model output
 * can never inject markup, and links are limited to same-site paths, fragments and http(s) URLs.
 * Deliberately dependency-free: the page must stay light, and the renderer runs on every streamed chunk.
 */

const escapeHtml = (value: string): string =>
    value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

const isSafeHref = (href: string): boolean => /^(?:https?:\/\/|\/(?!\/)|#)/i.test(href.trim());

/** Inline markup on already-escaped text: code, bold, italics, links. */
export function renderInline(text: string): string {
    const codeSpans: string[] = [];
    let html = escapeHtml(text).replace(/`([^`\n]+)`/g, (_match, code: string) => {
        codeSpans.push(`<code>${code}</code>`);
        return `\u0000${codeSpans.length - 1}\u0000`;
    });
    html = html.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (match, label: string, href: string) => {
        if (!isSafeHref(href)) return match;
        const external = /^https?:\/\//i.test(href);
        return `<a href="${href}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${label}</a>`;
    });
    html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>");
    html = html.replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
    return html.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => codeSpans[Number(index)] ?? "");
}

const isTableSeparator = (line: string): boolean => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

const splitCells = (line: string): string[] => {
    const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    const cells: string[] = [];
    let current = "";
    for (let index = 0; index < trimmed.length; index += 1) {
        const char = trimmed[index];
        if (char === "\\" && trimmed[index + 1] === "|") {
            current += "|";
            index += 1;
        } else if (char === "|") {
            cells.push(current.trim());
            current = "";
        } else {
            current += char;
        }
    }
    cells.push(current.trim());
    return cells;
};

interface ListItem {
    indent: number;
    ordered: boolean;
    text: string;
}

const listItem = (line: string): ListItem | undefined => {
    const match = /^(\s*)(?:([-*+])|(\d{1,3})[.)])\s+(.*)$/.exec(line);
    if (!match) return undefined;
    return { indent: match[1].replace(/\t/g, "    ").length, ordered: Boolean(match[3]), text: match[4] };
};

function renderList(items: ListItem[]): string {
    let html = "";
    const stack: { indent: number; ordered: boolean }[] = [];
    const closeTo = (indent: number): void => {
        while (stack.length && stack[stack.length - 1].indent > indent) {
            html += `</li></${stack.pop()?.ordered ? "ol" : "ul"}>`;
        }
    };
    for (const item of items) {
        const top = stack[stack.length - 1];
        if (!top || item.indent > top.indent) {
            stack.push({ indent: item.indent, ordered: item.ordered });
            html += `<${item.ordered ? "ol" : "ul"}><li>${renderInline(item.text)}`;
            continue;
        }
        closeTo(item.indent);
        const current = stack[stack.length - 1];
        if (current && current.ordered !== item.ordered && current.indent === item.indent) {
            html += `</li></${current.ordered ? "ol" : "ul"}>`;
            stack.pop();
            stack.push({ indent: item.indent, ordered: item.ordered });
            html += `<${item.ordered ? "ol" : "ul"}><li>${renderInline(item.text)}`;
            continue;
        }
        html += `</li><li>${renderInline(item.text)}`;
    }
    closeTo(-1);
    return html;
}

/** Markdown → HTML. Unknown constructs degrade to escaped text, never to broken markup. */
export function renderMarkdown(markdown: string): string {
    const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
    const out: string[] = [];
    let index = 0;

    const flushParagraph = (buffer: string[]): void => {
        if (buffer.length) out.push(`<p>${renderInline(buffer.join(" "))}</p>`);
        buffer.length = 0;
    };

    const paragraph: string[] = [];
    while (index < lines.length) {
        const line = lines[index];
        const trimmed = line.trim();

        if (!trimmed) {
            flushParagraph(paragraph);
            index += 1;
            continue;
        }

        const fence = /^```/.exec(trimmed);
        if (fence) {
            flushParagraph(paragraph);
            const code: string[] = [];
            index += 1;
            while (index < lines.length && !/^```/.test(lines[index].trim())) {
                code.push(lines[index]);
                index += 1;
            }
            index += 1;
            out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
            continue;
        }

        const heading = /^(#{1,6})\s+(.+?)\s*#*$/.exec(trimmed);
        if (heading) {
            flushParagraph(paragraph);
            const level = Math.min(6, Math.max(3, heading[1].length + 1));
            out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
            index += 1;
            continue;
        }

        if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
            flushParagraph(paragraph);
            out.push("<hr>");
            index += 1;
            continue;
        }

        if (trimmed.startsWith(">")) {
            flushParagraph(paragraph);
            const quote: string[] = [];
            while (index < lines.length && lines[index].trim().startsWith(">")) {
                quote.push(lines[index].trim().replace(/^>\s?/, ""));
                index += 1;
            }
            out.push(`<blockquote>${renderMarkdown(quote.join("\n"))}</blockquote>`);
            continue;
        }

        if (trimmed.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
            flushParagraph(paragraph);
            const header = splitCells(lines[index]);
            index += 2;
            const rows: string[][] = [];
            while (index < lines.length && lines[index].trim().includes("|") && lines[index].trim()) {
                rows.push(splitCells(lines[index]));
                index += 1;
            }
            const cell = (tag: string, value: string): string => `<${tag}>${renderInline(value)}</${tag}>`;
            const body = rows
                .map((row) => `<tr>${header.map((_, column) => cell("td", row[column] ?? "")).join("")}</tr>`)
                .join("");
            out.push(
                `<table><thead><tr>${header.map((value) => cell("th", value)).join("")}</tr></thead><tbody>${body}</tbody></table>`,
            );
            continue;
        }

        const item = listItem(line);
        if (item) {
            flushParagraph(paragraph);
            const items: ListItem[] = [];
            while (index < lines.length) {
                const next = listItem(lines[index]);
                if (next) {
                    items.push(next);
                    index += 1;
                } else if (lines[index].trim() && /^\s{2,}/.test(lines[index]) && items.length) {
                    items[items.length - 1].text += ` ${lines[index].trim()}`;
                    index += 1;
                } else {
                    break;
                }
            }
            out.push(renderList(items));
            continue;
        }

        paragraph.push(trimmed);
        index += 1;
    }
    flushParagraph(paragraph);
    return out.join("");
}
