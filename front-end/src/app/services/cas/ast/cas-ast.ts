import { createCasError } from '../errors/cas-errors';
import type { CasError } from '../errors/cas-errors';
import type { CasSeriesConvergenceResult } from '../convergence/cas-series-convergence';

export type CasExpression =
  | CasNumberNode
  | CasSymbolNode
  | CasUnaryNode
  | CasBinaryNode
  | CasFunctionCallNode
  | CasEquationNode;

export interface CasNumberNode {
  readonly kind: 'number';
  readonly value: number;
}

export interface CasSymbolNode {
  readonly kind: 'symbol';
  readonly name: string;
}

export interface CasUnaryNode {
  readonly kind: 'unary';
  readonly operator: '+' | '-';
  readonly operand: CasExpression;
}

export interface CasBinaryNode {
  readonly kind: 'binary';
  readonly operator: '+' | '-' | '*' | '/' | '^';
  readonly left: CasExpression;
  readonly right: CasExpression;
}

export interface CasFunctionCallNode {
  readonly kind: 'function';
  readonly name: string;
  readonly arguments: readonly CasExpression[];
}

export interface CasEquationNode {
  readonly kind: 'equation';
  readonly left: CasExpression;
  readonly right: CasExpression;
}

export interface CasMetadata {
  readonly source?: string;
  readonly depth?: number;
  readonly nodeCount?: number;
  readonly iterations?: number;
  readonly operation?: 'taylor' | 'maclaurin' | 'convergence';
  readonly seriesKind?: 'taylor' | 'maclaurin';
  readonly variable?: string;
  readonly center?: string;
  readonly order?: number;
  readonly polynomial?: string;
  readonly seriesConvergence?: CasSeriesConvergenceResult;
}

const BINARY_OPERATORS = new Set(['+', '-', '*', '/', '^']);
const UNARY_OPERATORS = new Set(['+', '-']);

export function numberNode(value: number): CasNumberNode {
  if (!Number.isFinite(value)) {
    throw new Error('CAS number must be finite');
  }

  return {
    kind: 'number',
    value: normalizeZero(value),
  };
}

export function symbolNode(name: string): CasSymbolNode {
  const normalized = name.trim();

  if (!normalized) {
    throw new Error('CAS symbol name must not be empty');
  }

  return {
    kind: 'symbol',
    name: normalized,
  };
}

export function unaryNode(
  operator: '+' | '-',
  operand: CasExpression
): CasUnaryNode {
  if (!UNARY_OPERATORS.has(operator)) {
    throw new Error(`Unsupported CAS unary operator: ${operator}`);
  }

  return {
    kind: 'unary',
    operator,
    operand,
  };
}

export function binaryNode(
  operator: '+' | '-' | '*' | '/' | '^',
  left: CasExpression,
  right: CasExpression
): CasBinaryNode {
  if (!BINARY_OPERATORS.has(operator)) {
    throw new Error(`Unsupported CAS binary operator: ${operator}`);
  }

  return {
    kind: 'binary',
    operator,
    left,
    right,
  };
}

export function functionCallNode(
  name: string,
  args: readonly CasExpression[] = []
): CasFunctionCallNode {
  const normalized = name.trim();

  if (!normalized) {
    throw new Error('CAS function name must not be empty');
  }

  return {
    kind: 'function',
    name: normalized,
    arguments: [...args],
  };
}

export function equationNode(
  left: CasExpression,
  right: CasExpression
): CasEquationNode {
  return {
    kind: 'equation',
    left,
    right,
  };
}

export function isStructurallyEqual(
  left: CasExpression,
  right: CasExpression
): boolean {
  if (left.kind !== right.kind) {
    return false;
  }

  switch (left.kind) {
    case 'number':
      return right.kind === 'number' && Object.is(left.value, right.value);
    case 'symbol':
      return right.kind === 'symbol' && left.name === right.name;
    case 'unary':
      return (
        right.kind === 'unary' &&
        left.operator === right.operator &&
        isStructurallyEqual(left.operand, right.operand)
      );
    case 'binary':
      return (
        right.kind === 'binary' &&
        left.operator === right.operator &&
        isStructurallyEqual(left.left, right.left) &&
        isStructurallyEqual(left.right, right.right)
      );
    case 'function':
      return (
        right.kind === 'function' &&
        left.name === right.name &&
        left.arguments.length === right.arguments.length &&
        left.arguments.every((argument, index) =>
          isStructurallyEqual(argument, right.arguments[index])
        )
      );
    case 'equation':
      return (
        right.kind === 'equation' &&
        isStructurallyEqual(left.left, right.left) &&
        isStructurallyEqual(left.right, right.right)
      );
    default: {
      const _exhaustive: never = left;
      return _exhaustive;
    }
  }
}

export interface CasComplexity {
  readonly depth: number;
  readonly nodeCount: number;
}

export function measureCasExpression(expression: CasExpression): CasComplexity {
  switch (expression.kind) {
    case 'number':
    case 'symbol':
      return { depth: 1, nodeCount: 1 };
    case 'unary': {
      const operand = measureCasExpression(expression.operand);
      return {
        depth: operand.depth + 1,
        nodeCount: operand.nodeCount + 1,
      };
    }
    case 'binary': {
      const left = measureCasExpression(expression.left);
      const right = measureCasExpression(expression.right);
      return {
        depth: Math.max(left.depth, right.depth) + 1,
        nodeCount: left.nodeCount + right.nodeCount + 1,
      };
    }
    case 'function': {
      let depth = 1;
      let nodeCount = 1;
      for (const argument of expression.arguments) {
        const measured = measureCasExpression(argument);
        depth = Math.max(depth, measured.depth + 1);
        nodeCount += measured.nodeCount;
      }
      return { depth, nodeCount };
    }
    case 'equation': {
      const left = measureCasExpression(expression.left);
      const right = measureCasExpression(expression.right);
      return {
        depth: Math.max(left.depth, right.depth) + 1,
        nodeCount: left.nodeCount + right.nodeCount + 1,
      };
    }
    default: {
      const _exhaustive: never = expression;
      return _exhaustive;
    }
  }
}

export function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

export function toCasFailure(message: string, detail?: string): CasError {
  return createCasError('NOT_IMPLEMENTED', message, detail);
}
