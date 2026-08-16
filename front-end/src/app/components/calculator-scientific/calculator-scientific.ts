import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HistoryService } from '../../services/history-services/history';
import { CalculatorMemoryService } from '../../services/memory-services/calculator-memory';
import { MemoryToggleService } from '../../services/memory-services/memory-toggle';
import { CalculatorFacade } from '../../services/calculator-state/calculator-facade';
import {
  CAS_QUICK_ACTIONS,
  buildCasInsertion,
  type CasQuickAction,
} from './cas-quick-actions';

interface CasQuickActionGroup {
  readonly title: string;
  readonly description: string;
  readonly actions: readonly CasQuickAction[];
}

@Component({
  selector: 'app-calculator-scientific',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './calculator-scientific.html',
  styleUrls: ['./calculator-scientific.css']
})
export class CalculatorScientificComponent {
  inputValue = '';
  showMemoryButtons = false;
  showCasTools = false;
  readonly casQuickActions = CAS_QUICK_ACTIONS;
  readonly casQuickActionGroups: readonly CasQuickActionGroup[] = [
    {
      title: 'Álgebra',
      description: 'Simplificar, expandir, factorizar y resolver.',
      actions: CAS_QUICK_ACTIONS.filter(action =>
        ['simplify', 'expand', 'factor', 'solve'].includes(action.id)
      ),
    },
    {
      title: 'Cálculo',
      description: 'Derivar, integrar y trabajar con límites.',
      actions: CAS_QUICK_ACTIONS.filter(action =>
        ['differentiate', 'integrate', 'limit'].includes(action.id)
      ),
    },
    {
      title: 'Series',
      description: 'Taylor, Maclaurin y convergencia.',
      actions: CAS_QUICK_ACTIONS.filter(action =>
        ['taylor', 'maclaurin', 'convergence'].includes(action.id)
      ),
    },
  ];

  constructor(
    private calculator: CalculatorFacade,
    public history: HistoryService,
    private calculatorMemory: CalculatorMemoryService,
    private memoryToggle: MemoryToggleService
  ) {
  }

  get angleMode(): string {
    return this.calculator.snapshot.angleMode;
  }

  onCalculatorPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse') return;

    const target = event.target;
    if (!(target instanceof Element) || !target.closest('button')) return;

    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLInputElement &&
      activeElement.id === 'calculatorInput'
    ) {
      activeElement.blur();
    }
  }

  cycleAngleMode() {
    this.calculator.cycleAngleMode();
  }


  toggleMemoryPanel(): void {
    this.memoryToggle.toggle();
  }

  toggleCasTools(): void {
    this.showCasTools = !this.showCasTools;
  }

  closeCasTools(): void {
    this.showCasTools = false;
  }

  closeCasToolsAndFocusToggle(): void {
    this.showCasTools = false;
    this.casToggleButton()?.focus();
  }

  onCasPanelKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;

    event.preventDefault();
    this.closeCasToolsAndFocusToggle();
  }

  insertCasAction(action: CasQuickAction): void {
    const input = this.calculatorInput();
    const insertion = buildCasInsertion(
      input?.value ?? this.calculator.snapshot.expression ?? '',
      input?.selectionStart ?? null,
      input?.selectionEnd ?? null,
      action
    );

    this.calculator.setExpression(insertion.expression);
    this.closeCasTools();

    queueMicrotask(() => {
      const currentInput = this.calculatorInput();
      if (!currentInput) return;

      currentInput.focus();
      currentInput.setSelectionRange(insertion.caretStart, insertion.caretEnd);
    });
  }

  handleButtonClick(value: string): void {
    try {
      switch (value) {
        case 'AC':
        case 'CE':
          this.calculator.clear();
          return;

        case 'DEL':
          this.calculator.backspace();
          return;

        case '+/-':
          if (this.calculator.snapshot.expression) {
            this.calculator.toggleSign();
          } else {
            this.calculator.setExpression('-');
          }
          return;
        case '=':
          const expr = this.calculator.snapshot.expression;
          const result = this.calculator.evaluate({
            angleMode: this.calculator.snapshot.angleMode,
          });
          this.storeHistory(expr, result);
          return;
        default:
          this.calculator.appendToken(value);
          return;
      }
    } catch {
      // CalculatorFacade conserva el error para que Display lo presente.
    }
  }

  async saveMemory() {
    await this.calculatorMemory.saveCurrent();
  }

  async clearMemory() {
    await this.calculatorMemory.clearAll();
  }

  async memoryPlus() {
    await this.calculatorMemory.addCurrentToLast();
  }

  async memoryMinus() {
    await this.calculatorMemory.subtractCurrentFromLast();
  }

  async recallLast() {
    await this.calculatorMemory.recallLast();
  }

  clearHistory(): void {
    this.history.clearHistory();
  }

  private storeHistory(expression: string, result: number | string): void {
    const calculationResult = this.calculator.snapshot.calculationResult;
    if (calculationResult && calculationResult.kind !== 'numeric') {
      this.history.agregarId(expression, result, calculationResult);
      return;
    }

    this.history.agregarId(expression, result);
  }

  private calculatorInput(): HTMLInputElement | null {
    return document.querySelector<HTMLInputElement>('#calculatorInput');
  }

  private casToggleButton(): HTMLButtonElement | null {
    return document.querySelector<HTMLButtonElement>('[data-control="cas-tools"]');
  }
}
