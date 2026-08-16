import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, distinctUntilChanged, map, type Observable } from 'rxjs';
import Complex from 'complex.js';
import {
  CALCULATION_ENGINE,
  type CalculationEngine,
  type CalculationOptions,
} from '../engine-services/calculation-engine.contract';
import {
  CalculatorCasCommandRouterService,
  type CalculatorCasCommandResult,
} from '../cas/calculator-cas-command-router';
import { CalculatorErrorMessageService } from './calculator-error-message';
import { Tokenizer } from '../polish-services/tokenizer';
import { detectGraphVariables } from '../polish-services/graph-variable-detector';
import { createInitialCalculatorState } from './calculator-state';
import type {
  CalculatorAngleMode,
  CalculatorInputTarget,
  CalculatorMode,
  CalculatorComputationResult,
  CalculatorState,
} from './calculator-state';

export type CalculationContextUpdate = Partial<
  Pick<CalculatorState, 'lastExpression' | 'result' | 'editingMemoryId'>
>;

@Injectable({ providedIn: 'root' })
export class CalculatorFacade {
  private readonly engine = inject<CalculationEngine>(CALCULATION_ENGINE);
  private readonly commandRouter = inject(CalculatorCasCommandRouterService);
  private readonly errorMessages = inject(CalculatorErrorMessageService);
  private readonly tokenizer = inject(Tokenizer);
  private readonly stateSubject = new BehaviorSubject<CalculatorState>(
    createInitialCalculatorState()
  );

  readonly state$ = this.stateSubject.asObservable();
  readonly displayValue$ = this.select(state => state.expression);
  readonly mode$ = this.select(state => state.mode);
  readonly angleMode$ = this.select(state => state.angleMode);
  readonly inputTarget$ = this.select(state => state.inputTarget);
  readonly error$ = this.select(state => state.error);
  readonly editingMemoryId$ = this.select(state => state.editingMemoryId);

  get snapshot(): CalculatorState {
    return this.stateSubject.value;
  }

  appendToken(token: string): void {
    const expression = this.snapshot.expression + token;
    this.update({
      expression,
      lastExpression: expression,
      phase: 'editing',
      error: null,
      calculationResult: null,
    });
  }

  setExpression(expression: string): void {
    this.update({
      expression,
      phase: 'editing',
      error: null,
      calculationResult: null,
    });
  }

  clear(): void {
    this.update({
      expression: '',
      lastExpression: null,
      result: null,
      calculationResult: null,
      phase: 'editing',
      status: 'idle',
      error: null,
      editingMemoryId: null,
    });
  }

  backspace(): void {
    const expression = this.snapshot.expression.slice(0, -1);
    this.update({
      expression,
      lastExpression: expression,
      phase: 'editing',
      error: null,
      calculationResult: null,
    });
  }

  toggleSign(): void {
    const expression = this.snapshot.expression;
    if (!expression) return;

    const toggledExpression = expression.startsWith('-')
      ? expression.slice(1)
      : `-${expression}`;
    this.update({
      expression: toggledExpression,
      lastExpression: toggledExpression,
      phase: 'editing',
      error: null,
      calculationResult: null,
    });
  }

  setMode(mode: CalculatorMode): void {
    this.update({ mode });
  }

  setAngleMode(angleMode: CalculatorAngleMode): void {
    this.update({ angleMode });
  }

  cycleAngleMode(): void {
    const current = this.snapshot.angleMode;
    const next: CalculatorAngleMode =
      current === 'RAD' ? 'GRAD' :
      current === 'GRAD' ? 'DEG' : 'RAD';

    this.setAngleMode(next);
  }

  setInputTarget(inputTarget: CalculatorInputTarget): void {
    this.update({ inputTarget });
  }

  evaluate(options?: CalculationOptions): number | string {
    const expression = this.snapshot.expression;
    const commandResult = this.commandRouter.execute(expression);
    if (commandResult) {
      if (!commandResult.ok) {
        const message = this.errorMessages.getMessage(commandResult.error);
        this.update({
          status: 'error',
          error: {
            code: commandResult.error.code,
            message,
          },
          calculationResult: null,
        });
        throw new Error(message);
      }

      const resultDetails = this.mapCommandResult(commandResult.result);
      this.update({
        expression: resultDetails.display,
        lastExpression: expression,
        result: resultDetails.display,
        calculationResult: resultDetails,
        phase: 'result',
        status: 'idle',
        error: null,
      });

      return resultDetails.display;
    }

    const graphVariables =
      this.snapshot.mode === 'graphic'
        ? detectGraphVariables(expression, this.tokenizer)
        : { hasX: false, hasY: false, variables: {} };
    const mergedOptions =
      graphVariables.hasX || graphVariables.hasY
        ? {
            ...options,
            variables: {
              ...graphVariables.variables,
              ...(options?.variables ?? {}),
            },
        }
        : options;
    this.update({ status: 'evaluating', error: null });

    try {
      const rawResult = this.engine.evaluate(expression, mergedOptions);
      const result: number | string = rawResult instanceof Complex
        ? rawResult.toString().replace('=', '')
        : rawResult;
      const calculationResult = this.buildNumericCalculationResult(
        expression,
        result
      );

      this.update({
        expression: String(result),
        lastExpression: expression,
        result,
        calculationResult,
        phase: 'result',
        status: 'idle',
        error: null,
      });

      return result;
    } catch (error) {
      this.update({
        status: 'error',
        error: {
          code: 'EVALUATION_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
        calculationResult: null,
      });
      throw error;
    }
  }

  restoreCalculation(
    expression: string,
    result: number | string,
    calculationResult: CalculatorComputationResult | null = null
  ): void {
    this.update({
      expression: String(result),
      lastExpression: expression,
      result,
      calculationResult,
      phase: 'result',
      status: 'idle',
      error: null,
    });
  }

  beginMemoryEdit(id: number, expression: string, result: number | string): void {
    this.update({
      expression,
      lastExpression: expression,
      result,
      calculationResult: null,
      phase: 'editing',
      status: 'idle',
      error: null,
      editingMemoryId: id,
    });
  }

  restoreMemoryRecord(expression: string, result: number | string): void {
    this.update({
      expression: String(result),
      lastExpression: expression,
      result,
      calculationResult: null,
      phase: 'result',
      status: 'idle',
      error: null,
      editingMemoryId: null,
    });
  }

  finishMemoryEdit(): void {
    this.update({ editingMemoryId: null });
  }

  cancelMemoryEdit(): void {
    this.update({ editingMemoryId: null });
  }

  updateCalculationContext(context: CalculationContextUpdate): void {
    this.update(context);
  }

  reportError(error: unknown, code = 'EVALUATION_ERROR'): void {
    this.update({
      status: 'error',
      calculationResult: null,
      error: {
        code,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }

  clearError(): void {
    this.update({
      error: null,
      status: this.snapshot.status === 'error' ? 'idle' : this.snapshot.status,
    });
  }

  private select<T>(project: (state: CalculatorState) => T): Observable<T> {
    return this.state$.pipe(
      map(project),
      distinctUntilChanged()
    );
  }

  private update(partial: Partial<CalculatorState>): void {
    this.stateSubject.next({
      ...this.snapshot,
      ...partial,
    });
  }

  private buildNumericCalculationResult(
    source: string,
    result: number | string
  ): CalculatorComputationResult {
    return {
      kind: 'numeric',
      operation: 'evaluate',
      source,
      display: String(result),
      exact: typeof result === 'number' && Number.isFinite(result) && Number.isInteger(result),
      value: result,
    };
  }

  private mapCommandResult(
    commandResult: CalculatorCasCommandResult
  ): CalculatorComputationResult {
    if (commandResult.kind === 'equation-solutions') {
      return {
        kind: 'equation-solutions',
        operation: 'solve',
        source: commandResult.source,
        display: commandResult.display,
        exact: commandResult.exact,
        expression: commandResult.expression,
        latex: commandResult.latex as readonly string[],
        variable: commandResult.variable ?? 'x',
        solutionKind: commandResult.solutionKind ?? 'finite',
        solutions: commandResult.solutions ?? [],
        conditions: commandResult.conditions ?? [],
      };
    }

    return {
      kind: 'symbolic',
      operation: commandResult.operation as
        | 'simplify'
        | 'expand'
        | 'factor'
        | 'differentiate'
        | 'integrate'
        | 'limit'
        | 'taylor'
        | 'convergence',
      source: commandResult.source,
      display: commandResult.display,
      exact: commandResult.exact,
      expression: commandResult.expression,
      latex: String(commandResult.latex),
      ...(commandResult.metadata ? { metadata: commandResult.metadata } : {}),
    };
  }
}
