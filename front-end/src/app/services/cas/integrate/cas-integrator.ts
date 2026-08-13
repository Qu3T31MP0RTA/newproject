import {
  binaryNode,
  functionCallNode,
  numberNode,
  symbolNode,
  unaryNode,
  type CasBinaryNode,
  type CasExpression,
  type CasFunctionCallNode,
  type CasUnaryNode,
} from '../ast/cas-ast';
import { createCasError } from '../errors/cas-errors';
import { DEFAULT_CAS_LIMITS, resolveCasLimits, type CasLimits } from '../limits/cas-limits';
import { casFailure, casSuccess, type CasResult } from '../result/cas-result';
import { simplifyCasExpression, type CasTextResult } from '../simplify/cas-simplifier';
import { buildExactDivision } from '../rational/cas-rational';
import { validateCasVariable } from '../variable/cas-variable';
import { dependsOnCasExpression, differentiateCasExpression, type CasOperationOptions } from '../differentiate/cas-differentiator';
import { formatCasExpression } from '../format/cas-formatter';

const SUPPORTED_INTEGRAL_FUNCTIONS = new Set([
  'sin',
  'cos',
  'exp',
  'expe',
  'sqrt',
  'ln',
  'tan',
]);

export function integrateCasExpression(
  expression: CasExpression,
  variable: string,
  options: CasOperationOptions = {}
): CasResult<CasExpression> {
  const normalizedVariable = validateCasVariable(variable);
  if (!normalizedVariable.ok) {
    return normalizedVariable;
  }

  const limits = resolveCasLimits(options.limits ?? DEFAULT_CAS_LIMITS);
  const simplified = simplifyCasExpression(expression, { limits });
  if (!simplified.ok) {
    return simplified;
  }

  const integrated = integrateNode(simplified.value, normalizedVariable.value, limits);
  if (!integrated.ok) {
    return integrated;
  }

  return simplifyCasExpression(integrated.value, { limits });
}

export function integrateCasText(
  source: string,
  variable: string,
  parser: { parse(source: string): CasResult<CasExpression> },
  options: CasOperationOptions = {}
): CasResult<CasTextResult> {
  const parsed = parser.parse(source);
  if (!parsed.ok) {
    return parsed;
  }

  const integrated = integrateCasExpression(parsed.value, variable, options);
  if (!integrated.ok) {
    return integrated;
  }

  return casSuccess(
    {
      expression: integrated.value,
      text: formatCasExpression(integrated.value),
      latex: formatCasExpression(integrated.value),
    },
    integrated.metadata
  );
}

function integrateNode(
  node: CasExpression,
  variable: string,
  limits: CasLimits
): CasResult<CasExpression> {
  if (!dependsOnCasExpression(node, variable)) {
    return casSuccess(binaryNode('*', cloneCasExpression(node), symbolNode(variable)));
  }

  switch (node.kind) {
    case 'number':
      return casSuccess(binaryNode('*', numberNode(node.value), symbolNode(variable)));
    case 'symbol':
      return integrateSymbol(node, variable);
    case 'unary':
      return integrateUnary(node, variable, limits);
    case 'binary':
      return integrateBinary(node, variable, limits);
    case 'function':
      return integrateFunction(node, variable, limits);
    case 'equation':
      return unsupportedIntegralError();
    default: {
      const _exhaustive: never = node;
      return _exhaustive;
    }
  }
}

function integrateSymbol(
  node: { readonly kind: 'symbol'; readonly name: string },
  variable: string
): CasResult<CasExpression> {
  if (node.name === variable) {
    return casSuccess(
      binaryNode(
        '/',
        binaryNode('^', symbolNode(variable), numberNode(2)),
        numberNode(2)
      )
    );
  }

  return casSuccess(binaryNode('*', symbolNode(node.name), symbolNode(variable)));
}

function integrateUnary(
  node: CasUnaryNode,
  variable: string,
  limits: CasLimits
): CasResult<CasExpression> {
  const integrated = integrateNode(node.operand, variable, limits);
  if (!integrated.ok) {
    return integrated;
  }

  if (node.operator === '+') {
    return integrated;
  }

  return casSuccess(unaryNode('-', integrated.value));
}

function integrateBinary(
  node: CasBinaryNode,
  variable: string,
  limits: CasLimits
): CasResult<CasExpression> {
  const leftDepends = dependsOnCasExpression(node.left, variable);
  const rightDepends = dependsOnCasExpression(node.right, variable);

  switch (node.operator) {
    case '+': {
      const left = integrateNode(node.left, variable, limits);
      if (!left.ok) return left;
      const right = integrateNode(node.right, variable, limits);
      if (!right.ok) return right;
      return casSuccess(binaryNode('+', left.value, right.value));
    }
    case '-': {
      const left = integrateNode(node.left, variable, limits);
      if (!left.ok) return left;
      const right = integrateNode(node.right, variable, limits);
      if (!right.ok) return right;
      return casSuccess(binaryNode('-', left.value, right.value));
    }
    case '*':
      return integrateProduct(node.left, node.right, leftDepends, rightDepends, variable, limits);
    case '/':
      return integrateDivision(node.left, node.right, leftDepends, rightDepends, variable, limits);
    case '^':
      return integratePowerNode(node.left, node.right, variable);
    default: {
      const _exhaustive: never = node.operator;
      return _exhaustive;
    }
  }
}

function integrateProduct(
  left: CasExpression,
  right: CasExpression,
  leftDepends: boolean,
  rightDepends: boolean,
  variable: string,
  limits: CasLimits
): CasResult<CasExpression> {
  if (!leftDepends && !rightDepends) {
    return casSuccess(binaryNode('*', cloneCasExpression(left), symbolNode(variable)));
  }

  const byPartsIntegration = tryIntegrateByPartsProduct(left, right, variable);
  if (byPartsIntegration.ok) {
    return byPartsIntegration;
  }

  if (!leftDepends && isNumericExpression(left)) {
    const rightIntegration = integrateNode(right, variable, limits);
    if (!rightIntegration.ok) {
      return rightIntegration;
    }

    return casSuccess(
      scaleExpressionByInteger(rightIntegration.value, left.value)
    );
  }

  if (!rightDepends && isNumericExpression(right)) {
    const leftIntegration = integrateNode(left, variable, limits);
    if (!leftIntegration.ok) {
      return leftIntegration;
    }

    return casSuccess(
      scaleExpressionByInteger(leftIntegration.value, right.value)
    );
  }

  if (!leftDepends) {
    const rightIntegration = integrateNode(right, variable, limits);
    if (!rightIntegration.ok) {
      return rightIntegration;
    }

    return casSuccess(
      attachIndependentFactor(cloneCasExpression(left), rightIntegration.value)
    );
  }

  if (!rightDepends) {
    const leftIntegration = integrateNode(left, variable, limits);
    if (!leftIntegration.ok) {
      return leftIntegration;
    }

    return casSuccess(
      attachIndependentFactor(cloneCasExpression(right), leftIntegration.value)
    );
  }

  return unsupportedIntegralError();
}

function tryIntegrateByPartsProduct(
  left: CasExpression,
  right: CasExpression,
  variable: string
): CasResult<CasExpression> {
  const factors = collectMultiplicationFactors(binaryNode('*', left, right));
  let numericFactor = 1;
  const independentFactors: CasExpression[] = [];
  let variableFactorCount = 0;
  let matchedFunction: CasFunctionCallNode | null = null;

  for (const factor of factors) {
    if (factor.kind === 'number') {
      numericFactor *= factor.value;
      continue;
    }

    if (!dependsOnCasExpression(factor, variable)) {
      independentFactors.push(cloneCasExpression(factor));
      continue;
    }

    if (isVariableSymbol(factor, variable)) {
      variableFactorCount += 1;
      continue;
    }

    if (isSupportedByPartsFunction(factor, variable)) {
      matchedFunction = factor;
      continue;
    }

    return unsupportedIntegralError();
  }

  if (variableFactorCount !== 1 || !matchedFunction) {
    return unsupportedIntegralError();
  }

  const coreIntegration = integrateByPartsFunction(matchedFunction.name, variable);
  if (!coreIntegration.ok) {
    return coreIntegration;
  }

  let integrated = coreIntegration.value;
  if (numericFactor !== 1) {
    integrated = scaleExpressionByInteger(integrated, numericFactor);
  }

  for (const factor of independentFactors) {
    integrated = attachIndependentFactor(factor, integrated);
  }

  return casSuccess(integrated);
}

function integrateDivision(
  numerator: CasExpression,
  denominator: CasExpression,
  numeratorDepends: boolean,
  denominatorDepends: boolean,
  variable: string,
  limits: CasLimits
): CasResult<CasExpression> {
  if (!numeratorDepends && !denominatorDepends) {
    return casSuccess(binaryNode('*', cloneCasExpression(numerator), symbolNode(variable)));
  }

  if (numeratorDepends && !denominatorDepends) {
    const numeratorIntegration = integrateNode(numerator, variable, limits);
    if (!numeratorIntegration.ok) {
      return numeratorIntegration;
    }

    return casSuccess(
      divideExpressionByConstant(
        numeratorIntegration.value,
        denominator
      )
    );
  }

  if (!numeratorDepends) {
    const reciprocal = integrateReciprocalLike(denominator, variable, limits);
    if (!reciprocal.ok) {
      return reciprocal;
    }

    if (isNumericExpression(numerator)) {
      return casSuccess(scaleExpressionByInteger(reciprocal.value, numerator.value));
    }

    return casSuccess(binaryNode('*', cloneCasExpression(numerator), reciprocal.value));
  }

  return unsupportedIntegralError();
}

function integrateReciprocalLike(
  denominator: CasExpression,
  variable: string,
  limits: CasLimits
): CasResult<CasExpression> {
  if (denominator.kind === 'symbol' && denominator.name === variable) {
    return casSuccess(
      functionCallNode('ln', [functionCallNode('abs', [symbolNode(variable)])])
    );
  }

  if (
    denominator.kind === 'binary' &&
    denominator.operator === '^' &&
    denominator.left.kind === 'symbol' &&
    denominator.left.name === variable &&
    denominator.right.kind === 'number' &&
    Number.isInteger(denominator.right.value) &&
    denominator.right.value > 1
  ) {
    return casSuccess(
      integrateVariablePower(
        -denominator.right.value,
        variable,
        1
      )
    );
  }

  const derivative = differentiateCasExpression(denominator, variable, { limits });
  if (!derivative.ok) {
    return derivative.error.code === 'CAS_UNSUPPORTED_DERIVATIVE'
      ? unsupportedIntegralError(derivative.error.functionName)
      : derivative;
  }

  const derivativeValue = readConstantNumericValue(derivative.value);
  if (derivativeValue === null || derivativeValue === 0) {
    return unsupportedIntegralError();
  }

  const absDenominator = functionCallNode('abs', [cloneCasExpression(denominator)]);
  const logTerm = functionCallNode('ln', [absDenominator]);
  return casSuccess(divideExpressionBySignedInteger(logTerm, derivativeValue));
}

function integratePowerNode(
  base: CasExpression,
  exponent: CasExpression,
  variable: string
): CasResult<CasExpression> {
  if (
    base.kind === 'symbol' &&
    base.name === variable &&
    exponent.kind === 'number' &&
    Number.isInteger(exponent.value)
  ) {
    return casSuccess(integrateVariablePower(exponent.value, variable, 1));
  }

  return unsupportedIntegralError();
}

function integrateFunction(
  node: CasFunctionCallNode,
  variable: string,
  limits: CasLimits
): CasResult<CasExpression> {
  if (!SUPPORTED_INTEGRAL_FUNCTIONS.has(node.name)) {
    return unsupportedIntegralError(node.name);
  }

  if (node.arguments.length !== 1) {
    return unsupportedIntegralError(node.name);
  }

  const argument = node.arguments[0];

  if (node.name === 'sqrt') {
    if (!isVariableSymbol(argument, variable)) {
      return unsupportedIntegralError(node.name);
    }

    return casSuccess(
      buildExactDivision(
        binaryNode(
          '*',
          numberNode(2),
          binaryNode(
            '*',
            symbolNode(variable),
            functionCallNode('sqrt', [symbolNode(variable)])
          )
        ),
        3
      )
    );
  }

  if (node.name === 'ln') {
    if (!isVariableSymbol(argument, variable)) {
      return unsupportedIntegralError(node.name);
    }

    return casSuccess(
      binaryNode(
        '-',
        binaryNode('*', symbolNode(variable), functionCallNode('ln', [symbolNode(variable)])),
        symbolNode(variable)
      )
    );
  }

  if (node.name === 'tan') {
    if (!isVariableSymbol(argument, variable)) {
      return unsupportedIntegralError(node.name);
    }

    return casSuccess(
      unaryNode(
        '-',
        functionCallNode('ln', [
          functionCallNode('abs', [
            functionCallNode('cos', [symbolNode(variable)]),
          ]),
        ])
      )
    );
  }

  const derivative = differentiateCasExpression(argument, variable, { limits });
  if (!derivative.ok) {
    return derivative.error.code === 'CAS_UNSUPPORTED_DERIVATIVE'
      ? unsupportedIntegralError(derivative.error.functionName ?? node.name)
      : derivative;
  }

  const derivativeValue = readConstantNumericValue(derivative.value);
  if (derivativeValue === null || derivativeValue === 0) {
    return unsupportedIntegralError(node.name);
  }

  switch (node.name) {
    case 'sin':
      return casSuccess(
        derivativeValue > 0
          ? binaryNode(
              '/',
              unaryNode('-', functionCallNode('cos', [cloneCasExpression(argument)])),
              numberNode(derivativeValue)
            )
          : binaryNode(
              '/',
              functionCallNode('cos', [cloneCasExpression(argument)]),
              numberNode(Math.abs(derivativeValue))
            )
      );
    case 'cos':
      return casSuccess(
        derivativeValue > 0
          ? binaryNode(
              '/',
              functionCallNode('sin', [cloneCasExpression(argument)]),
              numberNode(derivativeValue)
            )
          : binaryNode(
              '/',
              unaryNode('-', functionCallNode('sin', [cloneCasExpression(argument)])),
              numberNode(Math.abs(derivativeValue))
            )
      );
    case 'exp':
    case 'expe':
      return casSuccess(
        derivativeValue > 0
          ? binaryNode(
              '/',
              functionCallNode(node.name, [cloneCasExpression(argument)]),
              numberNode(derivativeValue)
            )
          : binaryNode(
              '/',
              unaryNode('-', functionCallNode(node.name, [cloneCasExpression(argument)])),
              numberNode(Math.abs(derivativeValue))
            )
      );
    default:
      return unsupportedIntegralError(node.name);
  }
}

function integrateByPartsFunction(
  functionName: string,
  variable: string
): CasResult<CasExpression> {
  const variableSymbol = symbolNode(variable);
  const functionArgument = symbolNode(variable);
  const functionExpression = functionCallNode(functionName, [functionArgument]);

  switch (functionName) {
    case 'exp':
    case 'expe':
      return casSuccess(
        binaryNode(
          '-',
          binaryNode('*', variableSymbol, functionExpression),
          functionCallNode(functionName, [symbolNode(variable)])
        )
      );
    case 'sin':
      return casSuccess(
        binaryNode(
          '+',
          unaryNode(
            '-',
            binaryNode(
              '*',
              variableSymbol,
              functionCallNode('cos', [symbolNode(variable)])
            )
          ),
          functionCallNode('sin', [symbolNode(variable)])
        )
      );
    case 'cos':
      return casSuccess(
        binaryNode(
          '+',
          binaryNode(
            '*',
            variableSymbol,
            functionCallNode('sin', [symbolNode(variable)])
          ),
          functionCallNode('cos', [symbolNode(variable)])
        )
      );
    default:
      return unsupportedIntegralError(functionName);
  }
}

function integrateVariablePower(
  exponent: number,
  variable: string,
  coefficient: number
): CasExpression {
  if (coefficient === 0) {
    return numberNode(0);
  }

  if (exponent === -1) {
    const absVariable = functionCallNode('abs', [symbolNode(variable)]);
    const logarithm = functionCallNode('ln', [absVariable]);
    if (coefficient === 1) {
      return logarithm;
    }

    if (coefficient === -1) {
      return unaryNode('-', logarithm);
    }

    return binaryNode('*', numberNode(coefficient), logarithm);
  }

  const nextExponent = exponent + 1;
  if (nextExponent === 0) {
    return numberNode(coefficient);
  }

  const power =
    nextExponent === 1
      ? symbolNode(variable)
      : binaryNode('^', symbolNode(variable), numberNode(nextExponent));

  if (exponent < -1) {
    const denominatorPower = Math.abs(nextExponent);
    const denominator =
      denominatorPower === 1
        ? symbolNode(variable)
        : binaryNode(
            '*',
            numberNode(denominatorPower),
            binaryNode('^', symbolNode(variable), numberNode(denominatorPower))
          );

    return binaryNode('/', numberNode(-coefficient), denominator);
  }

  if (coefficient === 1) {
    return buildExactDivision(power, nextExponent);
  }

  if (coefficient === -1) {
    return unaryNode('-', buildExactDivision(power, nextExponent));
  }

  return buildExactDivision(
    binaryNode('*', numberNode(coefficient), power),
    nextExponent
  );
}

function divideExpressionByConstant(
  expression: CasExpression,
  divisor: CasExpression
): CasExpression {
  if (divisor.kind === 'number') {
    if (divisor.value === 1) {
      return expression;
    }

    if (divisor.value === -1) {
      return unaryNode('-', expression);
    }

    if (expression.kind === 'number') {
      return buildExactDivision(numberNode(expression.value), divisor.value);
    }

    if (expression.kind === 'binary' && expression.operator === '/' && expression.right.kind === 'number') {
      return buildExactDivision(
        cloneCasExpression(expression.left),
        expression.right.value * divisor.value
      );
    }
  }

  return binaryNode('/', expression, cloneCasExpression(divisor));
}

function divideExpressionBySignedInteger(
  expression: CasExpression,
  denominator: number
): CasExpression {
  return buildExactDivision(expression, denominator);
}

function attachIndependentFactor(
  factor: CasExpression,
  integrated: CasExpression
): CasExpression {
  if (integrated.kind === 'binary' && integrated.operator === '/' && integrated.right.kind === 'number') {
    return buildExactDivision(
      binaryNode('*', factor, cloneCasExpression(integrated.left)),
      integrated.right.value
    );
  }

  if (integrated.kind === 'unary' && integrated.operator === '-') {
    return unaryNode('-', attachIndependentFactor(factor, integrated.operand));
  }

  return binaryNode('*', factor, integrated);
}

function readConstantNumericValue(expression: CasExpression): number | null {
  switch (expression.kind) {
    case 'number':
      return expression.value;
    case 'unary': {
      const operand = readConstantNumericValue(expression.operand);
      if (operand === null) {
        return null;
      }

      return expression.operator === '-' ? -operand : operand;
    }
    case 'binary': {
      const left = readConstantNumericValue(expression.left);
      const right = readConstantNumericValue(expression.right);
      if (left === null || right === null) {
        return null;
      }

      switch (expression.operator) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          return right === 0 ? null : left / right;
        case '^':
          return Math.pow(left, right);
        default:
          return null;
      }
    }
    default:
      return null;
  }
}

function collectMultiplicationFactors(expression: CasExpression): CasExpression[] {
  if (expression.kind === 'unary' && expression.operator === '-') {
    return [numberNode(-1), ...collectMultiplicationFactors(expression.operand)];
  }

  if (expression.kind === 'binary' && expression.operator === '*') {
    return [
      ...collectMultiplicationFactors(expression.left),
      ...collectMultiplicationFactors(expression.right),
    ];
  }

  return [expression];
}

function isVariableSymbol(
  expression: CasExpression,
  variable: string
): expression is { readonly kind: 'symbol'; readonly name: string } {
  return expression.kind === 'symbol' && expression.name === variable;
}

function isSupportedByPartsFunction(
  expression: CasExpression,
  variable: string
): expression is CasFunctionCallNode {
  return (
    expression.kind === 'function' &&
    expression.arguments.length === 1 &&
    isVariableSymbol(expression.arguments[0], variable) &&
    (expression.name === 'exp' ||
      expression.name === 'expe' ||
      expression.name === 'sin' ||
      expression.name === 'cos')
  );
}

function scaleExpressionByInteger(
  expression: CasExpression,
  factor: number
): CasExpression {
  if (factor === 0) {
    return numberNode(0);
  }

  if (factor === 1) {
    return cloneCasExpression(expression);
  }

  if (factor === -1) {
    return unaryNode('-', cloneCasExpression(expression));
  }

  switch (expression.kind) {
    case 'number':
      return numberNode(expression.value * factor);
    case 'symbol':
      return binaryNode('*', numberNode(factor), symbolNode(expression.name));
    case 'unary':
      return expression.operator === '+'
        ? scaleExpressionByInteger(expression.operand, factor)
        : unaryNode('-', scaleExpressionByInteger(expression.operand, factor));
    case 'binary':
      switch (expression.operator) {
        case '+':
          return binaryNode(
            '+',
            scaleExpressionByInteger(expression.left, factor),
            scaleExpressionByInteger(expression.right, factor)
          );
        case '-':
          return binaryNode(
            '-',
            scaleExpressionByInteger(expression.left, factor),
            scaleExpressionByInteger(expression.right, factor)
          );
        case '*':
          if (expression.left.kind === 'number') {
            return binaryNode('*', numberNode(expression.left.value * factor), cloneCasExpression(expression.right));
          }

          if (expression.right.kind === 'number') {
            return binaryNode('*', numberNode(expression.right.value * factor), cloneCasExpression(expression.left));
          }

          return binaryNode('*', numberNode(factor), cloneCasExpression(expression));
        case '/':
          if (expression.right.kind === 'number') {
            return binaryNode(
              '/',
              scaleExpressionByInteger(expression.left, factor),
              numberNode(expression.right.value)
            );
          }

          return binaryNode('*', numberNode(factor), cloneCasExpression(expression));
        case '^':
          return binaryNode('*', numberNode(factor), cloneCasExpression(expression));
      }
      break;
    case 'function':
      return binaryNode('*', numberNode(factor), cloneCasExpression(expression));
    case 'equation':
      return binaryNode('*', numberNode(factor), cloneCasExpression(expression));
    default: {
      const _exhaustive: never = expression;
      return _exhaustive;
    }
  }
}

function isNumericExpression(expression: CasExpression): expression is { readonly kind: 'number'; readonly value: number } {
  return expression.kind === 'number';
}

function cloneCasExpression(expression: CasExpression): CasExpression {
  switch (expression.kind) {
    case 'number':
      return numberNode(expression.value);
    case 'symbol':
      return symbolNode(expression.name);
    case 'unary':
      return unaryNode(expression.operator, cloneCasExpression(expression.operand));
    case 'binary':
      return binaryNode(
        expression.operator,
        cloneCasExpression(expression.left),
        cloneCasExpression(expression.right)
      );
    case 'function':
      return functionCallNode(
        expression.name,
        expression.arguments.map(argument => cloneCasExpression(argument))
      );
    case 'equation':
      return {
        kind: 'equation',
        left: cloneCasExpression(expression.left),
        right: cloneCasExpression(expression.right),
      };
    default: {
      const _exhaustive: never = expression;
      return _exhaustive;
    }
  }
}

function unsupportedIntegralError(functionName?: string): CasResult<CasExpression> {
  return casFailure(
    createCasError(
      'CAS_UNSUPPORTED_INTEGRAL',
      functionName
        ? `La función ${functionName} no está soportada simbólicamente en integrales.`
        : 'Esta integral todavía no está soportada.',
      undefined,
      functionName
    )
  );
}
