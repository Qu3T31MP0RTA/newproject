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

  it('evaluates limits through the public CAS engine', () => {
    const execution = router.execute('limit((x^2 - 1) / (x - 1), x, 1)');
    const directExecution = router.execute('limit(sin(x), x, 0)');
    const leftExecution = router.execute('limit(1 / x, x, 0, left)');
    const rightExecution = router.execute('limit(1 / x, x, 0, right)');
    const infinityExecution = router.execute('limit(x, x, inf)');

    expect(execution).not.toBeNull();
    expect(execution?.ok).toBeTrue();
    if (execution?.ok) {
      expect(execution.command).toBe('limit');
      expect(execution.result.kind).toBe('symbolic');
      expect(execution.result.display).toBe('2');
      expect(execution.result.latex).toBe('2');
    }

    expect(directExecution).not.toBeNull();
    expect(directExecution?.ok).toBeTrue();
    if (directExecution?.ok) {
      expect(directExecution.command).toBe('limit');
      expect(directExecution.result.kind).toBe('symbolic');
      expect(directExecution.result.display).toBe('0');
    }

    expect(leftExecution).not.toBeNull();
    expect(leftExecution?.ok).toBeTrue();
    if (leftExecution?.ok) {
      expect(leftExecution.command).toBe('limit');
      expect(leftExecution.result.kind).toBe('symbolic');
      expect(leftExecution.result.display).toBe('-∞');
    }

    expect(rightExecution).not.toBeNull();
    expect(rightExecution?.ok).toBeTrue();
    if (rightExecution?.ok) {
      expect(rightExecution.command).toBe('limit');
      expect(rightExecution.result.kind).toBe('symbolic');
      expect(rightExecution.result.display).toBe('+∞');
    }

    expect(infinityExecution).not.toBeNull();
    expect(infinityExecution?.ok).toBeTrue();
    if (infinityExecution?.ok) {
      expect(infinityExecution.command).toBe('limit');
      expect(infinityExecution.result.kind).toBe('symbolic');
      expect(infinityExecution.result.display).toBe('+∞');
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
      'limit()',
      'limit(x)',
      'limit(x, x)',
      'limit(x, x, 0, 1)',
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

  it('solves abs and sqrt equations through the public CAS engine', () => {
    const absExecution = router.execute('solve(abs(x) = 3, x)');
    const sqrtExecution = router.execute('solve(sqrt(x) = 3, x)');
    const noneExecution = router.execute('solve(sqrt(x) = -1, x)');
    const infiniteExecution = router.execute('solve(x = x, x)');

    expect(absExecution).not.toBeNull();
    expect(absExecution?.ok).toBeTrue();
    if (absExecution?.ok) {
      expect(absExecution.command).toBe('solve');
      expect(absExecution.result.kind).toBe('equation-solutions');
      expect(absExecution.result.display).toContain('x = -3');
      expect(absExecution.result.display).toContain('x = 3');
    }

    expect(sqrtExecution).not.toBeNull();
    expect(sqrtExecution?.ok).toBeTrue();
    if (sqrtExecution?.ok) {
      expect(sqrtExecution.command).toBe('solve');
      expect(sqrtExecution.result.kind).toBe('equation-solutions');
      expect(sqrtExecution.result.display).toContain('x = 9');
    }

    expect(noneExecution).not.toBeNull();
    expect(noneExecution?.ok).toBeTrue();
    if (noneExecution?.ok) {
      expect(noneExecution.command).toBe('solve');
      expect(noneExecution.result.kind).toBe('equation-solutions');
      expect(noneExecution.result.display).toBe('Sin solución');
      expect(noneExecution.result.solutionKind).toBe('none');
    }

    expect(infiniteExecution).not.toBeNull();
    expect(infiniteExecution?.ok).toBeTrue();
    if (infiniteExecution?.ok) {
      expect(infiniteExecution.command).toBe('solve');
      expect(infiniteExecution.result.kind).toBe('equation-solutions');
      expect(infiniteExecution.result.display).toBe('Infinitas soluciones');
      expect(infiniteExecution.result.solutionKind).toBe('infinite');
    }
  });

  it('solves limited transcendental equations through the public CAS engine', () => {
    const expExecution = router.execute('solve(exp(x) = e, x)');
    const expLinearExecution = router.execute('solve(exp(2 * x + 1) = 3, x)');
    const lnExecution = router.execute('solve(ln(x) = 1, x)');
    const sameBaseExecution = router.execute('solve(2 ^ (x + 1) = 2 ^ 3, x)');
    const impossibleExecution = router.execute('solve(exp(x) = 0, x)');

    expect(expExecution).not.toBeNull();
    expect(expExecution?.ok).toBeTrue();
    if (expExecution?.ok) {
      expect(expExecution.command).toBe('solve');
      expect(expExecution.result.kind).toBe('equation-solutions');
      expect(expExecution.result.display).toContain('x = 1');
      expect(expExecution.result.solutionKind).toBe('finite');
    }

    expect(expLinearExecution).not.toBeNull();
    expect(expLinearExecution?.ok).toBeTrue();
    if (expLinearExecution?.ok) {
      expect(expLinearExecution.command).toBe('solve');
      expect(expLinearExecution.result.kind).toBe('equation-solutions');
      expect(expLinearExecution.result.display).toContain('(ln(3) - 1) / 2');
    }

    expect(lnExecution).not.toBeNull();
    expect(lnExecution?.ok).toBeTrue();
    if (lnExecution?.ok) {
      expect(lnExecution.command).toBe('solve');
      expect(lnExecution.result.kind).toBe('equation-solutions');
      expect(lnExecution.result.display).toContain('x = e');
    }

    expect(sameBaseExecution).not.toBeNull();
    expect(sameBaseExecution?.ok).toBeTrue();
    if (sameBaseExecution?.ok) {
      expect(sameBaseExecution.command).toBe('solve');
      expect(sameBaseExecution.result.kind).toBe('equation-solutions');
      expect(sameBaseExecution.result.display).toContain('x = 2');
    }

    expect(impossibleExecution).not.toBeNull();
    expect(impossibleExecution?.ok).toBeTrue();
    if (impossibleExecution?.ok) {
      expect(impossibleExecution.command).toBe('solve');
      expect(impossibleExecution.result.kind).toBe('equation-solutions');
      expect(impossibleExecution.result.solutionKind).toBe('none');
    }
  });

  it('builds Taylor polynomials through the public CAS engine', () => {
    const execution = router.execute('taylor(exp(x), x, 0, 4)');
    const maclaurin = router.execute('maclaurin(exp(x), x, 4)');

    expect(execution).not.toBeNull();
    expect(execution?.ok).toBeTrue();
    if (execution?.ok) {
      expect(execution.command).toBe('taylor');
      expect(execution.result.kind).toBe('symbolic');
      expect(execution.result.display).toContain('x ^ 4 / 24');
      expect(execution.result.metadata).toEqual(jasmine.objectContaining({
        operation: 'taylor',
        seriesKind: 'taylor',
        variable: 'x',
        center: '0',
        order: 4,
      }));
    }

    expect(maclaurin).not.toBeNull();
    expect(maclaurin?.ok).toBeTrue();
    if (maclaurin?.ok) {
      expect(maclaurin.command).toBe('taylor');
      expect(maclaurin.result.kind).toBe('symbolic');
      expect(maclaurin.result.display).toContain('x ^ 4 / 24');
      expect(maclaurin.result.metadata).toEqual(jasmine.objectContaining({
        operation: 'taylor',
        seriesKind: 'maclaurin',
        variable: 'x',
        center: '0',
        order: 4,
      }));
    }
  });

  it('builds series convergence metadata through the public CAS engine', () => {
    const exp = router.execute('convergence(exp(x), x, 0)');
    const ln = router.execute('convergence(ln(1 + x), x, 0)');
    const unsupported = router.execute('convergence(sqrt(x), x, 0)');
    const displaced = router.execute('convergence(1 / (1 - 2 * (x - 3)), x, 3)');

    expect(exp).not.toBeNull();
    expect(exp?.ok).toBeTrue();
    if (exp?.ok) {
      expect(exp.command).toBe('convergence');
      expect(exp.result.kind).toBe('symbolic');
      expect(exp.result.display).toBe('Radio de convergencia: ∞');
      expect(exp.result.metadata).toEqual(jasmine.objectContaining({
        operation: 'convergence',
        seriesConvergence: jasmine.objectContaining({
          status: 'known',
          center: '0',
          radius: jasmine.objectContaining({
            kind: 'infinite',
          }),
        }),
      }));
    }

    expect(ln).not.toBeNull();
    expect(ln?.ok).toBeTrue();
    if (ln?.ok) {
      expect(ln.command).toBe('convergence');
      expect(ln.result.display).toBe('Radio de convergencia: 1\nIntervalo: (-1, 1]');
    }

    expect(unsupported).not.toBeNull();
    expect(unsupported?.ok).toBeTrue();
    if (unsupported?.ok) {
      expect(unsupported.command).toBe('convergence');
      expect(unsupported.result.display).toBe('Radio de convergencia: no disponible');
      expect(unsupported.result.metadata).toEqual(jasmine.objectContaining({
        operation: 'convergence',
        seriesConvergence: jasmine.objectContaining({
          status: 'unsupported',
          radius: jasmine.objectContaining({
            kind: 'unsupported',
          }),
        }),
      }));
    }

    expect(displaced).not.toBeNull();
    expect(displaced?.ok).toBeTrue();
    if (displaced?.ok) {
      expect(displaced.result.display).toBe('Radio de convergencia: 1 / 2\nIntervalo: (5 / 2, 7 / 2)');
    }
  });

  it('rejects malformed Taylor commands and invalid Taylor orders', () => {
    const arity = router.execute('taylor(exp(x), x, 0)');
    const invalidVariable = router.execute('taylor(exp(x), 5, 0, 4)');
    const invalidOrder = router.execute('taylor(exp(x), x, 0, -1)');
    const orderLimit = router.execute('taylor(exp(x), x, 0, 13)');
    const maclaurinArity = router.execute('maclaurin(exp(x), x)');
    const maclaurinVariable = router.execute('maclaurin(exp(x), 5, 4)');
    const convergenceArity = router.execute('convergence(exp(x), x)');
    const convergenceVariable = router.execute('convergence(exp(x), 5, 0)');
    const convergenceCenter = router.execute('convergence(exp(x), x, x)');

    expect(arity).not.toBeNull();
    expect(arity?.ok).toBeFalse();
    if (arity && !arity.ok) {
      expect(arity.error.code).toBe('CAS_COMMAND_ARITY_ERROR');
    }

    expect(invalidVariable).not.toBeNull();
    expect(invalidVariable?.ok).toBeFalse();
    if (invalidVariable && !invalidVariable.ok) {
      expect(invalidVariable.error.code).toBe('INVALID_VARIABLE');
    }

    expect(invalidOrder).not.toBeNull();
    expect(invalidOrder?.ok).toBeFalse();
    if (invalidOrder && !invalidOrder.ok) {
      expect(invalidOrder.error.code).toBe('INVALID_TAYLOR_ORDER');
    }

    expect(orderLimit).not.toBeNull();
    expect(orderLimit?.ok).toBeFalse();
    if (orderLimit && !orderLimit.ok) {
      expect(orderLimit.error.code).toBe('TAYLOR_ORDER_LIMIT');
    }

    expect(maclaurinArity).not.toBeNull();
    expect(maclaurinArity?.ok).toBeFalse();
    if (maclaurinArity && !maclaurinArity.ok) {
      expect(maclaurinArity.error.code).toBe('CAS_COMMAND_ARITY_ERROR');
    }

    expect(maclaurinVariable).not.toBeNull();
    expect(maclaurinVariable?.ok).toBeFalse();
    if (maclaurinVariable && !maclaurinVariable.ok) {
      expect(maclaurinVariable.error.code).toBe('INVALID_VARIABLE');
    }

    expect(convergenceArity).not.toBeNull();
    expect(convergenceArity?.ok).toBeFalse();
    if (convergenceArity && !convergenceArity.ok) {
      expect(convergenceArity.error.code).toBe('CAS_COMMAND_ARITY_ERROR');
    }

    expect(convergenceVariable).not.toBeNull();
    expect(convergenceVariable?.ok).toBeFalse();
    if (convergenceVariable && !convergenceVariable.ok) {
      expect(convergenceVariable.error.code).toBe('INVALID_VARIABLE');
    }

    expect(convergenceCenter).not.toBeNull();
    expect(convergenceCenter?.ok).toBeFalse();
    if (convergenceCenter && !convergenceCenter.ok) {
      expect(convergenceCenter.error.code).toBe('CAS_SERIES_DOMAIN_ERROR');
    }
  });

  it('includes solve conditions when the result is formal', () => {
    const execution = router.execute('solve(y * x + 2 = 0, x)');

    expect(execution).not.toBeNull();
    expect(execution?.ok).toBeTrue();
    if (execution?.ok) {
      expect(execution.command).toBe('solve');
      expect(execution.result.kind).toBe('equation-solutions');
      expect(execution.result.solutionKind).toBe('finite');
      expect(execution.result.solutions).toEqual(['-2 / y']);
      expect(execution.result.conditions).toEqual(['y ≠ 0']);
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

  it('reports invalid variables for limit commands', () => {
    const execution = router.execute('limit(x, 5, 0)');

    expect(execution).not.toBeNull();
    expect(execution?.ok).toBeFalse();
    if (execution && !execution.ok) {
      expect(execution.error.code).toBe('INVALID_VARIABLE');
    }
  });

  it('reports invalid limit directions after arity validation', () => {
    const execution = router.execute('limit(x, x, 0, sideways)');

    expect(execution).not.toBeNull();
    expect(execution?.ok).toBeFalse();
    if (execution && !execution.ok) {
      expect(execution.error.code).toBe('INVALID_LIMIT_DIRECTION');
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
