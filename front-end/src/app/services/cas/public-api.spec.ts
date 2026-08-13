import { CasParser } from './parser/cas-parser';
import { DefaultCasEngine, createCasEngine } from './public-api';

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
    const engine = createCasEngine();

    const parsed = engine.parse('x ^ 2 + x');
    expect(parsed.ok).toBeTrue();
    if (!parsed.ok) return;

    const differentiated = engine.differentiate(parsed.value, 'x');
    expect(differentiated.ok).toBeTrue();
    if (!differentiated.ok) return;

    expect(engine.format(differentiated.value)).toBe('2 * x + 1');

    const differentiatedText = engine.differentiateText('sin(x ^ 2)', 'x');
    expect(differentiatedText.ok).toBeTrue();
    if (!differentiatedText.ok) return;

    expect(differentiatedText.value.text).toBe('2 * x * cos(x ^ 2)');

    const powerText = engine.differentiateText('2 ^ x', 'x');
    expect(powerText.ok).toBeTrue();
    if (!powerText.ok) return;

    expect(powerText.value.text).toBe('ln(2) * 2 ^ x');
  });

  it('supports solving end to end', () => {
    const engine = createCasEngine();

    const parsed = engine.parse('x ^ 2 - 1');
    expect(parsed.ok).toBeTrue();
    if (!parsed.ok) return;

    const direct = engine.solve(parsed.value, 'x');
    expect(direct.ok).toBeTrue();
    if (!direct.ok) return;
    expect(direct.kind).toBe('finite');
    expect(direct.text).toEqual(['-1', '1']);

    const linear = engine.solveText('2 * x + 1 = 0', 'x');
    expect(linear.ok).toBeTrue();
    if (!linear.ok) return;
    expect(linear.kind).toBe('finite');
    expect(linear.text).toEqual(['-1 / 2']);

    const quadratic = engine.solveText('x ^ 2 - 2 = 0', 'x');
    expect(quadratic.ok).toBeTrue();
    if (!quadratic.ok) return;
    expect(quadratic.kind).toBe('finite');
    expect(quadratic.text).toEqual(['-sqrt(2)', 'sqrt(2)']);

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
