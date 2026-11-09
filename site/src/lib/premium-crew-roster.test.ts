import { expect, test } from "bun:test";
import { premiumCatalog } from "./premium-catalog";
import { samplePremiumCrew } from "./premium-crew";
import { renderPremiumCrewRoster } from "./premium-crew-roster";
import type { PremiumLibrary } from "./premium-library";

test("all icons remain usable without inventing scores or recommendation badges when SQLite has no results", () => {
    const catalog = premiumCatalog("en");
    const crew = samplePremiumCrew(null, catalog);
    const html = renderPremiumCrewRoster(crew, 0, catalog);
    expect(html.match(/data-crew-roster-pick=/g)).toHaveLength(56);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(6);
    expect(html).not.toContain('class="premium-crew-roster-rank"');
    expect(html).toContain("Battle score %");
    expect(html).toContain("Not enough games to recommend picks yet");
    expect(html).not.toContain("Crew fit");
    expect(html).toContain("No games");
    expect(html).not.toContain("<dialog");
    expect(renderPremiumCrewRoster(crew, 4, premiumCatalog("ru"), undefined, "ru")).toContain("Результат %");
});

test("a displayed percentage is the actual score, with its independent sample and interval available", () => {
    const catalog = premiumCatalog("en");
    const data = {
        units: [
            {
                key: "47",
                ids: [47],
                score: 0.586,
                families: 250,
                observations: 324,
                interval: [0.5, 0.67],
                frequency: 0.4,
            },
        ],
    } as PremiumLibrary;
    const html = renderPremiumCrewRoster([], 0, catalog, data);
    expect(html).toContain("58.6%");
    expect(html).toContain("n=250");
    expect(html).toContain("95% interval 50.0%–67.0%");
    const percentages = [...html.matchAll(/class="premium-crew-roster-percent">([^<]+)/g)].map((match) => match[1]);
    expect(percentages[0]).toBe("58.6%");
    expect(percentages.slice(1).every((value) => value === "—")).toBe(true);
    expect(html.match(/class="premium-crew-roster-rank"/g)).toHaveLength(1);
});
