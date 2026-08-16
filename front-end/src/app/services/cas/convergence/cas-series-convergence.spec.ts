import { CasParser } from '../parser/cas-parser';
import { formatCasExpression } from '../format/cas-formatter';
import { analyzeSeriesConvergence, analyzeSeriesConvergenceText } from './cas-series-convergence';

describe('CAS series convergence', () => {
  const parser = new CasParser();

  function expectConvergenceText(
    source: string,
    variable: string,
    center: string,
    expectedText: string
  ): void {
    const result = analyzeSeriesConvergenceText(source, variable, center, parser);
    expect(result.ok).withContext(source).toBeTrue();
    if (!result.ok) return;

    expect(result.value.text).withContext(source).toBe(expectedText);
    expect(result.value.latex).withContext(source).toBe(expectedText);
  }

  function parse(source: string) {
    const parsed = parser.parse(source);
    expect(parsed.ok).withContext(source).toBeTrue();
    if (!parsed.ok) {
      throw new Error(`Failed to parse ${source}`);
    }

    return parsed.value;
  }

  it('recognizes entire functions with arbitrary constant centers', () => {
    const exp = analyzeSeriesConvergenceText('exp(x)', 'x', '0', parser);
    const sin = analyzeSeriesConvergenceText('sin(x)', 'x', '0', parser);
    const cos = analyzeSeriesConvergenceText('cos(x)', 'x', '2', parser);

    for (const result of [exp, sin, cos]) {
      expect(result.ok).toBeTrue();
      if (!result.ok) continue;

      expect(result.value.status).toBe('known');
      expect(result.value.radius.kind).toBe('infinite');
      expect(result.value.text).toBe('Radio de convergencia: ∞');
    }
  });

  it('recognizes geometric families with exact rational radii and intervals', () => {
    const geometric = analyzeSeriesConvergenceText('1 / (1 - x)', 'x', '0', parser);
    expect(geometric.ok).toBeTrue();
    if (!geometric.ok) return;

    expect(geometric.value.status).toBe('known');
    expect(geometric.value.center).toBe('0');
    expect(geometric.value.radius).toEqual({
      kind: 'finite',
      value: '1',
    });
    expect(geometric.value.interval).toEqual({
      left: '-1',
      right: '1',
      leftIncluded: false,
      rightIncluded: false,
    });
    expect(geometric.value.text).toBe('Radio de convergencia: 1\nIntervalo: (-1, 1)');

    expectConvergenceText('1 / (1 - 2 * x)', 'x', '0', 'Radio de convergencia: 1 / 2\nIntervalo: (-1 / 2, 1 / 2)');
    expectConvergenceText('1 / (1 + 3 * x)', 'x', '0', 'Radio de convergencia: 1 / 3\nIntervalo: (-1 / 3, 1 / 3)');
  });

  it('recognizes displaced geometric series with a clean AST match', () => {
    const displaced = analyzeSeriesConvergenceText('1 / (1 - 2 * (x - 3))', 'x', '3', parser);
    expect(displaced.ok).toBeTrue();
    if (!displaced.ok) return;

    expect(displaced.value.status).toBe('known');
    expect(displaced.value.center).toBe('3');
    expect(displaced.value.radius).toEqual({
      kind: 'finite',
      value: '1 / 2',
    });
    expect(displaced.value.interval).toEqual({
      left: '5 / 2',
      right: '7 / 2',
      leftIncluded: false,
      rightIncluded: false,
    });
  });

  it('recognizes logarithmic families with asymmetric endpoints', () => {
    expectConvergenceText('ln(1 + x)', 'x', '0', 'Radio de convergencia: 1\nIntervalo: (-1, 1]');
    expectConvergenceText('ln(1 - x)', 'x', '0', 'Radio de convergencia: 1\nIntervalo: [-1, 1)');
  });

  it('returns unsupported for out-of-scope families', () => {
    const sqrt = analyzeSeriesConvergenceText('sqrt(x)', 'x', '0', parser);
    const tan = analyzeSeriesConvergenceText('tan(x)', 'x', '0', parser);
    const reciprocal = analyzeSeriesConvergenceText('1 / (1 + x ^ 2)', 'x', '0', parser);

    for (const result of [sqrt, tan, reciprocal]) {
      expect(result.ok).toBeTrue();
      if (!result.ok) continue;

      expect(result.value.status).toBe('unsupported');
      expect(result.value.radius).toEqual({ kind: 'unsupported' });
      expect(result.value.text).toBe('Radio de convergencia: no disponible');
    }
  });

  it('rejects centers that depend on the variable', () => {
    const result = analyzeSeriesConvergence(parse('exp(x)'), 'x', parse('x'));

    expect(result.ok).toBeFalse();
    if (!result.ok) {
      expect(result.error.code).toBe('CAS_SERIES_DOMAIN_ERROR');
    }
  });

  it('keeps the AST helper output readable', () => {
    const result = analyzeSeriesConvergence(parse('1 / (1 - x)'), 'x', parse('0'));

    expect(result.ok).toBeTrue();
    if (!result.ok) return;

    expect(formatCasExpression(parse('1 / (1 - x)'))).toBe('1 / (1 - x)');
    expect(result.value.center).toBe('0');
  });
});
