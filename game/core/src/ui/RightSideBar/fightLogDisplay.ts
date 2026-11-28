import { getLanguage, t, tf } from "../../i18n/i18n";

const valuePatterns = [
    [/^— Lap (\d+)$/i, "— Lap {value}"],
    [/^Lap (\d+) started!?$/i, "Lap {value} started"],
    [/^moved to (\([\d, ]+\))$/i, "moved to {value}"],
    [/^spawned at (\([\d, ]+\))$/i, "spawned at {value}"],
    [/^healed for ([\d.,]+)$/i, "healed for {value}"],
] as const;

/** Localize the rendered row while keeping the original line available for replay grouping and export. */
export function fightLogDisplay(text: string): string {
    if (getLanguage() !== "ru") return text;
    const value = text.trim();
    const translated = t(value);
    if (translated !== value) return text.replace(value, translated);

    for (const [pattern, template] of valuePatterns) {
        const match = pattern.exec(value);
        if (match) return text.replace(value, tf(template, { value: match[1] }));
    }

    const status = /^(gains|suffers|got) (.+?)(?: for ([\d.,]+) laps?)?$/i.exec(value);
    if (status) {
        const name = t(status[2]);
        if (name !== status[2]) {
            const result = status[3]
                ? tf("gets {status} for {laps} laps", { status: name, laps: status[3] })
                : tf("gets {status}", { status: name });
            return text.replace(value, result);
        }
    }

    const damage = /^takes ([\d.,]+) damage(?: from (.+?))?(\s*💀\s*\d+)?$/i.exec(value);
    if (damage) {
        const amount = damage[1];
        const result = damage[2]
            ? tf("takes {amount} damage from {source}", { amount, source: t(damage[2]) })
            : tf("takes {amount} damage", { amount });
        return text.replace(value, result + (damage[3] ?? ""));
    }

    const cast = /^casts? (.+?)(?: (on|at) (.+))?$/i.exec(value);
    if (cast) {
        const spell = t(cast[1]);
        if (spell !== cast[1]) {
            const result = cast[3]
                ? tf(cast[2] === "at" ? "casts {spell} at {target}" : "casts {spell} on {target}", {
                      spell,
                      target: t(cast[3]),
                  })
                : tf("casts {spell}", { spell });
            return text.replace(value, result);
        }
    }

    const strike = /^(resp )?(⚔️?|🏹) (.+?) (\([\d.,]+\)(?:\s*💀\s*\d+)?)$/u.exec(value);
    if (strike) {
        const response = strike[1] ? t("counterattack") + " " : "";
        return text.replace(value, `${response}${strike[2]} ${t(strike[3])} ${strike[4]}`);
    }
    return text;
}
