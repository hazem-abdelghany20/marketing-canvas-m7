/** Collections are cached as id → entity maps, in the order the API returned them. */
export type ById<T> = Record<string, T>;

export function byId<T extends { id: string }>(list: T[]): ById<T> {
  return Object.fromEntries(list.map((item) => [item.id, item]));
}

export function omit<T>(record: ById<T>, ids: Iterable<string>): ById<T> {
  const drop = new Set(ids);
  return Object.fromEntries(Object.entries(record).filter(([id]) => !drop.has(id)));
}

/** Puts removed entities back where they were, so a rollback keeps z-order intact. */
export function reinsert<T>(current: ById<T>, removed: ById<T>, order: string[]): ById<T> {
  const out: ById<T> = {};
  for (const id of order) {
    const item = current[id] ?? removed[id];
    if (item !== undefined) out[id] = item;
  }
  for (const [id, item] of Object.entries(current)) {
    if (!(id in out)) out[id] = item;
  }
  return out;
}
