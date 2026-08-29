/**
 * QA footprint overrides straight from the URL, so a rectangular-body session survives a reload:
 * `?footprints=White Tiger=1x2,Peasant=2x1` installs the engine's `__hocFootprintOverrides` global
 * before any scene constructs a unit. Same string format the engine parses (config_provider); the
 * mounted class already ships 2x1 from creatures.json, so this is for QA-ing shapes the catalog does
 * NOT ship. Distinct from the framing editor's `?footprint=WxH`, which SELECTS a shape and lends it
 * by authored art width.
 */
export const FOOTPRINT_OVERRIDES_QUERY_PARAM = "footprints";

export const installFootprintOverridesFromSearch = (search: string): string | undefined => {
    const value = new URLSearchParams(search).get(FOOTPRINT_OVERRIDES_QUERY_PARAM);
    if (!value) {
        return undefined;
    }
    (globalThis as { __hocFootprintOverrides?: string }).__hocFootprintOverrides = value;
    return value;
};
