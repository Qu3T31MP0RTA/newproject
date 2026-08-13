import { binaryNode, numberNode, type CasExpression, unaryNode } from '../ast/cas-ast';

export interface RationalApproximation {
  readonly numerator: number;
  readonly denominator: number;
}

const MAX_RATIONAL_DENOMINATOR = 1_000_000;
const RATIONAL_APPROXIMATION_TOLERANCE = 1e-12;

export function reduceExactRationalExpression(
  numerator: number,
  denominator: number
): CasExpression {
  if (denominator === 0) {
    return binaryNode('/', numberNode(numerator), numberNode(denominator));
  }

  if (numerator === 0) {
    return numberNode(0);
  }

  const normalizedDenominator = denominator < 0 ? -denominator : denominator;
  const normalizedNumerator = denominator < 0 ? -numerator : numerator;

  if (Number.isInteger(normalizedNumerator) && Number.isInteger(normalizedDenominator)) {
    const divisor = gcdOfIntegers(
      Math.abs(normalizedNumerator),
      Math.abs(normalizedDenominator)
    );
    const reducedNumerator = normalizedNumerator / divisor;
    const reducedDenominator = normalizedDenominator / divisor;

    if (reducedDenominator === 1) {
      return numberNode(reducedNumerator);
    }

    return binaryNode(
      '/',
      numberNode(reducedNumerator),
      numberNode(reducedDenominator)
    );
  }

  const quotient = normalizedNumerator / normalizedDenominator;
  const approximation = approximateRationalValue(quotient);
  if (approximation) {
    return buildRationalExpression(approximation);
  }

  return binaryNode(
    '/',
    numberNode(normalizedNumerator),
    numberNode(normalizedDenominator)
  );
}

export function gcdOfIntegers(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);

  while (b !== 0) {
    const temp = b;
    b = a % b;
    a = temp;
  }

  return a;
}

export function approximateRationalValue(
  value: number,
  maxDenominator: number = MAX_RATIONAL_DENOMINATOR,
  tolerance: number = RATIONAL_APPROXIMATION_TOLERANCE
): RationalApproximation | null {
  if (!Number.isFinite(value)) {
    return null;
  }

  if (Number.isInteger(value)) {
    return {
      numerator: value,
      denominator: 1,
    };
  }

  const sign = value < 0 ? -1 : 1;
  let remaining = Math.abs(value);
  let previousNumerator = 0;
  let numerator = 1;
  let previousDenominator = 1;
  let denominator = 0;
  let bestApproximation: RationalApproximation | null = null;
  let bestError = Number.POSITIVE_INFINITY;

  for (let iteration = 0; iteration < 32; iteration++) {
    const coefficient = Math.floor(remaining);
    const nextNumerator = coefficient * numerator + previousNumerator;
    const nextDenominator = coefficient * denominator + previousDenominator;

    if (nextDenominator > maxDenominator) {
      break;
    }

    const approximation = nextNumerator / nextDenominator;
    const error = Math.abs(approximation - Math.abs(value));
    if (error < bestError) {
      bestError = error;
      bestApproximation = {
        numerator: sign * nextNumerator,
        denominator: nextDenominator,
      };
    }

    if (error <= tolerance) {
      return bestApproximation;
    }

    const fractionalPart = remaining - coefficient;
    if (fractionalPart === 0) {
      break;
    }

    remaining = 1 / fractionalPart;
    previousNumerator = numerator;
    numerator = nextNumerator;
    previousDenominator = denominator;
    denominator = nextDenominator;
  }

  if (bestApproximation && bestError <= tolerance * Math.max(1, Math.abs(value))) {
    return bestApproximation;
  }

  return null;
}

export function buildExactRationalExpression(value: number): CasExpression {
  if (Number.isInteger(value)) {
    return numberNode(value);
  }

  const normalized = Object.is(value, -0) ? 0 : value;
  const approximation = approximateRationalValue(normalized);
  if (!approximation) {
    return numberNode(normalized);
  }

  return buildRationalExpression(approximation);
}

export function buildExactDivision(
  numerator: CasExpression,
  denominator: number
): CasExpression {
  if (denominator === 1) {
    return numerator;
  }

  if (denominator === -1) {
    return unaryNode('-', numerator);
  }

  if (numerator.kind === 'number') {
    return reduceExactRationalExpression(numerator.value, denominator);
  }

  const normalizedNumerator = normalizeExactNode(numerator);
  if (normalizedNumerator.kind === 'unary' && normalizedNumerator.operator === '-') {
    return unaryNode('-', buildExactDivision(normalizedNumerator.operand, denominator));
  }

  if (normalizedNumerator.kind === 'number') {
    return reduceExactRationalExpression(normalizedNumerator.value, denominator);
  }

  const factors = collectMultiplicationFactors(normalizedNumerator);
  let numericFactor = 1;
  const nonNumericFactors: CasExpression[] = [];

  for (const factor of factors) {
    if (factor.kind === 'number') {
      numericFactor *= factor.value;
    } else {
      nonNumericFactors.push(factor);
    }
  }

  const normalizedDenominator = denominator < 0 ? -denominator : denominator;
  const normalizedFactor = denominator < 0 ? -numericFactor : numericFactor;

  if (
    Number.isInteger(normalizedFactor) &&
    Number.isInteger(normalizedDenominator)
  ) {
    const divisor = gcdOfIntegers(
      Math.abs(normalizedFactor),
      Math.abs(normalizedDenominator)
    );
    const reducedFactor = normalizedFactor / divisor;
    const reducedDenominator = normalizedDenominator / divisor;
    const rebuilt = buildSignedProduct(reducedFactor, nonNumericFactors);

    if (reducedDenominator === 1) {
      return rebuilt;
    }

    return binaryNode('/', rebuilt, numberNode(reducedDenominator));
  }

  return binaryNode('/', normalizedNumerator, numberNode(normalizedDenominator));
}

function buildRationalExpression(approximation: RationalApproximation): CasExpression {
  const numerator = approximation.numerator;
  const denominator = approximation.denominator;

  if (denominator === 1) {
    return numberNode(numerator);
  }

  if (numerator === 1) {
    return binaryNode('/', numberNode(1), numberNode(denominator));
  }

  if (numerator === -1) {
    return unaryNode('-', binaryNode('/', numberNode(1), numberNode(denominator)));
  }

  return binaryNode('/', numberNode(numerator), numberNode(denominator));
}

function normalizeExactNode(expression: CasExpression): CasExpression {
  switch (expression.kind) {
    case 'number':
      return numberNode(expression.value);
    case 'symbol':
      return expression;
    case 'unary': {
      const operand = normalizeExactNode(expression.operand);
      if (expression.operator === '+') {
        return operand;
      }

      if (operand.kind === 'number') {
        return numberNode(-operand.value);
      }

      if (operand.kind === 'unary' && operand.operator === '-') {
        return operand.operand;
      }

      return unaryNode('-', operand);
    }
    case 'binary': {
      const left = normalizeExactNode(expression.left);
      const right = normalizeExactNode(expression.right);

      switch (expression.operator) {
        case '+':
          return binaryNode('+', left, right);
        case '-':
          return binaryNode('-', left, right);
        case '*':
          return binaryNode('*', left, right);
        case '/':
          return binaryNode('/', left, right);
        case '^':
          return binaryNode('^', left, right);
        default:
          throw new Error('Unsupported CAS binary operator in rational normalization.');
      }
    }
    case 'function':
      return {
        ...expression,
        arguments: expression.arguments.map(argument => normalizeExactNode(argument)),
      };
    case 'equation':
      return {
        ...expression,
        left: normalizeExactNode(expression.left),
        right: normalizeExactNode(expression.right),
      };
    default:
      throw new Error('Unsupported CAS expression kind in rational normalization.');
  }
}

function collectMultiplicationFactors(expression: CasExpression): CasExpression[] {
  if (expression.kind === 'binary' && expression.operator === '*') {
    return [
      ...collectMultiplicationFactors(expression.left),
      ...collectMultiplicationFactors(expression.right),
    ];
  }

  return [expression];
}

function buildSignedProduct(
  numericFactor: number,
  factors: readonly CasExpression[]
): CasExpression {
  if (factors.length === 0) {
    return numberNode(numericFactor);
  }

  const product = factors.reduce((left, right) => binaryNode('*', left, right));

  if (numericFactor === 1) {
    return product;
  }

  if (numericFactor === -1) {
    return unaryNode('-', product);
  }

  return numericFactor < 0
    ? unaryNode('-', binaryNode('*', numberNode(Math.abs(numericFactor)), product))
    : binaryNode('*', numberNode(numericFactor), product);
}
