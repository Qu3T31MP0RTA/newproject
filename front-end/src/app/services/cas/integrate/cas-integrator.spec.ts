import { binaryNode, functionCallNode, numberNode, symbolNode } from '../ast/cas-ast';
import { formatCasExpression } from '../format/cas-formatter';
import { CasParser } from '../parser/cas-parser';
import { simplifyCasExpression } from '../simplify/cas-simplifier';
import { differentiateCasExpression } from '../differentiate/cas-differentiator';
import { integrateCasExpression, integrateCasText } from './cas-integrator';
import {
  expectAntiderivative,
  expectIdempotent,
  expectNoForbiddenDecimal,
  expectNumericallyEquivalentExpressions,
} from '../testing/cas-test-helpers';

describe('integrateCasExpression', () => {
  const parser = new CasParser();

  it('integrates constants, variables and simple powers', () => {
    const cases: Array<[string, string]> = [
      ['5', '5 * x'],
      ['y', 'x * y'],
      ['x', 'x ^ 2 / 2'],
      ['x / 2', 'x ^ 2 / 4'],
      ['x ^ 2', 'x ^ 3 / 3'],
      ['x ^ 3', 'x ^ 4 / 4'],
      ['x ^ -2', '-1 / x'],
      ['1 / x', 'ln(abs(x))'],
      ['sqrt(x)', '2 * x * sqrt(x) / 3'],
    ];

    for (const [source, expected] of cases) {
      const parsed = parser.parse(source);
      expect(parsed.ok).withContext(source).toBeTrue();
      if (!parsed.ok) continue;

      const integrated = integrateCasExpression(parsed.value, 'x');
      expect(integrated.ok).withContext(source).toBeTrue();
      if (!integrated.ok) continue;

      expect(formatCasExpression(integrated.value)).withContext(source).toBe(expected);
    }
  });

  it('integrates linear sums and constant factors', () => {
    const cases: Array<[string, string]> = [
      ['x ^ 2 + x', 'x ^ 3 / 3 + x ^ 2 / 2'],
      ['x ^ 2 - 3 * x', 'x ^ 3 / 3 - 3 * x ^ 2 / 2'],
      ['3 * x ^ 2', 'x ^ 3'],
      ['2 * sin(x)', '-2 * cos(x)'],
      ['y * x', 'x ^ 2 * y / 2'],
      ['2 * x * exp(x)', '2 * x * exp(x) - 2 * exp(x)'],
      ['3 * x * sin(x)', '-3 * x * cos(x) + 3 * sin(x)'],
      ['4 * x * cos(x)', '4 * x * sin(x) + 4 * cos(x)'],
    ];

    for (const [source, expected] of cases) {
      const parsed = parser.parse(source);
      expect(parsed.ok).withContext(source).toBeTrue();
      if (!parsed.ok) continue;

      const integrated = integrateCasExpression(parsed.value, 'x');
      expect(integrated.ok).withContext(source).toBeTrue();
      if (!integrated.ok) continue;

      expect(formatCasExpression(integrated.value)).withContext(source).toBe(expected);
    }
  });

  it('keeps commuted products equivalent', () => {
    const cases: Array<[string, string]> = [
      ['exp(x) * x', 'x * exp(x) - exp(x)'],
      ['sin(x) * x', '-x * cos(x) + sin(x)'],
      ['cos(x) * x', 'x * sin(x) + cos(x)'],
    ];

    for (const [source, expected] of cases) {
      const parsed = parser.parse(source);
      expect(parsed.ok).withContext(source).toBeTrue();
      if (!parsed.ok) continue;

      const integrated = integrateCasExpression(parsed.value, 'x');
      expect(integrated.ok).withContext(source).toBeTrue();
      if (!integrated.ok) continue;

      expect(formatCasExpression(integrated.value)).withContext(source).toBe(expected);
    }
  });

  it('integrates sin, cos and exp with simple linear chain rules', () => {
    const cases: Array<[string, string]> = [
      ['sin(x)', '-cos(x)'],
      ['cos(x)', 'sin(x)'],
      ['exp(x)', 'exp(x)'],
      ['sin(2 * x)', '-cos(2 * x) / 2'],
      ['cos(3 * x + 1)', 'sin(3 * x + 1) / 3'],
      ['exp(x) * x', 'x * exp(x) - exp(x)'],
      ['sin(x) * x', '-x * cos(x) + sin(x)'],
      ['cos(x) * x', 'x * sin(x) + cos(x)'],
      ['ln(x)', 'x * ln(x) - x'],
      ['tan(x)', '-ln(abs(cos(x)))'],
    ];

    for (const [source, expected] of cases) {
      const parsed = parser.parse(source);
      expect(parsed.ok).withContext(source).toBeTrue();
      if (!parsed.ok) continue;

      const integrated = integrateCasExpression(parsed.value, 'x');
      expect(integrated.ok).withContext(source).toBeTrue();
      if (!integrated.ok) continue;

      expect(formatCasExpression(integrated.value)).withContext(source).toBe(expected);
    }
  });

  it('keeps the supported results consistent with differentiation', () => {
    const cases = [
      'x ^ 2',
      '3 * x ^ 2',
      'sin(x)',
      'cos(x)',
      'exp(x)',
      'x ^ 2 + x',
      'x * exp(x)',
      'x * sin(x)',
      'x * cos(x)',
    ];

    for (const source of cases) {
      const parsed = parser.parse(source);
      expect(parsed.ok).withContext(source).toBeTrue();
      if (!parsed.ok) continue;

      const integrated = integrateCasExpression(parsed.value, 'x');
      expect(integrated.ok).withContext(source).toBeTrue();
      if (!integrated.ok) continue;

      const differentiated = differentiateCasExpression(integrated.value, 'x');
      expect(differentiated.ok).withContext(source).toBeTrue();
      if (!differentiated.ok) continue;

      const reduced = simplifyCasExpression(
        binaryNode('-', differentiated.value, parsed.value)
      );
      expect(reduced.ok).withContext(source).toBeTrue();
      if (!reduced.ok) continue;

      expect(formatCasExpression(reduced.value)).withContext(source).toBe('0');
    }
  });

  it('keeps new exact antiderivatives stable under repeated simplification', () => {
    for (const source of [
      '2 * x * sqrt(x) / 3',
      'ln(abs(x))',
      'x * ln(x) - x',
      'x * exp(x) - exp(x)',
      '-x * cos(x) + sin(x)',
      'x * sin(x) + cos(x)',
    ]) {
      expectIdempotent(source);
    }
  });

  it('validates logarithmic antiderivatives with domain-aware differentiation', () => {
    const cases: Array<[string, string, readonly number[]]> = [
      ['ln(abs(x))', '1 / x', [ -3, -2, -1, 1, 2, 3 ]],
      ['-ln(abs(cos(x)))', 'tan(x)', [ -2.5, -1.5, -0.75, 0.25, 0.75, 1.25 ]],
    ];

    for (const [source, expectedDerivative, samples] of cases) {
      const parsed = parser.parse(source);
      expect(parsed.ok).withContext(source).toBeTrue();
      if (!parsed.ok) continue;

      const differentiated = differentiateCasExpression(parsed.value, 'x');
      expect(differentiated.ok).withContext(source).toBeTrue();
      if (!differentiated.ok) continue;

      expectNumericallyEquivalentExpressions(
        formatCasExpression(differentiated.value),
        expectedDerivative,
        'x',
        samples
      );
    }
  });

  it('preserves exact antiderivatives under diff(integrate(f)) - f', () => {
    const cases = [
      'x',
      'x ^ 2',
      'x ^ 3',
      'x / 2',
      '3 * x ^ 2',
      'y * x',
      'sin(x)',
      'sin(2 * x)',
      'cos(3 * x)',
      'exp(2 * x)',
      'x ^ 2 + x',
      'sqrt(x)',
      'ln(x)',
      'x * exp(x)',
      'x * sin(x)',
      'x * cos(x)',
    ];

    for (const source of cases) {
      expectAntiderivative(source, 'x');
    }
  });

  it('reports unsupported integrals with typed metadata', () => {
    const parsed = parser.parse('factorial(x)');
    expect(parsed.ok).toBeTrue();
    if (!parsed.ok) return;

    const integrated = integrateCasExpression(parsed.value, 'x');
    expect(integrated).toEqual({
      ok: false,
      error: jasmine.objectContaining({
        code: 'CAS_UNSUPPORTED_INTEGRAL',
        functionName: 'factorial',
      }),
    });
  });

  it('keeps inputs immutable', () => {
    const expression = binaryNode(
      '+',
      functionCallNode('sin', [symbolNode('x')]),
      numberNode(2)
    );
    const snapshot = JSON.parse(JSON.stringify(expression));

    const integrated = integrateCasExpression(expression, 'x');
    expect(integrated.ok).toBeTrue();
    expect(expression).toEqual(snapshot);
  });

  it('supports text integration through the helper', () => {
    const result = integrateCasText('x ^ 2', 'x', parser);

    expect(result.ok).toBeTrue();
    if (!result.ok) return;

    expect(result.value.text).toBe('x ^ 3 / 3');
  });

  it('does not decimalize critical integral outputs', () => {
    const cases: Array<[string, string]> = [
      ['x', 'x ^ 2 / 2'],
      ['x ^ 2', 'x ^ 3 / 3'],
      ['x ^ 3', 'x ^ 4 / 4'],
      ['x / 2', 'x ^ 2 / 4'],
      ['1 / x', 'ln(abs(x))'],
      ['x ^ 2 + x', 'x ^ 3 / 3 + x ^ 2 / 2'],
      ['x ^ 2 - 3 * x', 'x ^ 3 / 3 - 3 * x ^ 2 / 2'],
      ['sqrt(x)', '2 * x * sqrt(x) / 3'],
      ['ln(x)', 'x * ln(x) - x'],
      ['x * exp(x)', 'x * exp(x) - exp(x)'],
      ['x * sin(x)', '-x * cos(x) + sin(x)'],
      ['x * cos(x)', 'x * sin(x) + cos(x)'],
    ];

    for (const [source, expected] of cases) {
      const parsed = parser.parse(source);
      expect(parsed.ok).withContext(source).toBeTrue();
      if (!parsed.ok) continue;

      const integrated = integrateCasExpression(parsed.value, 'x');
      expect(integrated.ok).withContext(source).toBeTrue();
      if (!integrated.ok) continue;

      const text = formatCasExpression(integrated.value);
      expect(text).withContext(source).toBe(expected);
      expectNoForbiddenDecimal(text);
    }
  });

  it('reports unsupported integrals for cases outside the limited rules', () => {
    for (const source of [
      'x * ln(x)',
      'x ^ 2 * exp(x)',
      'x ^ 2 * sin(x)',
      'x ^ 2 * cos(x)',
      'factorial(x)',
    ]) {
      const parsed = parser.parse(source);
      expect(parsed.ok).withContext(source).toBeTrue();
      if (!parsed.ok) continue;

      const integrated = integrateCasExpression(parsed.value, 'x');
      expect(integrated).toEqual({
        ok: false,
        error: jasmine.objectContaining({
          code: 'CAS_UNSUPPORTED_INTEGRAL',
        }),
      });
    }
  });
});
