import { TestBed } from '@angular/core/testing';
import { CalculatorCasCommandRouterService } from './calculator-cas-command-router';

describe('CalculatorCasCommandRouterService', () => {
  let router: CalculatorCasCommandRouterService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CalculatorCasCommandRouterService],
    });
    router = TestBed.inject(CalculatorCasCommandRouterService);
  });

  it('does not handle ordinary numeric functions', () => {
    expect(router.canHandle('sin(1)')).toBeFalse();
    expect(router.canHandle('sign(1)')).toBeFalse();
    expect(router.execute('sin(1)')).toBeNull();
    expect(router.execute('sign(1)')).toBeNull();
  });

  it('simplifies expressions through the public CAS engine', () => {
    const execution = router.execute('simplify(2*x + 3*x)');

    expect(execution).not.toBeNull();
    expect(execution?.ok).toBeTrue();
    if (execution?.ok) {
      expect(execution.command).toBe('simplify');
      expect(execution.result.kind).toBe('symbolic');
      expect(execution.result.display).toBe('5 * x');
      expect(execution.result.latex).toBe('5 * x');
    }
  });

  it('expands expressions through the public CAS engine', () => {
    const execution = router.execute('expand((x + 1)^2)');

    expect(execution).not.toBeNull();
    expect(execution?.ok).toBeTrue();
    if (execution?.ok) {
      expect(execution.command).toBe('expand');
      expect(execution.result.kind).toBe('symbolic');
      expect(execution.result.display).toContain('x ^ 2');
    }
  });

  it('integrates expressions through the public CAS engine', () => {
    const execution = router.execute('integrate(x^2, x)');
    const lnExecution = router.execute('integrate(ln(x), x)');
    const byPartsExecution = router.execute('integrate(x*sin(x), x)');

    expect(execution).not.toBeNull();
    expect(execution?.ok).toBeTrue();
    if (execution?.ok) {
      expect(execution.command).toBe('integrate');
      expect(execution.result.kind).toBe('symbolic');
      expect(execution.result.display).toBe('x ^ 3 / 3');
      expect(execution.result.latex).toBe('x ^ 3 / 3');
    }

    expect(lnExecution).not.toBeNull();
    expect(lnExecution?.ok).toBeTrue();
    if (lnExecution?.ok) {
      expect(lnExecution.command).toBe('integrate');
      expect(lnExecution.result.kind).toBe('symbolic');
      expect(lnExecution.result.display).toBe('x * ln(x) - x');
    }

    expect(byPartsExecution).not.toBeNull();
    expect(byPartsExecution?.ok).toBeTrue();
    if (byPartsExecution?.ok) {
      expect(byPartsExecution.command).toBe('integrate');
      expect(byPartsExecution.result.kind).toBe('symbolic');
      expect(byPartsExecution.result.display).toBe('-x * cos(x) + sin(x)');
    }
  });

  it('preserves integral metadata for the new limited rules', () => {
    for (const source of ['integrate(ln(x), x)', 'integrate(x*sin(x), x)']) {
      const execution = router.execute(source);

      expect(execution).not.toBeNull();
      expect(execution?.ok).toBeTrue();
      if (execution?.ok) {
        expect(execution.command).toBe('integrate');
        expect(execution.result.kind).toBe('symbolic');
      }
    }
  });

  it('reports unsupported expansions through the public CAS engine', () => {
    const execution = router.execute('expand(sin(x))');

    expect(execution).not.toBeNull();
    expect(execution?.ok).toBeFalse();
    if (execution && !execution.ok) {
      expect(execution.error.code).toBe('UNSUPPORTED_EXPRESSION');
    }
  });

  it('factors expressions through the public CAS engine', () => {
    const execution = router.execute('factor(x^2 - 1)');

    expect(execution).not.toBeNull();
    expect(execution?.ok).toBeTrue();
    if (execution?.ok) {
      expect(execution.command).toBe('factor');
      expect(execution.result.kind).toBe('symbolic');
      expect(execution.result.display).toContain('(x - 1)');
      expect(execution.result.display).toContain('(x + 1)');
    }
  });

  it('supports diff as an alias for differentiate', () => {
    const diffExecution = router.execute('diff(sin(x ^ 2), x)');
    const differentiateExecution = router.execute('differentiate(sin(x ^ 2), x)');

    expect(diffExecution).not.toBeNull();
    expect(differentiateExecution).not.toBeNull();
    expect(diffExecution?.ok).toBeTrue();
    expect(differentiateExecution?.ok).toBeTrue();
    if (diffExecution?.ok && differentiateExecution?.ok) {
      expect(diffExecution.command).toBe('differentiate');
      expect(differentiateExecution.command).toBe('differentiate');
      expect(diffExecution.result.kind).toBe('symbolic');
      expect(differentiateExecution.result.kind).toBe('symbolic');
      expect(diffExecution.result.display).toBe(
        differentiateExecution.result.display
      );
      expect(diffExecution.result.display).toContain('2 * x');
      expect(diffExecution.result.display).toContain('cos(x ^ 2)');
    }
  });

  it('supports differentiate as the canonical command name', () => {
    const execution = router.execute('differentiate(sin(x), x)');

    expect(execution).not.toBeNull();
    expect(execution?.ok).toBeTrue();
    if (execution?.ok) {
      expect(execution.command).toBe('differentiate');
      expect(execution.result.kind).toBe('symbolic');
      expect(execution.result.display).toContain('cos(x)');
    }
  });

  it('reports arity errors before validating variables', () => {
    for (const source of [
      'diff(x)',
      'diff(x, )',
      'diff(, x)',
      'diff(x, x, y)',
      'differentiate()',
      'differentiate(x)',
      'solve(x = 1)',
      'solve(x = 1, )',
      'simplify()',
    ]) {
      const execution = router.execute(source);

      expect(execution).not.toBeNull();
      expect(execution?.ok).toBeFalse();
      if (execution && !execution.ok) {
        expect(execution.error.code).toBe('CAS_COMMAND_ARITY_ERROR');
      }
    }
  });

  it('solves simple equations and formats multiple solutions', () => {
    const execution = router.execute('solve(x^2 - 1 = 0, x)');

    expect(execution).not.toBeNull();
    expect(execution?.ok).toBeTrue();
    if (execution?.ok) {
      expect(execution.command).toBe('solve');
      expect(execution.result.kind).toBe('equation-solutions');
      expect(execution.result.display).toContain('x = -1');
      expect(execution.result.display).toContain('x = 1');
      expect(execution.result.solutionKind).toBe('finite');
    }
  });

  it('reports unsupported command-like identifiers clearly', () => {
    const execution = router.execute('unknown(x)');

    expect(execution).not.toBeNull();
    expect(execution?.ok).toBeFalse();
    if (execution && !execution.ok) {
      expect(execution.error.code).toBe('CAS_COMMAND_UNSUPPORTED');
    }
  });

  it('reports arity errors for malformed commands', () => {
    const execution = router.execute('diff(x)');

    expect(execution).not.toBeNull();
    expect(execution?.ok).toBeFalse();
    if (execution && !execution.ok) {
      expect(execution.error.code).toBe('CAS_COMMAND_ARITY_ERROR');
    }
  });

  it('reports invalid variables after arity validation for differentiate commands', () => {
    const execution = router.execute('diff(x, 5)');

    expect(execution).not.toBeNull();
    expect(execution?.ok).toBeFalse();
    if (execution && !execution.ok) {
      expect(execution.error.code).toBe('INVALID_VARIABLE');
    }
  });

  it('reports integrate arity errors before validating variables', () => {
    for (const source of [
      'integrate()',
      'integrate(x)',
      'integrate(x,)',
      'integrate(x,x,y)',
    ]) {
      const execution = router.execute(source);

      expect(execution).not.toBeNull();
      expect(execution?.ok).toBeFalse();
      if (execution && !execution.ok) {
        expect(execution.error.code).toBe('CAS_COMMAND_ARITY_ERROR');
      }
    }
  });

  it('reports invalid variables for integrate commands', () => {
    const execution = router.execute('integrate(x, 5)');

    expect(execution).not.toBeNull();
    expect(execution?.ok).toBeFalse();
    if (execution && !execution.ok) {
      expect(execution.error.code).toBe('INVALID_VARIABLE');
    }
  });

  it('preserves derivative error metadata for unsupported functions', () => {
    const execution = router.execute('diff(factorial(x), x)');

    expect(execution).not.toBeNull();
    expect(execution?.ok).toBeFalse();
    if (execution && !execution.ok) {
      expect(execution.error.code).toBe('CAS_UNSUPPORTED_DERIVATIVE');
      expect(execution.error.functionName).toBe('factorial');
    }
  });

  it('preserves integral error metadata for unsupported functions', () => {
    const execution = router.execute('integrate(factorial(x), x)');

    expect(execution).not.toBeNull();
    expect(execution?.ok).toBeFalse();
    if (execution && !execution.ok) {
      expect(execution.error.code).toBe('CAS_UNSUPPORTED_INTEGRAL');
      expect(execution.error.functionName).toBe('factorial');
    }
  });

  it('rejects malformed solve and simplify commands without throwing', () => {
    for (const source of ['solve(x = 1)', 'solve(x = 1, )', 'simplify()']) {
      const execution = router.execute(source);

      expect(execution).not.toBeNull();
      expect(execution?.ok).toBeFalse();
      if (execution && !execution.ok) {
        expect(execution.error.code).toBe('CAS_COMMAND_ARITY_ERROR');
      }
    }
  });
});
