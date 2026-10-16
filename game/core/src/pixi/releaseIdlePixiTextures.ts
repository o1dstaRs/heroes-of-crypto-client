import { releaseIdlePooledTextures } from "./texturePoolRelease";

/** Release unused GPU targets without invalidating textures still borrowed by canvas text. */
export function releaseIdlePixiTextures(): void {
    releaseIdlePooledTextures();
}
