import { CasParser } from './parser/cas-parser';
import { DefaultCasEngine, createCasEngine } from './public-api';
import {
  expectDifferentiatesTo,
  expectIntegratesTo,
  expectSolvesTo,
} from './testing/cas-test-helpers';

describe('CAS public API', () => {
  it('creates a usable engine that can parse, simplify and format', () => {
    const engine = createCasEngine();
    const parsed = engine.parse('x + 0');

    expect(parsed.ok).toBeTrue();
    if (!parsed.ok) return;

    const simplified = engine.simplify(parsed.value);
    expect(simplified.ok).toBeTrue();
    if (!simplified.ok) return;

    expect(engine.format(simplified.value)).toBe('x');
  });

  it('supports text simplification end to end', () => {
    const engine = new DefaultCasEngine();
    const simplified = engine.simplifyText('2 + 3');

    expect(simplified.ok).toBeTrue();
    if (!simplified.ok) return;

    expect(simplified.value.text).toBe('5');
  });

  it('supports expand and factor end to end', () => {
    const engine = createCasEngine();

    const expanded = engine.expandText('(x + 1) ^ 2');
    expect(expanded.ok).toBeTrue();
    if (!expanded.ok) return;
    expect(expanded.value.text).toBe('x ^ 2 + 2 * x + 1');

    const factored = engine.factorText('x ^ 2 - 1');
    expect(factored.ok).toBeTrue();
    if (!factored.ok) return;
    expect(factored.value.text).toBe('(x - 1) * (x + 1)');
  });

  it('supports integrate end to end', () => {
    expectIntegratesTo('sqrt(x)', 'x', '2 * x * sqrt(x) / 3');
    expectIntegratesTo('ln(x)', 'x', 'x * ln(x) - x');
    expectIntegratesTo('1 / x', 'x', 'ln(abs(x))');
    expectIntegratesTo('x * sin(x)', 'x', '-x * cos(x) + sin(x)');
  });

  it('supports Taylor end to end', () => {
    const engine = createCasEngine();

    const expTaylor = engine.taylorText('exp(x)', 'x', '0', 4);
    expect(expTaylor.ok).toBeTrue();
    if (!expTaylor.ok) return;
    expect(expTaylor.value.text).toBe('1 + x + x ^ 2 / 2 + x ^ 3 / 6 + x ^ 4 / 24');
    expect(expTaylor.metadata).toEqual(jasmine.objectContaining({
      operation: 'taylor',
      seriesKind: 'taylor',
      variable: 'x',
      center: '0',
      order: 4,
      polynomial: '1 + x + x ^ 2 / 2 + x ^ 3 / 6 + x ^ 4 / 24',
    }));

    const sinTaylor = engine.taylorText('sin(x)', 'x', '0', 5);
    expect(sinTaylor.ok).toBeTrue();
    if (!sinTaylor.ok) return;
    expect(sinTaylor.value.text).toBe('x - x ^ 3 / 6 + x ^ 5 / 120');

    const cosTaylor = engine.taylorText('cos(x)', 'x', '0', 4);
    expect(cosTaylor.ok).toBeTrue();
    if (!cosTaylor.ok) return;
    expect(cosTaylor.value.text).toBe('1 - x ^ 2 / 2 + x ^ 4 / 24');

    const lnTaylor = engine.taylorText('ln(x)', 'x', '1', 3);
    expect(lnTaylor.ok).toBeTrue();
    if (!lnTaylor.ok) return;
    expect(lnTaylor.value.text).toBe('x - 1 - (x - 1) ^ 2 / 2 + (x - 1) ^ 3 / 3');

    const maclaurin = engine.maclaurinText('sin(x)', 'x', 5);
    expect(maclaurin.ok).toBeTrue();
    if (!maclaurin.ok) return;
    expect(maclaurin.value.text).toBe('x - x ^ 3 / 6 + x ^ 5 / 120');
    expect(maclaurin.metadata).toEqual(jasmine.objectContaining({
      operation: 'taylor',
      seriesKind: 'maclaurin',
      variable: 'x',
      center: '0',
      order: 5,
      polynomial: 'x - x ^ 3 / 6 + x ^ 5 / 120',
    }));
  });

  it('supports series convergence end to end', () => {
    const engine = createCasEngine();

    const exp = engine.analyzeSeriesConvergenceText('exp(x)', 'x', '0');
    expect(exp.ok).toBeTrue();
    if (!exp.ok) return;
    expect(exp.value.text).toBe('Radio de convergencia: ∞');
    expect(exp.metadata).toEqual(jasmine.objectContaining({
      operation: 'convergence',
      seriesConvergence: jasmine.objectContaining({
        status: 'known',
        center: '0',
        radius: jasmine.objectContaining({
          kind: 'infinite',
        }),
      }),
    }));

    const ln = engine.analyzeSeriesConvergenceText('ln(1+x)', 'x', '0');
    expect(ln.ok).toBeTrue();
    if (!ln.ok) return;
    expect(ln.value.text).toBe('Radio de convergencia: 1\nIntervalo: (-1, 1]');
    expect(ln.value.interval).toEqual({
      left: '-1',
      right: '1',
      leftIncluded: false,
      rightIncluded: true,
    });

    const unsupported = engine.analyzeSeriesConvergenceText('sqrt(x)', 'x', '0');
    expect(unsupported.ok).toBeTrue();
    if (!unsupported.ok) return;
    expect(unsupported.value.status).toBe('unsupported');
    expect(unsupported.value.text).toBe('Radio de convergencia: no disponible');
  });

  it('supports limit end to end', () => {
    const engine = createCasEngine();

    const polynomialLimit = engine.limitText('x^2', 'x', '2');
    expect(polynomialLimit.ok).toBeTrue();
    if (!polynomialLimit.ok) return;
    expect(polynomialLimit.value.text).toBe('4');

    const removableLimit = engine.limitText('(x^2 - 1) / (x - 1)', 'x', '1');
    expect(removableLimit.ok).toBeTrue();
    if (!removableLimit.ok) return;
    expect(removableLimit.value.text).toBe('2');

    const leftLimit = engine.limitText('1 / x', 'x', '0', { direction: 'left' });
    expect(leftLimit.ok).toBeTrue();
    if (!leftLimit.ok) return;
    expect(leftLimit.value.text).toBe('-∞');

    const rightLimit = engine.limitText('1 / x', 'x', '0', { direction: 'right' });
    expect(rightLimit.ok).toBeTrue();
    if (!rightLimit.ok) return;
    expect(rightLimit.value.text).toBe('+∞');

    const infiniteLimit = engine.limitText('(2 * x + 1) / (3 * x - 5)', 'x', 'inf');
    expect(infiniteLimit.ok).toBeTrue();
    if (!infiniteLimit.ok) return;
    expect(infiniteLimit.value.text).toBe('2 / 3');
  });

  it('rejects unsupported expansions end to end', () => {
    const engine = createCasEngine();

    const expanded = engine.expandText('sin(x)');
    expect(expanded).toEqual({
      ok: false,
      error: jasmine.objectContaining({
        code: 'UNSUPPORTED_EXPRESSION',
      }),
    });
  });

  it('supports differentiation end to end', () => {
    expectDifferentiatesTo('x ^ 2 + x', 'x', '2 * x + 1');
    expectDifferentiatesTo('sin(x ^ 2)', 'x', '2 * x * cos(x ^ 2)');
    expectDifferentiatesTo('x / 2', 'x', '1 / 2');
    expectDifferentiatesTo('2 ^ x', 'x', 'ln(2) * 2 ^ x');
    expectDifferentiatesTo('abs(x)', 'x', 'sign(x)');
  });

  it('rejects unsupported integrals end to end', () => {
    const engine = createCasEngine();

    const integrated = engine.integrateText('factorial(x)', 'x');
    expect(integrated).toEqual({
      ok: false,
      error: jasmine.objectContaining({
        code: 'CAS_UNSUPPORTED_INTEGRAL',
      }),
    });
  });

  it('supports solving end to end', () => {
    expectSolvesTo('x ^ 2 - 1', 'x', ['-1', '1']);
    expectSolvesTo('2 * x + 1 = 0', 'x', ['-1 / 2']);
    expectSolvesTo('4 * x + 2 = 0', 'x', ['-1 / 2']);
    expectSolvesTo('2 * x + 3 = x + 5', 'x', ['2']);
    expectSolvesTo('3 * x - 2 = 2 * x + 4', 'x', ['6']);
    expectSolvesTo('x ^ 2 - 2 = 0', 'x', ['-sqrt(2)', 'sqrt(2)']);
    expectSolvesTo('y * x + 2 = 0', 'x', ['-2 / y']);
    expectSolvesTo(
      'a * x ^ 2 + b * x + c = 0',
      'x',
      ['(-b - sqrt(b ^ 2 - 4 * a * c)) / (2 * a)', '(-b + sqrt(b ^ 2 - 4 * a * c)) / (2 * a)']
    );
    expectSolvesTo('(x - 2) * (x + 3) = 0', 'x', ['-3', '2']);
    expectSolvesTo('(x - 1) ^ 2 = 0', 'x', ['1']);
    expectSolvesTo('sqrt(x) = 3', 'x', ['9']);
    expectSolvesTo('sqrt(x + 1) = 3', 'x', ['8']);
    expectSolvesTo('abs(x) = 3', 'x', ['-3', '3']);
    expectSolvesTo('abs(x) = 0', 'x', ['0']);
    expectSolvesTo('abs(x - 1) = 2', 'x', ['-1', '3']);
    expectSolvesTo('ln(x) = 0', 'x', ['1']);
    expectSolvesTo('exp(x) = 1', 'x', ['0']);

    const engine = createCasEngine();
    const infinite = engine.solveText('x = x', 'x');
    expect(infinite.ok).toBeTrue();
    if (!infinite.ok) return;
    expect(infinite.kind).toBe('infinite');
    expect(infinite.solutions).toEqual([]);
  });

  it('supports solveText for representative CAS equations', () => {
    const engine = createCasEngine();

    const absSolved = engine.solveText('abs(x)=3', 'x');
    expect(absSolved.ok).toBeTrue();
    if (!absSolved.ok) return;
    expect(absSolved.kind).toBe('finite');
    expect(absSolved.text).toEqual(['-3', '3']);

    const sqrtSolved = engine.solveText('sqrt(x)=3', 'x');
    expect(sqrtSolved.ok).toBeTrue();
    if (!sqrtSolved.ok) return;
    expect(sqrtSolved.kind).toBe('finite');
    expect(sqrtSolved.text).toEqual(['9']);

    const expSolved = engine.solveText('exp(x)=e', 'x');
    expect(expSolved.ok).toBeTrue();
    if (!expSolved.ok) return;
    expect(expSolved.kind).toBe('finite');
    expect(expSolved.text).toEqual(['1']);

    const lnSolved = engine.solveText('ln(x)=1', 'x');
    expect(lnSolved.ok).toBeTrue();
    if (!lnSolved.ok) return;
    expect(lnSolved.kind).toBe('finite');
    expect(lnSolved.text).toEqual(['e']);

    const powerSolved = engine.solveText('2^x=8', 'x');
    expect(powerSolved.ok).toBeTrue();
    if (!powerSolved.ok) return;
    expect(powerSolved.kind).toBe('finite');
    expect(powerSolved.text).toEqual(['ln(8) / ln(2)']);
  });

  it('rejects invalid differentiation variables', () => {
    const engine = createCasEngine();

    const differentiated = engine.differentiateText('x ^ 2', 'sin');
    expect(differentiated).toEqual({
      ok: false,
      error: jasmine.objectContaining({
        code: 'INVALID_VARIABLE',
      }),
    });
  });

  it('keeps the parser available for direct use', () => {
    const parser = new CasParser();
    expect(parser.parse('x = 2').ok).toBeTrue();
  });
});
