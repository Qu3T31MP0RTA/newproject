import { Injectable } from '@angular/core';
import {
  createCasEngine,
  type CasEngine,
  type CasMetadata,
  type CasError,
  type CasLimitOptions,
  type CasSolutionKind,
  type CasSolveResult,
} from './public-api';

export type CalculatorCasCommandName =
  | 'simplify'
  | 'expand'
  | 'factor'
  | 'differentiate'
  | 'integrate'
  | 'limit'
  | 'taylor'
  | 'convergence'
  | 'solve';

export interface CalculatorCasCommandResult {
  readonly kind: 'symbolic' | 'equation-solutions';
  readonly operation: CalculatorCasCommandName;
  readonly source: string;
  readonly display: string;
  readonly exact: boolean;
  readonly expression: string;
  readonly latex: string | readonly string[];
  readonly metadata?: CasMetadata;
  readonly variable?: string;
  readonly solutionKind?: CasSolutionKind;
  readonly solutions?: readonly string[];
  readonly conditions?: readonly string[];
}

export interface CalculatorCasCommandSuccess {
  readonly ok: true;
  readonly command: CalculatorCasCommandName;
  readonly result: CalculatorCasCommandResult;
}

export interface CalculatorCasCommandFailure {
  readonly ok: false;
  readonly command: string;
  readonly source: string;
  readonly error: CalculatorCasCommandError;
}

export interface CalculatorCasCommandError {
  readonly code: string;
  readonly message: string;
  readonly functionName?: string;
}

export type CalculatorCasCommandExecution =
  | CalculatorCasCommandSuccess
  | CalculatorCasCommandFailure;

const SUPPORTED_COMMANDS: ReadonlySet<string> = new Set([
  'simplify',
  'expand',
  'factor',
  'differentiate',
  'integrate',
  'limit',
  'taylor',
  'maclaurin',
  'convergence',
  'diff',
  'solve',
]);

const NUMERIC_FUNCTIONS: ReadonlySet<string> = new Set([
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'asec',
  'acsc',
  'acot',
  'sinh',
  'cosh',
  'tanh',
  'sech',
  'csch',
  'coth',
  'asinh',
  'acosh',
  'atanh',
  'asech',
  'acsch',
  'acoth',
  'ln',
  'log',
  'sqrt',
  'cbrt',
  'abs',
  'sign',
  'floor',
  'ceil',
  'exp',
  'expe',
  'yroot',
  'logxy',
  'pow',
  'mod',
  'deg',
  'dms',
  'factorial',
  'xylog',
  '%',
]);

@Injectable({ providedIn: 'root' })
export class CalculatorCasCommandRouterService {
  private readonly engine: CasEngine = createCasEngine();

  canHandle(source: string): boolean {
    return this.parse(source) !== null;
  }

  execute(source: string): CalculatorCasCommandExecution | null {
    const parsed = this.parse(source);
    if (!parsed) {
      return null;
    }

    if (parsed.kind === 'failure') {
      return {
        ok: false,
        command: parsed.command,
        source: parsed.source,
        error: parsed.error,
      };
    }

    const { command, args } = parsed;
    switch (command) {
      case 'simplify': {
        const [expression] = args as readonly [string];
        const result = this.engine.simplifyText(expression);
        return this.fromTextResult(source, command, result);
      }
      case 'expand': {
        const [expression] = args as readonly [string];
        const result = this.engine.expandText(expression);
        return this.fromTextResult(source, command, result);
      }
      case 'factor': {
        const [expression] = args as readonly [string];
        const result = this.engine.factorText(expression);
        return this.fromTextResult(source, command, result);
      }
      case 'differentiate': {
        const [expression, variable] = args as readonly [string, string];
        const result = this.engine.differentiateText(expression, variable);
        return this.fromTextResult(source, command, result);
      }
      case 'integrate': {
        const [expression, variable] = args as readonly [string, string];
        const result = this.engine.integrateText(expression, variable);
        return this.fromTextResult(source, command, result);
      }
      case 'limit': {
        const [expression, variable, point, direction] =
          args as readonly [string, string, string, string?];
        const result = this.engine.limitText(
          expression,
          variable,
          point,
          direction ? { direction: direction as CasLimitOptions['direction'] } : undefined
        );
        return this.fromTextResult(source, command, result);
      }
      case 'taylor': {
        const result = parsed.seriesKind === 'maclaurin'
          ? this.engine.maclaurinText(
              (args as readonly [string, string, string])[0],
              (args as readonly [string, string, string])[1],
              this.parseTaylorOrder((args as readonly [string, string, string])[2])
            )
          : this.engine.taylorText(
              (args as readonly [string, string, string, string])[0],
              (args as readonly [string, string, string, string])[1],
              (args as readonly [string, string, string, string])[2],
              this.parseTaylorOrder((args as readonly [string, string, string, string])[3])
            );
        return this.fromTextResult(source, command, result);
      }
      case 'solve': {
        const [expression, variable] = args as readonly [string, string];
        const result = this.engine.solveText(expression, variable);
        return this.fromSolveResult(source, result);
      }
      case 'convergence': {
        const [expression, variable, center] = args as readonly [string, string, string];
        const result = this.engine.analyzeSeriesConvergenceText(
          expression,
          variable,
          center
        );
        return this.fromTextResult(source, command, result);
      }
      default: {
        const _exhaustive: never = command;
        return _exhaustive;
      }
    }
  }

  private fromTextResult(
    source: string,
    operation: Exclude<CalculatorCasCommandName, 'solve'>,
    result:
      | {
          ok: true;
          value: { text: string; latex: string; expression: unknown };
          metadata?: CasMetadata;
        }
      | { ok: false; error: CasError }
  ): CalculatorCasCommandExecution {
    if (!result.ok) {
      return {
        ok: false,
        command: operation,
        source,
        error: result.error,
      };
    }

    return {
      ok: true,
      command: operation,
      result: {
        kind: 'symbolic',
        operation,
        source,
        display: result.value.text,
        exact: true,
        expression: result.value.text,
        latex: result.value.latex,
        metadata: result.metadata,
      },
    };
  }

  private fromSolveResult(
    source: string,
    result: CasSolveResult
  ): CalculatorCasCommandExecution {
    if (!result.ok) {
      return {
        ok: false,
        command: 'solve',
        source,
        error: result.error,
      };
    }

    const display = this.formatSolveDisplay(result);
    return {
      ok: true,
      command: 'solve',
      result: {
        kind: 'equation-solutions',
        operation: 'solve',
        source,
        display,
        exact: result.exact,
        expression: source,
        latex: result.latex,
        variable: result.variable,
        solutionKind: result.kind,
        solutions: result.text,
        conditions: result.conditions,
      },
    };
  }

  private formatSolveDisplay(result: CasSolveResult): string {
    if (!result.ok) {
      return result.error.message;
    }

    if (result.kind === 'none') {
      return 'Sin solución';
    }

    if (result.kind === 'infinite') {
      return 'Infinitas soluciones';
    }

    return result.text.map(solution => `${result.variable} = ${solution}`).join('\n');
  }

  private parse(source: string):
    | {
        kind: 'command';
        command: CalculatorCasCommandName;
        seriesKind?: 'taylor' | 'maclaurin';
        args:
          | readonly [string]
          | readonly [string, string]
          | readonly [string, string, string]
          | readonly [string, string, string, string];
      }
    | { kind: 'failure'; command: string; source: string; error: CalculatorCasCommandError }
    | null {
    const trimmed = source.trim();
    if (!trimmed) {
      return null;
    }

    const openIndex = trimmed.indexOf('(');
    if (openIndex <= 0) {
      return null;
    }

    const name = trimmed.slice(0, openIndex).trim();
    if (!this.isIdentifier(name)) {
      return null;
    }

    if (NUMERIC_FUNCTIONS.has(name)) {
      return null;
    }

    const closeIndex = this.findMatchingCloseParen(trimmed, openIndex);
    if (closeIndex < 0) {
      return this.failure(
        name,
        trimmed,
        'CAS_COMMAND_SYNTAX_ERROR',
        'La sintaxis del comando CAS es inválida.'
      );
    }

    if (trimmed.slice(closeIndex + 1).trim()) {
      return this.failure(
        name,
        trimmed,
        'CAS_COMMAND_SYNTAX_ERROR',
        'La sintaxis del comando CAS es inválida.'
      );
    }

    const canonicalName = this.normalizeCommandName(name);
    if (
      !SUPPORTED_COMMANDS.has(name) &&
      (canonicalName === null || !SUPPORTED_COMMANDS.has(canonicalName))
    ) {
      return this.failure(
        name,
        trimmed,
        'CAS_COMMAND_UNSUPPORTED',
        `El comando CAS "${name}" no está soportado.`
      );
    }

    const args = this.splitTopLevelArguments(trimmed.slice(openIndex + 1, closeIndex));
    const normalizedCommand = (canonicalName ?? name) as CalculatorCasCommandName;
    if (
      normalizedCommand === 'solve' ||
      normalizedCommand === 'differentiate' ||
      normalizedCommand === 'integrate'
    ) {
      if (args.length !== 2 || args.some(arg => !arg.trim())) {
        return this.failure(
          normalizedCommand,
          trimmed,
          'CAS_COMMAND_ARITY_ERROR',
          `${normalizedCommand} requiere exactamente dos argumentos.`
        );
      }

      return {
        kind: 'command',
        command: normalizedCommand,
        args: [args[0].trim(), args[1].trim()],
      };
    }

    if (normalizedCommand === 'convergence') {
      if (args.length !== 3 || args.some(arg => !arg.trim())) {
        return this.failure(
          normalizedCommand,
          trimmed,
          'CAS_COMMAND_ARITY_ERROR',
          'convergence requiere exactamente tres argumentos.'
        );
      }

      return {
        kind: 'command',
        command: normalizedCommand,
        args: [args[0].trim(), args[1].trim(), args[2].trim()],
      };
    }

    if (normalizedCommand === 'limit') {
      if ((args.length !== 3 && args.length !== 4) || args.some(arg => !arg.trim())) {
        return this.failure(
          normalizedCommand,
          trimmed,
          'CAS_COMMAND_ARITY_ERROR',
          'limit requiere exactamente tres o cuatro argumentos.'
        );
      }

      if (args.length === 4) {
        const direction = args[3].trim();
        if (direction !== 'left' && direction !== 'right') {
          return this.failure(
            normalizedCommand,
            trimmed,
            'INVALID_LIMIT_DIRECTION',
            'La dirección del límite no es válida.'
          );
        }
      }

      return {
        kind: 'command',
        command: normalizedCommand,
        args:
          args.length === 4
            ? [args[0].trim(), args[1].trim(), args[2].trim(), args[3].trim()]
            : [args[0].trim(), args[1].trim(), args[2].trim()],
      };
    }

    if (normalizedCommand === 'taylor') {
      if (
        name === 'maclaurin' &&
        (args.length !== 3 || args.some(arg => !arg.trim()))
      ) {
        return this.failure(
          normalizedCommand,
          trimmed,
          'CAS_COMMAND_ARITY_ERROR',
          'maclaurin requiere exactamente tres argumentos.'
        );
      }

      if (
        name !== 'maclaurin' &&
        (args.length !== 4 || args.some(arg => !arg.trim()))
      ) {
        return this.failure(
          normalizedCommand,
          trimmed,
          'CAS_COMMAND_ARITY_ERROR',
          'taylor requiere exactamente cuatro argumentos.'
        );
      }

      const orderText = name === 'maclaurin' ? args[2].trim() : args[3].trim();
      const orderError = this.validateTaylorOrder(orderText);
      if (orderError) {
        return this.failure(
          normalizedCommand,
          trimmed,
          orderError.code,
          orderError.message
        );
      }

      return {
        kind: 'command',
        command: normalizedCommand,
        seriesKind: name === 'maclaurin' ? 'maclaurin' : 'taylor',
        args:
          name === 'maclaurin'
            ? [args[0].trim(), args[1].trim(), args[2].trim()]
            : [args[0].trim(), args[1].trim(), args[2].trim(), args[3].trim()],
      };
    }

    if (args.length !== 1 || !args[0].trim()) {
      return this.failure(
        normalizedCommand,
        trimmed,
        'CAS_COMMAND_ARITY_ERROR',
        `${normalizedCommand} requiere exactamente un argumento.`
      );
    }

    return {
      kind: 'command',
      command: normalizedCommand,
      args: [args[0].trim()],
    };
  }

  private normalizeCommandName(name: string): CalculatorCasCommandName | null {
    if (name === 'diff') {
      return 'differentiate';
    }

    if (name === 'maclaurin') {
      return 'taylor';
    }

    return SUPPORTED_COMMANDS.has(name) ? (name as CalculatorCasCommandName) : null;
  }

  private parseTaylorOrder(orderText: string): number {
    const trimmed = orderText.trim();
    const value = Number(trimmed);
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      throw new Error('Taylor order should be validated before parsing.');
    }

    return value;
  }

  private validateTaylorOrder(orderText: string): { code: string; message: string } | null {
    const value = Number(orderText.trim());
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      return {
        code: 'INVALID_TAYLOR_ORDER',
        message: 'El orden de Taylor debe ser un entero no negativo.',
      };
    }

    if (value > 12) {
      return {
        code: 'TAYLOR_ORDER_LIMIT',
        message: 'El orden solicitado es demasiado alto.',
      };
    }

    return null;
  }

  private isIdentifier(value: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
  }

  private findMatchingCloseParen(expression: string, openIndex: number): number {
    let depth = 0;

    for (let index = openIndex; index < expression.length; index++) {
      const char = expression[index];
      if (char === '(') {
        depth += 1;
      } else if (char === ')') {
        depth -= 1;
        if (depth === 0) {
          return index;
        }
      }
    }

    return -1;
  }

  private splitTopLevelArguments(source: string): string[] {
    const trimmed = source.trim();
    if (!trimmed) {
      return [];
    }

    const args: string[] = [];
    let current = '';
    let depth = 0;

    for (let index = 0; index < source.length; index++) {
      const char = source[index];

      if (char === '(') {
        depth += 1;
        current += char;
        continue;
      }

      if (char === ')') {
        depth -= 1;
        current += char;
        continue;
      }

      if (char === ',' && depth === 0) {
        args.push(current.trim());
        current = '';
        continue;
      }

      current += char;
    }

    args.push(current.trim());
    return args;
  }

  private failure(
    command: string,
    source: string,
    code: string,
    message: string
  ): { kind: 'failure'; command: string; source: string; error: CalculatorCasCommandError } {
    return {
      kind: 'failure',
      command,
      source,
      error: { code, message },
    };
  }
}
