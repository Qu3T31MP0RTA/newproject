import {
  binaryNode,
  functionCallNode,
  numberNode,
  symbolNode,
  type CasMetadata,
  type CasExpression,
  unaryNode,
} from '../ast/cas-ast';
import { createCasError } from '../errors/cas-errors';
import { DEFAULT_CAS_LIMITS, resolveCasLimits, type CasLimits } from '../limits/cas-limits';
import { casFailure, casSuccess, type CasResult } from '../result/cas-result';
import { formatCasExpression } from '../format/cas-formatter';
import { simplifyCasExpression } from '../simplify/cas-simplifier';
import type { CasTextResult } from '../simplify/cas-simplifier';
import { buildExactDivision, buildExactRationalExpression } from '../rational/cas-rational';
import { differentiateCasExpression } from '../differentiate/cas-differentiator';
import { containsVariable, substituteCasExpression } from '../solve/cas-substitution';
import { validateCasVariable } from '../variable/cas-variable';
import type { CasOperationOptions } from '../differentiate/cas-differentiator';

export const MAX_TAYLOR_ORDER = 12;

export function taylorCasExpression(
  expression: CasExpression,
  variable: string,
  center: CasExpression,
  order: number,
  options: CasOperationOptions = {}
): CasResult<CasExpression> {
  const normalizedVariable = validateCasVariable(variable);
  if (!normalizedVariable.ok) {
    return normalizedVariable;
  }

  const normalizedOrder = validateTaylorOrder(order);
  if (!normalizedOrder.ok) {
    return normalizedOrder;
  }

  const limits = resolveCasLimits(options.limits ?? DEFAULT_CAS_LIMITS);
  const simplifiedExpression = simplifyCasExpression(expression, { limits });
  if (!simplifiedExpression.ok) {
    return simplifiedExpression;
  }

  const normalizedCenter = exactifyTaylorExpression(center, limits);
  if (!normalizedCenter.ok) {
    return normalizedCenter;
  }

  if (containsVariable(normalizedCenter.value, normalizedVariable.value)) {
    return casFailure(
      createCasError(
        'CAS_TAYLOR_DOMAIN_ERROR',
        'La serie no puede construirse en ese punto dentro del dominio real soportado.'
      )
    );
  }

  const result = buildTaylorPolynomial(
    simplifiedExpression.value,
    normalizedVariable.value,
    normalizedCenter.value,
    normalizedOrder.value,
    limits
  );
  if (!result.ok) {
    return result;
  }

  return casSuccess(result.value);
}

export function taylorCasText(
  source: string,
  variable: string,
  centerSource: string,
  order: number,
  parser: { parse(source: string): CasResult<CasExpression> },
  options: CasOperationOptions = {}
): CasResult<CasTextResult> {
  const parsed = parser.parse(source);
  if (!parsed.ok) {
    return parsed;
  }

  const center = parser.parse(centerSource);
  if (!center.ok) {
    return center;
  }

  const result = taylorCasExpression(parsed.value, variable, center.value, order, options);
  if (!result.ok) {
    return result;
  }

  return casSuccess({
    expression: result.value,
    text: formatCasExpression(result.value),
    latex: formatCasExpression(result.value),
  }, buildSeriesMetadata('taylor', variable, center.value, order, result.value));
}

export function maclaurinCasExpression(
  expression: CasExpression,
  variable: string,
  order: number,
  options: CasOperationOptions = {}
): CasResult<CasExpression> {
  return taylorCasExpression(expression, variable, numberNode(0), order, options);
}

export function maclaurinCasText(
  source: string,
  variable: string,
  order: number,
  parser: { parse(source: string): CasResult<CasExpression> },
  options: CasOperationOptions = {}
): CasResult<CasTextResult> {
  const result = taylorCasText(source, variable, '0', order, parser, options);
  if (!result.ok) {
    return result;
  }

  return casSuccess(result.value, {
    ...(result.metadata ?? {}),
    operation: 'taylor',
    seriesKind: 'maclaurin',
  });
}

function buildTaylorPolynomial(
  expression: CasExpression,
  variable: string,
  center: CasExpression,
  order: number,
  limits: CasLimits
): CasResult<CasExpression> {
  const terms: CasExpression[] = [];
  let currentDerivative: CasExpression = expression;

  for (let degree = 0; degree <= order; degree += 1) {
    const evaluated = evaluateAtCenter(currentDerivative, variable, center, limits);
    if (!evaluated.ok) {
      return evaluated;
    }

    if (!isZeroExpression(evaluated.value)) {
      const scaledCoefficient = buildExactDivision(
        evaluated.value,
        factorialInteger(degree)
      );
      const term = degree === 0
        ? scaledCoefficient
        : binaryNode(
            '*',
            scaledCoefficient,
            buildTaylorPower(variable, center, degree)
          );
      const simplifiedTerm = simplifyTaylorTerm(term, limits);
      if (!simplifiedTerm.ok) {
        return simplifiedTerm;
      }

      terms.push(simplifiedTerm.value);
    }

    if (degree === order || isZeroExpression(currentDerivative)) {
      break;
    }

    const differentiated = differentiateCasExpression(currentDerivative, variable, {
      limits,
    });
    if (!differentiated.ok) {
      return differentiated;
    }

    const simplifiedDerivative = simplifyCasExpression(differentiated.value, {
      limits,
    });
    if (!simplifiedDerivative.ok) {
      return simplifiedDerivative;
    }

    currentDerivative = simplifiedDerivative.value;
  }

  if (terms.length === 0) {
    return casSuccess(numberNode(0));
  }

  let polynomial = terms[0];
  for (let index = 1; index < terms.length; index += 1) {
    const combined = simplifyTaylorTerm(
      binaryNode('+', polynomial, terms[index]),
      limits
    );
    if (!combined.ok) {
      return combined;
    }

    polynomial = combined.value;
  }

  return casSuccess(polynomial);
}

function simplifyTaylorTerm(
  expression: CasExpression,
  limits: CasLimits
): CasResult<CasExpression> {
  const simplified = simplifyCasExpression(expression, { limits });
  return simplified.ok ? simplified : simplified;
}

function evaluateAtCenter(
  expression: CasExpression,
  variable: string,
  center: CasExpression,
  limits: CasLimits
): CasResult<CasExpression> {
  const substituted = substituteCasExpression(expression, variable, center);
  const evaluated = exactifyTaylorExpression(substituted, limits);
  if (!evaluated.ok) {
    return evaluated;
  }

  if (containsVariable(evaluated.value, variable)) {
    return casFailure(
      createCasError(
        'CAS_TAYLOR_DOMAIN_ERROR',
        'La serie no puede construirse en ese punto dentro del dominio real soportado.'
      )
    );
  }

  return casSuccess(evaluated.value);
}

function exactifyTaylorExpression(
  expression: CasExpression,
  limits: CasLimits
): CasResult<CasExpression> {
  switch (expression.kind) {
    case 'number':
      return casSuccess(numberNode(expression.value));
    case 'symbol':
      return casSuccess(symbolNode(expression.name));
    case 'unary': {
      const operandResult = exactifyTaylorExpression(expression.operand, limits);
      if (!operandResult.ok) {
        return operandResult;
      }

      const operand = operandResult.value;
      if (expression.operator === '+') {
        return casSuccess(operand);
      }

      if (operand.kind === 'number') {
        return casSuccess(numberNode(-operand.value));
      }

      if (operand.kind === 'unary' && operand.operator === '-') {
        return casSuccess(operand.operand);
      }

      return casSuccess(unaryNode('-', operand));
    }
    case 'binary': {
      const leftResult = exactifyTaylorExpression(expression.left, limits);
      if (!leftResult.ok) {
        return leftResult;
      }

      const rightResult = exactifyTaylorExpression(expression.right, limits);
      if (!rightResult.ok) {
        return rightResult;
      }

      const left = leftResult.value;
      const right = rightResult.value;

      if (left.kind === 'number' && right.kind === 'number') {
        return exactifyNumericBinary(expression.operator, left.value, right.value);
      }

      if (expression.operator === '/' && right.kind === 'number' && right.value === 0) {
        return taylorDomainError();
      }

      if (
        expression.operator === '^' &&
        left.kind === 'number' &&
        right.kind === 'number'
      ) {
        return exactifyNumericBinary('^', left.value, right.value);
      }

      return casSuccess(binaryNode(expression.operator, left, right));
    }
    case 'function': {
      const argumentResults: CasExpression[] = [];
      for (const argument of expression.arguments) {
        const exactified = exactifyTaylorExpression(argument, limits);
        if (!exactified.ok) {
          return exactified;
        }

        argumentResults.push(exactified.value);
      }

      if (argumentResults.length !== 1) {
        return casSuccess(functionCallNode(expression.name, argumentResults));
      }

      const [argument] = argumentResults;
      if (argument.kind !== 'number') {
        return casSuccess(functionCallNode(expression.name, argumentResults));
      }

      switch (expression.name) {
        case 'abs':
          return casSuccess(numberNode(Math.abs(argument.value)));
        case 'sign':
          return casSuccess(numberNode(Math.sign(argument.value)));
        case 'exp':
        case 'expe':
          if (argument.value === 0) {
            return casSuccess(numberNode(1));
          }
          return casSuccess(functionCallNode(expression.name, argumentResults));
        case 'sqrt':
          if (argument.value < 0) {
            return taylorDomainError();
          }
          if (argument.value === 0) {
            return casSuccess(numberNode(0));
          }
          {
            const root = Math.sqrt(argument.value);
            if (Number.isInteger(root)) {
              return casSuccess(buildExactRationalExpression(root));
            }
          }
          return casSuccess(functionCallNode(expression.name, argumentResults));
        case 'ln':
        case 'log':
          if (argument.value <= 0) {
            return taylorDomainError();
          }
          if (argument.value === 1) {
            return casSuccess(numberNode(0));
          }
          return casSuccess(functionCallNode(expression.name, argumentResults));
        case 'sin':
          if (argument.value === 0) {
            return casSuccess(numberNode(0));
          }
          return casSuccess(functionCallNode(expression.name, argumentResults));
        case 'cos':
          if (argument.value === 0) {
            return casSuccess(numberNode(1));
          }
          return casSuccess(functionCallNode(expression.name, argumentResults));
        case 'tan':
          if (argument.value === 0) {
            return casSuccess(numberNode(0));
          }
          return casSuccess(functionCallNode(expression.name, argumentResults));
        default:
          return casSuccess(functionCallNode(expression.name, argumentResults));
      }
    }
    case 'equation': {
      const leftResult = exactifyTaylorExpression(expression.left, limits);
      if (!leftResult.ok) {
        return leftResult;
      }

      const rightResult = exactifyTaylorExpression(expression.right, limits);
      if (!rightResult.ok) {
        return rightResult;
      }

      return casSuccess({
        kind: 'equation',
        left: leftResult.value,
        right: rightResult.value,
      });
    }
    default: {
      const _exhaustive: never = expression;
      return _exhaustive;
    }
  }
}

function exactifyNumericBinary(
  operator: '+' | '-' | '*' | '/' | '^',
  left: number,
  right: number
): CasResult<CasExpression> {
  switch (operator) {
    case '+':
      return casSuccess(buildExactRationalExpression(left + right));
    case '-':
      return casSuccess(buildExactRationalExpression(left - right));
    case '*':
      return casSuccess(buildExactRationalExpression(left * right));
    case '/':
      if (right === 0) {
        return taylorDomainError();
      }
      return casSuccess(buildExactRationalExpression(left / right));
    case '^': {
      const value = Math.pow(left, right);
      if (!Number.isFinite(value)) {
        return taylorDomainError();
      }
      return casSuccess(buildExactRationalExpression(value));
    }
    default: {
      const _exhaustive: never = operator;
      return _exhaustive;
    }
  }
}

function buildTaylorPower(
  variable: string,
  center: CasExpression,
  degree: number
): CasExpression {
  if (degree === 0) {
    return numberNode(1);
  }

  const shift = binaryNode('-', symbolNode(variable), center);
  if (degree === 1) {
    return shift;
  }

  return binaryNode('^', shift, numberNode(degree));
}

function factorialInteger(order: number): number {
  let result = 1;
  for (let index = 2; index <= order; index += 1) {
    result *= index;
  }
  return result;
}

function validateTaylorOrder(order: number): CasResult<number> {
  if (!Number.isFinite(order) || !Number.isInteger(order) || order < 0) {
    return casFailure(
      createCasError(
        'INVALID_TAYLOR_ORDER',
        'El orden de Taylor debe ser un entero no negativo.'
      )
    );
  }

  if (order > MAX_TAYLOR_ORDER) {
    return casFailure(
      createCasError(
        'TAYLOR_ORDER_LIMIT',
        'El orden solicitado es demasiado alto.'
      )
    );
  }

  return casSuccess(order);
}

function taylorDomainError(): CasResult<CasExpression> {
  return casFailure(
    createCasError(
      'CAS_TAYLOR_DOMAIN_ERROR',
      'La serie no puede construirse en ese punto dentro del dominio real soportado.'
    )
  );
}

function isZeroExpression(expression: CasExpression): boolean {
  return expression.kind === 'number' && expression.value === 0;
}

function buildSeriesMetadata(
  operation: 'taylor' | 'maclaurin',
  variable: string,
  center: CasExpression,
  order: number,
  polynomial: CasExpression
): CasMetadata {
  return {
    operation,
    seriesKind: operation,
    variable,
    center: formatCasExpression(center),
    order,
    polynomial: formatCasExpression(polynomial),
  };
}
