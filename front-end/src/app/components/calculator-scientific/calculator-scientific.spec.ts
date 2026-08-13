import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CalculatorScientificComponent } from './calculator-scientific';
import { CalculatorFacade } from '../../services/calculator-state/calculator-facade';
import {
  createInitialCalculatorState,
  type CalculatorSymbolicComputationResult,
  type CalculatorState,
} from '../../services/calculator-state/calculator-state';
import { HistoryService } from '../../services/history-services/history';
import { CalculatorMemoryService } from '../../services/memory-services/calculator-memory';
import { MemoryToggleService } from '../../services/memory-services/memory-toggle';
import { CAS_QUICK_ACTIONS, buildCasInsertion } from './cas-quick-actions';

describe('CalculatorScientificComponent', () => {
  let component: CalculatorScientificComponent;
  let fixture: ComponentFixture<CalculatorScientificComponent>;
  let calculatorState: CalculatorState;
  let mockCalculator: jasmine.SpyObj<CalculatorFacade>;
  let mockMemory: jasmine.SpyObj<CalculatorMemoryService>;
  let mockHistory: { agregarId: jasmine.Spy; clearHistory: jasmine.Spy };

  beforeEach(async () => {
    calculatorState = createInitialCalculatorState();
    mockCalculator = jasmine.createSpyObj<CalculatorFacade>(
      'CalculatorFacade',
      [
        'appendToken',
        'clear',
        'backspace',
        'toggleSign',
        'setExpression',
        'cycleAngleMode',
        'evaluate',
      ],
      { snapshot: calculatorState }
    );
    mockCalculator.cycleAngleMode.and.callFake(() => {
      calculatorState.angleMode =
        calculatorState.angleMode === 'RAD'
          ? 'GRAD'
          : calculatorState.angleMode === 'GRAD'
            ? 'DEG'
            : 'RAD';
    });
    mockCalculator.evaluate.and.returnValue(3);

    mockMemory = jasmine.createSpyObj<CalculatorMemoryService>(
      'CalculatorMemoryService',
      [
        'saveCurrent',
        'clearAll',
        'addCurrentToLast',
        'subtractCurrentFromLast',
        'recallLast',
      ]
    );
    mockMemory.saveCurrent.and.resolveTo(false);
    mockMemory.clearAll.and.resolveTo();
    mockMemory.addCurrentToLast.and.resolveTo(false);
    mockMemory.subtractCurrentFromLast.and.resolveTo(false);
    mockMemory.recallLast.and.resolveTo(false);
    mockHistory = {
      agregarId: jasmine.createSpy('agregarId'),
      clearHistory: jasmine.createSpy('clearHistory'),
    };
    await TestBed.configureTestingModule({
      imports: [CalculatorScientificComponent],
      providers: [
        { provide: CalculatorFacade, useValue: mockCalculator },
        { provide: HistoryService, useValue: mockHistory },
        { provide: CalculatorMemoryService, useValue: mockMemory },
        { provide: MemoryToggleService, useValue: { toggle: jasmine.createSpy('toggle') } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CalculatorScientificComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('blurs calculatorInput on touch buttons and still sends the token', () => {
    const input = attachFocusedInput('calculatorInput');
    const button = buttonForToken('7');
    const event = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerType: 'touch',
    });

    button.dispatchEvent(event);
    button.click();

    expect(document.activeElement).not.toBe(input);
    expect(event.defaultPrevented).toBeFalse();
    expect(mockCalculator.appendToken).toHaveBeenCalledOnceWith('7');
    input.remove();
  });

  it('applies touch blur to toolbar controls but not mouse interaction', () => {
    const angleButton = nativeElement().querySelector<HTMLButtonElement>('#multiBtn')!;
    const touchInput = attachFocusedInput('calculatorInput');

    angleButton.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      pointerType: 'touch',
    }));
    expect(document.activeElement).not.toBe(touchInput);
    touchInput.remove();

    const mouseInput = attachFocusedInput('calculatorInput');
    angleButton.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      pointerType: 'mouse',
    }));
    expect(document.activeElement).toBe(mouseInput);
    mouseInput.remove();
  });

  it('keeps exactly 80 explicit button elements when memory is expanded', () => {
    component.showMemoryButtons = true;
    fixture.detectChanges();

    const buttons = Array.from(
      nativeElement().querySelectorAll<HTMLButtonElement>('button')
    );

    expect(buttons.length).toBe(81);
    expect(buttons.every(button => button.type === 'button')).toBeTrue();
  });

  it('renders a compact CAS button and opens a discoverable panel', () => {
    const casButton = nativeElement().querySelector<HTMLButtonElement>('[data-control="cas-tools"]');

    expect(casButton).not.toBeNull();
    expect(casButton?.type).toBe('button');
    expect(casButton?.getAttribute('aria-controls')).toBe('cas-tools-panel');
    expect(casButton?.getAttribute('aria-expanded')).toBe('false');
    expect(nativeElement().querySelector('#cas-tools-panel')).toBeNull();

    casButton?.click();
    fixture.detectChanges();

    const panel = nativeElement().querySelector<HTMLElement>('#cas-tools-panel');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('aria-label')).toBe('Herramientas de álgebra simbólica');
    expect(casButton?.getAttribute('aria-expanded')).toBe('true');
    const actions = Array.from(panel!.querySelectorAll<HTMLButtonElement>('[data-cas-action]'));
    expect(actions.length).toBe(6);
    expect(actions[0].getAttribute('title')).toContain('Derivada simbólica');
  });

  it('closes the CAS panel with Escape and returns focus to the toggle button', () => {
    const casButton = nativeElement().querySelector<HTMLButtonElement>('[data-control="cas-tools"]')!;

    casButton.click();
    fixture.detectChanges();

    const panel = nativeElement().querySelector<HTMLElement>('#cas-tools-panel')!;
    panel.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    fixture.detectChanges();

    expect(nativeElement().querySelector('#cas-tools-panel')).toBeNull();
    expect(casButton.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(casButton);
  });

  it('inserts the selected expression into CAS templates and keeps the rest intact', () => {
    calculatorState.expression = 'x^2 + 1';
    const input = attachExpressionInput('x^2 + 1', 0, 3);

    clickCasAction('differentiate');

    expect(mockCalculator.setExpression).toHaveBeenCalledOnceWith('diff(x^2,x) + 1');
    expect(input.value).toBe('x^2 + 1');
    input.remove();
  });

  it('inserts the current caret position into CAS templates when nothing is selected', () => {
    calculatorState.expression = 'x^2';
    const input = attachExpressionInput('x^2', 3, 3);

    clickCasAction('simplify');

    expect(mockCalculator.setExpression).toHaveBeenCalledOnceWith('x^2simplify()');
    input.remove();
  });

  it('builds the expected caret positions for CAS insertions', () => {
    expect(
      buildCasInsertion('x^2 + 1', 0, 3, CAS_QUICK_ACTIONS[0]).caretStart
    ).toBeGreaterThan(0);
    expect(
      buildCasInsertion('', null, null, CAS_QUICK_ACTIONS[2])
    ).toEqual({
      expression: 'simplify()',
      caretStart: 9,
      caretEnd: 9,
    });
  });

  it('keeps every scientific token unchanged', () => {
    const handler = spyOn(component, 'handleButtonClick');
    const buttons = Array.from(
      nativeElement().querySelectorAll<HTMLButtonElement>('[data-token]')
    );

    buttons.forEach(button => button.click());

    expect(buttons.length).toBe(71);
    expect(handler.calls.allArgs().map(([token]) => token)).toEqual([
      '2nd',
      'acoth(', 'acsch(', 'asech(', 'asin(', 'acos(', 'atan(', 'asec(', 'acsc(',
      'acot(', 'asinh(', 'acosh(', 'atanh(', 'coth(', 'csch(', 'sech(', 'sinh(',
      'cosh(', 'tanh(', 'sec(', 'cot(', 'csc(', 'sin(', 'cos(', 'tan(',
      'e^(', 'xylog(', '2^x', 'yroot(', '∛', '³', 'ln(', 'log(',
      '10^', 'pow(', '²√', '²', '|x|(', '⌊x⌋(', '⌈x⌉(', '→dms',
      '→deg', ',', 'π', '1/', '(', '|x|(', 'e', ')', 'AC', 'exp(', '!', 'DEL', 'MOD(',
      '7', '8', '9', '4', '5', '6', '1', '2', '3', '+/-', '0', '.',
      '/', '*', '-', '+', '=',
    ]);
  });

  it('delegates AC, DEL, sign and digits from the DOM', () => {
    calculatorState.expression = 'sin(';

    clickToken('9');
    clickToken('DEL');
    clickToken('+/-');
    clickToken('AC');

    expect(mockCalculator.appendToken).toHaveBeenCalledOnceWith('9');
    expect(mockCalculator.backspace).toHaveBeenCalledTimes(1);
    expect(mockCalculator.toggleSign).toHaveBeenCalledTimes(1);
    expect(mockCalculator.clear).toHaveBeenCalledTimes(1);
    expect(buttonForToken('AC').textContent?.trim()).toBe('CE');
  });

  it('preserves the leading minus behavior for an empty expression', () => {
    calculatorState.expression = '';

    component.handleButtonClick('+/-');

    expect(mockCalculator.setExpression).toHaveBeenCalledOnceWith('-');
    expect(mockCalculator.toggleSign).not.toHaveBeenCalled();
  });

  it('evaluates through CalculatorFacade with the selected angle mode', () => {
    calculatorState.expression = 'sqrt(9)';

    clickToken('=');

    expect(mockCalculator.evaluate).toHaveBeenCalledOnceWith({ angleMode: 'RAD' });
    expect(mockHistory.agregarId).toHaveBeenCalledWith('sqrt(9)', 3);
  });

  it('preserves CAS metadata when saving symbolic results to history', () => {
    const calculationResult: CalculatorSymbolicComputationResult = {
      kind: 'symbolic',
      source: 'factor(x^2 - 1)',
      operation: 'factor',
      display: '(x - 1) * (x + 1)',
      exact: true,
      expression: '(x - 1) * (x + 1)',
      latex: '(x - 1)(x + 1)',
    };
    calculatorState.expression = 'factor(x^2 - 1)';
    calculatorState.calculationResult = calculationResult;
    mockCalculator.evaluate.and.returnValue('(x - 1) * (x + 1)' as never);

    clickToken('=');

    expect(mockCalculator.evaluate).toHaveBeenCalledOnceWith({ angleMode: 'RAD' });
    expect(mockHistory.agregarId).toHaveBeenCalledWith(
      'factor(x^2 - 1)',
      '(x - 1) * (x + 1)',
      calculationResult
    );
  });

  it('evaluates symbolic differentiation commands through the same calculator flow', () => {
    const calculationResult: CalculatorSymbolicComputationResult = {
      kind: 'symbolic',
      source: 'diff(x^2,x)',
      operation: 'differentiate',
      display: '2 * x',
      exact: true,
      expression: '2 * x',
      latex: '2 * x',
    };
    calculatorState.expression = 'diff(x^2,x)';
    calculatorState.calculationResult = calculationResult;
    mockCalculator.evaluate.and.returnValue('2 * x' as never);

    clickToken('=');

    expect(mockCalculator.evaluate).toHaveBeenCalledOnceWith({ angleMode: 'RAD' });
    expect(mockHistory.agregarId).toHaveBeenCalledWith(
      'diff(x^2,x)',
      '2 * x',
      calculationResult
    );
  });

  it('evaluates symbolic integration commands through the same calculator flow', () => {
    const calculationResult: CalculatorSymbolicComputationResult = {
      kind: 'symbolic',
      source: 'integrate(x^2,x)',
      operation: 'integrate',
      display: 'x ^ 3 / 3',
      exact: true,
      expression: 'x ^ 3 / 3',
      latex: 'x ^ 3 / 3',
    };
    calculatorState.expression = 'integrate(x^2,x)';
    calculatorState.calculationResult = calculationResult;
    mockCalculator.evaluate.and.returnValue('x ^ 3 / 3' as never);

    clickToken('=');

    expect(mockCalculator.evaluate).toHaveBeenCalledOnceWith({ angleMode: 'RAD' });
    expect(mockHistory.agregarId).toHaveBeenCalledWith(
      'integrate(x^2,x)',
      'x ^ 3 / 3',
      calculationResult
    );
  });

  it('captures evaluation errors without alerting or duplicating a message', () => {
    const alertSpy = spyOn(window, 'alert');
    const facadeError = {
      code: 'EVALUATION_ERROR',
      message: 'Invalid expression',
    };
    calculatorState.error = facadeError;
    mockCalculator.evaluate.and.throwError('Invalid expression');

    expect(() => component.handleButtonClick('=')).not.toThrow();

    expect(mockCalculator.evaluate).toHaveBeenCalledOnceWith({ angleMode: 'RAD' });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockHistory.agregarId).not.toHaveBeenCalled();
    expect(calculatorState.error).toBe(facadeError);
    expect('error' in component).toBeFalse();
  });

  it('keeps one childless multiBtn and cycles RAD, GRAD and DEG from the DOM', () => {
    const buttons = nativeElement().querySelectorAll<HTMLButtonElement>('#multiBtn');
    const angleButton = buttons.item(0);

    expect(buttons.length).toBe(1);
    expect(angleButton.childElementCount).toBe(0);
    expect(angleButton.textContent?.trim()).toBe('RAD');

    angleButton.click();
    fixture.detectChanges();
    expect(calculatorState.angleMode).toBe('GRAD');
    expect(angleButton.textContent?.trim()).toBe('GRAD');

    angleButton.click();
    fixture.detectChanges();
    expect(calculatorState.angleMode).toBe('DEG');
    expect(angleButton.textContent?.trim()).toBe('DEG');

    angleButton.click();
    fixture.detectChanges();
    expect(calculatorState.angleMode).toBe('RAD');
    expect(angleButton.textContent?.trim()).toBe('RAD');
    expect(mockCalculator.cycleAngleMode).toHaveBeenCalledTimes(3);
  });

  it('restores GRAD and DEG from real state after being mounted again', () => {
    fixture.destroy();

    for (const angleMode of ['GRAD', 'DEG'] as const) {
      calculatorState.angleMode = angleMode;
      fixture = TestBed.createComponent(CalculatorScientificComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();

      const angleButtons =
        nativeElement().querySelectorAll<HTMLButtonElement>('#multiBtn');
      expect(angleButtons.length).toBe(1);
      expect(angleButtons.item(0).childElementCount).toBe(0);
      expect(angleButtons.item(0).textContent?.trim()).toBe(angleMode);

      fixture.destroy();
    }
  });

  it('keeps F-E hidden', () => {
    const button = nativeElement().querySelector<HTMLButtonElement>('#fBtn');

    expect(button).not.toBeNull();
    expect(button?.hidden).toBeTrue();
  });

  it('opens and closes the memory controls with More', () => {
    const more = nativeElement().querySelector<HTMLButtonElement>('[data-control="more"]');

    expect(nativeElement().querySelector('.memory-toolbar')).toBeNull();
    expect(more?.getAttribute('aria-expanded')).toBe('false');

    more?.click();
    fixture.detectChanges();

    expect(nativeElement().querySelector('.memory-toolbar')).not.toBeNull();
    expect(more?.getAttribute('aria-expanded')).toBe('true');

    more?.click();
    fixture.detectChanges();

    expect(nativeElement().querySelector('.memory-toolbar')).toBeNull();
    expect(more?.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps memory buttons connected to their public adapters', () => {
    component.showMemoryButtons = true;
    fixture.detectChanges();

    const clear = spyOn(component, 'clearMemory');
    const recall = spyOn(component, 'recallLast');
    const add = spyOn(component, 'memoryPlus');
    const subtract = spyOn(component, 'memoryMinus');
    const save = spyOn(component, 'saveMemory');

    const buttons = Array.from(
      nativeElement().querySelectorAll<HTMLButtonElement>('[data-memory-action]')
    );
    buttons.forEach(button => button.click());

    expect(clear).toHaveBeenCalledTimes(1);
    expect(recall).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
    expect(subtract).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('delegates memory commands to CalculatorMemoryService', async () => {
    await component.saveMemory();
    await component.clearMemory();
    await component.memoryPlus();
    await component.memoryMinus();
    await component.recallLast();

    expect(mockMemory.saveCurrent).toHaveBeenCalled();
    expect(mockMemory.clearAll).toHaveBeenCalled();
    expect(mockMemory.addCurrentToLast).toHaveBeenCalled();
    expect(mockMemory.subtractCurrentFromLast).toHaveBeenCalled();
    expect(mockMemory.recallLast).toHaveBeenCalled();
  });

  function clickToken(token: string): void {
    buttonForToken(token).click();
  }

  function buttonForToken(token: string): HTMLButtonElement {
    const button = Array.from(
      nativeElement().querySelectorAll<HTMLButtonElement>('[data-token]')
    ).find(candidate => candidate.dataset['token'] === token);

    expect(button).withContext(`Missing button for token ${token}`).toBeDefined();
    return button as HTMLButtonElement;
  }

  function nativeElement(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function attachFocusedInput(id: string): HTMLInputElement {
    const input = document.createElement('input');
    input.id = id;
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);
    return input;
  }

  function attachExpressionInput(
    value: string,
    selectionStart: number,
    selectionEnd: number
  ): HTMLInputElement {
    const input = attachFocusedInput('calculatorInput');
    input.value = value;
    input.setSelectionRange(selectionStart, selectionEnd);
    return input;
  }

  function clickCasAction(actionId: string): void {
    const button = nativeElement().querySelector<HTMLButtonElement>(
      `[data-control="cas-tools"]`
    );
    button?.click();
    fixture.detectChanges();

    const action = nativeElement().querySelector<HTMLButtonElement>(
      `[data-cas-action="${actionId}"]`
    );
    expect(action).withContext(`Missing CAS action ${actionId}`).toBeDefined();
    action?.click();
  }
});
