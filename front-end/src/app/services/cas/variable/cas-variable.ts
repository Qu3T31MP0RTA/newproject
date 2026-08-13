import { createCasError } from '../errors/cas-errors';
import { casFailure, casSuccess, type CasResult } from '../result/cas-result';

const VARIABLE_PATTERN = /^[A-Za-zπ][A-Za-z0-9π]*$/;

const RESERVED_VARIABLES = new Set([
  'pi',
  'π',
  'e',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'asec',
  'acsc',
  'acot',
  'sinh',
  'cosh',
  'tanh',
  'sech',
  'csch',
  'coth',
  'asinh',
  'acosh',
  'atanh',
  'asech',
  'acsch',
  'acoth',
  'ln',
  'log',
  'sqrt',
  'cbrt',
  'abs',
  'sign',
  'floor',
  'ceil',
  'exp',
  'expe',
  'yroot',
  'logxy',
  'pow',
  'mod',
  'deg',
  'dms',
  'factorial',
  'xylog',
  '%',
]);

export function validateCasVariable(variable: unknown): CasResult<string> {
  if (typeof variable !== 'string') {
    return casFailure(
      createCasError(
        'INVALID_VARIABLE',
        'La variable de derivación no es válida.'
      )
    );
  }

  const normalized = variable.trim();
  if (!normalized || !VARIABLE_PATTERN.test(normalized)) {
    return casFailure(
      createCasError(
        'INVALID_VARIABLE',
        'La variable de derivación no es válida.'
      )
    );
  }

  if (RESERVED_VARIABLES.has(normalized)) {
    return casFailure(
      createCasError(
        'INVALID_VARIABLE',
        'La variable de derivación no puede ser una constante o función reservada.'
      )
    );
  }

  return casSuccess(normalized);
}

export function normalizeCasVariableName(variable: unknown): string | null {
  if (typeof variable !== 'string') {
    return null;
  }

  const normalized = variable.trim();
  if (!normalized || !VARIABLE_PATTERN.test(normalized)) {
    return null;
  }

  if (RESERVED_VARIABLES.has(normalized)) {
    return null;
  }

  return normalized;
}
