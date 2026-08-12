import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dir, "..");
const packageJson = JSON.parse(await readFile(resolve(workspaceRoot, "package.json"), "utf8")) as {
    workspaces?: string[];
};
const packageRoots = packageJson.workspaces ?? [];
const testFileGlobs = [
    new Bun.Glob("**/*.{test,spec}.{js,jsx,mjs,cjs,ts,tsx}"),
    new Bun.Glob("**/{test_*.py,*_test.py,*.test.py,*.spec.py}"),
];
const forbiddenSkip =
    /\b(?:xdescribe|xit|xtest)\s*\(|\b(?:test|it|describe|suite)\s*\.\s*(?:skip|todo|skipIf|todoIf)\s*\(|\b(?:skip|todo)\s*:\s*true\b|@(?:unittest\.)?skip(?:If|Unless)?\s*\(|\bpytest\.mark\.skip(?:if)?\b|\bself\.skipTest\s*\(/;
const violations: string[] = [];

for (const packageRoot of packageRoots) {
    const absolutePackageRoot = resolve(workspaceRoot, packageRoot);
    const testFiles = new Set<string>();
    for (const testFileGlob of testFileGlobs) {
        for await (const filePath of testFileGlob.scan({ cwd: absolutePackageRoot, onlyFiles: true })) {
            if (filePath.split("/").some((part) => part === "node_modules" || part === "dist" || part === ".git")) {
                continue;
            }
            testFiles.add(filePath);
        }
    }
    for (const filePath of testFiles) {
        const absoluteFilePath = resolve(absolutePackageRoot, filePath);
        const lines = (await readFile(absoluteFilePath, "utf8")).split("\n");
        for (const [index, line] of lines.entries()) {
            if (forbiddenSkip.test(line)) {
                violations.push(`${relative(workspaceRoot, absoluteFilePath)}:${index + 1}: ${line.trim()}`);
            }
        }
    }
}

if (violations.length) {
    console.error("Skipped or todo tests are not allowed:\n" + violations.join("\n"));
    process.exit(1);
}

console.log("Test skip check passed: all package tests are enabled.");
