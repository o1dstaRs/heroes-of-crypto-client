import React from "react";

const inline = (text: string): React.ReactNode[] => {
    const parts = text.split(/(\[[^\]]+\]\([^\s)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
        if (part.startsWith("`") && part.endsWith("`"))
            return (
                <code key={index} style={{ fontSize: "0.88em", overflowWrap: "anywhere" }}>
                    {part.slice(1, -1)}
                </code>
            );
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        if (link) {
            try {
                const url = new URL(link[2], window.location.origin);
                if (["https:", "http:"].includes(url.protocol))
                    return (
                        <a key={index} href={url.href} target="_blank" rel="noreferrer" style={{ color: "#f6b87e" }}>
                            {link[1]}
                        </a>
                    );
            } catch {
                /* Invalid links remain text. */
            }
        }
        return part;
    });
};

export const PremiumAnswer: React.FC<{ text: string }> = ({ text }) => (
    <>
        {text.split(/\n\s*\n/).map((block, index) => {
            const lines = block.split("\n");
            if (lines.every((line) => /^[-*] /.test(line)))
                return (
                    <ul key={index} style={{ paddingLeft: 20 }}>
                        {lines.map((line, i) => (
                            <li key={i}>{inline(line.slice(2))}</li>
                        ))}
                    </ul>
                );
            return (
                <p key={index} style={{ margin: "0 0 12px" }}>
                    {inline(block.replace(/^#{1,4} /, ""))}
                </p>
            );
        })}
    </>
);
