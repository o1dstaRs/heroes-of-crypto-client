import { buildKnowledgeGraph } from "../lib/knowledge/graph-builder";

export function GET() {
    const entries = buildKnowledgeGraph().nodes.map(({ id, name, nameRu, type, href, hrefRu, text, textRu }) => ({
        id,
        name,
        nameRu,
        type,
        href,
        hrefRu,
        text,
        textRu,
    }));
    return Response.json({ entries });
}
