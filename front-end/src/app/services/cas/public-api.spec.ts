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
    expectSolvesTo('x ^ 2 - 2 = 0', 'x', ['-sqrt(2)', 'sqrt(2)']);

    const engine = createCasEngine();
    const infinite = engine.solveText('x = x', 'x');
    expect(infinite.ok).toBeTrue();
    if (!infinite.ok) return;
    expect(infinite.kind).toBe('infinite');
    expect(infinite.solutions).toEqual([]);
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
