import { TestBed } from '@angular/core/testing';
import Complex from 'complex.js';
import { CALCULATION_ENGINE } from '../engine-services/calculation-engine.contract';
import { CalculatorFacade } from './calculator-facade';
import type { CalculatorComputationResult } from './calculator-state';

describe('CalculatorFacade', () => {
  let facade: CalculatorFacade;
  let engine: { evaluate: jasmine.Spy };

  beforeEach(() => {
    engine = {
      evaluate: jasmine.createSpy('evaluate'),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: CALCULATION_ENGINE, useValue: engine }],
    });
    facade = TestBed.inject(CalculatorFacade);
  });

  it('appends tokens and exposes the display value', () => {
    let displayValue = '';
    const subscription = facade.displayValue$.subscribe(value => displayValue = value);

    facade.appendToken('2');
    facade.appendToken('+3');

    expect(facade.snapshot.expression).toBe('2+3');
    expect(facade.snapshot.lastExpression).toBe('2+3');
    expect(displayValue).toBe('2+3');
    subscription.unsubscribe();
  });

  it('sets, clears and removes the last expression character', () => {
    facade.setExpression('123');
    facade.backspace();
    expect(facade.snapshot.expression).toBe('12');
    expect(facade.snapshot.lastExpression).toBe('12');

    facade.clear();
    expect(facade.snapshot.expression).toBe('');
    expect(facade.snapshot.result).toBeNull();
    expect(facade.snapshot.calculationResult).toBeNull();
  });

  it('toggles the leading sign without changing an empty expression', () => {
    facade.toggleSign();
    expect(facade.snapshot.expression).toBe('');

    facade.setExpression('5');
    facade.toggleSign();
    expect(facade.snapshot.expression).toBe('-5');
    expect(facade.snapshot.lastExpression).toBe('-5');

    facade.toggleSign();
    expect(facade.snapshot.expression).toBe('5');
  });

  it('updates calculator mode', () => {
    let mode = facade.snapshot.mode;
    const subscription = facade.mode$.subscribe(value => mode = value);

    facade.setMode('scientific');

    expect(facade.snapshot.mode).toBe('scientific');
    expect(mode).toBe('scientific');
    subscription.unsubscribe();
  });

  it('sets and cycles angle mode', () => {
    let angleMode = facade.snapshot.angleMode;
    const subscription = facade.angleMode$.subscribe(value => angleMode = value);

    facade.cycleAngleMode();
    expect(facade.snapshot.angleMode).toBe('GRAD');
    facade.cycleAngleMode();
    expect(facade.snapshot.angleMode).toBe('DEG');
    facade.cycleAngleMode();

    expect(facade.snapshot.angleMode).toBe('RAD');
    expect(angleMode).toBe('RAD');

    facade.setAngleMode('DEG');
    expect(angleMode).toBe('DEG');
    subscription.unsubscribe();
  });

  it('updates the active input target', () => {
    let inputTarget = facade.snapshot.inputTarget;
    const subscription = facade.inputTarget$.subscribe(value => inputTarget = value);

    facade.setInputTarget({ type: 'workspace-item', itemId: 'item-1' });

    expect(facade.snapshot.inputTarget).toEqual({
      type: 'workspace-item',
      itemId: 'item-1',
    });
    expect(inputTarget).toEqual({
      type: 'workspace-item',
      itemId: 'item-1',
    });
    subscription.unsubscribe();
  });

  it('starts without an error and can clear it safely', () => {
    facade.clearError();
    expect(facade.snapshot.error).toBeNull();
    expect(facade.snapshot.status).toBe('idle');
  });

  it('reports an error without changing the calculation context', () => {
    facade.restoreCalculation('2+2', 4);
    const context = {
      expression: facade.snapshot.expression,
      lastExpression: facade.snapshot.lastExpression,
      result: facade.snapshot.result,
      phase: facade.snapshot.phase,
    };

    facade.reportError(
      new Error('Invalid graphical expression'),
      'GRAPHIC_EVALUATION_ERROR'
    );

    expect(facade.snapshot.status).toBe('error');
    expect(facade.snapshot.error).toEqual({
      code: 'GRAPHIC_EVALUATION_ERROR',
      message: 'Invalid graphical expression',
    });
    expect({
      expression: facade.snapshot.expression,
      lastExpression: facade.snapshot.lastExpression,
      result: facade.snapshot.result,
      phase: facade.snapshot.phase,
    }).toEqual(context);
  });

  it('evaluates the current expression and stores its display result', () => {
    engine.evaluate.and.returnValue(4);
    facade.setExpression('2+2');

    const result = facade.evaluate();

    expect(engine.evaluate).toHaveBeenCalledOnceWith('2+2', undefined);
    expect(result).toBe(4);
    expect(facade.snapshot.expression).toBe('4');
    expect(facade.snapshot.lastExpression).toBe('2+2');
    expect(facade.snapshot.result).toBe(4);
    expect(facade.snapshot.phase).toBe('result');
  });

  it('evaluates graphic x expressions with an x variable context', () => {
    engine.evaluate.and.returnValue(4);
    facade.setMode('graphic');
    facade.setExpression('x');

    const result = facade.evaluate();

    expect(engine.evaluate).toHaveBeenCalledOnceWith('x', {
      variables: { x: 0 },
    });
    expect(result).toBe(4);
  });

  it('evaluates graphic x+y expressions with x and y variables', () => {
    engine.evaluate.and.returnValue(7);
    facade.setMode('graphic');
    facade.setExpression('x+y');

    const result = facade.evaluate();

    expect(engine.evaluate).toHaveBeenCalledOnceWith('x+y', {
      variables: { x: 0, y: 0 },
    });
    expect(result).toBe(7);
  });

  it('normalizes a complex result for display', () => {
    engine.evaluate.and.returnValue(new Complex(2, 3));
    facade.setExpression('sqrt(-5)');

    const result = facade.evaluate();

    expect(result).toBe('2 + 3i');
    expect(facade.snapshot.expression).toBe('2 + 3i');
    expect(facade.snapshot.result).toBe('2 + 3i');
  });

  it('evaluates simplify CAS commands through the public router', () => {
    facade.setExpression('simplify(2*x + 3*x)');

    const result = facade.evaluate();

    expect(engine.evaluate).not.toHaveBeenCalled();
    expect(result).toBe('5 * x');
    expect(facade.snapshot.expression).toBe('5 * x');
    expect(facade.snapshot.result).toBe('5 * x');
    expect(facade.snapshot.calculationResult).toEqual({
      kind: 'symbolic',
      operation: 'simplify',
      source: 'simplify(2*x + 3*x)',
      display: '5 * x',
      exact: true,
      expression: '5 * x',
      latex: '5 * x',
      } as CalculatorComputationResult);
  });

  it('evaluates expand CAS commands through the public router', () => {
    facade.setExpression('expand((x + 1)^2)');

    const result = facade.evaluate();

    expect(engine.evaluate).not.toHaveBeenCalled();
    expect(result).toBe('x ^ 2 + 2 * x + 1');
    expect(facade.snapshot.expression).toBe('x ^ 2 + 2 * x + 1');
    expect(facade.snapshot.result).toBe('x ^ 2 + 2 * x + 1');
    expect(facade.snapshot.calculationResult).toEqual({
      kind: 'symbolic',
      operation: 'expand',
      source: 'expand((x + 1)^2)',
      display: 'x ^ 2 + 2 * x + 1',
      exact: true,
      expression: 'x ^ 2 + 2 * x + 1',
      latex: 'x ^ 2 + 2 * x + 1',
    } as CalculatorComputationResult);
  });

  it('evaluates differentiate CAS commands through the public router', () => {
    facade.setExpression('diff(sin(x ^ 2), x)');

    const result = facade.evaluate();

    expect(engine.evaluate).not.toHaveBeenCalled();
    expect(result).toBe('2 * x * cos(x ^ 2)');
    expect(facade.snapshot.expression).toBe('2 * x * cos(x ^ 2)');
    expect(facade.snapshot.result).toBe('2 * x * cos(x ^ 2)');
    expect(facade.snapshot.calculationResult).toEqual({
      kind: 'symbolic',
      operation: 'differentiate',
      source: 'diff(sin(x ^ 2), x)',
      display: '2 * x * cos(x ^ 2)',
      exact: true,
      expression: '2 * x * cos(x ^ 2)',
      latex: '2 * x * cos(x ^ 2)',
    } as CalculatorComputationResult);
  });

  it('evaluates integrate CAS commands through the public router', () => {
    facade.setExpression('integrate(x^2,x)');

    const result = facade.evaluate();

    expect(engine.evaluate).not.toHaveBeenCalled();
    expect(result).toBe('x ^ 3 / 3');
    expect(facade.snapshot.expression).toBe('x ^ 3 / 3');
    expect(facade.snapshot.result).toBe('x ^ 3 / 3');
    expect(facade.snapshot.calculationResult).toEqual({
      kind: 'symbolic',
      operation: 'integrate',
      source: 'integrate(x^2,x)',
      display: 'x ^ 3 / 3',
      exact: true,
      expression: 'x ^ 3 / 3',
      latex: 'x ^ 3 / 3',
    } as CalculatorComputationResult);
  });

  it('evaluates limit CAS commands through the public router', () => {
    facade.setExpression('limit((x^2-1)/(x-1),x,1)');

    const result = facade.evaluate();

    expect(engine.evaluate).not.toHaveBeenCalled();
    expect(result).toBe('2');
    expect(facade.snapshot.expression).toBe('2');
    expect(facade.snapshot.result).toBe('2');
    expect(facade.snapshot.calculationResult).toEqual({
      kind: 'symbolic',
      operation: 'limit',
      source: 'limit((x^2-1)/(x-1),x,1)',
      display: '2',
      exact: true,
      expression: '2',
      latex: '2',
    } as CalculatorComputationResult);
  });

  it('evaluates Taylor CAS commands and stores symbolic metadata', () => {
    facade.setExpression('taylor(exp(x),x,0,4)');

    const result = facade.evaluate();

    expect(engine.evaluate).not.toHaveBeenCalled();
    expect(result).toContain('x');
    expect(facade.snapshot.calculationResult).toEqual({
      kind: 'symbolic',
      operation: 'taylor',
      source: 'taylor(exp(x),x,0,4)',
      display: result,
      exact: true,
      expression: result,
      latex: result,
      metadata: {
        operation: 'taylor',
        seriesKind: 'taylor',
        variable: 'x',
        center: '0',
        order: 4,
        polynomial: result,
      },
    } as CalculatorComputationResult);
  });

  it('evaluates convergence CAS commands and stores structured metadata', () => {
    facade.setExpression('convergence(ln(1+x),x,0)');

    const result = facade.evaluate();

    expect(engine.evaluate).not.toHaveBeenCalled();
    expect(result).toContain('Radio de convergencia');
    expect(facade.snapshot.expression).toBe('Radio de convergencia: 1\nIntervalo: (-1, 1]');
    expect(facade.snapshot.result).toBe(result);
    expect(facade.snapshot.calculationResult).toEqual({
      kind: 'symbolic',
      operation: 'convergence',
      source: 'convergence(ln(1+x),x,0)',
      display: result,
      exact: true,
      expression: result,
      latex: result,
      metadata: {
        operation: 'convergence',
        seriesConvergence: {
          status: 'known',
          center: '0',
          radius: {
            kind: 'finite',
            value: '1',
          },
          interval: {
            left: '-1',
            right: '1',
            leftIncluded: false,
            rightIncluded: true,
          },
        },
      },
    } as CalculatorComputationResult);
  });

  it('maps CAS derivative errors to a readable message', () => {
    facade.setExpression('diff(factorial(x), x)');

    expect(() => facade.evaluate()).toThrowError(
      'No se puede derivar la función "factorial".'
    );

    expect(facade.snapshot.status).toBe('error');
    expect(facade.snapshot.error).toEqual({
      code: 'CAS_UNSUPPORTED_DERIVATIVE',
      message: 'No se puede derivar la función "factorial".',
    });
  });

  it('maps CAS integral errors to a readable message', () => {
    facade.setExpression('integrate(factorial(x), x)');

    expect(() => facade.evaluate()).toThrowError(
      'No se puede integrar simbólicamente la función "factorial" todavía.'
    );

    expect(facade.snapshot.status).toBe('error');
    expect(facade.snapshot.error).toEqual({
      code: 'CAS_UNSUPPORTED_INTEGRAL',
      message: 'No se puede integrar simbólicamente la función "factorial" todavía.',
    });
  });

  it('evaluates solve CAS commands and stores the structured metadata', () => {
    facade.setExpression('solve(x^2 - 1 = 0, x)');

    const result = facade.evaluate();

    expect(engine.evaluate).not.toHaveBeenCalled();
    expect(result).toContain('x = -1');
    expect(result).toContain('x = 1');
    expect(facade.snapshot.expression).toContain('x = -1');
    expect(facade.snapshot.result).toBe(result);
    expect(facade.snapshot.calculationResult).toEqual({
      kind: 'equation-solutions',
      operation: 'solve',
      source: 'solve(x^2 - 1 = 0, x)',
      display: result,
      exact: true,
      expression: 'solve(x^2 - 1 = 0, x)',
      latex: ['-1', '1'],
      variable: 'x',
      solutionKind: 'finite',
      solutions: ['-1', '1'],
      conditions: [],
    } as CalculatorComputationResult);
  });

  it('evaluates abs-based solve commands through CAS and stores equation metadata', () => {
    facade.setExpression('solve(abs(x)=3,x)');

    const result = facade.evaluate();

    expect(engine.evaluate).not.toHaveBeenCalled();
    expect(result).toContain('x = -3');
    expect(result).toContain('x = 3');
    expect(facade.snapshot.calculationResult).toEqual({
      kind: 'equation-solutions',
      operation: 'solve',
      source: 'solve(abs(x)=3,x)',
      display: result,
      exact: true,
      expression: 'solve(abs(x)=3,x)',
      latex: ['-3', '3'],
      variable: 'x',
      solutionKind: 'finite',
      solutions: ['-3', '3'],
      conditions: [],
    } as CalculatorComputationResult);
  });

  it('evaluates sqrt-based solve commands through CAS and stores equation metadata', () => {
    facade.setExpression('solve(sqrt(x)=3,x)');

    const result = facade.evaluate();

    expect(engine.evaluate).not.toHaveBeenCalled();
    expect(result).toContain('x = 9');
    expect(facade.snapshot.calculationResult).toEqual({
      kind: 'equation-solutions',
      operation: 'solve',
      source: 'solve(sqrt(x)=3,x)',
      display: result,
      exact: true,
      expression: 'solve(sqrt(x)=3,x)',
      latex: ['9'],
      variable: 'x',
      solutionKind: 'finite',
      solutions: ['9'],
      conditions: [],
    } as CalculatorComputationResult);
  });

  it('evaluates solve commands for no-solution and infinite-solution states', () => {
    facade.setExpression('solve(sqrt(x)=-1,x)');

    const noneResult = facade.evaluate();

    expect(engine.evaluate).not.toHaveBeenCalled();
    expect(noneResult).toBe('Sin solución');
    expect(facade.snapshot.calculationResult).toEqual({
      kind: 'equation-solutions',
      operation: 'solve',
      source: 'solve(sqrt(x)=-1,x)',
      display: 'Sin solución',
      exact: true,
      expression: 'solve(sqrt(x)=-1,x)',
      latex: [],
      variable: 'x',
      solutionKind: 'none',
      solutions: [],
      conditions: [],
    } as CalculatorComputationResult);

    facade.setExpression('solve(x=x,x)');

    const infiniteResult = facade.evaluate();

    expect(engine.evaluate).not.toHaveBeenCalled();
    expect(infiniteResult).toBe('Infinitas soluciones');
    expect(facade.snapshot.calculationResult).toEqual({
      kind: 'equation-solutions',
      operation: 'solve',
      source: 'solve(x=x,x)',
      display: 'Infinitas soluciones',
      exact: true,
      expression: 'solve(x=x,x)',
      latex: [],
      variable: 'x',
      solutionKind: 'infinite',
      solutions: [],
      conditions: [],
    } as CalculatorComputationResult);
  });

  it('evaluates transcendental solve commands and stores equation metadata', () => {
    facade.setExpression('solve(exp(x)=e,x)');

    const result = facade.evaluate();

    expect(engine.evaluate).not.toHaveBeenCalled();
    expect(result).toBe('1');
    expect(facade.snapshot.calculationResult).toEqual({
      kind: 'equation-solutions',
      operation: 'solve',
      source: 'solve(exp(x)=e,x)',
      display: result,
      exact: true,
      expression: 'solve(exp(x)=e,x)',
      latex: ['1'],
      variable: 'x',
      solutionKind: 'finite',
      solutions: ['1'],
      conditions: [],
    } as CalculatorComputationResult);
  });

  it('evaluates formal solve commands and stores their conditions', () => {
    facade.setExpression('solve(y*x + 2 = 0, x)');

    const result = facade.evaluate();

    expect(engine.evaluate).not.toHaveBeenCalled();
    expect(result).toBe('-2 / y');
    expect(facade.snapshot.calculationResult).toEqual({
      kind: 'equation-solutions',
      operation: 'solve',
      source: 'solve(y*x + 2 = 0, x)',
      display: result,
      exact: true,
      expression: 'solve(y*x + 2 = 0, x)',
      latex: ['-2 / y'],
      variable: 'x',
      solutionKind: 'finite',
      solutions: ['-2 / y'],
      conditions: ['y ≠ 0'],
    } as CalculatorComputationResult);
  });

  it('restores a completed calculation', () => {
    facade.restoreCalculation('6*7', 42);

    expect(facade.snapshot.expression).toBe('42');
    expect(facade.snapshot.lastExpression).toBe('6*7');
    expect(facade.snapshot.result).toBe(42);
    expect(facade.snapshot.phase).toBe('result');
  });

  it('begins and finishes memory editing', () => {
    let editingMemoryId = facade.snapshot.editingMemoryId;
    const subscription = facade.editingMemoryId$.subscribe(
      value => editingMemoryId = value
    );

    facade.beginMemoryEdit(7, '3*3', 9);

    expect(facade.snapshot.expression).toBe('3*3');
    expect(facade.snapshot.lastExpression).toBe('3*3');
    expect(facade.snapshot.result).toBe(9);
    expect(facade.snapshot.phase).toBe('editing');
    expect(editingMemoryId).toBe(7);

    facade.finishMemoryEdit();
    expect(editingMemoryId).toBeNull();
    subscription.unsubscribe();
  });

  it('restores a memory record and cancels an active edit', () => {
    facade.beginMemoryEdit(4, '8/2', 4);
    facade.cancelMemoryEdit();
    expect(facade.snapshot.editingMemoryId).toBeNull();

    facade.beginMemoryEdit(5, '6*7', 42);
    facade.restoreMemoryRecord('2+3', 5);

    expect(facade.snapshot.expression).toBe('5');
    expect(facade.snapshot.lastExpression).toBe('2+3');
    expect(facade.snapshot.result).toBe(5);
    expect(facade.snapshot.phase).toBe('result');
    expect(facade.snapshot.editingMemoryId).toBeNull();
  });
});
