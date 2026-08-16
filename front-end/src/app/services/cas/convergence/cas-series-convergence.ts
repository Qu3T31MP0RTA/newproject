import {
  binaryNode,
  functionCallNode,
  isStructurallyEqual,
  numberNode,
  type CasExpression,
  type CasMetadata,
  unaryNode,
} from '../ast/cas-ast';
import { createCasError } from '../errors/cas-errors';
import { DEFAULT_CAS_LIMITS, resolveCasLimits, type CasLimits } from '../limits/cas-limits';
import { casFailure, casSuccess, type CasResult } from '../result/cas-result';
import { formatCasExpression } from '../format/cas-formatter';
import { simplifyCasExpression } from '../simplify/cas-simplifier';
import { validateCasVariable } from '../variable/cas-variable';
import { containsVariable } from '../solve/cas-substitution';
import { reduceExactRationalExpression } from '../rational/cas-rational';

export type CasSeriesConvergenceStatus = 'known' | 'unsupported' | 'domain-error';

export type CasSeriesConvergenceRadius =
  | {
      readonly kind: 'finite';
      readonly value: string;
    }
  | {
      readonly kind: 'infinite';
    }
  | {
      readonly kind: 'unsupported';
    };

export interface CasSeriesConvergenceInterval {
  readonly left: string;
  readonly right: string;
  readonly leftIncluded: boolean;
  readonly rightIncluded: boolean;
}

export interface CasSeriesConvergenceResult {
  readonly status: CasSeriesConvergenceStatus;
  readonly center: string;
  readonly radius: CasSeriesConvergenceRadius;
  readonly interval?: CasSeriesConvergenceInterval;
  readonly notes?: readonly string[];
}

export interface CasSeriesConvergenceTextResult extends CasSeriesConvergenceResult {
  readonly expression: CasExpression;
  readonly text: string;
  readonly latex: string;
}

interface LinearForm {
  readonly coefficient: CasExpression;
  readonly constant: CasExpression;
}

const ENTIRE_FUNCTIONS = new Set(['exp', 'sin', 'cos']);

export function analyzeSeriesConvergence(
  expression: CasExpression,
  variable: string,
  center: CasExpression,
  options: { readonly limits?: Partial<CasLimits> } = {}
): CasResult<CasSeriesConvergenceResult> {
  const normalizedVariable = validateCasVariable(variable);
  if (!normalizedVariable.ok) {
    return normalizedVariable;
  }

  const limits = resolveCasLimits(options.limits ?? DEFAULT_CAS_LIMITS);
  const simplifiedExpression = simplifyCasExpression(expression, { limits });
  if (!simplifiedExpression.ok) {
    return simplifiedExpression;
  }

  const simplifiedCenter = simplifyCasExpression(center, { limits });
  if (!simplifiedCenter.ok) {
    return simplifiedCenter;
  }

  if (containsVariable(simplifiedCenter.value, normalizedVariable.value)) {
    return casFailure(
      createCasError(
        'CAS_SERIES_DOMAIN_ERROR',
        'El centro de convergencia no puede depender de la variable.'
      )
    );
  }

  const centerText = formatCasExpression(simplifiedCenter.value);

  if (isEntireExpression(simplifiedExpression.value, normalizedVariable.value)) {
    return casSuccess(
      {
        status: 'known',
        center: centerText,
        radius: {
          kind: 'infinite',
        },
      },
      buildConvergenceMetadata({
        status: 'known',
        center: centerText,
        radius: {
          kind: 'infinite',
        },
      })
    );
  }

  const geometric = matchGeometricSeries(
    simplifiedExpression.value,
    normalizedVariable.value,
    simplifiedCenter.value,
    limits
  );
  if (geometric) {
    return casSuccess(
      geometric,
      buildConvergenceMetadata(geometric)
    );
  }

  const logarithmic = matchLogarithmicSeries(
    simplifiedExpression.value,
    normalizedVariable.value,
    simplifiedCenter.value,
    limits
  );
  if (logarithmic) {
    return casSuccess(
      logarithmic,
      buildConvergenceMetadata(logarithmic)
    );
  }

  const unsupported = createUnsupportedConvergenceResult(centerText);
  return casSuccess(unsupported, buildConvergenceMetadata(unsupported));
}

export function analyzeSeriesConvergenceText(
  source: string,
  variable: string,
  centerSource: string,
  parser: { parse(source: string): CasResult<CasExpression> },
  options: { readonly limits?: Partial<CasLimits> } = {}
): CasResult<CasSeriesConvergenceTextResult> {
  const parsed = parser.parse(source);
  if (!parsed.ok) {
    return parsed;
  }

  const center = parser.parse(centerSource);
  if (!center.ok) {
    return center;
  }

  const result = analyzeSeriesConvergence(parsed.value, variable, center.value, options);
  if (!result.ok) {
    return result;
  }

  const text = formatConvergenceText(result.value);
  return casSuccess(
    {
      ...result.value,
      expression: parsed.value,
      text,
      latex: text,
    },
    buildConvergenceMetadata(result.value)
  );
}

function matchGeometricSeries(
  expression: CasExpression,
  variable: string,
  center: CasExpression,
  limits: CasLimits
): CasSeriesConvergenceResult | null {
  if (expression.kind !== 'binary' || expression.operator !== '/') {
    return null;
  }

  const numerator = simplifyIndependentExpression(expression.left, limits);
  if (!numerator || !isExactOne(numerator)) {
    return null;
  }

  const denominator = simplifyIndependentExpression(expression.right, limits);
  if (!denominator) {
    return null;
  }

  const linear = linearizeExpression(denominator, variable, limits);
  if (!linear) {
    return null;
  }

  const coefficient = simplifyIndependentExpression(linear.coefficient, limits);
  const constant = simplifyIndependentExpression(linear.constant, limits);
  if (!coefficient || !constant) {
    return null;
  }

  if (isZeroExpression(coefficient)) {
    return null;
  }

  const expectedConstant = simplifyCasExpression(
    binaryNode(
      '-',
      numberNode(1),
      binaryNode('*', coefficient, center)
    ),
    { limits }
  );

  if (!expectedConstant.ok) {
    return null;
  }

  if (!isStructurallyEqual(constant, expectedConstant.value)) {
    return null;
  }

  const radius = buildRadiusExpression(coefficient, limits);
  if (!radius.ok) {
    return null;
  }

  const interval = buildInterval(
    center,
    radius.value,
    false,
    false,
    limits
  );
  if (!interval.ok) {
    return null;
  }

  return {
    status: 'known',
    center: formatCasExpression(center),
    radius: {
      kind: 'finite',
      value: formatCasExpression(radius.value),
    },
    interval: interval.value,
  };
}

function matchLogarithmicSeries(
  expression: CasExpression,
  variable: string,
  center: CasExpression,
  limits: CasLimits
): CasSeriesConvergenceResult | null {
  if (!isZeroExpression(center)) {
    return null;
  }

  if (expression.kind !== 'function') {
    return null;
  }

  const name = expression.name.toLowerCase();
  if (name !== 'ln' && name !== 'log') {
    return null;
  }

  if (expression.arguments.length !== 1) {
    return null;
  }

  const argument = simplifyIndependentExpression(expression.arguments[0], limits);
  if (!argument) {
    return null;
  }

  const linear = linearizeExpression(argument, variable, limits);
  if (!linear) {
    return null;
  }

  const coefficient = simplifyIndependentExpression(linear.coefficient, limits);
  const constant = simplifyIndependentExpression(linear.constant, limits);
  if (!coefficient || !constant) {
    return null;
  }

  if (!isExactOne(constant)) {
    return null;
  }

  if (
    coefficient.kind !== 'number' ||
    (coefficient.value !== 1 && coefficient.value !== -1)
  ) {
    return null;
  }

  const radius = {
    kind: 'finite' as const,
    value: '1',
  };

  const interval = coefficient.value > 0
    ? {
        left: '-1',
        right: '1',
        leftIncluded: false,
        rightIncluded: true,
      }
    : {
        left: '-1',
        right: '1',
        leftIncluded: true,
        rightIncluded: false,
      };

  return {
    status: 'known',
    center: '0',
    radius,
    interval,
  };
}

function createUnsupportedConvergenceResult(center: string): CasSeriesConvergenceResult {
  return {
    status: 'unsupported',
    center,
    radius: {
      kind: 'unsupported',
    },
    notes: ['La familia no está soportada todavía.'],
  };
}

function formatConvergenceText(result: CasSeriesConvergenceResult): string {
  if (result.status === 'unsupported') {
    return 'Radio de convergencia: no disponible';
  }

  if (result.radius.kind === 'infinite') {
    return 'Radio de convergencia: ∞';
  }

  if (result.radius.kind !== 'finite') {
    return 'Radio de convergencia: no disponible';
  }

  const lines = [`Radio de convergencia: ${result.radius.value}`];
  if (result.interval) {
    lines.push(
      `Intervalo: ${formatInterval(result.interval)}`
    );
  }

  return lines.join('\n');
}

function formatInterval(interval: CasSeriesConvergenceInterval): string {
  const leftBracket = interval.leftIncluded ? '[' : '(';
  const rightBracket = interval.rightIncluded ? ']' : ')';
  return `${leftBracket}${interval.left}, ${interval.right}${rightBracket}`;
}

function buildConvergenceMetadata(result: CasSeriesConvergenceResult): CasMetadata {
  return {
    operation: 'convergence',
    seriesConvergence: result,
  };
}

function isEntireExpression(expression: CasExpression, variable: string): boolean {
  if (!containsVariable(expression, variable)) {
    return true;
  }

  switch (expression.kind) {
    case 'number':
      return true;
    case 'symbol':
      return expression.name !== variable;
    case 'unary':
      return isEntireExpression(expression.operand, variable);
    case 'binary':
      switch (expression.operator) {
        case '+':
        case '-':
        case '*':
          return (
            isEntireExpression(expression.left, variable) &&
            isEntireExpression(expression.right, variable)
          );
        case '/':
          return (
            !containsVariable(expression.right, variable) &&
            isEntireExpression(expression.left, variable)
          );
        case '^':
          if (!containsVariable(expression.left, variable) && !containsVariable(expression.right, variable)) {
            return true;
          }

          return (
            isEntireExpression(expression.left, variable) &&
            !containsVariable(expression.right, variable) &&
            isNonNegativeIntegerExpression(expression.right)
          );
        default:
          return false;
      }
    case 'function':
      if (expression.arguments.every(argument => !containsVariable(argument, variable))) {
        return true;
      }

      if (!ENTIRE_FUNCTIONS.has(expression.name.toLowerCase())) {
        return false;
      }

      return expression.arguments.every(argument =>
        isEntireExpression(argument, variable)
      );
    case 'equation':
      return false;
    default: {
      const _exhaustive: never = expression;
      return _exhaustive;
    }
  }
}

function isNonNegativeIntegerExpression(expression: CasExpression): boolean {
  return expression.kind === 'number' && Number.isInteger(expression.value) && expression.value >= 0;
}

function linearizeExpression(
  expression: CasExpression,
  variable: string,
  limits: CasLimits
): LinearForm | null {
  switch (expression.kind) {
    case 'number':
      return {
        coefficient: numberNode(0),
        constant: numberNode(expression.value),
      };
    case 'symbol':
      return expression.name === variable
        ? {
            coefficient: numberNode(1),
            constant: numberNode(0),
          }
        : {
            coefficient: numberNode(0),
            constant: expression,
          };
    case 'unary': {
      const operand = linearizeExpression(expression.operand, variable, limits);
      if (!operand) {
        return null;
      }

      if (expression.operator === '+') {
        return operand;
      }

      return scaleLinearForm(unaryNode('-', numberNode(1)), operand, limits);
    }
    case 'binary':
      switch (expression.operator) {
        case '+':
          return combineLinearForms('+', expression.left, expression.right, variable, limits);
        case '-':
          return combineLinearForms('-', expression.left, expression.right, variable, limits);
        case '*':
          return multiplyLinearForms(expression.left, expression.right, variable, limits);
        case '/':
          return divideLinearForms(expression.left, expression.right, variable, limits);
        case '^':
          return powerLinearForm(expression.left, expression.right, variable, limits);
        default:
          return null;
      }
    case 'function':
      return expression.arguments.every(argument => !containsVariable(argument, variable))
        ? {
            coefficient: numberNode(0),
            constant: expression,
          }
        : null;
    case 'equation':
      return null;
    default: {
      const _exhaustive: never = expression;
      return _exhaustive;
    }
  }
}

function combineLinearForms(
  operator: '+' | '-',
  leftExpression: CasExpression,
  rightExpression: CasExpression,
  variable: string,
  limits: CasLimits
): LinearForm | null {
  const left = linearizeExpression(leftExpression, variable, limits);
  const right = linearizeExpression(rightExpression, variable, limits);
  if (!left || !right) {
    return null;
  }

  const rightOperator = operator === '+' ? '+' : '-';
  const coefficient = simplifyIndependentExpression(
    binaryNode(operator, left.coefficient, right.coefficient),
    limits
  );
  const constant = simplifyIndependentExpression(
    binaryNode(rightOperator, left.constant, right.constant),
    limits
  );

  if (!coefficient || !constant) {
    return null;
  }

  return {
    coefficient,
    constant,
  };
}

function multiplyLinearForms(
  leftExpression: CasExpression,
  rightExpression: CasExpression,
  variable: string,
  limits: CasLimits
): LinearForm | null {
  const leftContainsVariable = containsVariable(leftExpression, variable);
  const rightContainsVariable = containsVariable(rightExpression, variable);

  if (!leftContainsVariable && rightContainsVariable) {
    const right = linearizeExpression(rightExpression, variable, limits);
    if (!right) {
      return null;
    }

    return scaleLinearForm(leftExpression, right, limits);
  }

  if (!rightContainsVariable && leftContainsVariable) {
    const left = linearizeExpression(leftExpression, variable, limits);
    if (!left) {
      return null;
    }

    return scaleLinearForm(rightExpression, left, limits);
  }

  if (!leftContainsVariable && !rightContainsVariable) {
    return {
      coefficient: numberNode(0),
      constant: binaryNode('*', leftExpression, rightExpression),
    };
  }

  return null;
}

function divideLinearForms(
  numeratorExpression: CasExpression,
  denominatorExpression: CasExpression,
  variable: string,
  limits: CasLimits
): LinearForm | null {
  if (containsVariable(denominatorExpression, variable)) {
    return null;
  }

  const numeratorContainsVariable = containsVariable(numeratorExpression, variable);
  if (!numeratorContainsVariable) {
    return {
      coefficient: numberNode(0),
      constant: binaryNode('/', numeratorExpression, denominatorExpression),
    };
  }

  const numerator = linearizeExpression(numeratorExpression, variable, limits);
  if (!numerator) {
    return null;
  }

  return {
    coefficient: simplifyIndependentExpression(
      binaryNode('/', numerator.coefficient, denominatorExpression),
      limits
    ) ?? numberNode(0),
    constant: simplifyIndependentExpression(
      binaryNode('/', numerator.constant, denominatorExpression),
      limits
    ) ?? numberNode(0),
  };
}

function powerLinearForm(
  baseExpression: CasExpression,
  exponentExpression: CasExpression,
  variable: string,
  limits: CasLimits
): LinearForm | null {
  const baseContainsVariable = containsVariable(baseExpression, variable);
  const exponentContainsVariable = containsVariable(exponentExpression, variable);

  if (!baseContainsVariable && !exponentContainsVariable) {
    return {
      coefficient: numberNode(0),
      constant: binaryNode('^', baseExpression, exponentExpression),
    };
  }

  if (exponentContainsVariable) {
    return null;
  }

  if (exponentExpression.kind !== 'number') {
    return null;
  }

  if (exponentExpression.value === 0) {
    return {
      coefficient: numberNode(0),
      constant: numberNode(1),
    };
  }

  if (exponentExpression.value === 1) {
    return linearizeExpression(baseExpression, variable, limits);
  }

  return null;
}

function scaleLinearForm(
  factorExpression: CasExpression,
  form: LinearForm,
  limits: CasLimits
): LinearForm | null {
  const coefficient = simplifyIndependentExpression(
    binaryNode('*', factorExpression, form.coefficient),
    limits
  );
  const constant = simplifyIndependentExpression(
    binaryNode('*', factorExpression, form.constant),
    limits
  );

  if (!coefficient || !constant) {
    return null;
  }

  return {
    coefficient,
    constant,
  };
}

function simplifyIndependentExpression(
  expression: CasExpression,
  limits: CasLimits
): CasExpression | null {
  const simplified = simplifyCasExpression(expression, { limits });
  if (!simplified.ok) {
    return null;
  }

  return simplified.value;
}

function buildRadiusExpression(
  coefficient: CasExpression,
  limits: CasLimits
): CasResult<CasExpression> {
  const absoluteCoefficient = simplifyIndependentExpression(
    buildAbsoluteExpression(coefficient),
    limits
  );
  if (!absoluteCoefficient) {
    return casFailure(
      createCasError(
        'CAS_SERIES_DOMAIN_ERROR',
        'El centro de convergencia no puede depender de la variable.'
      )
    );
  }

  if (absoluteCoefficient.kind === 'number') {
    return casSuccess(reduceExactRationalExpression(1, absoluteCoefficient.value));
  }

  return casSuccess(
    binaryNode('/', numberNode(1), absoluteCoefficient)
  );
}

function buildAbsoluteExpression(expression: CasExpression): CasExpression {
  if (expression.kind === 'number') {
    return numberNode(Math.abs(expression.value));
  }

  if (expression.kind === 'unary' && expression.operator === '-') {
    return expression.operand;
  }

  return functionCallNode('abs', [expression]);
}

function buildInterval(
  center: CasExpression,
  radius: CasExpression,
  leftIncluded: boolean,
  rightIncluded: boolean,
  limits: CasLimits
): CasResult<CasSeriesConvergenceInterval> {
  const left = simplifyCasExpression(
    binaryNode('-', center, radius),
    { limits }
  );
  if (!left.ok) {
    return left;
  }

  const right = simplifyCasExpression(
    binaryNode('+', center, radius),
    { limits }
  );
  if (!right.ok) {
    return right;
  }

  return casSuccess({
    left: formatCasExpression(left.value),
    right: formatCasExpression(right.value),
    leftIncluded,
    rightIncluded,
  });
}

function isExactOne(expression: CasExpression): boolean {
  return expression.kind === 'number' && expression.value === 1;
}

function isZeroExpression(expression: CasExpression): boolean {
  return expression.kind === 'number' && expression.value === 0;
}
