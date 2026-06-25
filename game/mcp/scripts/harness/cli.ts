import type { HarnessActorConfig, HarnessScenario, HarnessStyle } from "./types";
import type { TeamName } from "../../src/types";

export const parseArgs = (argv: string[] = Bun.argv.slice(2)): Map<string, string | boolean> => {
    const parsed = new Map<string, string | boolean>();
    for (const arg of argv) {
        if (!arg.startsWith("--")) {
            parsed.set(arg, true);
            continue;
        }
        const [key, ...valueParts] = arg.slice(2).split("=");
        parsed.set(key, valueParts.length ? valueParts.join("=") : true);
    }
    return parsed;
};

export const stringArg = (
    args: Map<string, string | boolean>,
    name: string,
    fallback: string,
): string => {
    const value = args.get(name);
    return typeof value === "string" ? value : fallback;
};

export const numberArg = (
    args: Map<string, string | boolean>,
    name: string,
    fallback: number,
): number => {
    const value = args.get(name);
    if (typeof value !== "string") {
        return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

export const boolArg = (
    args: Map<string, string | boolean>,
    name: string,
    fallback: boolean,
): boolean => {
    const value = args.get(name);
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "string") {
        return value !== "0" && value !== "false";
    }
    return fallback;
};

export const parseList = (value: string): string[] =>
    value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);

export const parseScenario = (value: string): HarnessScenario => {
    if (
        value === "draft" ||
        value === "quickstart" ||
        value === "approach" ||
        value === "priority_targets" ||
        value === "spell_duel" ||
        value === "summon_duel"
    ) {
        return value;
    }
    throw new Error(`Unknown scenario: ${value}`);
};

export const parseStyle = (value: string): HarnessStyle => {
    if (value === "balanced" || value === "aggressive" || value === "defensive") {
        return value;
    }
    throw new Error(`Unknown style: ${value}`);
};

export const parseActor = (
    value: string,
    team: TeamName,
    defaults: {
        modelApiBase: string;
        modelName: string;
        style: HarnessStyle;
        timeoutMs: number;
    },
): HarnessActorConfig => {
    if (value === "builtin") {
        return {
            team,
            controller: "builtin",
            style: defaults.style,
            timeoutMs: defaults.timeoutMs,
        };
    }

    const [controller, modelName] = value.split(":");
    if (controller !== "model") {
        throw new Error(`Unknown actor "${value}". Use "builtin" or "model[:name]".`);
    }

    return {
        team,
        controller: "model",
        modelName: modelName || defaults.modelName,
        modelApiBase: defaults.modelApiBase,
        style: defaults.style,
        timeoutMs: defaults.timeoutMs,
    };
};
