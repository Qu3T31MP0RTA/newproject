import {
  binaryNode,
  equationNode,
  numberNode,
  symbolNode,
} from '../ast/cas-ast';
import { formatCasExpression } from '../format/cas-formatter';
import { CasParser } from '../parser/cas-parser';
import { solveCasExpression, solveCasText } from './cas-solver';

describe('CAS solver', () => {
  const parser = new CasParser();

  function expectFiniteSolutions(
    source: string,
    variable: string,
    expected: string[],
    options = {}
  ): void {
    const parsed = parser.parse(source);
    expect(parsed.ok).withContext(source).toBeTrue();
    if (!parsed.ok) return;

    const solved = solveCasExpression(parsed.value, variable, options);
    expect(solved.ok).withContext(source).toBeTrue();
    if (!solved.ok) return;

    expect(solved.kind).withContext(source).toBe('finite');
    expect(solved.text).withContext(source).toEqual(expected);
  }

  it('solves constant equations as infinite or none', () => {
    const infinite = solveCasText('0 = 0', 'x', parser);
    expect(infinite.ok).toBeTrue();
    if (!infinite.ok) return;
    expect(infinite.kind).toBe('infinite');
    expect(infinite.solutions).toEqual([]);

    const alsoInfinite = solveCasText('5 = 5', 'x', parser);
    expect(alsoInfinite.ok).toBeTrue();
    if (!alsoInfinite.ok) return;
    expect(alsoInfinite.kind).toBe('infinite');

    const none = solveCasText('3 = 4', 'x', parser);
    expect(none.ok).toBeTrue();
    if (!none.ok) return;
    expect(none.kind).toBe('none');
    expect(none.text).toEqual([]);
  });

  it('solves linear equations exactly', () => {
    const cases: Array<[string, string[]]> = [
      ['2 * x + 4 = 0', ['-2']],
      ['3 * x - 9 = 0', ['3']],
      ['x + 5 = 2', ['-3']],
      ['-x + 3 = 0', ['3']],
      ['2 * (x + 1) = 6', ['2']],
      ['2 * x + 1 = 0', ['-1 / 2']],
      ['4 * x + 2 = 0', ['-1 / 2']],
    ];

    for (const [source, expected] of cases) {
      expectFiniteSolutions(source, 'x', expected);
    }
  });

  it('solves identities and contradictions deterministically', () => {
    const infinite = solveCasText('x = x', 'x', parser);
    expect(infinite.ok).toBeTrue();
    if (!infinite.ok) return;
    expect(infinite.kind).toBe('infinite');

    const none = solveCasText('x = x + 1', 'x', parser);
    expect(none.ok).toBeTrue();
    if (!none.ok) return;
    expect(none.kind).toBe('none');

    const alsoInfinite = solveCasText('2 * x + 4 = 2 * x + 4', 'x', parser);
    expect(alsoInfinite.ok).toBeTrue();
    if (!alsoInfinite.ok) return;
    expect(alsoInfinite.kind).toBe('infinite');

    const alsoNone = solveCasText('2 * x + 4 = 2 * x + 5', 'x', parser);
    expect(alsoNone.ok).toBeTrue();
    if (!alsoNone.ok) return;
    expect(alsoNone.kind).toBe('none');
  });

  it('solves quadratic equations exactly when the discriminant is real', () => {
    const cases: Array<[string, string[]]> = [
      ['x ^ 2 - 1 = 0', ['-1', '1']],
      ['x ^ 2 - 2 * x + 1 = 0', ['1']],
      ['2 * x ^ 2 - 8 = 0', ['-2', '2']],
      ['x ^ 2 - 2 = 0', ['-sqrt(2)', 'sqrt(2)']],
    ];

    for (const [source, expected] of cases) {
      expectFiniteSolutions(source, 'x', expected);
    }
  });

  it('returns no real solutions for negative discriminants', () => {
    const result = solveCasText('x ^ 2 + 1 = 0', 'x', parser);
    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.kind).toBe('none');
    expect(result.text).toEqual([]);
  });

  it('supports a second variable when the coefficient of x is numeric', () => {
    expectFiniteSolutions('y ^ 2 - 4 = 0', 'y', ['-2', '2']);
    expectFiniteSolutions('x + y = 0', 'x', ['-y']);
    expectFiniteSolutions('2 * x + y = 0', 'x', ['-y / 2']);
  });

  it('deduplicates repeated roots', () => {
    const result = solveCasText('(x - 1) ^ 2 = 0', 'x', parser);
    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.kind).toBe('finite');
    expect(result.text).toEqual(['1']);
  });

  it('rejects unsupported equations', () => {
    const cases = [
      'x ^ 3 - 1 = 0',
      '1 / x = 0',
      'sin(x) = 0',
      'x ^ x = 2',
      'sqrt(x) = 2',
    ];

    for (const source of cases) {
      const result = solveCasText(source, 'x', parser);
      expect(result.ok).withContext(source).toBeFalse();
    }
  });

  it('preserves round-trippable solution text', () => {
    const cases = ['-2', '-1 / 2', 'sqrt(2)'];

    for (const source of cases) {
      const parsed = parser.parse(source);
      expect(parsed.ok).withContext(source).toBeTrue();
      if (!parsed.ok) continue;

      expect(formatCasExpression(parsed.value)).withContext(source).toBe(source);
    }
  });

  it('keeps inputs immutable', () => {
    const equation = equationNode(
      binaryNode('+', symbolNode('x'), numberNode(1)),
      numberNode(0)
    );
    const snapshot = JSON.parse(JSON.stringify(equation));

    const solved = solveCasExpression(equation, 'x');
    expect(solved.ok).toBeTrue();
    expect(equation).toEqual(snapshot);
  });

  it('respects limits', () => {
    const result = solveCasText('(x + 1) ^ 4 = 0', 'x', parser, {
      limits: { maxNodes: 3 },
    });

    expect(result.ok).toBeFalse();
    if (result.ok) return;
    expect(result.error.code).toBe('TOO_COMPLEX');
  });
});
