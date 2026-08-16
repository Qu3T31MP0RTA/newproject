import type Complex from 'complex.js';
import type { CasMetadata } from '../cas/ast/cas-ast';

export type CalculatorValue = number | Complex;
export type CalculatorResult = CalculatorValue | string;
export type CalculatorMode = 'basic' | 'scientific' | 'graphic';
export type CalculatorAngleMode = 'RAD' | 'DEG' | 'GRAD';
export type CalculatorPhase = 'editing' | 'result';
export type CalculatorStatus = 'idle' | 'evaluating' | 'error';
export type CalculatorComputationKind = 'numeric' | 'symbolic' | 'equation-solutions';

export type CalculatorInputTarget =
  | { type: 'calculator' }
  | { type: 'workspace-item'; itemId: string };

export interface CalculatorError {
  code: string;
  message: string;
}

export interface CalculatorState {
  expression: string;
  lastExpression: string | null;
  result: CalculatorResult | null;
  calculationResult: CalculatorComputationResult | null;
  phase: CalculatorPhase;
  status: CalculatorStatus;
  mode: CalculatorMode;
  angleMode: CalculatorAngleMode;
  inputTarget: CalculatorInputTarget;
  error: CalculatorError | null;
  editingMemoryId: number | null;
}

export function createInitialCalculatorState(): CalculatorState {
  return {
    expression: '',
    lastExpression: null,
    result: null,
    calculationResult: null,
    phase: 'editing',
    status: 'idle',
    mode: 'graphic',
    angleMode: 'RAD',
    inputTarget: { type: 'calculator' },
    error: null,
    editingMemoryId: null,
  };
}

export interface CalculatorNumericComputationResult {
  kind: 'numeric';
  operation: 'evaluate';
  source: string;
  display: string;
  exact: boolean;
  value: CalculatorResult;
}

export interface CalculatorSymbolicComputationResult {
  kind: 'symbolic';
  operation: 'simplify' | 'expand' | 'factor' | 'differentiate' | 'integrate' | 'limit' | 'taylor' | 'convergence';
  source: string;
  display: string;
  exact: boolean;
  expression: string;
  latex: string;
  metadata?: CasMetadata;
}

export interface CalculatorEquationSolutionsComputationResult {
  kind: 'equation-solutions';
  operation: 'solve';
  source: string;
  display: string;
  exact: boolean;
  expression: string;
  latex: readonly string[];
  variable: string;
  solutionKind: 'finite' | 'none' | 'infinite';
  solutions: readonly string[];
  conditions?: readonly string[];
}

export type CalculatorComputationResult =
  | CalculatorNumericComputationResult
  | CalculatorSymbolicComputationResult
  | CalculatorEquationSolutionsComputationResult;
