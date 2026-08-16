import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { CalculatorFacade } from '../../services/calculator-state/calculator-facade';
import {
  HistoryItem,
  HistoryService,
} from '../../services/history-services/history';
import { HistoryComponent } from './history';

describe('HistoryComponent', () => {
  let component: HistoryComponent;
  let fixture: ComponentFixture<HistoryComponent>;
  let calculator: jasmine.SpyObj<CalculatorFacade>;
  let historyService: {
    changed$: BehaviorSubject<void>;
    getHistory: jasmine.Spy;
    removeFromLocalStorage: jasmine.Spy;
    clearHistory: jasmine.Spy;
  };

  beforeEach(async () => {
    calculator = jasmine.createSpyObj<CalculatorFacade>(
      'CalculatorFacade',
      ['restoreCalculation']
    );
    historyService = {
      changed$: new BehaviorSubject<void>(undefined),
      getHistory: jasmine.createSpy('getHistory').and.returnValue([]),
      removeFromLocalStorage: jasmine.createSpy('removeFromLocalStorage'),
      clearHistory: jasmine.createSpy('clearHistory'),
    };

    await TestBed.configureTestingModule({
      imports: [HistoryComponent],
      providers: [
        { provide: CalculatorFacade, useValue: calculator },
        { provide: HistoryService, useValue: historyService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HistoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => historyService.changed$.complete());

  function renderHistory(items: HistoryItem[]): void {
    historyService.getHistory.and.returnValue(items);
    component.loadHistory();
    fixture.detectChanges();
  }

  it('should create and show an accessible empty state', () => {
    expect(component).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.history-empty')).toBeTruthy();
    expect(
      (fixture.nativeElement.querySelector('.clear-history') as HTMLButtonElement).disabled
    ).toBeTrue();
  });

  it('renders expression and result separately without duplicated ids or nested controls', () => {
    const item: HistoryItem = {
      idi: 1,
      expression: '6*7',
      result: 42,
    };
    renderHistory([item]);

    expect(fixture.nativeElement.querySelector('.history-expression').textContent).toContain(
      '6*7'
    );
    expect(fixture.nativeElement.querySelector('.history-result').textContent).toContain('42');
    expect(fixture.nativeElement.querySelectorAll('#history-list').length).toBe(1);
    expect(fixture.nativeElement.querySelector('button a, a button')).toBeNull();
  });

  it('renders solve results as structured solutions', () => {
    const calculationResult: NonNullable<HistoryItem['calculationResult']> = {
      kind: 'equation-solutions',
      operation: 'solve',
      source: 'solve(x^2 - 1 = 0, x)',
      display: 'x = -1\nx = 1',
      exact: true,
      expression: 'solve(x^2 - 1 = 0, x)',
      latex: ['-1', '1'],
      variable: 'x',
      solutionKind: 'finite',
      solutions: ['-1', '1'],
      conditions: [],
    };
    const item: HistoryItem = {
      idi: 2,
      expression: 'solve(x^2 - 1 = 0, x)',
      result: 'x = -1\nx = 1',
      calculationResult,
    };
    renderHistory([item]);

    expect(fixture.nativeElement.querySelector('.history-solve .history-label').textContent.trim())
      .toBe('Soluciones');
    expect(fixture.nativeElement.querySelector('.history-solve-solutions').textContent).toContain(
      'x ='
    );
    expect(fixture.nativeElement.querySelector('.history-solve-solutions').textContent).toContain(
      '-1'
    );
    expect(fixture.nativeElement.querySelector('.history-solve-solutions').textContent).toContain(
      '1'
    );
  });

  it('renders a single solve result with the singular label', () => {
    const calculationResult: NonNullable<HistoryItem['calculationResult']> = {
      kind: 'equation-solutions',
      operation: 'solve',
      source: 'solve(sqrt(x)=3, x)',
      display: 'x = 9',
      exact: true,
      expression: 'solve(sqrt(x)=3, x)',
      latex: ['9'],
      variable: 'x',
      solutionKind: 'finite',
      solutions: ['9'],
      conditions: [],
    };
    const item: HistoryItem = {
      idi: 6,
      expression: 'solve(sqrt(x)=3, x)',
      result: 'x = 9',
      calculationResult,
    };
    renderHistory([item]);

    expect(fixture.nativeElement.querySelector('.history-solve .history-label').textContent.trim())
      .toBe('Solución');
    expect(fixture.nativeElement.querySelector('.history-solve-solutions').textContent).toContain(
      'x ='
    );
    expect(fixture.nativeElement.querySelector('.history-solve-solutions').textContent).toContain(
      '9'
    );
  });

  it('renders formal solve results with conditions', () => {
    const calculationResult: NonNullable<HistoryItem['calculationResult']> = {
      kind: 'equation-solutions',
      operation: 'solve',
      source: 'solve(y*x + 2 = 0, x)',
      display: '-2 / y',
      exact: true,
      expression: 'solve(y*x + 2 = 0, x)',
      latex: ['-2 / y'],
      variable: 'x',
      solutionKind: 'finite',
      solutions: ['-2 / y'],
      conditions: ['y ≠ 0'],
    };
    const item: HistoryItem = {
      idi: 3,
      expression: 'solve(y*x + 2 = 0, x)',
      result: '-2 / y',
      calculationResult,
    };
    renderHistory([item]);

    expect(fixture.nativeElement.querySelector('.history-solve .history-label').textContent.trim())
      .toBe('Solución formal');
    expect(fixture.nativeElement.querySelector('.history-solve-conditions').textContent).toContain(
      'Condición'
    );
    expect(fixture.nativeElement.querySelector('.history-solve-conditions').textContent).toContain(
      'y ≠ 0'
    );
  });

  it('renders solve states for none and infinite results', () => {
    renderHistory([
      {
        idi: 4,
        expression: 'solve(sqrt(x) = -1, x)',
        result: 'Sin solución',
        calculationResult: {
          kind: 'equation-solutions',
          operation: 'solve',
          source: 'solve(sqrt(x) = -1, x)',
          display: 'Sin solución',
          exact: true,
          expression: 'solve(sqrt(x) = -1, x)',
          latex: [],
          variable: 'x',
          solutionKind: 'none',
          solutions: [],
          conditions: [],
        },
      },
    ]);

    expect(fixture.nativeElement.querySelector('.history-solve .history-label').textContent.trim())
      .toBe('Sin solución');

    renderHistory([
      {
        idi: 5,
        expression: 'solve(x = x, x)',
        result: 'Infinitas soluciones',
        calculationResult: {
          kind: 'equation-solutions',
          operation: 'solve',
          source: 'solve(x = x, x)',
          display: 'Infinitas soluciones',
          exact: true,
          expression: 'solve(x = x, x)',
          latex: [],
          variable: 'x',
          solutionKind: 'infinite',
          solutions: [],
          conditions: [],
        },
      },
    ]);

    expect(fixture.nativeElement.querySelector('.history-solve .history-label').textContent.trim())
      .toBe('Infinitas soluciones');
  });

  it('restores a history item through CalculatorFacade', () => {
    const item: HistoryItem = {
      idi: 1,
      expression: '6*7',
      result: 42,
    };
    renderHistory([item]);

    (fixture.nativeElement.querySelector('.restore-history') as HTMLButtonElement).click();

    expect(calculator.restoreCalculation).toHaveBeenCalledOnceWith('6*7', 42);
  });

  it('restores CAS metadata when it exists in the history item', () => {
    const calculationResult: NonNullable<HistoryItem['calculationResult']> = {
      kind: 'equation-solutions',
      operation: 'solve',
      source: 'solve(x^2 - 1 = 0, x)',
      display: 'x = -1\nx = 1',
      exact: true,
      expression: 'solve(x^2 - 1 = 0, x)',
      latex: ['-1', '1'],
      variable: 'x',
      solutionKind: 'finite',
      solutions: ['-1', '1'],
    };
    const item: HistoryItem = {
      idi: 2,
      expression: 'solve(x^2 - 1 = 0, x)',
      result: 'x = -1\nx = 1',
      calculationResult,
    };
    renderHistory([item]);

    (fixture.nativeElement.querySelector('.restore-history') as HTMLButtonElement).click();

    expect(calculator.restoreCalculation).toHaveBeenCalledOnceWith(
      'solve(x^2 - 1 = 0, x)',
      'x = -1\nx = 1',
      calculationResult
    );
  });

  it('delegates delete and clear bindings to the repository', () => {
    renderHistory([
      {
        idi: 3,
        expression: '9/3',
        result: 3,
      },
    ]);

    (fixture.nativeElement.querySelector('.delete-history') as HTMLButtonElement).click();
    (fixture.nativeElement.querySelector('.clear-history') as HTMLButtonElement).click();

    expect(historyService.removeFromLocalStorage).toHaveBeenCalledOnceWith(3);
    expect(historyService.clearHistory).toHaveBeenCalled();
  });

  it('unsubscribes from repository changes on destroy', () => {
    const callsBeforeDestroy = historyService.getHistory.calls.count();
    fixture.destroy();

    historyService.changed$.next();

    expect(historyService.getHistory).toHaveBeenCalledTimes(callsBeforeDestroy);
  });
});
