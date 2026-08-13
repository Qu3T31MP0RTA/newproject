export * from './ast/cas-ast';
export * from './errors/cas-errors';
export * from './limits/cas-limits';
export * from './parser/cas-parser';
export * from './result/cas-result';
export * from './polynomial/cas-polynomial';
export * from './operations/cas-operations';
export * from './differentiate/cas-differentiator';
export * from './integrate/cas-integrator';
export * from './solve/cas-solver';
export * from './simplify/cas-simplifier';
export * from './format/cas-formatter';

import { formatCasExpression } from './format/cas-formatter';
import { CasParser } from './parser/cas-parser';
import { simplifyCasExpression, simplifyCasText } from './simplify/cas-simplifier';
import {
  expandCasExpression,
  expandCasText,
  factorCasExpression,
  factorCasText,
} from './operations/cas-operations';
import {
  differentiateCasExpression,
  differentiateCasText,
  type CasOperationOptions,
} from './differentiate/cas-differentiator';
import {
  integrateCasExpression,
  integrateCasText,
} from './integrate/cas-integrator';
import {
  solveCasExpression,
  solveCasText,
  type CasSolveResult,
} from './solve/cas-solver';
import type { CasExpression } from './ast/cas-ast';
import type { CasResult } from './result/cas-result';
import type { CasTextResult } from './simplify/cas-simplifier';

export interface CasEngine {
  parse(source: string): CasResult<CasExpression>;
  simplify(expression: CasExpression): CasResult<CasExpression>;
  expand(expression: CasExpression): CasResult<CasExpression>;
  factor(expression: CasExpression): CasResult<CasExpression>;
  differentiate(
    expression: CasExpression,
    variable: string,
    options?: CasOperationOptions
  ): CasResult<CasExpression>;
  integrate(
    expression: CasExpression,
    variable: string,
    options?: CasOperationOptions
  ): CasResult<CasExpression>;
  simplifyText(source: string): CasResult<CasTextResult>;
  expandText(source: string): CasResult<CasTextResult>;
  factorText(source: string): CasResult<CasTextResult>;
  differentiateText(
    source: string,
    variable: string,
    options?: CasOperationOptions
  ): CasResult<CasTextResult>;
  integrateText(
    source: string,
    variable: string,
    options?: CasOperationOptions
  ): CasResult<CasTextResult>;
  solve(expression: CasExpression, variable: string, options?: CasOperationOptions): CasSolveResult;
  solveText(source: string, variable: string, options?: CasOperationOptions): CasSolveResult;
  format(expression: CasExpression): string;
}

export class DefaultCasEngine implements CasEngine {
  private readonly parser = new CasParser();

  parse(source: string): CasResult<CasExpression> {
    return this.parser.parse(source);
  }

  simplify(expression: CasExpression): CasResult<CasExpression> {
    return simplifyCasExpression(expression);
  }

  expand(expression: CasExpression): CasResult<CasExpression> {
    return expandCasExpression(expression);
  }

  factor(expression: CasExpression): CasResult<CasExpression> {
    return factorCasExpression(expression);
  }

  differentiate(
    expression: CasExpression,
    variable: string,
    options?: CasOperationOptions
  ): CasResult<CasExpression> {
    return differentiateCasExpression(expression, variable, options);
  }

  integrate(
    expression: CasExpression,
    variable: string,
    options?: CasOperationOptions
  ): CasResult<CasExpression> {
    return integrateCasExpression(expression, variable, options);
  }

  solve(
    expression: CasExpression,
    variable: string,
    options?: CasOperationOptions
  ): CasSolveResult {
    return solveCasExpression(expression, variable, options);
  }

  simplifyText(source: string): CasResult<CasTextResult> {
    return simplifyCasText(source, this.parser);
  }

  expandText(source: string): CasResult<CasTextResult> {
    return expandCasText(source, this.parser);
  }

  factorText(source: string): CasResult<CasTextResult> {
    return factorCasText(source, this.parser);
  }

  differentiateText(
    source: string,
    variable: string,
    options?: CasOperationOptions
  ): CasResult<CasTextResult> {
    return differentiateCasText(source, variable, this.parser, options);
  }

  integrateText(
    source: string,
    variable: string,
    options?: CasOperationOptions
  ): CasResult<CasTextResult> {
    return integrateCasText(source, variable, this.parser, options);
  }

  solveText(
    source: string,
    variable: string,
    options?: CasOperationOptions
  ): CasSolveResult {
    return solveCasText(source, variable, this.parser, options);
  }

  format(expression: CasExpression): string {
    return formatCasExpression(expression);
  }
}

export function createCasEngine(): CasEngine {
  return new DefaultCasEngine();
}
