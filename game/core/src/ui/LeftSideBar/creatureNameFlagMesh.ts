/** Static material grid: enough samples for smooth diagonal folds, uploaded once rather than per frame. */
export function createCreatureFlagMesh(columns = 96, rows = 12) {
    const vertices = new Float32Array((columns + 1) * (rows + 1) * 2);
    const indices = new Uint16Array(columns * rows * 6);
    let vertex = 0;
    let index = 0;
    for (let row = 0; row <= rows; row++) {
        for (let column = 0; column <= columns; column++) {
            vertices[vertex++] = column / columns;
            vertices[vertex++] = row / rows;
            if (row < rows && column < columns) {
                const a = row * (columns + 1) + column;
                const b = a + columns + 1;
                indices.set([a, b, a + 1, a + 1, b, b + 1], index);
                index += 6;
            }
        }
    }
    return { vertices, indices };
}
