import { expect, test } from "bun:test";

test("an open Mac game refreshes only the browser stores affected by its settings window", () => {
    // Load the actual stores in a fresh process so their window listeners and caches belong to this test.
    const result = Bun.spawnSync(
        [
            process.execPath,
            "--eval",
            `
                import assert from "node:assert/strict";

                const values = new Map();
                let writes = 0;
                Object.assign(globalThis, {
                    window: new EventTarget(),
                    document: { documentElement: { lang: "" } },
                    location: { search: "?vol=0.44&muted=1" },
                    localStorage: {
                        getItem: (key) => values.get(key) ?? null,
                        setItem: (key, value) => { writes++; values.set(key, value); },
                    },
                });

                const audio = await import("./audioLevels");
                const idle = await import("./idleTiming");
                const premium = await import("./premiumPreferences");
                const language = await import("../i18n/i18n");
                const nativeEdit = (entries) => {
                    for (const [key, value] of Object.entries(entries)) values.set(key, value);
                    window.dispatchEvent(new CustomEvent("hoc:mac-preferences", { detail: Object.keys(entries) }));
                };

                nativeEdit({ "hoc:language": "ru" });
                assert.equal(language.getLanguage(), "ru");
                assert.equal(document.documentElement.lang, "ru");
                assert.equal(language.t("Settings"), "Настройки");
                assert.equal(writes, 0);
                assert.equal(audio.getAudioLevels().musicVolume, 0.44);
                assert.equal(audio.getAudioLevels().musicMuted, true);
                assert.equal(values.get("hoc:themeVolume"), "0.44");

                premium.setPremiumPreference("enabled", true);
                premium.setPremiumPreference("suggestedMoves", true);
                premium.setPremiumPreference("chat", false);
                let audioUpdates = 0, idleUpdates = 0, premiumUpdates = 0;
                audio.subscribeAudioLevels(() => audioUpdates++);
                idle.subscribeStaggerDuplicateIdle(() => idleUpdates++);
                premium.subscribePremiumPreferences(() => premiumUpdates++);
                const beforeEdits = writes;

                nativeEdit({
                    "hoc:soundVolume": "0.6",
                    "hoc:themeVolume": "0.71",
                    "hoc:themeMuted": "0",
                    "hoc:effectsVolume": "0.80",
                    "hoc:effectsMuted": "1",
                    "hoc:staggerDuplicateIdle": "0",
                    "hoc.premium.enabled": "true",
                    "hoc.premium.suggestedMoves": "false",
                });
                assert.deepEqual(audio.getAudioLevels(), {
                    masterVolume: 0.6, masterMuted: false, musicVolume: 0.71,
                    musicMuted: false, effectsVolume: 0.80, effectsMuted: true,
                });
                assert.equal(audio.effectsGain(), 0);
                assert.equal(idle.duplicateIdleOffsetMs(2), 0);
                assert.equal(premium.getPremiumCapability("suggestedMoves"), false);
                assert.equal(premium.getPremiumPreference("chat"), false);

                nativeEdit({ "hoc.premium.enabled": "false", "hoc:language": "en" });
                assert.equal(premium.getPremiumCapability("draft"), false);
                assert.equal(document.documentElement.lang, "en");
                nativeEdit({ "hoc.ranked.boardSide": "right" });
                assert.deepEqual([audioUpdates, idleUpdates, premiumUpdates], [1, 1, 2]);
                assert.equal(writes, beforeEdits);
            `,
        ],
        { cwd: import.meta.dir, stdout: "pipe", stderr: "pipe" },
    );
    expect(result.exitCode, result.stderr.toString()).toBe(0);
});
