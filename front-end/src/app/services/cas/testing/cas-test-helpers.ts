import { binaryNode } from '../ast/cas-ast';
import { formatCasExpression } from '../format/cas-formatter';
import { CasParser } from '../parser/cas-parser';
import { createCasEngine } from '../public-api';
import { simplifyCasExpression } from '../simplify/cas-simplifier';
import Complex from 'complex.js';
import { evaluator } from '../../polish-services/polish-evaluator';
import { Tokenizer } from '../../polish-services/tokenizer';
import { parser as PolishPostfixParser } from '../../polish-services/polish-notation-parser-service';

const parser = new CasParser();
const engine = createCasEngine();
const tokenizer = new Tokenizer();
const postfixParser = new PolishPostfixParser();
const polishEvaluator = new evaluator();

export function expectSimplifiesTo(source: string, expected: string): void {
  const parsed = parser.parse(source);
  expect(parsed.ok).withContext(source).toBeTrue();
  if (!parsed.ok) return;

  const simplified = simplifyCasExpression(parsed.value);
  expect(simplified.ok).withContext(source).toBeTrue();
  if (!simplified.ok) return;

  expect(formatCasExpression(simplified.value)).withContext(source).toBe(expected);
}

export function expectDifferentiatesTo(
  source: string,
  variable: string,
  expected: string
): void {
  const parsed = parser.parse(source);
  expect(parsed.ok).withContext(source).toBeTrue();
  if (!parsed.ok) return;

  const differentiated = engine.differentiate(parsed.value, variable);
  expect(differentiated.ok).withContext(source).toBeTrue();
  if (!differentiated.ok) return;

  expect(formatCasExpression(differentiated.value)).withContext(source).toBe(expected);
}

export function expectIntegratesTo(
  source: string,
  variable: string,
  expected: string
): void {
  const parsed = parser.parse(source);
  expect(parsed.ok).withContext(source).toBeTrue();
  if (!parsed.ok) return;

  const integrated = engine.integrate(parsed.value, variable);
  expect(integrated.ok).withContext(source).toBeTrue();
  if (!integrated.ok) return;

  expect(formatCasExpression(integrated.value)).withContext(source).toBe(expected);
}

export function expectSolvesTo(
  source: string,
  variable: string,
  expected: readonly string[]
): void {
  const parsed = parser.parse(source);
  expect(parsed.ok).withContext(source).toBeTrue();
  if (!parsed.ok) return;

  const solved = engine.solve(parsed.value, variable);
  expect(solved.ok).withContext(source).toBeTrue();
  if (!solved.ok) return;

  expect(solved.kind).withContext(source).toBe('finite');
  expect(solved.text).withContext(source).toEqual(expected);
}

export function expectIdempotent(source: string): void {
  const parsed = parser.parse(source);
  expect(parsed.ok).withContext(source).toBeTrue();
  if (!parsed.ok) return;

  const once = simplifyCasExpression(parsed.value);
  expect(once.ok).withContext(source).toBeTrue();
  if (!once.ok) return;

  const twice = simplifyCasExpression(once.value);
  expect(twice.ok).withContext(source).toBeTrue();
  if (!twice.ok) return;

  expect(twice.value).withContext(source).toEqual(once.value);
}

export function expectExactFraction(source: string, expected: string): void {
  const parsed = parser.parse(source);
  expect(parsed.ok).withContext(source).toBeTrue();
  if (!parsed.ok) return;

  expect(formatCasExpression(parsed.value)).withContext(source).toBe(expected);
}

export function expectAntiderivative(
  integrand: string,
  variable: string
): void {
  const parsed = parser.parse(integrand);
  expect(parsed.ok).withContext(integrand).toBeTrue();
  if (!parsed.ok) return;

  const integrated = engine.integrate(parsed.value, variable);
  expect(integrated.ok).withContext(integrand).toBeTrue();
  if (!integrated.ok) return;

  const differentiated = engine.differentiate(integrated.value, variable);
  expect(differentiated.ok).withContext(integrand).toBeTrue();
  if (!differentiated.ok) return;

  const reduced = simplifyCasExpression(
    binaryNode('-', differentiated.value, parsed.value)
  );
  expect(reduced.ok).withContext(integrand).toBeTrue();
  if (!reduced.ok) return;

  expect(formatCasExpression(reduced.value)).withContext(integrand).toBe('0');
}

export function expectNoForbiddenDecimal(source: string): void {
  expect(source).not.toContain('0.5');
  expect(source).not.toContain('0.25');
  expect(source).not.toContain('0.3333333333333333');
  expect(source).not.toContain('0.6666666666666666');
}

export function expectNumericallyEquivalentExpressions(
  left: string,
  right: string,
  variable: string,
  samples: readonly number[] = [ -3, -2, -1, 1, 2, 3 ]
): void {
  for (const value of samples) {
    const leftValue = evaluatePolishExpression(left, variable, value);
    const rightValue = evaluatePolishExpression(right, variable, value);

    expect(leftValue).withContext(`${left} @ ${variable}=${value}`).not.toBeNull();
    expect(rightValue).withContext(`${right} @ ${variable}=${value}`).not.toBeNull();
    if (leftValue === null || rightValue === null) {
      continue;
    }

    expect(leftValue).withContext(`${left} @ ${variable}=${value}`).toBeCloseTo(rightValue, 9);
  }
}

function evaluatePolishExpression(
  source: string,
  variable: string,
  value: number
): number | null {
  const tokens = tokenizer.tokenize(source, { unaryOperators: true });
  const postfix = postfixParser.toPostFix(tokens);
  const evaluation = polishEvaluator.evaluatePostFix(
    postfix,
    { [variable]: value },
    false,
    'RAD'
  );

  if (typeof evaluation === 'number') {
    return Number.isFinite(evaluation) ? evaluation : null;
  }

  if (evaluation instanceof Complex) {
    if (!Number.isFinite(evaluation.re) || !Number.isFinite(evaluation.im)) {
      return null;
    }

    if (Math.abs(evaluation.im) > 1e-9) {
      return null;
    }

    return evaluation.re;
  }

  if (evaluation && typeof evaluation === 'object' && 'result' in evaluation) {
    const result = evaluation.result;
    if (typeof result === 'number') {
      return Number.isFinite(result) ? result : null;
    }

    if (result instanceof Complex) {
      if (!Number.isFinite(result.re) || !Number.isFinite(result.im)) {
        return null;
      }

      if (Math.abs(result.im) > 1e-9) {
        return null;
      }

      return result.re;
    }
  }

  return null;
}
