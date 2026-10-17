import { releaseIdlePooledTextures } from "./texturePoolRelease";

/** Release unused GPU allocations while retaining Pixi's pooled texture/source identities. */
export function releaseIdlePixiTextures(): void {
    releaseIdlePooledTextures();
}
