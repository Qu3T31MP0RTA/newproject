export type CasErrorCode =
  | 'UNSUPPORTED_EXPRESSION'
  | 'UNSUPPORTED_OPERATION'
  | 'CAS_UNSUPPORTED_DERIVATIVE'
  | 'CAS_UNSUPPORTED_INTEGRAL'
  | 'CAS_UNSUPPORTED_LIMIT'
  | 'CAS_TAYLOR_DOMAIN_ERROR'
  | 'CAS_SERIES_DOMAIN_ERROR'
  | 'INVALID_TAYLOR_ORDER'
  | 'TAYLOR_ORDER_LIMIT'
  | 'CAS_LIMIT_DOMAIN_ERROR'
  | 'INVALID_LIMIT_DIRECTION'
  | 'INVALID_VARIABLE'
  | 'DIVISION_BY_ZERO'
  | 'TOO_COMPLEX'
  | 'ITERATION_LIMIT'
  | 'UNSUPPORTED_POLYNOMIAL_DEGREE'
  | 'NOT_IMPLEMENTED';

export interface CasError {
  readonly code: CasErrorCode;
  readonly message: string;
  readonly detail?: string;
  readonly functionName?: string;
}

export function createCasError(
  code: CasErrorCode,
  message: string,
  detail?: string,
  functionName?: string
): CasError {
  return {
    code,
    message,
    ...(detail ? { detail } : {}),
    ...(functionName ? { functionName } : {}),
  };
}
