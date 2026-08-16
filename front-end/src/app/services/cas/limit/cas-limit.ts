import {
  binaryNode,
  functionCallNode,
  numberNode,
  symbolNode,
  type CasBinaryNode,
  type CasExpression,
  type CasFunctionCallNode,
  unaryNode,
} from '../ast/cas-ast';
import { createCasError } from '../errors/cas-errors';
import { DEFAULT_CAS_LIMITS, resolveCasLimits, type CasLimits } from '../limits/cas-limits';
import { casFailure, casSuccess, type CasResult } from '../result/cas-result';
import { formatCasExpression } from '../format/cas-formatter';
import { simplifyCasExpression } from '../simplify/cas-simplifier';
import { reduceExactRationalExpression } from '../rational/cas-rational';
import { substituteCasExpression, containsVariable } from '../solve/cas-substitution';
import { toPolynomial, type Polynomial } from '../polynomial/cas-polynomial';
import { validateCasVariable } from '../variable/cas-variable';

export type CasLimitDirection = 'both' | 'left' | 'right';
export type CasLimitResultKind =
  | 'finite'
  | 'positive-infinity'
  | 'negative-infinity'
  | 'does-not-exist';

export interface CasLimitOptions {
  readonly limits?: Partial<CasLimits>;
  readonly direction?: CasLimitDirection;
}

export interface CasLimitBaseResult {
  readonly kind: CasLimitResultKind;
  readonly direction: CasLimitDirection;
  readonly text: string;
  readonly latex: string;
  readonly expression?: CasExpression;
}

export interface CasLimitFiniteResult extends CasLimitBaseResult {
  readonly kind: 'finite';
  readonly expression: CasExpression;
}

export interface CasLimitInfiniteResult extends CasLimitBaseResult {
  readonly kind: 'positive-infinity' | 'negative-infinity';
  readonly expression: CasExpression;
}

export interface CasLimitDoesNotExistResult extends CasLimitBaseResult {
  readonly kind: 'does-not-exist';
  readonly expression: CasExpression;
}

export type CasLimitExpressionResult =
  | CasLimitFiniteResult
  | CasLimitInfiniteResult
  | CasLimitDoesNotExistResult;

export type CasLimitTextResult = Omit<CasLimitBaseResult, 'expression'> & {
  readonly expression: CasExpression | string;
};

type LimitState =
  | { readonly kind: 'finite'; readonly expression: CasExpression }
  | { readonly kind: 'zero'; readonly sign: 'positive' | 'negative' }
  | { readonly kind: 'positive-infinity' | 'negative-infinity' }
  | { readonly kind: 'does-not-exist' }
  | { readonly kind: 'domain-error'; readonly functionName?: string }
  | { readonly kind: 'unsupported'; readonly functionName?: string };

interface RationalFraction {
  readonly numerator: CasExpression;
  readonly denominator: CasExpression;
}

const LIMIT_APPROACH_VARIABLE = '__limit_h';
const LIMIT_APPROACH_SYMBOL = symbolNode(LIMIT_APPROACH_VARIABLE);
const INFINITY_SYMBOL = symbolNode('∞');
const DOES_NOT_EXIST_SYMBOL = symbolNode('does-not-exist');

const SAFE_FUNCTIONS = new Set([
  'sin',
  'cos',
  'tan',
  'exp',
  'expe',
  'sqrt',
  'abs',
  'ln',
  'log',
  'sign',
  'cbrt',
]);

export function limitCasExpression(
  expression: CasExpression,
  variable: string,
  point: CasExpression,
  options: CasLimitOptions = {}
): CasResult<CasLimitExpressionResult> {
  const normalizedVariable = validateCasVariable(variable);
  if (!normalizedVariable.ok) {
    return normalizedVariable;
  }

  const direction = normalizeDirection(options.direction);
  if (!direction) {
    return invalidLimitDirection();
  }

  const limits = resolveCasLimits(options.limits ?? DEFAULT_CAS_LIMITS);
  const simplifiedExpression = simplifyCasExpression(expression, { limits });
  if (!simplifiedExpression.ok) {
    return simplifiedExpression;
  }

  const simplifiedPoint = simplifyCasExpression(point, { limits });
  if (!simplifiedPoint.ok) {
    return simplifiedPoint;
  }

  if (containsVariable(simplifiedPoint.value, normalizedVariable.value)) {
    return unsupportedLimit();
  }

  const pointKind = classifyPoint(simplifiedPoint.value);
  const result =
    pointKind.kind === 'finite'
      ? direction === 'both'
        ? evaluateBidirectionalFiniteLimit(
            simplifiedExpression.value,
            normalizedVariable.value,
            pointKind.value,
            limits
          )
        : evaluateDirectionalFiniteLimit(
            simplifiedExpression.value,
            normalizedVariable.value,
            pointKind.value,
            direction,
            limits
          )
      : evaluateInfiniteLimit(
          simplifiedExpression.value,
          normalizedVariable.value,
          pointKind,
          limits
        );

  if (result.kind === 'unsupported') {
    return unsupportedLimit(result.functionName);
  }

  if (result.kind === 'domain-error') {
    return casFailure(
      createCasError(
        'CAS_LIMIT_DOMAIN_ERROR',
        'El límite queda fuera del dominio real soportado.',
        undefined,
        result.functionName
      )
    );
  }

  return casSuccess(formatLimitResult(result, pointKind.kind === 'finite' ? direction : 'both'));
}

export function limitCasText(
  source: string,
  variable: string,
  pointSource: string,
  parser: { parse(source: string): CasResult<CasExpression> },
  options: CasLimitOptions = {}
): CasResult<CasLimitTextResult> {
  const parsed = parser.parse(source);
  if (!parsed.ok) {
    return parsed;
  }

  const parsedPoint = parser.parse(pointSource);
  if (!parsedPoint.ok) {
    return parsedPoint;
  }

  const limited = limitCasExpression(parsed.value, variable, parsedPoint.value, options);
  if (!limited.ok) {
    return limited;
  }

  return casSuccess({
    kind: limited.value.kind,
    direction: limited.value.direction,
    expression: limited.value.expression ?? limited.value.text,
    text: limited.value.text,
    latex: limited.value.latex,
  });
}

function evaluateDirectionalFiniteLimit(
  expression: CasExpression,
  variable: string,
  point: CasExpression,
  direction: Exclude<CasLimitDirection, 'both'>,
  limits: CasLimits
): LimitState {
  const transformed = substituteCasExpression(
    expression,
    variable,
    binaryNode(direction === 'left' ? '-' : '+', point, LIMIT_APPROACH_SYMBOL)
  );

  return evaluateApproachToZero(transformed, limits);
}

function evaluateBidirectionalFiniteLimit(
  expression: CasExpression,
  variable: string,
  point: CasExpression,
  limits: CasLimits
): LimitState {
  const left = evaluateDirectionalFiniteLimit(expression, variable, point, 'left', limits);
  const right = evaluateDirectionalFiniteLimit(expression, variable, point, 'right', limits);
  return mergeDirectionalResults(left, right);
}

function evaluateInfiniteLimit(
  expression: CasExpression,
  variable: string,
  point: { readonly kind: 'positive-infinity' | 'negative-infinity' },
  limits: CasLimits
): LimitState {
  const transformed = substituteCasExpression(
    expression,
    variable,
    point.kind === 'positive-infinity'
      ? binaryNode('/', numberNode(1), LIMIT_APPROACH_SYMBOL)
      : unaryNode('-', binaryNode('/', numberNode(1), LIMIT_APPROACH_SYMBOL))
  );

  return evaluateApproachToZero(transformed, limits);
}

function evaluateApproachToZero(expression: CasExpression, limits: CasLimits): LimitState {
  const simplified = simplifyCasExpression(expression, { limits });
  if (!simplified.ok) {
    return { kind: 'unsupported' };
  }

  return evaluateZeroApproach(simplified.value, limits);
}

function evaluateZeroApproach(expression: CasExpression, limits: CasLimits): LimitState {
  const rational = analyzeRationalNearZero(expression);
  if (rational) {
    return rational;
  }

  switch (expression.kind) {
    case 'number':
      return { kind: 'finite', expression };
    case 'symbol':
      if (expression.name === LIMIT_APPROACH_VARIABLE) {
        return { kind: 'zero', sign: 'positive' };
      }

      return { kind: 'finite', expression };
    case 'unary':
      return evaluateUnaryZeroApproach(expression, limits);
    case 'binary':
      return evaluateBinaryZeroApproach(expression, limits);
    case 'function':
      return evaluateFunctionZeroApproach(expression, limits);
    case 'equation':
      return { kind: 'unsupported' };
    default: {
      const _exhaustive: never = expression;
      return _exhaustive;
    }
  }
}

function evaluateUnaryZeroApproach(
  expression: { readonly kind: 'unary'; readonly operator: '+' | '-'; readonly operand: CasExpression },
  limits: CasLimits
): LimitState {
  const value = evaluateZeroApproach(expression.operand, limits);
  if (value.kind === 'unsupported' || value.kind === 'domain-error' || value.kind === 'does-not-exist') {
    return value;
  }

  if (expression.operator === '+') {
    return value;
  }

  if (value.kind === 'finite') {
    return { kind: 'finite', expression: negateFiniteExpression(value.expression) };
  }

  if (value.kind === 'zero') {
    return {
      kind: 'zero',
      sign: value.sign === 'positive' ? 'negative' : 'positive',
    };
  }

  return {
    kind: value.kind === 'positive-infinity' ? 'negative-infinity' : 'positive-infinity',
  };
}

function evaluateBinaryZeroApproach(
  expression: CasBinaryNode,
  limits: CasLimits
): LimitState {
  const left = evaluateZeroApproach(expression.left, limits);
  if (left.kind === 'unsupported' || left.kind === 'domain-error' || left.kind === 'does-not-exist') {
    return left;
  }

  const right = evaluateZeroApproach(expression.right, limits);
  if (right.kind === 'unsupported' || right.kind === 'domain-error' || right.kind === 'does-not-exist') {
    return right;
  }

  switch (expression.operator) {
    case '+':
      return combineAddition(left, right);
    case '-':
      return combineSubtraction(left, right);
    case '*':
      return combineMultiplication(left, right);
    case '/':
      return combineDivision(left, right);
    case '^':
      return combinePower(left, right);
    default: {
      const _exhaustive: never = expression.operator;
      return _exhaustive;
    }
  }
}

function evaluateFunctionZeroApproach(
  expression: CasFunctionCallNode,
  limits: CasLimits
): LimitState {
  const evaluatedArguments: LimitState[] = [];
  for (const argument of expression.arguments) {
    const evaluated = evaluateZeroApproach(argument, limits);
    if (evaluated.kind === 'unsupported' || evaluated.kind === 'domain-error' || evaluated.kind === 'does-not-exist') {
      return evaluated;
    }

    evaluatedArguments.push(evaluated);
  }

  if (expression.arguments.length !== 1) {
    return { kind: 'unsupported', functionName: expression.name };
  }

  const [argument] = evaluatedArguments;

  switch (expression.name) {
    case 'sin':
    case 'cos':
      return evaluateTrigonometricFunction(expression.name, argument);
    case 'tan':
      return evaluateTangentFunction(argument);
    case 'exp':
    case 'expe':
      return evaluateExponentialFunction(argument);
    case 'sqrt':
      return evaluateSquareRootFunction(argument);
    case 'abs':
      return evaluateAbsoluteFunction(argument);
    case 'ln':
    case 'log':
      return evaluateLogarithmFunction(argument);
    case 'sign':
      return evaluateSignFunction(argument);
    case 'cbrt':
      return evaluateCubeRootFunction(argument);
    default:
      if (!SAFE_FUNCTIONS.has(expression.name)) {
        return { kind: 'unsupported', functionName: expression.name };
      }

      return {
        kind: 'finite',
        expression: {
          ...expression,
          arguments: [argument.kind === 'finite' ? argument.expression : argumentToExpression(argument)],
        },
      };
  }
}

function evaluateTrigonometricFunction(
  name: 'sin' | 'cos',
  argument: LimitState
): LimitState {
  if (argument.kind === 'positive-infinity' || argument.kind === 'negative-infinity') {
    return { kind: 'does-not-exist' };
  }

  if (argument.kind === 'zero') {
    return name === 'sin'
      ? { kind: 'zero', sign: 'positive' }
      : { kind: 'finite', expression: numberNode(1) };
  }

  if (argument.kind === 'finite') {
    const numeric = tryEvaluateConstantNumber(argument.expression);
    if (numeric !== null) {
      const value = name === 'sin' ? Math.sin(numeric) : Math.cos(numeric);
      return { kind: 'finite', expression: buildExactNumericExpression(value) };
    }

    return {
      kind: 'finite',
      expression: {
        kind: 'function',
        name,
        arguments: [argument.expression],
      },
    };
  }

  return argument;
}

function evaluateTangentFunction(argument: LimitState): LimitState {
  if (argument.kind === 'positive-infinity' || argument.kind === 'negative-infinity') {
    return { kind: 'does-not-exist' };
  }

  if (argument.kind === 'zero') {
    return { kind: 'finite', expression: numberNode(0) };
  }

  if (argument.kind === 'finite') {
    const numeric = tryEvaluateConstantNumber(argument.expression);
    if (numeric !== null) {
      const cosine = Math.cos(numeric);
      if (Math.abs(cosine) < 1e-12) {
        return { kind: 'does-not-exist' };
      }

      return { kind: 'finite', expression: buildExactNumericExpression(Math.tan(numeric)) };
    }

    return {
      kind: 'finite',
      expression: functionCallNode('tan', [argument.expression]),
    };
  }

  return argument;
}

function evaluateExponentialFunction(argument: LimitState): LimitState {
  if (argument.kind === 'positive-infinity') {
    return { kind: 'positive-infinity' };
  }

  if (argument.kind === 'negative-infinity') {
    return { kind: 'zero', sign: 'positive' };
  }

  if (argument.kind === 'zero') {
    return { kind: 'finite', expression: numberNode(1) };
  }

  if (argument.kind === 'finite') {
    const numeric = tryEvaluateConstantNumber(argument.expression);
    if (numeric !== null) {
      return { kind: 'finite', expression: buildExactNumericExpression(Math.exp(numeric)) };
    }

    return {
      kind: 'finite',
      expression: functionCallNode('exp', [argument.expression]),
    };
  }

  return argument;
}

function evaluateSquareRootFunction(argument: LimitState): LimitState {
  if (argument.kind === 'negative-infinity') {
    return { kind: 'domain-error', functionName: 'sqrt' };
  }

  if (argument.kind === 'positive-infinity') {
    return { kind: 'positive-infinity' };
  }

  if (argument.kind === 'zero') {
    if (argument.sign === 'negative') {
      return { kind: 'domain-error', functionName: 'sqrt' };
    }

    return { kind: 'finite', expression: numberNode(0) };
  }

  if (argument.kind === 'finite') {
    const numeric = tryEvaluateConstantNumber(argument.expression);
    if (numeric !== null) {
      if (numeric < 0) {
        return { kind: 'domain-error', functionName: 'sqrt' };
      }

      return { kind: 'finite', expression: buildExactNumericExpression(Math.sqrt(numeric)) };
    }

    return {
      kind: 'finite',
      expression: functionCallNode('sqrt', [argument.expression]),
    };
  }

  return argument;
}

function evaluateAbsoluteFunction(argument: LimitState): LimitState {
  if (argument.kind === 'positive-infinity' || argument.kind === 'negative-infinity') {
    return { kind: 'positive-infinity' };
  }

  if (argument.kind === 'zero') {
    return { kind: 'finite', expression: numberNode(0) };
  }

  if (argument.kind === 'finite') {
    const numeric = tryEvaluateConstantNumber(argument.expression);
    if (numeric !== null) {
      return { kind: 'finite', expression: buildExactNumericExpression(Math.abs(numeric)) };
    }

    return {
      kind: 'finite',
      expression: functionCallNode('abs', [argument.expression]),
    };
  }

  return argument;
}

function evaluateLogarithmFunction(argument: LimitState): LimitState {
  if (argument.kind === 'positive-infinity') {
    return { kind: 'positive-infinity' };
  }

  if (argument.kind === 'negative-infinity') {
    return { kind: 'domain-error', functionName: 'ln' };
  }

  if (argument.kind === 'zero') {
    return argument.sign === 'positive'
      ? { kind: 'negative-infinity' }
      : { kind: 'domain-error', functionName: 'ln' };
  }

  if (argument.kind === 'finite') {
    const numeric = tryEvaluateConstantNumber(argument.expression);
    if (numeric !== null) {
      if (numeric <= 0) {
        return { kind: 'domain-error', functionName: 'ln' };
      }

      return { kind: 'finite', expression: buildExactNumericExpression(Math.log(numeric)) };
    }

    return {
      kind: 'finite',
      expression: functionCallNode('ln', [argument.expression]),
    };
  }

  return argument;
}

function evaluateSignFunction(argument: LimitState): LimitState {
  if (argument.kind === 'positive-infinity') {
    return { kind: 'finite', expression: numberNode(1) };
  }

  if (argument.kind === 'negative-infinity') {
    return { kind: 'finite', expression: numberNode(-1) };
  }

  if (argument.kind === 'zero') {
    return {
      kind: 'finite',
      expression: numberNode(argument.sign === 'positive' ? 1 : -1),
    };
  }

  if (argument.kind === 'finite') {
    const numeric = tryEvaluateConstantNumber(argument.expression);
    if (numeric !== null) {
      return { kind: 'finite', expression: numberNode(Math.sign(numeric)) };
    }

    return {
      kind: 'finite',
      expression: functionCallNode('sign', [argument.expression]),
    };
  }

  return argument;
}

function evaluateCubeRootFunction(argument: LimitState): LimitState {
  if (argument.kind === 'positive-infinity') {
    return { kind: 'positive-infinity' };
  }

  if (argument.kind === 'negative-infinity') {
    return { kind: 'negative-infinity' };
  }

  if (argument.kind === 'zero') {
    return argument.sign === 'positive'
      ? { kind: 'finite', expression: numberNode(0) }
      : { kind: 'finite', expression: numberNode(-0) };
  }

  if (argument.kind === 'finite') {
    const numeric = tryEvaluateConstantNumber(argument.expression);
    if (numeric !== null) {
      return { kind: 'finite', expression: buildExactNumericExpression(Math.cbrt(numeric)) };
    }

    return {
      kind: 'finite',
      expression: functionCallNode('cbrt', [argument.expression]),
    };
  }

  return argument;
}

function analyzeRationalNearZero(expression: CasExpression): LimitState | null {
  const fraction = extractRationalFraction(expression);
  if (!fraction) {
    return null;
  }

  const numerator = toPolynomial(fraction.numerator, {
    limits: DEFAULT_CAS_LIMITS,
    maxExponent: 16,
    maxTerms: 512,
  });
  if (!numerator.ok) {
    return null;
  }

  const denominator = toPolynomial(fraction.denominator, {
    limits: DEFAULT_CAS_LIMITS,
    maxExponent: 16,
    maxTerms: 512,
  });
  if (!denominator.ok) {
    return null;
  }

  const numeratorOrder = lowestOrderAtZero(numerator.value);
  const denominatorOrder = lowestOrderAtZero(denominator.value);
  if (denominatorOrder.kind === 'zero-polynomial') {
    return { kind: 'unsupported' };
  }

  if (numeratorOrder.kind === 'zero-polynomial') {
    return { kind: 'zero', sign: 'positive' };
  }

  const numeratorTerm = numeratorOrder;
  const denominatorTerm = denominatorOrder;

  const ratioSign = signOfRatio(numeratorTerm.coefficient, denominatorTerm.coefficient);
  const orderDifference = numeratorTerm.order - denominatorTerm.order;

  if (orderDifference > 0) {
    return { kind: 'zero', sign: ratioSign };
  }

  if (orderDifference === 0) {
    const ratio = reduceExactRationalExpression(
      numeratorTerm.coefficient,
      denominatorTerm.coefficient
    );

    if (ratio.kind === 'binary' && ratio.operator === '/' && ratio.right.kind === 'number' && ratio.right.value === 0) {
      return { kind: 'unsupported' };
    }

    return { kind: 'finite', expression: ratio };
  }

  return ratioSign === 'positive'
    ? { kind: 'positive-infinity' }
    : { kind: 'negative-infinity' };
}

function extractRationalFraction(expression: CasExpression): RationalFraction | null {
  switch (expression.kind) {
    case 'number':
      return { numerator: expression, denominator: numberNode(1) };
    case 'symbol':
      return expression.name === LIMIT_APPROACH_VARIABLE
        ? { numerator: expression, denominator: numberNode(1) }
        : null;
    case 'unary': {
      const operand = extractRationalFraction(expression.operand);
      if (!operand) {
        return null;
      }

      if (expression.operator === '+') {
        return operand;
      }

      return {
        numerator: unaryNode('-', operand.numerator),
        denominator: operand.denominator,
      };
    }
    case 'binary': {
      const left = extractRationalFraction(expression.left);
      const right = extractRationalFraction(expression.right);
      if (!left || !right) {
        return null;
      }

      switch (expression.operator) {
        case '+':
          return {
            numerator: binaryNode(
              '+',
              binaryNode('*', left.numerator, right.denominator),
              binaryNode('*', right.numerator, left.denominator)
            ),
            denominator: binaryNode('*', left.denominator, right.denominator),
          };
        case '-':
          return {
            numerator: binaryNode(
              '-',
              binaryNode('*', left.numerator, right.denominator),
              binaryNode('*', right.numerator, left.denominator)
            ),
            denominator: binaryNode('*', left.denominator, right.denominator),
          };
        case '*':
          return {
            numerator: binaryNode('*', left.numerator, right.numerator),
            denominator: binaryNode('*', left.denominator, right.denominator),
          };
        case '/':
          return {
            numerator: binaryNode('*', left.numerator, right.denominator),
            denominator: binaryNode('*', left.denominator, right.numerator),
          };
        case '^':
          if (right.numerator.kind !== 'number' || right.denominator.kind !== 'number') {
            return null;
          }

          if (right.denominator.value !== 1 || !Number.isInteger(right.numerator.value)) {
            return null;
          }

          if (right.numerator.value === 0) {
            return { numerator: numberNode(1), denominator: numberNode(1) };
          }

          if (right.numerator.value < 0) {
            const exponent = Math.abs(right.numerator.value);
            return {
              numerator: binaryNode('^', left.denominator, numberNode(exponent)),
              denominator: binaryNode('^', left.numerator, numberNode(exponent)),
            };
          }

          return {
            numerator: binaryNode('^', left.numerator, numberNode(right.numerator.value)),
            denominator: binaryNode('^', left.denominator, numberNode(right.numerator.value)),
          };
        default:
          return null;
      }
    }
    case 'function':
    case 'equation':
      return null;
    default: {
      const _exhaustive: never = expression;
      return _exhaustive;
    }
  }
}

function combineAddition(left: LimitState, right: LimitState): LimitState {
  if (left.kind === 'finite' && right.kind === 'finite') {
    if (left.expression.kind === 'number' && right.expression.kind === 'number') {
      return { kind: 'finite', expression: numberNode(left.expression.value + right.expression.value) };
    }

    return {
      kind: 'finite',
      expression: binaryNode('+', left.expression, right.expression),
    };
  }

  if (left.kind === 'zero') {
    return right;
  }

  if (right.kind === 'zero') {
    return left;
  }

  if (
    left.kind === 'positive-infinity' ||
    left.kind === 'negative-infinity' ||
    right.kind === 'positive-infinity' ||
    right.kind === 'negative-infinity'
  ) {
    if (left.kind === 'positive-infinity' && right.kind === 'negative-infinity') {
      return { kind: 'does-not-exist' };
    }

    if (left.kind === 'negative-infinity' && right.kind === 'positive-infinity') {
      return { kind: 'does-not-exist' };
    }

    return left.kind === 'positive-infinity' || right.kind === 'positive-infinity'
      ? { kind: 'positive-infinity' }
      : { kind: 'negative-infinity' };
  }

  return {
    kind: 'finite',
    expression: binaryNode('+', extractFiniteExpression(left), extractFiniteExpression(right)),
  };
}

function combineSubtraction(left: LimitState, right: LimitState): LimitState {
  return combineAddition(left, negateLimitState(right));
}

function combineMultiplication(left: LimitState, right: LimitState): LimitState {
  if (left.kind === 'zero' || right.kind === 'zero') {
    if (left.kind === 'positive-infinity' || left.kind === 'negative-infinity') {
      return { kind: 'does-not-exist' };
    }

    if (right.kind === 'positive-infinity' || right.kind === 'negative-infinity') {
      return { kind: 'does-not-exist' };
    }

    return { kind: 'zero', sign: 'positive' };
  }

  if (left.kind === 'finite' && right.kind === 'finite') {
    if (left.expression.kind === 'number' && right.expression.kind === 'number') {
      return { kind: 'finite', expression: numberNode(left.expression.value * right.expression.value) };
    }

    return {
      kind: 'finite',
      expression: binaryNode('*', left.expression, right.expression),
    };
  }

  if (left.kind === 'finite' && right.kind !== 'finite') {
    return multiplyFiniteBySpecial(left, right);
  }

  if (right.kind === 'finite' && left.kind !== 'finite') {
    return multiplyFiniteBySpecial(right, left);
  }

  if (
    (left.kind === 'positive-infinity' || left.kind === 'negative-infinity') &&
    (right.kind === 'positive-infinity' || right.kind === 'negative-infinity')
  ) {
    return {
      kind: left.kind === right.kind ? 'positive-infinity' : 'negative-infinity',
    };
  }

  return { kind: 'unsupported' };
}

function combineDivision(left: LimitState, right: LimitState): LimitState {
  if (right.kind === 'zero') {
    if (left.kind === 'zero') {
      return { kind: 'does-not-exist' };
    }

    if (left.kind === 'finite' && left.expression.kind === 'number') {
      const sign = signFromNumber(left.expression.value) === 'positive' ? right.sign : oppositeSign(right.sign);
      return sign === 'positive'
        ? { kind: 'positive-infinity' }
        : { kind: 'negative-infinity' };
    }

    if (left.kind === 'positive-infinity' || left.kind === 'negative-infinity') {
      return left;
    }

    return { kind: 'unsupported' };
  }

  if (left.kind === 'zero') {
    if (right.kind === 'positive-infinity' || right.kind === 'negative-infinity') {
      return { kind: 'zero', sign: 'positive' };
    }

    if (right.kind === 'finite') {
      return {
        kind: 'finite',
        expression: numberNode(0),
      };
    }
  }

  if (left.kind === 'finite' && right.kind === 'finite') {
    if (left.expression.kind === 'number' && right.expression.kind === 'number') {
      if (right.expression.value === 0) {
        return { kind: 'does-not-exist' };
      }

      return {
        kind: 'finite',
        expression: reduceExactRationalExpression(left.expression.value, right.expression.value),
      };
    }

    return {
      kind: 'finite',
      expression: binaryNode('/', left.expression, right.expression),
    };
  }

  if (left.kind === 'finite' && (right.kind === 'positive-infinity' || right.kind === 'negative-infinity')) {
    return { kind: 'zero', sign: 'positive' };
  }

  if ((left.kind === 'positive-infinity' || left.kind === 'negative-infinity') && right.kind === 'finite') {
    if (right.expression.kind !== 'number') {
      return { kind: 'unsupported' };
    }

    const sign = signFromNumber(right.expression.value);
    if (sign === 'zero') {
      return { kind: 'does-not-exist' };
    }

    return {
      kind: left.kind === (sign === 'positive' ? 'positive-infinity' : 'negative-infinity')
        ? 'positive-infinity'
        : 'negative-infinity',
    };
  }

  if (
    (left.kind === 'positive-infinity' || left.kind === 'negative-infinity') &&
    (right.kind === 'positive-infinity' || right.kind === 'negative-infinity')
  ) {
    return { kind: 'does-not-exist' };
  }

  return { kind: 'unsupported' };
}

function combinePower(left: LimitState, right: LimitState): LimitState {
  if (right.kind === 'finite' && right.expression.kind === 'number') {
    if (right.expression.value === 0) {
      return { kind: 'finite', expression: numberNode(1) };
    }

    if (right.expression.value === 1) {
      return left;
    }

    if (right.expression.value > 1 && Number.isInteger(right.expression.value)) {
      if (left.kind === 'finite') {
        if (left.expression.kind === 'number') {
          return {
            kind: 'finite',
            expression: buildExactNumericExpression(Math.pow(left.expression.value, right.expression.value)),
          };
        }

        return {
          kind: 'finite',
          expression: binaryNode('^', left.expression, right.expression),
        };
      }

      if (left.kind === 'zero') {
        return { kind: 'zero', sign: 'positive' };
      }

      if (left.kind === 'positive-infinity' || left.kind === 'negative-infinity') {
        return right.expression.value % 2 === 0
          ? { kind: 'positive-infinity' }
          : left;
      }
    }
  }

  if (
    left.kind === 'positive-infinity' ||
    left.kind === 'negative-infinity' ||
    right.kind === 'positive-infinity' ||
    right.kind === 'negative-infinity'
  ) {
    return { kind: 'does-not-exist' };
  }

  return {
    kind: 'finite',
    expression: binaryNode('^', extractFiniteExpression(left), extractFiniteExpression(right)),
  };
}

function multiplyFiniteBySpecial(finite: Extract<LimitState, { readonly kind: 'finite' }>, special: LimitState): LimitState {
  if (finite.expression.kind !== 'number') {
    return { kind: 'unsupported' };
  }

  const finiteSign = signFromNumber(finite.expression.value);
  if (finiteSign === 'zero') {
    return { kind: 'zero', sign: 'positive' };
  }

  if (special.kind === 'positive-infinity' || special.kind === 'negative-infinity') {
    const resultSign =
      finiteSign === 'positive'
        ? special.kind === 'positive-infinity'
          ? 'positive-infinity'
          : 'negative-infinity'
        : special.kind === 'positive-infinity'
          ? 'negative-infinity'
          : 'positive-infinity';

    return { kind: resultSign };
  }

  return { kind: 'unsupported' };
}

function negateLimitState(state: LimitState): LimitState {
  if (state.kind === 'finite') {
    if (state.expression.kind === 'number') {
      return { kind: 'finite', expression: numberNode(-state.expression.value) };
    }

    return { kind: 'finite', expression: unaryNode('-', state.expression) };
  }

  if (state.kind === 'zero') {
    return {
      kind: 'zero',
      sign: state.sign === 'positive' ? 'negative' : 'positive',
    };
  }

  if (state.kind === 'positive-infinity') {
    return { kind: 'negative-infinity' };
  }

  if (state.kind === 'negative-infinity') {
    return { kind: 'positive-infinity' };
  }

  return state;
}

function mergeDirectionalResults(left: LimitState, right: LimitState): LimitState {
  if (left.kind === 'domain-error' || right.kind === 'domain-error') {
    return left.kind === 'domain-error' ? left : right;
  }

  if (left.kind === 'unsupported' || right.kind === 'unsupported') {
    return left.kind === 'unsupported' ? left : right;
  }

  if (left.kind === 'does-not-exist' || right.kind === 'does-not-exist') {
    return { kind: 'does-not-exist' };
  }

  if (areEquivalentLimits(left, right)) {
    return left.kind === 'zero' || right.kind === 'zero'
      ? { kind: 'finite', expression: numberNode(0) }
      : left;
  }

  if (isZeroLike(left) && isZeroLike(right)) {
    return { kind: 'finite', expression: numberNode(0) };
  }

  if (left.kind === 'positive-infinity' && right.kind === 'positive-infinity') {
    return { kind: 'positive-infinity' };
  }

  if (left.kind === 'negative-infinity' && right.kind === 'negative-infinity') {
    return { kind: 'negative-infinity' };
  }

  if (
    (left.kind === 'positive-infinity' && right.kind === 'negative-infinity') ||
    (left.kind === 'negative-infinity' && right.kind === 'positive-infinity')
  ) {
    return { kind: 'does-not-exist' };
  }

  if (left.kind === 'zero' && right.kind === 'zero') {
    return { kind: 'finite', expression: numberNode(0) };
  }

  if (left.kind === 'finite' && right.kind === 'finite') {
    return { kind: 'does-not-exist' };
  }

  return { kind: 'does-not-exist' };
}

function areEquivalentLimits(left: LimitState, right: LimitState): boolean {
  if (left.kind !== right.kind) {
    return false;
  }

  switch (left.kind) {
    case 'finite':
      if (right.kind !== 'finite') return false;
      return formatCasExpression(left.expression) === formatCasExpression(right.expression);
    case 'zero':
      return right.kind === 'zero';
    case 'positive-infinity':
    case 'negative-infinity':
    case 'does-not-exist':
      return true;
    default:
      return false;
  }
}

function isZeroLike(state: LimitState): boolean {
  return state.kind === 'zero' || (state.kind === 'finite' && state.expression.kind === 'number' && state.expression.value === 0);
}

function extractFiniteExpression(state: LimitState): CasExpression {
  if (state.kind === 'finite') {
    return state.expression;
  }

  if (state.kind === 'zero') {
    return numberNode(0);
  }

  if (state.kind === 'positive-infinity') {
    return unaryNode('+', INFINITY_SYMBOL);
  }

  if (state.kind === 'negative-infinity') {
    return unaryNode('-', INFINITY_SYMBOL);
  }

  return DOES_NOT_EXIST_SYMBOL;
}

function formatLimitResult(
  result: Exclude<LimitState, { readonly kind: 'domain-error' } | { readonly kind: 'unsupported' }>,
  direction: CasLimitDirection
): CasLimitExpressionResult {
  switch (result.kind) {
    case 'finite': {
      const simplified = simplifyCasExpression(result.expression);
      const expression = simplified.ok ? simplified.value : result.expression;
      return {
        kind: 'finite',
        direction,
        expression,
        text: formatCasExpression(expression),
        latex: formatCasExpression(expression),
      };
    }
    case 'zero':
      return {
        kind: 'finite',
        direction,
        expression: numberNode(0),
        text: '0',
        latex: '0',
      };
    case 'positive-infinity':
      return {
        kind: 'positive-infinity',
        direction,
        expression: unaryNode('+', INFINITY_SYMBOL),
        text: '+∞',
        latex: '\\infty',
      };
    case 'negative-infinity':
      return {
        kind: 'negative-infinity',
        direction,
        expression: unaryNode('-', INFINITY_SYMBOL),
        text: '-∞',
        latex: '-\\infty',
      };
    case 'does-not-exist':
      return {
        kind: 'does-not-exist',
        direction,
        expression: DOES_NOT_EXIST_SYMBOL,
        text: 'El límite no existe',
        latex: '\\text{El límite no existe}',
      };
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}

function tryEvaluateConstantNumber(expression: CasExpression): number | null {
  switch (expression.kind) {
    case 'number':
      return expression.value;
    case 'symbol':
      return constantSymbolValue(expression.name);
    case 'unary': {
      const operand = tryEvaluateConstantNumber(expression.operand);
      if (operand === null) {
        return null;
      }

      return expression.operator === '+' ? operand : -operand;
    }
    case 'binary': {
      const left = tryEvaluateConstantNumber(expression.left);
      const right = tryEvaluateConstantNumber(expression.right);
      if (left === null || right === null) {
        return null;
      }

      switch (expression.operator) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          return right === 0 ? null : left / right;
        case '^': {
          const powered = Math.pow(left, right);
          return Number.isFinite(powered) ? powered : null;
        }
        default:
          return null;
      }
    }
    case 'function': {
      const args = expression.arguments.map(argument => tryEvaluateConstantNumber(argument));
      if (args.some(value => value === null)) {
        return null;
      }

      return evaluateNumericFunction(expression.name, args as readonly number[]);
    }
    case 'equation':
      return null;
    default: {
      const _exhaustive: never = expression;
      return _exhaustive;
    }
  }
}

function evaluateNumericFunction(name: string, values: readonly number[]): number | null {
  if (values.length !== 1) {
    return null;
  }

  const value = values[0];

  switch (name) {
    case 'sin':
      return Math.sin(value);
    case 'cos':
      return Math.cos(value);
    case 'tan': {
      const cosine = Math.cos(value);
      if (Math.abs(cosine) < 1e-12) {
        return null;
      }

      return Math.tan(value);
    }
    case 'exp':
    case 'expe':
      return Math.exp(value);
    case 'sqrt':
      return value < 0 ? null : Math.sqrt(value);
    case 'abs':
      return Math.abs(value);
    case 'ln':
      return value > 0 ? Math.log(value) : null;
    case 'log':
      return value > 0 ? Math.log10(value) : null;
    case 'cbrt':
      return Math.cbrt(value);
    default:
      return null;
  }
}

function buildExactNumericExpression(value: number): CasExpression {
  return reduceExactRationalExpression(value, 1);
}

function constantSymbolValue(name: string): number | null {
  switch (name) {
    case 'pi':
    case 'Ï€':
      return Math.PI;
    case 'e':
      return Math.E;
    default:
      return null;
  }
}

function classifyPoint(expression: CasExpression):
  | { readonly kind: 'finite'; readonly value: CasExpression }
  | { readonly kind: 'positive-infinity' }
  | { readonly kind: 'negative-infinity' } {
  if (expression.kind === 'symbol' && (expression.name === 'inf' || expression.name === 'infty')) {
    return { kind: 'positive-infinity' };
  }

  if (
    expression.kind === 'unary' &&
    expression.operator === '-' &&
    expression.operand.kind === 'symbol' &&
    (expression.operand.name === 'inf' || expression.operand.name === 'infty')
  ) {
    return { kind: 'negative-infinity' };
  }

  return { kind: 'finite', value: expression };
}

function normalizeDirection(direction: CasLimitOptions['direction']): CasLimitDirection | null {
  if (direction === undefined) {
    return 'both';
  }

  if (direction === 'both' || direction === 'left' || direction === 'right') {
    return direction;
  }

  return null;
}

function invalidLimitDirection(): CasResult<CasLimitExpressionResult> {
  return casFailure(
    createCasError(
      'INVALID_LIMIT_DIRECTION',
      'La dirección del límite no es válida.'
    )
  );
}

function unsupportedLimit(functionName?: string): CasResult<CasLimitExpressionResult> {
  return casFailure(
    createCasError(
      'CAS_UNSUPPORTED_LIMIT',
      'Este límite todavía no está soportado.',
      undefined,
      functionName
    )
  );
}

function oppositeSign(sign: 'positive' | 'negative'): 'positive' | 'negative' {
  return sign === 'positive' ? 'negative' : 'positive';
}

function signFromNumber(value: number): 'positive' | 'negative' | 'zero' {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'zero';
}

function signOfRatio(
  numerator: number,
  denominator: number
): 'positive' | 'negative' {
  const sign = Math.sign(numerator) * Math.sign(denominator);
  return sign < 0 ? 'negative' : 'positive';
}

function negateFiniteExpression(expression: CasExpression): CasExpression {
  if (expression.kind === 'number') {
    return numberNode(-expression.value);
  }

  if (expression.kind === 'unary' && expression.operator === '-') {
    return expression.operand;
  }

  return unaryNode('-', expression);
}

function argumentToExpression(argument: LimitState): CasExpression {
  switch (argument.kind) {
    case 'finite':
      return argument.expression;
    case 'zero':
      return numberNode(0);
    case 'positive-infinity':
      return unaryNode('+', INFINITY_SYMBOL);
    case 'negative-infinity':
      return unaryNode('-', INFINITY_SYMBOL);
    case 'does-not-exist':
      return DOES_NOT_EXIST_SYMBOL;
    case 'domain-error':
    case 'unsupported':
      return DOES_NOT_EXIST_SYMBOL;
    default: {
      const _exhaustive: never = argument;
      return _exhaustive;
    }
  }
}

function lowestOrderAtZero(polynomial: Polynomial):
  | { readonly kind: 'zero-polynomial' }
  | { readonly kind: 'term'; readonly order: number; readonly coefficient: number } {
  const terms = polynomial.terms.filter(term => term.coefficient !== 0);
  if (terms.length === 0) {
    return { kind: 'zero-polynomial' };
  }

  let order = Number.POSITIVE_INFINITY;
  let coefficient = 0;

  for (const term of terms) {
    const termOrder = term.powers[LIMIT_APPROACH_VARIABLE] ?? 0;
    if (termOrder < order) {
      order = termOrder;
      coefficient = term.coefficient;
      continue;
    }

    if (termOrder === order) {
      coefficient += term.coefficient;
    }
  }

  if (coefficient === 0) {
    return { kind: 'zero-polynomial' };
  }

  return {
    kind: 'term',
    order,
    coefficient,
  };
}
