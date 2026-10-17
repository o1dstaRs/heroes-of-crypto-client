import { releaseIdlePooledTextures } from "./texturePoolRelease";

/** Release unused GPU allocations while retaining Pixi's pooled texture/source identities. */
export function releaseIdlePixiTextures(renderer?: unknown): void {
    releaseIdlePooledTextures(renderer);
}
