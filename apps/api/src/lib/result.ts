/**
 * Result Type Wrapper
 * Type-safe error handling using neverthrow pattern
 */

import { Result, ResultAsync, ok, err, okAsync, errAsync } from 'neverthrow';
import { AppError, ErrorCode, type ErrorCodeType } from './errors.js';

export type AppResult<T> = Result<T, AppError>;
export type AsyncAppResult<T> = ResultAsync<T, AppError>;

export { ok, err, okAsync, errAsync };

export function tryCatch<T>(
  fn: () => T,
  errorCode: ErrorCodeType = ErrorCode.SYSTEM_ERROR
): AppResult<T> {
  try {
    return ok(fn());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return err(new AppError({ code: errorCode, message, cause: error instanceof Error ? error : undefined }));
  }
}

export function tryCatchAsync<T>(
  fn: () => Promise<T>,
  errorCode: ErrorCodeType = ErrorCode.SYSTEM_ERROR
): AsyncAppResult<T> {
  return ResultAsync.fromPromise(fn(), (error) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new AppError({ code: errorCode, message, cause: error instanceof Error ? error : undefined });
  });
}
