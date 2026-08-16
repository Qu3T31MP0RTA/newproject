import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { HistoryService,HistoryItem } from '../../services/history-services/history';
import { CalculatorFacade } from '../../services/calculator-state/calculator-facade';
import type { CalculatorEquationSolutionsComputationResult } from '../../services/calculator-state/calculator-state';

@Component({
  selector: 'app-history',
  templateUrl: './history.html',
  styleUrls: ['./history.css'],
  standalone: true,
  imports: [CommonModule],
})
export class HistoryComponent implements OnInit, OnDestroy {
  history: HistoryItem[] = [];
  private sub!: Subscription;

  constructor(
    private historyService: HistoryService,
    private calculator: CalculatorFacade
  ) {}

  ngOnInit(): void {
    this.loadHistory();

    this.sub = this.historyService.changed$.subscribe(() => {
      this.loadHistory();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  loadHistory(): void {
    this.history = this.historyService.getHistory();
  }

  restoreHistory(item: HistoryItem): void {
    const calculationResult = item.calculationResult;
    if (calculationResult && calculationResult.kind !== 'numeric') {
      this.calculator.restoreCalculation(
        item.expression,
        item.result,
        calculationResult
      );
      return;
    }

    this.calculator.restoreCalculation(item.expression, item.result);
  }

  deleteItem(idi: number): void {
    this.historyService.removeFromLocalStorage(idi);
  }

  clearAll(): void {
    this.historyService.clearHistory();
  }

  isEquationSolutions(
    calculationResult: HistoryItem['calculationResult']
  ): calculationResult is CalculatorEquationSolutionsComputationResult {
    return calculationResult?.kind === 'equation-solutions';
  }

  getSolveResult(
    calculationResult: HistoryItem['calculationResult']
  ): CalculatorEquationSolutionsComputationResult | null {
    return this.isEquationSolutions(calculationResult) ? calculationResult : null;
  }

  getSolveHeading(
    calculationResult: CalculatorEquationSolutionsComputationResult
  ): string {
    if (calculationResult.solutionKind === 'none') return 'Sin solución';
    if (calculationResult.solutionKind === 'infinite') {
      return 'Infinitas soluciones';
    }

    const formal = (calculationResult.conditions?.length ?? 0) > 0;
    if (!formal) {
      return calculationResult.solutions.length === 1
        ? 'Solución'
        : 'Soluciones';
    }

    return calculationResult.solutions.length === 1
      ? 'Solución formal'
      : 'Soluciones formales';
  }
}
