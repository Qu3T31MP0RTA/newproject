import {
  binaryNode,
  numberNode,
  symbolNode,
  type CasBinaryNode,
  type CasExpression,
  type CasUnaryNode,
  unaryNode,
} from '../ast/cas-ast';
import { createCasError } from '../errors/cas-errors';
import { DEFAULT_CAS_LIMITS, resolveCasLimits, type CasLimits } from '../limits/cas-limits';
import { casFailure, casSuccess, type CasResult } from '../result/cas-result';
import { approximateRationalValue, buildExactDivision } from '../rational/cas-rational';

export interface PolynomialTerm {
  readonly coefficient: number;
  readonly powers: Readonly<Record<string, number>>;
}

export interface Polynomial {
  readonly terms: readonly PolynomialTerm[];
}

export interface CasPolynomialOptions {
  readonly limits?: Partial<CasLimits>;
  readonly maxExponent?: number;
  readonly maxTerms?: number;
}

export interface CasExpandOptions extends CasPolynomialOptions {}

export const DEFAULT_CAS_EXPAND_OPTIONS: Required<Pick<CasPolynomialOptions, 'maxExponent' | 'maxTerms'>> = {
  maxExponent: 8,
  maxTerms: 256,
};

type MonomialMap = Map<string, PolynomialTerm>;

export function toPolynomial(
  expression: CasExpression,
  options: CasPolynomialOptions = {}
): CasResult<Polynomial> {
  const limits = resolveCasLimits(options.limits ?? DEFAULT_CAS_LIMITS);
  const initial = measureInput(expression, limits);
  if (!initial.ok) {
    return initial;
  }

  const converted = toPolynomialInternal(
    expression,
    {
      maxExponent: options.maxExponent ?? DEFAULT_CAS_EXPAND_OPTIONS.maxExponent,
      maxTerms: options.maxTerms ?? DEFAULT_CAS_EXPAND_OPTIONS.maxTerms,
    }
  );

  if (!converted.ok) {
    return converted;
  }

  return casSuccess(normalizePolynomial(converted.value));
}

export function fromPolynomial(polynomial: Polynomial): CasExpression {
  const terms = normalizePolynomial(polynomial).terms;
  if (terms.length === 0) {
    return numberNode(0);
  }

  const expression = terms
    .filter(term => term.coefficient !== 0)
    .map(term => buildTermExpression(term))
    .filter((term): term is CasExpression => term !== null);

  if (expression.length === 0) {
    return numberNode(0);
  }

  let result: CasExpression | null = null;
  for (const term of expression) {
    if (term.kind === 'unary' && term.operator === '-') {
      result =
        result === null
          ? unaryNode('-', term.operand)
          : binaryNode('-', result, term.operand);
      continue;
    }

    result = result === null ? term : binaryNode('+', result, term);
  }

  return result ?? numberNode(0);
}

export function degree(polynomial: Polynomial): number {
  if (polynomial.terms.length === 0) {
    return 0;
  }

  return Math.max(...polynomial.terms.map(term => degreeOfTerm(term)));
}

export function degreeIn(polynomial: Polynomial, variable: string): number {
  let max = 0;
  for (const term of polynomial.terms) {
    const exponent = term.powers[variable] ?? 0;
    max = Math.max(max, exponent);
  }
  return max;
}

export function coefficientOf(
  polynomial: Polynomial,
  powers: Readonly<Record<string, number>>
): number {
  const key = termKey(powers);
  return polynomial.terms.find(term => termKey(term.powers) === key)?.coefficient ?? 0;
}

export function normalizePolynomial(polynomial: Polynomial): Polynomial {
  return createPolynomialFromTerms(polynomial.terms);
}

export function addPolynomials(left: Polynomial, right: Polynomial): Polynomial {
  return createPolynomialFromTerms([...left.terms, ...right.terms]);
}

export function negatePolynomial(polynomial: Polynomial): Polynomial {
  return createPolynomialFromTerms(
    polynomial.terms.map(term => ({
      coefficient: -term.coefficient,
      powers: term.powers,
    }))
  );
}

export function subtractPolynomials(left: Polynomial, right: Polynomial): Polynomial {
  return addPolynomials(left, negatePolynomial(right));
}

export function multiplyPolynomials(left: Polynomial, right: Polynomial): Polynomial {
  const terms: PolynomialTerm[] = [];

  for (const leftTerm of left.terms) {
    for (const rightTerm of right.terms) {
      terms.push(multiplyTerms(leftTerm, rightTerm));
    }
  }

  return createPolynomialFromTerms(terms);
}

export function scalePolynomial(polynomial: Polynomial, factor: number): Polynomial {
  return createPolynomialFromTerms(
    polynomial.terms.map(term => ({
      coefficient: term.coefficient * factor,
      powers: term.powers,
    }))
  );
}

export function powerPolynomial(
  polynomial: Polynomial,
  exponent: number,
  maxTerms: number
): CasResult<Polynomial> {
  if (!Number.isInteger(exponent) || exponent < 1) {
    return casFailure(
      createCasError(
        'UNSUPPORTED_EXPRESSION',
        'Los exponentes polinómicos deben ser enteros positivos.'
      )
    );
  }

  let result = constantPolynomial(1);
  for (let index = 0; index < exponent; index++) {
    result = multiplyPolynomials(result, polynomial);
    if (result.terms.length > maxTerms) {
      return casFailure(
        createCasError(
          'TOO_COMPLEX',
          'La expansión polinómica supera el límite de términos.'
        )
      );
    }
  }

  return casSuccess(result);
}

export function toExpressionIfPolynomial(
  expression: CasExpression,
  options: CasPolynomialOptions = {}
): CasResult<CasExpression> {
  const polynomial = toPolynomial(expression, options);
  if (!polynomial.ok) {
    return polynomial;
  }

  return casSuccess(fromPolynomial(polynomial.value));
}

function toPolynomialInternal(
  expression: CasExpression,
  options: Required<Pick<CasExpandOptions, 'maxExponent' | 'maxTerms'>>
): CasResult<Polynomial> {
  switch (expression.kind) {
    case 'number':
      return casSuccess(constantPolynomial(expression.value));
    case 'symbol':
      return casSuccess(symbolPolynomial(expression.name));
    case 'unary':
      return toPolynomialUnary(expression, options);
    case 'binary':
      return toPolynomialBinary(expression, options);
    case 'function':
    case 'equation':
      return casFailure(
        createCasError(
          'UNSUPPORTED_EXPRESSION',
          'La expresión contiene nodos no polinómicos.'
        )
      );
    default: {
      const _exhaustive: never = expression;
      return _exhaustive;
    }
  }
}

function toPolynomialUnary(
  node: CasUnaryNode,
  options: Required<Pick<CasExpandOptions, 'maxExponent' | 'maxTerms'>>
): CasResult<Polynomial> {
  const operand = toPolynomialInternal(node.operand, options);
  if (!operand.ok) return operand;

  if (node.operator === '+') {
    return operand;
  }

  return casSuccess(negatePolynomial(operand.value));
}

function toPolynomialBinary(
  node: CasBinaryNode,
  options: Required<Pick<CasExpandOptions, 'maxExponent' | 'maxTerms'>>
): CasResult<Polynomial> {
  const left = toPolynomialInternal(node.left, options);
  if (!left.ok) return left;
  const right = toPolynomialInternal(node.right, options);
  if (!right.ok) return right;

  switch (node.operator) {
    case '+':
      return casSuccess(addPolynomials(left.value, right.value));
    case '-':
      return casSuccess(subtractPolynomials(left.value, right.value));
    case '*':
      return casSuccess(multiplyPolynomials(left.value, right.value));
    case '/':
      return dividePolynomial(left.value, right.value);
    case '^':
      return powerPolynomialWithExpressionExponent(left.value, node.right, options);
    default: {
      const _exhaustive: never = node.operator;
      return _exhaustive;
    }
  }
}

function powerPolynomialWithExpressionExponent(
  base: Polynomial,
  exponentExpression: CasExpression,
  options: Required<Pick<CasExpandOptions, 'maxExponent' | 'maxTerms'>>
): CasResult<Polynomial> {
  if (exponentExpression.kind !== 'number') {
    return casFailure(
      createCasError(
        'UNSUPPORTED_EXPRESSION',
        'Los exponentes polinómicos deben ser numéricos.'
      )
    );
  }

  if (!Number.isInteger(exponentExpression.value) || exponentExpression.value < 1) {
    return casFailure(
      createCasError(
        'UNSUPPORTED_EXPRESSION',
        'Los exponentes polinómicos deben ser enteros positivos.'
      )
    );
  }

  if (exponentExpression.value > options.maxExponent) {
    return casFailure(
      createCasError(
        'TOO_COMPLEX',
        'La expansión polinómica supera el exponente máximo permitido.'
      )
    );
  }

  return powerPolynomial(base, exponentExpression.value, options.maxTerms);
}

function dividePolynomial(
  numerator: Polynomial,
  denominator: Polynomial
): CasResult<Polynomial> {
  if (!isConstantPolynomial(denominator)) {
    return casFailure(
      createCasError(
        'UNSUPPORTED_EXPRESSION',
        'La división polinómica sólo admite denominadores constantes.'
      )
    );
  }

  const divisor = denominator.terms[0]?.coefficient ?? 0;
  if (divisor === 0) {
    return casFailure(
      createCasError('DIVISION_BY_ZERO', 'No se puede dividir entre cero.')
    );
  }

  return casSuccess(
    scalePolynomial(numerator, 1 / divisor)
  );
}

function isConstantPolynomial(polynomial: Polynomial): boolean {
  return polynomial.terms.length === 1 && degreeOfTerm(polynomial.terms[0]) === 0;
}

function constantPolynomial(value: number): Polynomial {
  return createPolynomialFromTerms([
    {
      coefficient: value,
      powers: {},
    },
  ]);
}

function symbolPolynomial(name: string): Polynomial {
  return createPolynomialFromTerms([
    {
      coefficient: 1,
      powers: { [name]: 1 },
    },
  ]);
}

function createPolynomialFromTerms(terms: readonly PolynomialTerm[]): Polynomial {
  const map: MonomialMap = new Map();

  for (const term of terms) {
    if (!Number.isFinite(term.coefficient)) {
      continue;
    }

    const normalizedPowers = normalizePowers(term.powers);
    const key = termKey(normalizedPowers);
    const existing = map.get(key);
    const coefficient = (existing?.coefficient ?? 0) + normalizeCoefficient(term.coefficient);

    if (coefficient === 0) {
      map.delete(key);
      continue;
    }

    map.set(key, {
      coefficient,
      powers: normalizedPowers,
    });
  }

  const sorted = [...map.values()].sort(compareTerms);
  if (sorted.length === 0) {
    return {
      terms: [
        {
          coefficient: 0,
          powers: {},
        },
      ],
    };
  }

  return {
    terms: sorted.map(term => ({
      coefficient: normalizeZero(term.coefficient),
      powers: freezePowers(term.powers),
    })),
  };
}

function normalizePowers(powers: Readonly<Record<string, number>>): Record<string, number> {
  const normalized: Record<string, number> = {};
  for (const [name, exponent] of Object.entries(powers)) {
    if (!Number.isFinite(exponent) || !Number.isInteger(exponent) || exponent < 0) {
      continue;
    }
    if (exponent === 0) {
      continue;
    }
    normalized[name] = exponent;
  }
  return normalized;
}

function freezePowers(powers: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  return Object.freeze({ ...powers });
}

function normalizeCoefficient(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

export function termKey(powers: Readonly<Record<string, number>>): string {
  const entries = Object.entries(powers)
    .filter(([, exponent]) => exponent !== 0)
    .sort(([left], [right]) => left.localeCompare(right));

  if (entries.length === 0) {
    return '';
  }

  return entries
    .map(([name, exponent]) => `${name}${exponent === 1 ? '' : `^${exponent}`}`)
    .join('*');
}

function compareTerms(left: PolynomialTerm, right: PolynomialTerm): number {
  const leftDegree = degreeOfTerm(left);
  const rightDegree = degreeOfTerm(right);

  if (leftDegree !== rightDegree) {
    return rightDegree - leftDegree;
  }

  const leftKey = termKey(left.powers);
  const rightKey = termKey(right.powers);

  return leftKey.localeCompare(rightKey);
}

function degreeOfTerm(term: PolynomialTerm): number {
  return Object.values(term.powers).reduce((sum, exponent) => sum + exponent, 0);
}

function multiplyTerms(left: PolynomialTerm, right: PolynomialTerm): PolynomialTerm {
  const powers: Record<string, number> = { ...left.powers };
  for (const [name, exponent] of Object.entries(right.powers)) {
    powers[name] = (powers[name] ?? 0) + exponent;
  }

  return {
    coefficient: normalizeCoefficient(left.coefficient * right.coefficient),
    powers,
  };
}

function buildTermExpression(term: PolynomialTerm): CasExpression | null {
  if (term.coefficient === 0) {
    return null;
  }

  const factors: CasExpression[] = [];
  for (const [name, exponent] of Object.entries(term.powers).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    if (exponent === 1) {
      factors.push(symbolNode(name));
    } else {
      factors.push(binaryNode('^', symbolNode(name), numberNode(exponent)));
    }
  }

  if (factors.length === 0) {
    return exactNumberExpression(term.coefficient);
  }

  let monomial = factors.reduce((left, right) => binaryNode('*', left, right));

  if (term.coefficient === 1) {
    return monomial;
  }

  if (term.coefficient === -1) {
    return unaryNode('-', monomial);
  }

  const rational = approximateRationalValue(term.coefficient);
  if (!rational) {
    return binaryNode('*', numberNode(term.coefficient), monomial);
  }

  if (rational.denominator === 1) {
    if (rational.numerator < 0) {
      return unaryNode(
        '-',
        binaryNode('*', numberNode(Math.abs(rational.numerator)), monomial)
      );
    }

    return binaryNode('*', numberNode(rational.numerator), monomial);
  }

  if (rational.numerator === 1) {
    return buildExactDivision(monomial, rational.denominator);
  }

  if (rational.numerator === -1) {
    return unaryNode('-', buildExactDivision(monomial, rational.denominator));
  }

  if (rational.numerator < 0) {
    return unaryNode(
      '-',
      buildExactDivision(
        binaryNode('*', numberNode(Math.abs(rational.numerator)), monomial),
        rational.denominator
      )
    );
  }

  return buildExactDivision(
    binaryNode('*', numberNode(rational.numerator), monomial),
    rational.denominator
  );
}

function exactNumberExpression(value: number): CasExpression {
  if (Number.isInteger(value)) {
    return numberNode(value);
  }

  const rational = approximateRationalValue(Object.is(value, -0) ? 0 : value);
  if (!rational) {
    return numberNode(value);
  }

  if (rational.denominator === 1) {
    return numberNode(rational.numerator);
  }

  return buildExactDivision(numberNode(rational.numerator), rational.denominator);
}

function measureInput(
  expression: CasExpression,
  limits: CasLimits
): CasResult<void> {
  const depth = measureDepth(expression);
  const nodeCount = measureNodes(expression);

  if (depth > limits.maxDepth || nodeCount > limits.maxNodes) {
    return casFailure(
      createCasError('TOO_COMPLEX', 'La expresión supera el límite de complejidad.')
    );
  }

  return casSuccess(undefined);
}

function measureDepth(expression: CasExpression): number {
  switch (expression.kind) {
    case 'number':
    case 'symbol':
      return 1;
    case 'unary':
      return measureDepth(expression.operand) + 1;
    case 'binary':
      return Math.max(measureDepth(expression.left), measureDepth(expression.right)) + 1;
    case 'function':
      return 1 + Math.max(0, ...expression.arguments.map(argument => measureDepth(argument)));
    case 'equation':
      return Math.max(measureDepth(expression.left), measureDepth(expression.right)) + 1;
    default: {
      const _exhaustive: never = expression;
      return _exhaustive;
    }
  }
}

function measureNodes(expression: CasExpression): number {
  switch (expression.kind) {
    case 'number':
    case 'symbol':
      return 1;
    case 'unary':
      return 1 + measureNodes(expression.operand);
    case 'binary':
      return 1 + measureNodes(expression.left) + measureNodes(expression.right);
    case 'function':
      return 1 + expression.arguments.reduce((count, argument) => count + measureNodes(argument), 0);
    case 'equation':
      return 1 + measureNodes(expression.left) + measureNodes(expression.right);
    default: {
      const _exhaustive: never = expression;
      return _exhaustive;
    }
  }
}

function isPolynomialExpressionSafe(expression: CasExpression): boolean {
  return toPolynomial(expression).ok;
}

export function polynomialRoundTrip(
  expression: CasExpression,
  options: CasPolynomialOptions = {}
): CasResult<CasExpression> {
  const polynomial = toPolynomial(expression, options);
  if (!polynomial.ok) {
    return polynomial;
  }

  return casSuccess(fromPolynomial(polynomial.value));
}

export function canRepresentAsPolynomial(expression: CasExpression): boolean {
  return isPolynomialExpressionSafe(expression);
}
