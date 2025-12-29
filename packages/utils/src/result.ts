/**
 * Result type for operations that can fail
 * Similar to Rust's Result<T, E>
 */

export type Result<T, E = Error> = Success<T> | Failure<E>;

export interface Success<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Failure<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * Create a success result
 */
export function success<T>(value: T): Success<T> {
  return { ok: true, value };
}

/**
 * Create a failure result
 */
export function failure<E>(error: E): Failure<E> {
  return { ok: false, error };
}

/**
 * Check if result is success
 */
export function isSuccess<T, E>(result: Result<T, E>): result is Success<T> {
  return result.ok;
}

/**
 * Check if result is failure
 */
export function isFailure<T, E>(result: Result<T, E>): result is Failure<E> {
  return !result.ok;
}

/**
 * Unwrap a result, throwing if it's a failure
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
}

/**
 * Unwrap a result with a default value
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (result.ok) {
    return result.value;
  }
  return defaultValue;
}

/**
 * Unwrap a result with a default value from a function
 */
export function unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T {
  if (result.ok) {
    return result.value;
  }
  return fn(result.error);
}

/**
 * Map a success value
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (result.ok) {
    return success(fn(result.value));
  }
  return result;
}

/**
 * Map an error value
 */
export function mapError<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (!result.ok) {
    return failure(fn(result.error));
  }
  return result;
}

/**
 * Flat map (chain) a result
 */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (result.ok) {
    return fn(result.value);
  }
  return result;
}

/**
 * Try to execute a function and return a Result
 */
export function tryCatch<T>(fn: () => T): Result<T, Error> {
  try {
    return success(fn());
  } catch (error) {
    return failure(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Try to execute an async function and return a Result
 */
export async function tryCatchAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    return success(await fn());
  } catch (error) {
    return failure(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Combine multiple results into one
 * Returns first failure or success with all values
 */
export function combine<T extends readonly Result<unknown, unknown>[]>(
  results: [...T]
): Result<
  { [K in keyof T]: T[K] extends Result<infer V, unknown> ? V : never },
  T[number] extends Result<unknown, infer E> ? E : never
> {
  const values: unknown[] = [];

  for (const result of results) {
    if (!result.ok) {
      return result as Failure<T[number] extends Result<unknown, infer E> ? E : never>;
    }
    values.push(result.value);
  }

  return success(values) as Success<{
    [K in keyof T]: T[K] extends Result<infer V, unknown> ? V : never;
  }>;
}

/**
 * Execute a result and handle both cases
 */
export function match<T, E, R>(
  result: Result<T, E>,
  handlers: {
    success: (value: T) => R;
    failure: (error: E) => R;
  }
): R {
  if (result.ok) {
    return handlers.success(result.value);
  }
  return handlers.failure(result.error);
}
