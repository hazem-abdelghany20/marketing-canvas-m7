import { ApiError } from "../api/client";
import type { AppState, AppStore } from "./state";

export interface Mutation<R> {
  /** The optimistic guess, applied before the request goes out. */
  apply?: (state: AppState) => Partial<AppState>;
  request: () => Promise<R>;
  /** Replace the guess with what the server actually returned. */
  commit: (state: AppState, result: R) => Partial<AppState>;
  /** Undo exactly what `apply` did, touching nothing else. */
  rollback: (state: AppState) => Partial<AppState>;
}

/**
 * The one path every cache write takes. The API is the system of record: a
 * success reconciles to the server's object, a failure restores the cache and
 * rethrows so the caller can report it.
 */
export async function mutate<R>(store: AppStore, mutation: Mutation<R>): Promise<R> {
  if (mutation.apply) store.setState(mutation.apply(store.getState()));
  let result: R;
  try {
    result = await mutation.request();
  } catch (error) {
    store.setState(mutation.rollback(store.getState()));
    throw toApiError(error);
  }
  store.setState(mutation.commit(store.getState(), result));
  return result;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError(0, "client_error", "Something went wrong on this page. Reload and try again.");
}

export function notFound(what: string): ApiError {
  return new ApiError(404, `${what}_not_found`, `That ${what} doesn't exist any more. It may have been deleted.`);
}
