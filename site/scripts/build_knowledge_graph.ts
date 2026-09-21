#!/usr/bin/env bun
/**
 * Compiles the Knowledge Graph and writes it next to the built site as `dist/knowledge-graph.json`.
 *
 * Runs after `astro build` (see the `build` script in package.json): the rules prose is read from the
 * rendered Knowledge Base pages, everything else comes straight from the data modules. The file ships
 * with the site, so every site deploy republishes the knowledge the AI search answers from — the same
 * commit, the same numbers the codex pages show.
 *
 *   bun scripts/build_knowledge_graph.ts            # default: <site>/dist
 *   KNOWLEDGE_GRAPH_DIST=/path/to/dist bun scripts/build_knowledge_graph.ts
 */

import { resolve } from "node:path";

import { buildKnowledgeGraph } from "../src/lib/knowledge/graph-builder";
import type { KnowledgeGraph } from "../src/lib/knowledge/graph-types";

const siteRoot = resolve(import.meta.dir, "..");
const distDir = resolve(process.env.KNOWLEDGE_GRAPH_DIST ?? resolve(siteRoot, "dist"));
const outFile = resolve(distDir, "knowledge-graph.json");

async function readRendered(relativePath: string): Promise<string> {
    const file = Bun.file(resolve(distDir, relativePath));
    if (!(await file.exists())) {
        throw new Error(
            `${relativePath} is missing under ${distDir}; run \`astro build\` before building the knowledge graph`,
        );
    }
    return file.text();
}

async function gitShortHead(cwd: string): Promise<string | undefined> {
    try {
        const proc = Bun.spawn(["git", "rev-parse", "--short", "HEAD"], { cwd, stdout: "pipe", stderr: "ignore" });
        const output = (await new Response(proc.stdout).text()).trim();
        await proc.exited;
        return proc.exitCode === 0 && output ? output : undefined;
    } catch {
        return undefined;
    }
}

function validate(graph: KnowledgeGraph): void {
    const ids = new Set<string>();
    for (const node of graph.nodes) {
        if (ids.has(node.id)) throw new Error(`duplicate node id ${node.id}`);
        ids.add(node.id);
        if (!node.text.trim()) throw new Error(`node ${node.id} has no text`);
    }
    for (const edge of graph.edges) {
        if (!ids.has(edge.from) || !ids.has(edge.to)) throw new Error(`dangling edge ${edge.from} -> ${edge.to}`);
    }
    const rules = graph.nodes.filter((node) => node.type === "rule");
    if (rules.length < 10)
        throw new Error(`only ${rules.length} rule sections were extracted; the rendered page changed shape?`);
    if (rules.some((node) => !node.textRu)) throw new Error("a rule section has no Russian text");
    if (graph.nodes.length < 300) throw new Error(`graph is suspiciously small: ${graph.nodes.length} nodes`);
}

const [en, ru] = await Promise.all([
    readRendered("knowledge-base/index.html"),
    readRendered("ru/knowledge-base/index.html"),
]);
const graph = buildKnowledgeGraph({
    rulesHtml: { en, ru },
    clientCommit: await gitShortHead(resolve(siteRoot, "..")),
    commonCommit: await gitShortHead(resolve(siteRoot, "..", "game", "heroes-of-crypto-common")),
});
validate(graph);

const json = JSON.stringify(graph);
await Bun.write(outFile, json);

const kb = (json.length / 1024).toFixed(0);
const summary = Object.entries(graph.counts)
    .filter(([key]) => key !== "nodes" && key !== "edges")
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
console.log(
    `knowledge graph: ${graph.counts.nodes} nodes, ${graph.counts.edges} edges (${summary}), ${kb} KB → ${outFile}`,
);
