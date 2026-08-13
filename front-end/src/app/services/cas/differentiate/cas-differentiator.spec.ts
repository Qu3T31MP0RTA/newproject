import { binaryNode, numberNode, symbolNode, type CasExpression } from '../ast/cas-ast';
import { formatCasExpression } from '../format/cas-formatter';
import { CasParser } from '../parser/cas-parser';
import {
  dependsOnCasExpression,
  differentiateCasExpression,
  differentiateCasText,
} from './cas-differentiator';

describe('CAS differentiation', () => {
  const parser = new CasParser();

  it('derives constants, variables and other variables', () => {
    const cases: Array<[string, string, string]> = [
      ['5', 'x', '0'],
      ['pi', 'x', '0'],
      ['e', 'x', '0'],
      ['x', 'x', '1'],
      ['y', 'x', '0'],
    ];

    for (const [source, variable, expected] of cases) {
      const parsed = parser.parse(source);
      expect(parsed.ok).withContext(source).toBeTrue();
      if (!parsed.ok) continue;

      const result = differentiateCasExpression(parsed.value, variable);
      expect(result.ok).withContext(`${source} / ${variable}`).toBeTrue();
      if (!result.ok) continue;

      expect(formatCasExpression(result.value)).withContext(source).toBe(expected);
    }
  });

  it('derives polynomials and basic products and quotients', () => {
    const cases: Array<[string, string]> = [
      ['x ^ 2', '2 * x'],
      ['2 ^ x', 'ln(2) * 2 ^ x'],
      ['x ^ pi', 'pi * x ^ (pi - 1)'],
      ['x ^ -1', '-1 * x ^ -2'],
      ['x ^ 3 + 2 * x ^ 2 + x + 1', '3 * x ^ 2 + 4 * x + 1'],
      ['(x + 1) * (x + 2)', '2 * x + 3'],
      ['x * y', 'y'],
      ['x * sin(x)', 'sin(x) + x * cos(x)'],
      ['x / 2', '1 / 2'],
      ['1 / x', '-1 / x ^ 2'],
      ['x / (x + 1)', '1 / (x + 1) ^ 2'],
    ];

    for (const [source, expected] of cases) {
      const parsed = parser.parse(source);
      expect(parsed.ok).withContext(source).toBeTrue();
      if (!parsed.ok) continue;

      const result = differentiateCasExpression(parsed.value, 'x');
      expect(result.ok).withContext(source).toBeTrue();
      if (!result.ok) continue;

      expect(formatCasExpression(result.value)).withContext(source).toBe(expected);
    }
  });

  it('applies chain rule to supported functions', () => {
    const cases: Array<[string, string]> = [
      ['sin(x ^ 2)', '2 * x * cos(x ^ 2)'],
      ['cos(3 * x)', '-3 * sin(3 * x)'],
      ['sqrt(x + 1)', '1 / (2 * sqrt(x + 1))'],
      ['ln(x ^ 2 + 1)', '2 * x / (x ^ 2 + 1)'],
      ['exp(x + 1)', 'exp(x + 1)'],
      ['tan(x)', '1 / cos(x) ^ 2'],
      ['log(x)', '1 / x'],
    ];

    for (const [source, expected] of cases) {
      const parsed = parser.parse(source);
      expect(parsed.ok).withContext(source).toBeTrue();
      if (!parsed.ok) continue;

      const result = differentiateCasExpression(parsed.value, 'x');
      expect(result.ok).withContext(source).toBeTrue();
      if (!result.ok) continue;

      expect(formatCasExpression(result.value)).withContext(source).toBe(expected);
    }
  });

  it('supports other differentiation variables', () => {
    const parsed = parser.parse('x * y + y ^ 2');
    expect(parsed.ok).toBeTrue();
    if (!parsed.ok) return;

    const result = differentiateCasExpression(parsed.value, 'y');
    expect(result.ok).toBeTrue();
    if (!result.ok) return;

    expect(formatCasExpression(result.value)).toBe('x + 2 * y');
  });

  it('returns zero when the expression does not depend on the variable', () => {
    expect(dependsOnCasExpression(numberNode(5), 'x')).toBeFalse();
    expect(dependsOnCasExpression(symbolNode('y'), 'x')).toBeFalse();
    expect(dependsOnCasExpression(binaryNode('+', symbolNode('y'), numberNode(2)), 'x')).toBeFalse();
    expect(dependsOnCasExpression(binaryNode('*', symbolNode('x'), symbolNode('y')), 'x')).toBeTrue();
    const parsed = parser.parse('sin(x)');
    expect(parsed.ok).toBeTrue();
    if (!parsed.ok) return;

    expect(dependsOnCasExpression(parsed.value, 'x')).toBeTrue();
  });

  it('rejects invalid variables and unsupported powers', () => {
    const parsed = parser.parse('x ^ x');
    expect(parsed.ok).toBeTrue();
    if (!parsed.ok) return;

    const unsupported = differentiateCasExpression(parsed.value, 'x');
    expect(unsupported).toEqual({
      ok: false,
      error: jasmine.objectContaining({
        code: 'UNSUPPORTED_EXPRESSION',
      }),
    });

    const unsupportedFunction = parser.parse('factorial(x)');
    expect(unsupportedFunction.ok).toBeTrue();
    if (!unsupportedFunction.ok) return;

    const unsupportedFunctionResult = differentiateCasExpression(
      unsupportedFunction.value,
      'x'
    );
    expect(unsupportedFunctionResult).toEqual({
      ok: false,
      error: jasmine.objectContaining({
        code: 'CAS_UNSUPPORTED_DERIVATIVE',
        functionName: 'factorial',
      }),
    });

    const invalid = differentiateCasExpression(parsed.value, 'sin');
    expect(invalid).toEqual({
      ok: false,
      error: jasmine.objectContaining({
        code: 'INVALID_VARIABLE',
      }),
    });
  });

  it('fails when the derivative would exceed the configured limits', () => {
    const expression = buildDeepSum(24);

    const result = differentiateCasExpression(expression, 'x', {
      limits: {
        maxDepth: 4,
        maxNodes: 16,
      },
    });

    expect(result).toEqual({
      ok: false,
      error: jasmine.objectContaining({
        code: 'TOO_COMPLEX',
      }),
    });
  });

  it('keeps the input AST immutable and reparseable', () => {
    const parsed = parser.parse('sin(x ^ 2) + x');
    expect(parsed.ok).toBeTrue();
    if (!parsed.ok) return;

    const snapshot = JSON.parse(JSON.stringify(parsed.value));
    const result = differentiateCasExpression(parsed.value, 'x');

    expect(result.ok).toBeTrue();
    expect(parsed.value).toEqual(snapshot);

    if (!result.ok) return;

    const reparsed = parser.parse(formatCasExpression(result.value));
    expect(reparsed.ok).toBeTrue();
  });

  it('supports text differentiation end to end', () => {
    const result = differentiateCasText('x ^ 3 + x', 'x', parser);

    expect(result.ok).toBeTrue();
    if (!result.ok) return;

    expect(result.value.text).toBe('3 * x ^ 2 + 1');
  });
});

function buildDeepSum(depth: number): CasExpression {
  let current: CasExpression = symbolNode('x');
  for (let index = 0; index < depth; index++) {
    current = binaryNode('+', current, numberNode(1));
  }
  return current;
}
