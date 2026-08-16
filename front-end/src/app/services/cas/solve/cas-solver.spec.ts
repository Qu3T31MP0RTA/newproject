import {
  binaryNode,
  equationNode,
  numberNode,
  symbolNode,
} from '../ast/cas-ast';
import { formatCasExpression } from '../format/cas-formatter';
import { CasParser } from '../parser/cas-parser';
import { simplifyCasExpression } from '../simplify/cas-simplifier';
import { substituteCasExpression } from './cas-substitution';
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

    for (const solution of solved.solutions) {
      const substituted = substituteCasExpression(
        solved.normalizedEquation,
        variable,
        solution
      );
      const simplified = simplifyCasExpression(substituted);
      expect(simplified.ok).withContext(`${source} @ ${formatCasExpression(solution)}`).toBeTrue();
      if (!simplified.ok) continue;
      expect(formatCasExpression(simplified.value)).withContext(`${source} @ ${formatCasExpression(solution)}`).toBe('0');
    }
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
      ['2 * x + 3 = x + 5', ['2']],
      ['3 * x - 2 = 2 * x + 4', ['6']],
      ['2 * x + 1 = 0', ['-1 / 2']],
      ['4 * x + 2 = 0', ['-1 / 2']],
      ['3 * x + 2 = x + 10', ['4']],
    ];

    for (const [source, expected] of cases) {
      expectFiniteSolutions(source, 'x', expected);
    }
  });

  it('solves linear equations with symbolic coefficients', () => {
    const linear = solveCasText('y * x + 2 = 0', 'x', parser);
    expect(linear.ok).toBeTrue();
    if (!linear.ok) return;
    expect(linear.kind).toBe('finite');
    expect(linear.text).toEqual(['-2 / y']);
    expect(linear.conditions).toEqual(['y ≠ 0']);
    expectFiniteSolutions('a * x + b = c * x + d', 'x', ['(d - b) / (a - c)']);
  });

  it('solves identities and contradictions deterministically', () => {
    const infinite = solveCasText('x = x', 'x', parser);
    expect(infinite.ok).toBeTrue();
    if (!infinite.ok) return;
    expect(infinite.kind).toBe('infinite');

    const symbolicInfinite = solveCasText('a * x = a * x', 'x', parser);
    expect(symbolicInfinite.ok).toBeTrue();
    if (!symbolicInfinite.ok) return;
    expect(symbolicInfinite.kind).toBe('infinite');

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

  it('solves quadratic equations with symbolic coefficients', () => {
    const result = solveCasText(
      'a * x ^ 2 + b * x + c = 0',
      'x',
      parser
    );
    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.kind).toBe('finite');
    expect(result.text).toEqual([
      '(-b - sqrt(b ^ 2 - 4 * a * c)) / (2 * a)',
      '(-b + sqrt(b ^ 2 - 4 * a * c)) / (2 * a)',
    ]);
    expect(result.conditions).toEqual(['a ≠ 0', 'b ^ 2 - 4 * a * c ≥ 0']);
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

  it('solves simple product, sqrt, abs and exponential equations', () => {
    expectFiniteSolutions('(x - 2) * (x + 3) = 0', 'x', ['-3', '2']);
    expectFiniteSolutions('(x - 1) * (x - 1) = 0', 'x', ['1']);
    expectFiniteSolutions('(x - 1) ^ 2 = 0', 'x', ['1']);
    expectFiniteSolutions('sqrt(x) = 3', 'x', ['9']);
    expectFiniteSolutions('sqrt(x + 1) = 3', 'x', ['8']);
    expectFiniteSolutions('abs(x - 1) = 2', 'x', ['-1', '3']);
    expectFiniteSolutions('abs(x) = 3', 'x', ['-3', '3']);
    expectFiniteSolutions('abs(x) = 0', 'x', ['0']);
    expectFiniteSolutions('exp(x) = 1', 'x', ['0']);
    expectFiniteSolutions('exp(x) = 2', 'x', ['ln(2)']);
    expectFiniteSolutions('exp(x) = e', 'x', ['1']);
    expectFiniteSolutions('ln(x) = 0', 'x', ['1']);
    expectFiniteSolutions('ln(x) = 1', 'x', ['e']);
    expectFiniteSolutions('ln(x) = 2', 'x', ['exp(2)']);
    expectFiniteSolutions('ln(x + 1) = 0', 'x', ['0']);
    expectFiniteSolutions('exp(2 * x) = 4', 'x', ['ln(4) / 2']);
    expectFiniteSolutions('exp(2 * x + 1) = 3', 'x', ['(ln(3) - 1) / 2']);
    expectFiniteSolutions('2 ^ x = 8', 'x', ['ln(8) / ln(2)']);
    expectFiniteSolutions('2 ^ x = 1', 'x', ['0']);
    expectFiniteSolutions('2 ^ (x + 1) = 2 ^ 3', 'x', ['2']);
    expectFiniteSolutions('exp(2 * x) = exp(6)', 'x', ['3']);
    expectFiniteSolutions('ln(x + 1) = ln(3)', 'x', ['2']);
  });

  it('treats 1^x = 1 as infinitely many solutions in the supported real domain', () => {
    const result = solveCasText('1 ^ x = 1', 'x', parser);
    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.kind).toBe('infinite');
  });

  it('rejects impossible absolute value equations', () => {
    const negative = solveCasText('abs(x) = -2', 'x', parser);
    expect(negative.ok).toBeTrue();
    if (!negative.ok) return;
    expect(negative.kind).toBe('none');
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
      'sqrt(x) = x',
      'x * exp(x) = 1',
      'exp(x) + x = 2',
    ];

    for (const source of cases) {
      const result = solveCasText(source, 'x', parser);
      expect(result.ok).withContext(source).toBeFalse();
    }
  });

  it('returns none for impossible transcendental cases in the real domain', () => {
    const zero = solveCasText('exp(x) = 0', 'x', parser);
    expect(zero.ok).toBeTrue();
    if (!zero.ok) return;
    expect(zero.kind).toBe('none');

    const negative = solveCasText('exp(x) = -1', 'x', parser);
    expect(negative.ok).toBeTrue();
    if (!negative.ok) return;
    expect(negative.kind).toBe('none');

    const impossibleBase = solveCasText('1 ^ x = 2', 'x', parser);
    expect(impossibleBase.ok).toBeTrue();
    if (!impossibleBase.ok) return;
    expect(impossibleBase.kind).toBe('none');
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
