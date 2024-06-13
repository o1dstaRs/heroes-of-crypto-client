export function removeFromArray<T>(list: T[], value: T) {
    const index = list.indexOf(value);
    if (index >= 0) list.splice(index, 1);
}
