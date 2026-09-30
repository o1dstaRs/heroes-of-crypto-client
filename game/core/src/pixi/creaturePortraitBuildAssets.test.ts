import { describe, expect, test } from "bun:test";
import { verifyCreaturePortraitBuildAssets } from "./verifyCreaturePortraitBuildAssets";
import { REQUIRED_FULL_BODY_PORTRAIT_SOURCES } from "./creaturePortraitAssetKeys";

const imageMap = (keys: string[], extraTypes: string[] = []): string =>
    `export type ImageKey = ${[...keys, ...extraTypes].map((key) => JSON.stringify(key)).join(" | ")};\n` +
    `export const images = {\n${keys.map((key) => `    "${key}": new URL("${key}.webp", import.meta.url).toString(),`).join("\n")}\n} as unknown as Readonly<Record<ImageKey, string>>;`;

const preferredKeys = Object.values(REQUIRED_FULL_BODY_PORTRAIT_SOURCES).map(([key]) => key);

describe("release portrait source guard", () => {
    test("accepts every approved preferred source in the actual image object", () => {
        expect(() => verifyCreaturePortraitBuildAssets(imageMap(preferredKeys))).not.toThrow();
    });

    test("accepts the existing Efreet and Mantis version fallbacks", () => {
        const keys = preferredKeys.map((key) =>
            key === "efreet_portrait_full_v7"
                ? "efreet_portrait_full_v5"
                : key === "mantis_portrait_full_v3"
                  ? "mantis_portrait_full_v2"
                  : key,
        );
        expect(() => verifyCreaturePortraitBuildAssets(imageMap(keys))).not.toThrow();
    });

    test("rejects each required source even when its type and legacy fallback remain", () => {
        for (const [name, alternatives] of Object.entries(REQUIRED_FULL_BODY_PORTRAIT_SOURCES)) {
            const fallback = `${name.toLowerCase().replaceAll(" ", "_")}_512`;
            const keys = [...preferredKeys.filter((key) => !alternatives.includes(key)), fallback];
            expect(() => verifyCreaturePortraitBuildAssets(imageMap(keys, [...alternatives]))).toThrow(name);
        }
    });

    test("rejects a catalog or synthetic lookup without actual URL entries", () => {
        expect(() => verifyCreaturePortraitBuildAssets(JSON.stringify(preferredKeys))).toThrow("portrait sources");
        expect(() => verifyCreaturePortraitBuildAssets("export const images = new Proxy({}, {});")).toThrow(
            "portrait sources",
        );
    });
});
