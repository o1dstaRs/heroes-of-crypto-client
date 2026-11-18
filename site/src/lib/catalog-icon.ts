import versions from "./generated/catalog-icon-versions.json";

/** Image URLs must change with their bytes: the website serves flat art with a one-day browser cache. */
export const catalogIconUrl = (path: string): string => {
    const version = (versions as Record<string, string>)[path];
    return version ? `${path}?v=${version}` : path;
};
