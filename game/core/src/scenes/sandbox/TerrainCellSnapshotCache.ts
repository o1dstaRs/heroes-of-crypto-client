/** A tiny structural view of transient terrain stores from the shared engine. */
export interface RevisionedTerrainCellStore<TCell> {
    getRevision(): number;
    toJSON(): TCell[];
}

/**
 * Keeps the latest immutable render snapshot for an animated terrain layer.
 *
 * The layer still advances every frame; only the engine-store serialization is skipped until its
 * revision changes. Replacing a store (as ranked snapshot hydration does) always refreshes the data.
 */
export class TerrainCellSnapshotCache<TCell> {
    private store?: RevisionedTerrainCellStore<TCell>;
    private revision = -1;
    private cells: readonly TCell[] = [];
    public get(store: RevisionedTerrainCellStore<TCell>): readonly TCell[] {
        const revision = store.getRevision();
        if (this.store !== store || this.revision !== revision) {
            this.store = store;
            this.revision = revision;
            this.cells = store.toJSON();
        }
        return this.cells;
    }
}
