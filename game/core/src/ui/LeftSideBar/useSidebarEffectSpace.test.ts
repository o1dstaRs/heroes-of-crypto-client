import { expect, test } from "bun:test";
import { fitSidebarBuffRows } from "./useSidebarEffectSpace";

test("a More Time footer leaves one complete buff row and room for debuffs", () => {
    const row = 90;
    const spaceBetweenBuffsAndFooter = 234;
    const debuffsAndHeadings = 122;
    const height = fitSidebarBuffRows(row, spaceBetweenBuffsAndFooter - debuffsAndHeadings);
    expect(height).toBe(row);
    expect(height + debuffsAndHeadings).toBeLessThan(spaceBetweenBuffsAndFooter);
});

test("spare space permits two rows without growing beyond two", () => {
    expect(fitSidebarBuffRows(40.2, 85)).toBe(80.4);
    expect(fitSidebarBuffRows(40.2, 500)).toBe(80.4);
});

test("a partial second row is not exposed and a tiny viewport keeps a complete minimum row", () => {
    expect(fitSidebarBuffRows(90, 175)).toBe(90);
    expect(fitSidebarBuffRows(90, -15)).toBe(90);
});
