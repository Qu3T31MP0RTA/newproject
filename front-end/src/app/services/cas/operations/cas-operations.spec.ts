import { binaryNode, numberNode, symbolNode } from '../ast/cas-ast';
import { formatCasExpression } from '../format/cas-formatter';
import { CasParser } from '../parser/cas-parser';
import { expandCasExpression, factorCasExpression } from './cas-operations';

describe('CAS operations', () => {
  const parser = new CasParser();

  it('expands distributive products and powers', () => {
    const cases: Array<[string, string]> = [
      ['x * (x + 1)', 'x ^ 2 + x'],
      ['2 * (x + 3)', '2 * x + 6'],
      ['(x + 1) * (x + 2)', 'x ^ 2 + 3 * x + 2'],
      ['(x + 1) * (x - 1)', 'x ^ 2 + -1'],
      ['(x + y) * z', 'x * z + y * z'],
      ['(x + 1) ^ 2', 'x ^ 2 + 2 * x + 1'],
      ['(x - 1) ^ 2', 'x ^ 2 + -2 * x + 1'],
    ];

    for (const [source, expected] of cases) {
      const parsed = parser.parse(source);
      expect(parsed.ok).withContext(source).toBeTrue();
      if (!parsed.ok) continue;

      const expanded = expandCasExpression(parsed.value);
      expect(expanded.ok).withContext(source).toBeTrue();
      if (!expanded.ok) continue;

      expect(formatCasExpression(expanded.value)).withContext(source).toBe(expected);
    }
  });

  it('factors common numeric factors and basic patterns', () => {
    const cases: Array<[string, string]> = [
      ['2 * x + 2 * y', '2 * (x + y)'],
      ['6 * x ^ 2 + 9 * x', '3 * x * (2 * x + 3)'],
      ['x ^ 2 - 1', '(x - 1) * (x + 1)'],
      ['x ^ 2 - y ^ 2', '(x - y) * (x + y)'],
      ['x ^ 2 + 2 * x + 1', '(x + 1) ^ 2'],
      ['x ^ 2 - 2 * x + 1', '(x - 1) ^ 2'],
    ];

    for (const [source, expected] of cases) {
      const parsed = parser.parse(source);
      expect(parsed.ok).withContext(source).toBeTrue();
      if (!parsed.ok) continue;

      const factored = factorCasExpression(parsed.value);
      expect(factored.ok).withContext(source).toBeTrue();
      if (!factored.ok) continue;

      expect(formatCasExpression(factored.value)).withContext(source).toBe(expected);
    }
  });

  it('leaves non-factorable expressions simplified', () => {
    const parsed = parser.parse('x ^ 3 + x + 1');
    expect(parsed.ok).toBeTrue();
    if (!parsed.ok) return;

    const factored = factorCasExpression(parsed.value);
    expect(factored.ok).toBeTrue();
    if (!factored.ok) return;

    expect(formatCasExpression(factored.value)).toBe('x ^ 3 + x + 1');
  });

  it('keeps inputs immutable', () => {
    const expression = binaryNode(
      '*',
      binaryNode('+', symbolNode('x'), numberNode(1)),
      binaryNode('+', symbolNode('x'), numberNode(2))
    );
    const snapshot = JSON.parse(JSON.stringify(expression));

    const expanded = expandCasExpression(expression);
    expect(expanded.ok).toBeTrue();
    expect(expression).toEqual(snapshot);
  });
});
