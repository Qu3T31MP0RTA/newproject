import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { map } from 'rxjs';
import { HistoryService } from '../../services/history-services/history';
import { InputService } from '../../services/input-services/input-services';
import { CalculatorFacade } from '../../services/calculator-state/calculator-facade';
import type {
  CalculatorEquationSolutionsComputationResult,
  CalculatorState,
  CalculatorStatus,
} from '../../services/calculator-state/calculator-state';

interface DisplayViewModel {
  expression: string;
  result: string | null;
  resultIsMultiline: boolean;
  error: string | null;
  status: CalculatorStatus;
  statusLabel: string;
  solveResult: CalculatorEquationSolutionsComputationResult | null;
}

@Component({
  selector: 'app-display',
  templateUrl: './display.html',
  styleUrls: ['./display.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class DisplayComponent implements AfterViewInit, OnDestroy {
  readonly viewModel$;
  @ViewChild('expressionInput') private expressionInput?: ElementRef<HTMLInputElement>;
  private caretSyncHandle: number | null = null;

  constructor(
    private calculator: CalculatorFacade,
    public history: HistoryService,
    public inputService: InputService,
  ) {
    this.viewModel$ = this.calculator.state$.pipe(
      map(state => this.toViewModel(state))
    );
  }

  ngAfterViewInit(): void {
    this.scheduleCaretReveal();
  }

  ngOnDestroy(): void {
    if (this.caretSyncHandle !== null) {
      cancelAnimationFrame(this.caretSyncHandle);
      this.caretSyncHandle = null;
    }
  }

  onExpressionChange(expression: string): void {
    this.calculator.setExpression(expression);
    this.scheduleCaretReveal();
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Backspace') {
      event.preventDefault();

      const state = this.calculator.snapshot;
      if (state.phase === 'result' && state.lastExpression !== null) {
        this.calculator.setExpression(state.lastExpression);
      }

      this.calculator.backspace();
      this.scheduleCaretReveal();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      try {
        const expr = this.calculator.snapshot.expression;
        const result = this.calculator.evaluate({
          angleMode: this.calculator.snapshot.angleMode,
        });
        this.storeHistory(expr, result);
      } catch {
        // El facade ya conserva el error para que el display lo muestre.
      }
    }
  }

  onExpressionFocus(): void {
    this.inputService.setCalculatorTarget();
    this.scheduleCaretReveal();
  }

  private toViewModel(state: CalculatorState): DisplayViewModel {
    return {
      expression:
        state.phase === 'result'
          ? state.lastExpression ?? state.expression
          : state.expression,
      result:
        state.phase === 'result' && state.result !== null
          ? String(state.result)
          : null,
      resultIsMultiline:
        state.phase === 'result' &&
        state.result !== null &&
        String(state.result).includes('\n'),
      error: state.error?.message ?? null,
      status: state.status,
      statusLabel: this.getStatusLabel(state),
      solveResult:
        state.calculationResult?.kind === 'equation-solutions'
          ? state.calculationResult
          : null,
    };
  }

  private getStatusLabel(state: CalculatorState): string {
    if (state.status === 'evaluating') return 'Calculando';
    if (state.status === 'error') return 'Error';
    if (state.phase === 'result') return 'Resultado';
    return 'Listo';
  }

  getSolveLabel(result: CalculatorEquationSolutionsComputationResult): string {
    if (result.solutionKind === 'none') return 'Sin solución';
    if (result.solutionKind === 'infinite') return 'Infinitas soluciones';

    const formal = (result.conditions?.length ?? 0) > 0;
    if (!formal) {
      return result.solutions.length === 1 ? 'Solución' : 'Soluciones';
    }

    return result.solutions.length === 1
      ? 'Solución formal'
      : 'Soluciones formales';
  }

  private scheduleCaretReveal(): void {
    if (this.caretSyncHandle !== null) {
      cancelAnimationFrame(this.caretSyncHandle);
    }

    this.caretSyncHandle = requestAnimationFrame(() => {
      this.caretSyncHandle = null;
      const input = this.expressionInput?.nativeElement;
      if (!input || document.activeElement !== input) return;

      const selectionStart = input.selectionStart;
      const selectionEnd = input.selectionEnd;
      if (
        selectionStart === null ||
        selectionEnd === null ||
        selectionStart !== selectionEnd ||
        selectionEnd !== input.value.length
      ) {
        return;
      }

      input.scrollLeft = input.scrollWidth;
    });
  }

  private storeHistory(expression: string, result: number | string): void {
    const calculationResult = this.calculator.snapshot.calculationResult;
    if (calculationResult && calculationResult.kind !== 'numeric') {
      this.history.agregarId(expression, result, calculationResult);
      return;
    }

    this.history.agregarId(expression, result);
  }
}
