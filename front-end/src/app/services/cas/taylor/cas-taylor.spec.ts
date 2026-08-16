import { type CasExpression } from '../ast/cas-ast';
import { formatCasExpression } from '../format/cas-formatter';
import { CasParser } from '../parser/cas-parser';
import { createCasEngine } from '../public-api';
import { simplifyCasExpression } from '../simplify/cas-simplifier';
import { substituteCasExpression } from '../solve/cas-substitution';
import { differentiateCasExpression } from '../differentiate/cas-differentiator';
import { expectNoForbiddenDecimal } from '../testing/cas-test-helpers';

describe('CAS Taylor', () => {
  const parser = new CasParser();
  const engine = createCasEngine();

  it('builds exact Taylor polynomials for the supported examples', () => {
    const cases: Array<[string, string, string, number, string]> = [
      ['exp(x)', 'x', '0', 4, '1 + x + x ^ 2 / 2 + x ^ 3 / 6 + x ^ 4 / 24'],
      ['sin(x)', 'x', '0', 5, 'x - x ^ 3 / 6 + x ^ 5 / 120'],
      ['cos(x)', 'x', '0', 4, '1 - x ^ 2 / 2 + x ^ 4 / 24'],
      ['ln(x)', 'x', '1', 3, 'x - 1 - (x - 1) ^ 2 / 2 + (x - 1) ^ 3 / 3'],
      ['x ^ 2', 'x', '2', 3, 'x ^ 2'],
    ];

    for (const [source, variable, center, order, expected] of cases) {
      const result = engine.taylorText(source, variable, center, order);
      expect(result.ok).withContext(source).toBeTrue();
      if (!result.ok) continue;

      expect(result.value.text).withContext(source).toBe(expected);
      expect(result.value.latex).withContext(source).toBe(expected);
      expectNoForbiddenDecimal(result.value.text);
      expect(result.metadata?.operation).toBe('taylor');
      expect(result.metadata?.variable).toBe(variable);
      expect(result.metadata?.center).toBe(center);
      expect(result.metadata?.order).toBe(order);
    }
  });

  it('supports Maclaurin as an alias with structured metadata', () => {
    const result = engine.maclaurinText('exp(x)', 'x', 4);

    expect(result.ok).toBeTrue();
    if (!result.ok) return;

    expect(result.value.text).toBe('1 + x + x ^ 2 / 2 + x ^ 3 / 6 + x ^ 4 / 24');
    expect(result.metadata?.operation).toBe('taylor');
    expect(result.metadata?.seriesKind).toBe('maclaurin');
    expect(result.metadata?.center).toBe('0');
    expect(result.metadata?.order).toBe(4);
    expect(result.metadata?.polynomial).toBe(result.value.text);
  });

  it('reduces constant and polynomial inputs without growing the series artificially', () => {
    const constant = engine.taylorText('5', 'x', '0', 4);
    expect(constant.ok).toBeTrue();
    if (!constant.ok) return;
    expect(constant.value.text).toBe('5');

    const polynomial = engine.taylorText('x ^ 2', 'x', '0', 5);
    expect(polynomial.ok).toBeTrue();
    if (!polynomial.ok) return;
    expect(polynomial.value.text).toBe('x ^ 2');
  });

  it('supports zero order as the constant term', () => {
    const result = engine.taylorText('exp(x)', 'x', '0', 0);
    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.value.text).toBe('1');
  });

  it('preserves exact rational centers without decimalizing them', () => {
    const result = engine.taylorText('exp(x)', 'x', '1 / 2', 2);

    expect(result.ok).toBeTrue();
    if (!result.ok) return;

    expect(result.metadata?.center).toBe('1 / 2');
    expect(result.value.text).toContain('x - 1 / 2');
    expectNoForbiddenDecimal(result.value.text);
  });

  it('rejects invalid Taylor orders', () => {
    const parsedExpression = parser.parse('exp(x)');
    const parsedCenter = parser.parse('0');
    expect(parsedExpression.ok).toBeTrue();
    expect(parsedCenter.ok).toBeTrue();
    if (!parsedExpression.ok || !parsedCenter.ok) return;

    for (const order of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = engine.taylor(parsedExpression.value, 'x', parsedCenter.value, order);

      expect(result.ok).toBeFalse();
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_TAYLOR_ORDER');
      }
    }
  });

  it('rejects orders above the configured limit', () => {
    const parsed = parser.parse('exp(x)');
    const center = parser.parse('0');
    expect(parsed.ok).toBeTrue();
    expect(center.ok).toBeTrue();
    if (!parsed.ok || !center.ok) return;

    const result = engine.taylor(parsed.value, 'x', center.value, 13);
    expect(result.ok).toBeFalse();
    if (!result.ok) {
      expect(result.error.code).toBe('TAYLOR_ORDER_LIMIT');
    }
  });

  it('rejects Taylor centers that fail real-domain evaluation', () => {
    const result = engine.taylorText('ln(x)', 'x', '0', 3);

    expect(result.ok).toBeFalse();
    if (!result.ok) {
      expect(result.error.code).toBe('CAS_TAYLOR_DOMAIN_ERROR');
    }

    const sqrtResult = engine.taylorText('sqrt(x)', 'x', '-1', 3);

    expect(sqrtResult.ok).toBeFalse();
    if (!sqrtResult.ok) {
      expect(sqrtResult.error.code).toBe('CAS_TAYLOR_DOMAIN_ERROR');
    }
  });

  it('rejects centers that still depend on the expansion variable', () => {
    const result = engine.taylorText('exp(x)', 'x', 'x', 3);

    expect(result.ok).toBeFalse();
    if (!result.ok) {
      expect(result.error.code).toBe('CAS_TAYLOR_DOMAIN_ERROR');
    }
  });

  it('rejects non-differentiable Taylor inputs when differentiation stops being supported', () => {
    const result = engine.taylorText('abs(x)', 'x', '0', 3);

    expect(result.ok).toBeFalse();
    if (!result.ok) {
      expect(result.error.code).toBe('CAS_UNSUPPORTED_DERIVATIVE');
    }
  });

  it('matches the original derivatives at the expansion center', () => {
    const cases = [
      { source: 'exp(x)', variable: 'x', center: '0', order: 4 },
      { source: 'sin(x)', variable: 'x', center: '0', order: 5 },
      { source: 'cos(x)', variable: 'x', center: '0', order: 4 },
    ] as const;

    for (const testCase of cases) {
      expectTaylorMatchesSourceDerivatives(
        testCase.source,
        testCase.variable,
        testCase.center,
        testCase.order
      );
    }
  });

  function expectTaylorMatchesSourceDerivatives(
    source: string,
    variable: string,
    centerSource: string,
    order: number
  ): void {
    const parsedSource = parser.parse(source);
    const parsedCenter = parser.parse(centerSource);
    expect(parsedSource.ok).withContext(source).toBeTrue();
    expect(parsedCenter.ok).withContext(centerSource).toBeTrue();
    if (!parsedSource.ok || !parsedCenter.ok) return;

    const taylor = engine.taylor(parsedSource.value, variable, parsedCenter.value, order);
    expect(taylor.ok).withContext(source).toBeTrue();
    if (!taylor.ok) return;

    let currentDerivative = parsedSource.value;
    for (let degree = 0; degree <= order; degree += 1) {
      const expected = evaluateAtCenter(currentDerivative, variable, parsedCenter.value);
      expect(expected.ok).withContext(`${source} @ ${degree}`).toBeTrue();
      if (!expected.ok) continue;

      const taylorDerivative = differentiateTimes(taylor.value, variable, degree);
      const actual = evaluateAtCenter(taylorDerivative, variable, parsedCenter.value);
      expect(actual.ok).withContext(`${source} Taylor @ ${degree}`).toBeTrue();
      if (!actual.ok) continue;

      expect(formatCasExpression(actual.value)).withContext(`${source} @ ${degree}`)
        .toBe(formatCasExpression(expected.value));

      const nextDerivative = differentiateCasExpression(currentDerivative, variable);
      expect(nextDerivative.ok).withContext(`${source} @ ${degree}`).toBeTrue();
      if (!nextDerivative.ok) break;
      currentDerivative = nextDerivative.value;
    }
  }

  function evaluateAtCenter(
    expression: CasExpression,
    variable: string,
    center: CasExpression
  ) {
    const substituted = substituteCasExpression(expression, variable, center);
    return simplifyCasExpression(substituted);
  }

  function differentiateTimes(
    expression: CasExpression,
    variable: string,
    times: number
  ): CasExpression {
    let current = expression;
    for (let index = 0; index < times; index += 1) {
      const differentiated = differentiateCasExpression(current, variable);
      expect(differentiated.ok).withContext(`${variable}^${index + 1}`).toBeTrue();
      if (!differentiated.ok) {
        return current;
      }
      current = differentiated.value;
    }

    return current;
  }
});
