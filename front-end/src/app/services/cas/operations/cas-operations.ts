import {
  binaryNode,
  numberNode,
  symbolNode,
  type CasExpression,
} from '../ast/cas-ast';
import { createCasError } from '../errors/cas-errors';
import { DEFAULT_CAS_LIMITS } from '../limits/cas-limits';
import { casFailure, casSuccess, type CasResult } from '../result/cas-result';
import {
  DEFAULT_CAS_EXPAND_OPTIONS,
  fromPolynomial,
  normalizePolynomial,
  toPolynomial,
  termKey,
  type CasExpandOptions,
  type Polynomial,
  type PolynomialTerm,
} from '../polynomial/cas-polynomial';
import { formatCasExpression } from '../format/cas-formatter';
import { simplifyCasExpression } from '../simplify/cas-simplifier';
import type { CasTextResult } from '../simplify/cas-simplifier';

export function expandCasExpression(
  expression: CasExpression,
  options: CasExpandOptions = {}
): CasResult<CasExpression> {
  const simplified = simplifyCasExpression(expression, {
    limits: options.limits ?? DEFAULT_CAS_LIMITS,
  });
  if (!simplified.ok) {
    return simplified;
  }

  const polynomial = toPolynomial(simplified.value, {
    limits: options.limits ?? DEFAULT_CAS_LIMITS,
    maxExponent: options.maxExponent ?? DEFAULT_CAS_EXPAND_OPTIONS.maxExponent,
    maxTerms: options.maxTerms ?? DEFAULT_CAS_EXPAND_OPTIONS.maxTerms,
  });
  if (!polynomial.ok) {
    return casFailure(
      createCasError(
        'UNSUPPORTED_EXPRESSION',
        'La expresión contiene nodos no polinómicos.'
      )
    );
  }

  return casSuccess(fromPolynomial(polynomial.value), simplified.metadata);
}

export function expandCasText(
  source: string,
  parser: { parse(source: string): CasResult<CasExpression> },
  options: CasExpandOptions = {}
): CasResult<CasTextResult> {
  const parsed = parser.parse(source);
  if (!parsed.ok) {
    return parsed;
  }

  const expanded = expandCasExpression(parsed.value, options);
  if (!expanded.ok) {
    return expanded;
  }

  return casSuccess(
    {
      expression: expanded.value,
      text: formatCasExpression(expanded.value),
      latex: formatCasExpression(expanded.value),
    },
    expanded.metadata
  );
}

export function factorCasExpression(
  expression: CasExpression
): CasResult<CasExpression> {
  const simplified = simplifyCasExpression(expression, {
    limits: DEFAULT_CAS_LIMITS,
  });
  if (!simplified.ok) {
    return simplified;
  }

  const polynomial = toPolynomial(simplified.value, {
    limits: DEFAULT_CAS_LIMITS,
    maxExponent: DEFAULT_CAS_EXPAND_OPTIONS.maxExponent,
    maxTerms: DEFAULT_CAS_EXPAND_OPTIONS.maxTerms,
  });
  if (!polynomial.ok) {
    return simplified;
  }

  const factored = tryFactorPolynomial(normalizePolynomial(polynomial.value));
  if (!factored.ok || factored.value === null) {
    return simplified;
  }

  return casSuccess(factored.value, simplified.metadata);
}

export function factorCasText(
  source: string,
  parser: { parse(source: string): CasResult<CasExpression> }
): CasResult<CasTextResult> {
  const parsed = parser.parse(source);
  if (!parsed.ok) {
    return parsed;
  }

  const factored = factorCasExpression(parsed.value);
  if (!factored.ok) {
    return factored;
  }

  return casSuccess(
    {
      expression: factored.value,
      text: formatCasExpression(factored.value),
      latex: formatCasExpression(factored.value),
    },
    factored.metadata
  );
}

type FactorOutcome = CasResult<CasExpression | null>;

function tryFactorPolynomial(polynomial: Polynomial): FactorOutcome {
  const commonFactor = factorCommonMonomial(polynomial);
  if (commonFactor.ok && commonFactor.value !== null) {
    return commonFactor;
  }

  const differenceOfSquares = factorDifferenceOfSquares(polynomial);
  if (differenceOfSquares.ok && differenceOfSquares.value !== null) {
    return differenceOfSquares;
  }

  const perfectSquare = factorPerfectSquareTrinomial(polynomial);
  if (perfectSquare.ok && perfectSquare.value !== null) {
    return perfectSquare;
  }

  return casSuccess(null);
}

function factorCommonMonomial(polynomial: Polynomial): FactorOutcome {
  const terms = polynomial.terms.filter(term => term.coefficient !== 0);
  if (terms.length < 2) {
    return casSuccess(null);
  }

  const integerCoefficients = terms.every(term => Number.isInteger(term.coefficient));
  const numericGcd = integerCoefficients
    ? terms
        .map(term => Math.abs(term.coefficient))
        .reduce((gcd, value) => gcdOfIntegers(gcd, value))
    : 1;

  const commonPowers = commonExponentMap(terms);
  const hasCommonVariables = Object.keys(commonPowers).length > 0;
  const hasCommonNumeric = numericGcd > 1;

  if (!hasCommonVariables && !hasCommonNumeric) {
    return casSuccess(null);
  }

  const factorTerm: PolynomialTerm = {
    coefficient: hasCommonNumeric ? numericGcd : 1,
    powers: commonPowers,
  };

  const remainderTerms: PolynomialTerm[] = terms.map(term => ({
    coefficient: term.coefficient / factorTerm.coefficient,
    powers: subtractExponentMap(term.powers, commonPowers),
  }));

  const remainder = normalizePolynomial({ terms: remainderTerms });
  const factorExpression = fromPolynomial({ terms: [factorTerm] });

  if (isNeutralFactorExpression(factorExpression)) {
    return casSuccess(null);
  }

  return casSuccess(binaryNode('*', factorExpression, fromPolynomial(remainder)));
}

function factorDifferenceOfSquares(polynomial: Polynomial): FactorOutcome {
  const terms = polynomial.terms.filter(term => term.coefficient !== 0);
  if (terms.length !== 2) {
    return casSuccess(null);
  }

  const [first, second] = terms;
  const positive = first.coefficient > 0 ? first : second;
  const negative = first.coefficient < 0 ? first : second;

  if (positive.coefficient !== 1 || negative.coefficient !== -1) {
    return casSuccess(null);
  }

  const rootPositive = squareRootMonomial(positive);
  const rootNegative = squareRootMonomial({
    coefficient: 1,
    powers: negative.powers,
  });

  if (!rootPositive || !rootNegative) {
    return casSuccess(null);
  }

  return casSuccess(
    binaryNode(
      '*',
      binaryNode('-', rootPositive, rootNegative),
      binaryNode('+', rootPositive, rootNegative)
    )
  );
}

function factorPerfectSquareTrinomial(polynomial: Polynomial): FactorOutcome {
  const terms = polynomial.terms.filter(term => term.coefficient !== 0);
  if (terms.length !== 3) {
    return casSuccess(null);
  }

  const constant = terms.find(term => degreeOfTerm(term) === 0);
  const middle = terms.find(term => degreeOfTerm(term) === 1);
  const outer = terms.find(term => degreeOfTerm(term) === 2);

  if (!constant || !middle || !outer) {
    return casSuccess(null);
  }

  if (constant.coefficient !== 1 || outer.coefficient !== 1) {
    return casSuccess(null);
  }

  if (Math.abs(middle.coefficient) !== 2) {
    return casSuccess(null);
  }

  const rootOuter = squareRootMonomial(outer);
  if (!rootOuter) {
    return casSuccess(null);
  }

  const rootOuterPowers = powersFromMonomialExpression(rootOuter);
  if (termKey(middle.powers) !== termKey(rootOuterPowers)) {
    return casSuccess(null);
  }

  const sign = middle.coefficient > 0 ? '+' : '-';
  return casSuccess(
    binaryNode(
      '^',
      binaryNode(sign, rootOuter, numberNode(1)),
      numberNode(2)
    )
  );
}

function squareRootMonomial(term: PolynomialTerm): CasExpression | null {
  if (term.coefficient !== 1) {
    return null;
  }

  const rootPowers: Record<string, number> = {};
  for (const [name, exponent] of Object.entries(term.powers)) {
    if (exponent % 2 !== 0) {
      return null;
    }
    if (exponent > 0) {
      rootPowers[name] = exponent / 2;
    }
  }

  const factors = Object.entries(rootPowers)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, exponent]) =>
      exponent === 1 ? symbolNode(name) : binaryNode('^', symbolNode(name), numberNode(exponent))
    );

  if (factors.length === 0) {
    return numberNode(1);
  }

  return factors.reduce((left, right) => binaryNode('*', left, right));
}

function powersFromMonomialExpression(
  expression: CasExpression
): Readonly<Record<string, number>> {
  switch (expression.kind) {
    case 'number':
      return {};
    case 'symbol':
      return { [expression.name]: 1 };
    case 'unary':
      return powersFromMonomialExpression(expression.operand);
    case 'binary':
      if (expression.operator === '*') {
        return mergePowerMaps(
          powersFromMonomialExpression(expression.left),
          powersFromMonomialExpression(expression.right)
        );
      }
      if (expression.operator === '^' && expression.right.kind === 'number') {
        const base = powersFromMonomialExpression(expression.left);
        const result: Record<string, number> = {};
        for (const [name, exponent] of Object.entries(base)) {
          result[name] = exponent * expression.right.value;
        }
        return result;
      }
      return {};
    case 'function':
    case 'equation':
      return {};
    default: {
      const _exhaustive: never = expression;
      return _exhaustive;
    }
  }
}

function commonExponentMap(terms: readonly PolynomialTerm[]): Readonly<Record<string, number>> {
  const variables = new Set<string>();
  for (const term of terms) {
    Object.keys(term.powers).forEach(variable => variables.add(variable));
  }

  const result: Record<string, number> = {};
  for (const variable of [...variables].sort()) {
    const exponents = terms.map(term => term.powers[variable] ?? 0);
    const min = Math.min(...exponents);
    if (min > 0) {
      result[variable] = min;
    }
  }

  return result;
}

function subtractExponentMap(
  source: Readonly<Record<string, number>>,
  subtractor: Readonly<Record<string, number>>
): Readonly<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const [name, exponent] of Object.entries(source)) {
    const next = exponent - (subtractor[name] ?? 0);
    if (next > 0) {
      result[name] = next;
    }
  }
  return result;
}

function mergePowerMaps(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>
): Readonly<Record<string, number>> {
  const result: Record<string, number> = { ...left };
  for (const [name, exponent] of Object.entries(right)) {
    result[name] = (result[name] ?? 0) + exponent;
  }
  return result;
}

function gcdOfIntegers(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const temp = b;
    b = a % b;
    a = temp;
  }
  return a;
}

function isNeutralFactorExpression(expression: CasExpression): boolean {
  return expression.kind === 'number' && expression.value === 1;
}

function degreeOfTerm(term: PolynomialTerm): number {
  return Object.values(term.powers).reduce((sum, exponent) => sum + exponent, 0);
}
