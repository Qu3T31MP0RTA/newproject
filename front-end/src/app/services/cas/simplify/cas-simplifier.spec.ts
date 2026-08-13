import {
  binaryNode,
  functionCallNode,
  numberNode,
  symbolNode,
  type CasExpression,
} from '../ast/cas-ast';
import { formatCasExpression } from '../format/cas-formatter';
import { CasParser } from '../parser/cas-parser';
import { simplifyCasExpression, simplifyCasText } from './cas-simplifier';

describe('simplifyCasExpression', () => {
  it('simplifies safe identities and folds numbers', () => {
    const cases = new Map<string, string>([
      ['x + 0', 'x'],
      ['0 + x', 'x'],
      ['x - 0', 'x'],
      ['x * 1', 'x'],
      ['1 * x', 'x'],
      ['x * 0', '0'],
      ['0 * x', '0'],
      ['x / 1', 'x'],
      ['x ^ 1', 'x'],
      ['1 ^ x', '1'],
      ['-(-x)', 'x'],
      ['2 + 3', '5'],
      ['2 * 3', '6'],
      ['2 - 3', '-1'],
      ['6 / 3', '2'],
      ['2 ^ 3', '8'],
      ['x + x', '2 * x'],
      ['2 * x + 3 * x', '5 * x'],
      ['x * y + y * x', '2 * x * y'],
      ['x * x * x', 'x ^ 3'],
      ['x ^ 2 * x ^ 3', 'x ^ 5'],
      ['x ^ 2 / x', 'x'],
      ['(2 * x) / 2', 'x'],
      ['x - x', '0'],
      ['3 * x - x', '2 * x'],
      ['x ^ 2 + 2 * x ^ 2', '3 * x ^ 2'],
      ['2 * x + 3 + 4 * x - 1', '6 * x + 2'],
      ['x + 2 + 3', 'x + 5'],
      ['2 * 3 * x', '6 * x'],
    ]);

    const parser = new CasParser();
    for (const [source, expected] of cases.entries()) {
      const parsed = parser.parse(source);
      expect(parsed.ok).withContext(source).toBeTrue();
      if (!parsed.ok) continue;

      const simplified = simplifyCasExpression(parsed.value);
      expect(simplified.ok).withContext(source).toBeTrue();
      if (!simplified.ok) continue;

      expect(formatCasExpression(simplified.value)).withContext(source).toBe(expected);
    }
  });

  it('does not apply unsafe identities', () => {
    const parser = new CasParser();

    for (const source of ['x / x', '0 / x', 'sqrt(x ^ 2)']) {
      const parsed = parser.parse(source);
      expect(parsed.ok).withContext(source).toBeTrue();
      if (!parsed.ok) continue;

      const simplified = simplifyCasExpression(parsed.value);
      expect(simplified.ok).withContext(source).toBeTrue();
      if (!simplified.ok) continue;

      expect(formatCasExpression(simplified.value)).withContext(source).toBe(source);
    }
  });

  it('simplifies x ^ 0 to 1 as a safe algebraic identity', () => {
    const parser = new CasParser();
    const parsed = parser.parse('x ^ 0');
    expect(parsed.ok).toBeTrue();
    if (!parsed.ok) return;

    const simplified = simplifyCasExpression(parsed.value);
    expect(simplified.ok).toBeTrue();
    if (!simplified.ok) return;

    expect(formatCasExpression(simplified.value)).toBe('1');
  });

  it('keeps input immutable and converges deterministically', () => {
    const expression = binaryNode(
      '+',
      binaryNode('+', symbolNode('x'), numberNode(2)),
      numberNode(3)
    );

    const snapshot = JSON.parse(JSON.stringify(expression));
    const first = simplifyCasExpression(expression);
    const second = simplifyCasExpression(expression);

    expect(first.ok).toBeTrue();
    expect(second.ok).toBeTrue();
    expect(expression).toEqual(snapshot);
    expect(first).toEqual(second);
  });

  it('fails on division by zero', () => {
    const result = simplifyCasExpression(binaryNode('/', numberNode(1), numberNode(0)));
    expect(result).toEqual({
      ok: false,
      error: jasmine.objectContaining({
        code: 'DIVISION_BY_ZERO',
      }),
    });
  });

  it('fails when the input is too complex', () => {
    const deepExpression = buildDeepSum(140);
    const result = simplifyCasExpression(deepExpression);
    expect(result).toEqual({
      ok: false,
      error: jasmine.objectContaining({
        code: 'TOO_COMPLEX',
      }),
    });
  });

  it('fails when iterations are exhausted', () => {
    const parser = new CasParser();
    const parsed = parser.parse('x + 0');
    expect(parsed.ok).toBeTrue();
    if (!parsed.ok) return;

    const result = simplifyCasExpression(parsed.value, {
      limits: {
        maxIterations: 0,
      },
    });

    expect(result).toEqual({
      ok: false,
      error: jasmine.objectContaining({
        code: 'ITERATION_LIMIT',
      }),
    });
  });

  it('supports simplifyText with parser and formatter composition', () => {
    const parser = new CasParser();
    const parsed = parser.parse('2 + 3');
    expect(parsed.ok).toBeTrue();
    if (!parsed.ok) return;

    const simplified = simplifyCasExpression(parsed.value);
    expect(simplified.ok).toBeTrue();
    if (!simplified.ok) return;

    expect(formatCasExpression(simplified.value)).toBe('5');
  });

  it('keeps opaque function calls intact while simplifying their arguments', () => {
    const result = simplifyCasExpression(
      functionCallNode('sin', [binaryNode('+', numberNode(2), numberNode(3))])
    );
    expect(result.ok).toBeTrue();
    if (!result.ok) return;

    expect(formatCasExpression(result.value)).toBe('sin(5)');
  });

  it('parses and simplifies text through the helper', () => {
    const parser = new CasParser();
    const parsed = parser.parse('x + 0');
    expect(parsed.ok).toBeTrue();
    if (!parsed.ok) return;

    const text = simplifyCasText('x + 0', parser);
    expect(text.ok).toBeTrue();
    if (!text.ok) return;

    expect(formatCasExpression(text.value.expression)).toBe('x');
    expect(text.value.text).toBe('x');
  });
});

function buildDeepSum(depth: number): CasExpression {
  let current: CasExpression = symbolNode('x');
  for (let index = 0; index < depth; index++) {
    current = binaryNode('+', current, numberNode(1));
  }
  return current;
}
