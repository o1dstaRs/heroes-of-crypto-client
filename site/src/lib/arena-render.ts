/** Poll timestamps and loading indicators do not change an already rendered arena panel. */
export function arenaPanelRenderKey<
    T extends {
        top?: { computedAt: number };
        standings?: { computedAt: number };
        games?: { computedAt: number };
        myBets: ReadonlyMap<string, unknown>;
        loading: ReadonlySet<string>;
        errors: ReadonlySet<string>;
        cached: ReadonlySet<string>;
        lastSuccessfulAt: number;
    },
>(state: T, viewer: { loggedIn: boolean; playing: boolean }): string {
    const data = (value: { computedAt: number } | undefined) => {
        if (!value) return null;
        const { computedAt: _computedAt, ...content } = value;
        return content;
    };
    return JSON.stringify({
        ...state,
        top: data(state.top),
        standings: data(state.standings),
        games: data(state.games),
        myBets: [...state.myBets],
        loading: undefined,
        errors: undefined,
        cached: undefined,
        lastSuccessfulAt: undefined,
        missing: ["top", "standings", "games"].map((resource) =>
            state[resource as "top" | "standings" | "games"]
                ? null
                : [resource, state.loading.has(resource), state.errors.has(resource)],
        ),
        viewer,
    });
}
