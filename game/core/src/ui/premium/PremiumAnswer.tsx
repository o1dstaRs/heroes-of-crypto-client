import React from "react";

import { premiumSourceHref } from "./premiumSourceHref";

const inline = (text: string): React.ReactNode[] =>
    text.split(/(\[[^\]\n]+\]\([^\s)]+\)|\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*)/g).map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
        if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
        if (part.startsWith("`") && part.endsWith("`"))
            return (
                <code key={index} style={{ fontSize: "0.88em", overflowWrap: "anywhere" }}>
                    {part.slice(1, -1)}
                </code>
            );
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        const href = link && premiumSourceHref(link[2]);
        if (href && link)
            return (
                <a key={index} href={href} target="_blank" rel="noopener noreferrer" style={{ color: "#f6b87e" }}>
                    {link[1]}
                </a>
            );
        return part;
    });

const listItem = (line: string) => /^(\s*)(?:([-*+])|(\d{1,3})[.)])\s+(.*)$/.exec(line);
const separator = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
const tableCells = (line: string) =>
    line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split(/(?<!\\)\|/)
        .map((cell) => cell.trim().replaceAll("\\|", "|"));

const blocks = (lines: string[], depth = 0): React.ReactNode[] => {
    const output: React.ReactNode[] = [];
    let index = 0;
    while (index < lines.length) {
        const line = lines[index];
        if (!line.trim()) {
            index++;
            continue;
        }
        const key = index;
        if (/^\s*```/.test(line)) {
            const code: string[] = [];
            index++;
            while (index < lines.length && !/^\s*```/.test(lines[index])) code.push(lines[index++]);
            index++;
            output.push(
                <pre key={key} style={{ whiteSpace: "pre-wrap", margin: "8px 0" }}>
                    <code>{code.join("\n")}</code>
                </pre>,
            );
            continue;
        }
        const heading = /^\s*#{1,6}\s+(.+?)\s*#*$/.exec(line);
        if (heading) {
            output.push(
                <h3 key={key} style={{ fontSize: "1em", color: "#f5ba88", margin: "12px 0 6px" }}>
                    {inline(heading[1])}
                </h3>,
            );
            index++;
            continue;
        }
        if (line.includes("|") && separator(lines[index + 1] ?? "")) {
            const headers = tableCells(line);
            const rows: string[][] = [];
            index += 2;
            while (index < lines.length && lines[index].includes("|") && lines[index].trim())
                rows.push(tableCells(lines[index++]));
            const cellStyle: React.CSSProperties = {
                padding: "6px 8px",
                borderBottom: "1px solid #69442b",
                textAlign: "left",
                verticalAlign: "top",
            };
            output.push(
                <div
                    key={key}
                    role="region"
                    aria-label="Comparison"
                    tabIndex={0}
                    style={{ overflowX: "auto", margin: "8px 0" }}
                >
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "inherit" }}>
                        <thead>
                            <tr>
                                {headers.map((header, i) => (
                                    <th key={i} scope="col" style={{ ...cellStyle, color: "#f5ba88" }}>
                                        {inline(header)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, i) => (
                                <tr key={i}>
                                    {headers.map((_, j) => (
                                        <td key={j} style={cellStyle}>
                                            {inline(row[j] ?? "")}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>,
            );
            continue;
        }
        const first = listItem(line);
        if (first) {
            const ordered = Boolean(first[3]);
            const indent = first[1].length;
            const items: React.ReactNode[] = [];
            while (index < lines.length) {
                const item = listItem(lines[index]);
                if (!item || item[1].length !== indent || Boolean(item[3]) !== ordered) break;
                const nested: string[] = [];
                const text = item[4];
                index++;
                while (
                    index < lines.length &&
                    lines[index].trim() &&
                    (lines[index].match(/^\s*/)?.[0].length ?? 0) > indent
                )
                    nested.push(lines[index++]);
                items.push(
                    <li key={items.length} style={{ marginBottom: 5 }}>
                        {inline(text)}
                        {nested.length > 0 && (depth < 6 ? blocks(nested, depth + 1) : nested.join(" "))}
                    </li>,
                );
            }
            output.push(
                ordered ? (
                    <ol key={key} start={Number(first[3])} style={{ paddingLeft: 22, margin: "8px 0" }}>
                        {items}
                    </ol>
                ) : (
                    <ul key={key} style={{ paddingLeft: 20, margin: "8px 0" }}>
                        {items}
                    </ul>
                ),
            );
            continue;
        }
        const paragraph = [line.trim()];
        index++;
        while (
            index < lines.length &&
            lines[index].trim() &&
            !listItem(lines[index]) &&
            !/^\s*(?:#{1,6}\s|```)/.test(lines[index]) &&
            !separator(lines[index + 1] ?? "")
        )
            paragraph.push(lines[index++].trim());
        output.push(
            <p key={key} style={{ margin: "0 0 10px" }}>
                {inline(paragraph.join(" "))}
            </p>,
        );
    }
    return output;
};

export const PremiumAnswer: React.FC<{ text: string }> = ({ text }) => (
    <>{blocks(text.replace(/\r\n?/g, "\n").split("\n"))}</>
);
