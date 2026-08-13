import {
  binaryNode,
  equationNode,
  functionCallNode,
  measureCasExpression,
  numberNode,
  type CasBinaryNode,
  type CasExpression,
  type CasFunctionCallNode,
  type CasUnaryNode,
} from '../ast/cas-ast';
import { createCasError } from '../errors/cas-errors';
import { DEFAULT_CAS_LIMITS, resolveCasLimits, type CasLimits } from '../limits/cas-limits';
import { casFailure, casSuccess, type CasResult } from '../result/cas-result';
import { formatCasExpression } from '../format/cas-formatter';
import { simplifyCasExpression, type CasTextResult } from '../simplify/cas-simplifier';
import { normalizeCasVariableName, validateCasVariable } from '../variable/cas-variable';

export interface CasOperationOptions {
  readonly limits?: Partial<CasLimits>;
}

const SUPPORTED_UNARY_FUNCTIONS = new Set([
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'sech',
  'csch',
  'coth',
  'ln',
  'log',
  'abs',
  'exp',
  'expe',
  'sqrt',
  'cbrt',
  'sign',
]);

export function differentiateCasExpression(
  expression: CasExpression,
  variable: string,
  options: CasOperationOptions = {}
): CasResult<CasExpression> {
  const normalizedVariable = validateCasVariable(variable);
  if (!normalizedVariable.ok) {
    return normalizedVariable;
  }

  const limits = resolveCasLimits(options.limits ?? DEFAULT_CAS_LIMITS);
  const initialComplexity = measureCasExpression(expression);
  if (!withinLimits(initialComplexity.depth, initialComplexity.nodeCount, limits)) {
    return casFailure(
      createCasError(
        'TOO_COMPLEX',
        'La expresiÃ³n CAS supera el lÃ­mite de complejidad.'
      )
    );
  }

  if (
    findUnsupportedDerivativeFunctionName(expression) === null &&
    !dependsOnCasExpression(expression, normalizedVariable.value)
  ) {
    return casSuccess(numberNode(0), {
      depth: 1,
      nodeCount: 1,
      iterations: 1,
    });
  }

  const differentiated = differentiateNode(
    expression,
    normalizedVariable.value,
    limits
  );
  if (!differentiated.ok) {
    return differentiated;
  }

  const differentiatedComplexity = measureCasExpression(differentiated.value);
  if (
    !withinLimits(
      differentiatedComplexity.depth,
      differentiatedComplexity.nodeCount,
      limits
    )
  ) {
    return casFailure(
      createCasError(
        'TOO_COMPLEX',
        'La derivada CAS supera el lÃ­mite de complejidad.'
      )
    );
  }

  return simplifyCasExpression(differentiated.value, { limits });
}

export function differentiateCasText(
  source: string,
  variable: string,
  parser: { parse(source: string): CasResult<CasExpression> },
  options: CasOperationOptions = {}
): CasResult<CasTextResult> {
  const parsed = parser.parse(source);
  if (!parsed.ok) {
    return parsed;
  }

  const differentiated = differentiateCasExpression(parsed.value, variable, options);
  if (!differentiated.ok) {
    return differentiated;
  }

  return casSuccess(
    {
      expression: differentiated.value,
      text: formatCasExpression(differentiated.value),
      latex: formatCasExpression(differentiated.value),
    },
    differentiated.metadata
  );
}

export function dependsOnCasExpression(
  expression: CasExpression,
  variable: string
): boolean {
  const normalizedVariable = normalizeVariableName(variable);
  if (!normalizedVariable) {
    return false;
  }

  return dependsOnNode(expression, normalizedVariable);
}

function differentiateNode(
  node: CasExpression,
  variable: string,
  limits: CasLimits
): CasResult<CasExpression> {
  switch (node.kind) {
    case 'number':
      return casSuccess(numberNode(0));
    case 'symbol':
      return casSuccess(numberNode(node.name === variable ? 1 : 0));
    case 'unary':
      return differentiateUnary(node, variable, limits);
    case 'binary':
      return differentiateBinary(node, variable, limits);
    case 'function':
      return differentiateFunction(node, variable, limits);
    case 'equation':
      return differentiateEquation(node, variable, limits);
    default: {
      const _exhaustive: never = node;
      return _exhaustive;
    }
  }
}

function differentiateUnary(
  node: CasUnaryNode,
  variable: string,
  limits: CasLimits
): CasResult<CasExpression> {
  const derivative = differentiateNode(node.operand, variable, limits);
  if (!derivative.ok) {
    return derivative;
  }

  if (node.operator === '+') {
    return derivative;
  }

  return casSuccess(multiplyChain([numberNode(-1), derivative.value]));
}

function differentiateBinary(
  node: CasBinaryNode,
  variable: string,
  limits: CasLimits
): CasResult<CasExpression> {
  const leftDerivative = differentiateNode(node.left, variable, limits);
  if (!leftDerivative.ok) {
    return leftDerivative;
  }

  const rightDerivative = differentiateNode(node.right, variable, limits);
  if (!rightDerivative.ok) {
    return rightDerivative;
  }

  switch (node.operator) {
    case '+':
      return casSuccess(
        binaryNode('+', leftDerivative.value, rightDerivative.value)
      );
    case '-':
      return casSuccess(
        binaryNode('-', leftDerivative.value, rightDerivative.value)
      );
    case '*':
      return casSuccess(
        binaryNode(
          '+',
          multiplyChain([leftDerivative.value, cloneCasExpression(node.right)]),
          multiplyChain([cloneCasExpression(node.left), rightDerivative.value])
        )
      );
    case '/': {
      const numerator = binaryNode(
        '-',
        multiplyChain([leftDerivative.value, cloneCasExpression(node.right)]),
        multiplyChain([cloneCasExpression(node.left), rightDerivative.value])
      );
      const denominator = binaryNode(
        '^',
        cloneCasExpression(node.right),
        numberNode(2)
      );
      return casSuccess(binaryNode('/', numerator, denominator));
    }
    case '^':
      return differentiatePower(
        node.left,
        node.right,
        variable,
        limits
      );
    default: {
      const _exhaustive: never = node.operator;
      return _exhaustive;
    }
  }
}

function differentiatePower(
  base: CasExpression,
  exponent: CasExpression,
  variable: string,
  limits: CasLimits
): CasResult<CasExpression> {
  const unsupportedFunctionName =
    findUnsupportedDerivativeFunctionName(base) ??
    findUnsupportedDerivativeFunctionName(exponent);
  if (unsupportedFunctionName) {
    return unsupportedDerivativeError(unsupportedFunctionName);
  }

  const baseDepends = dependsOnNode(base, variable);
  const exponentDepends = dependsOnNode(exponent, variable);

  if (!baseDepends && !exponentDepends) {
    return casSuccess(numberNode(0));
  }

  if (!exponentDepends) {
    const baseDerivative = differentiateNode(base, variable, limits);
    if (!baseDerivative.ok) {
      return baseDerivative;
    }

    return differentiateConstantExponentPower(
      base,
      exponent,
      baseDerivative.value
    );
  }

  if (!baseDepends) {
    return differentiateConstantBasePower(
      base,
      exponent,
      variable,
      limits
    );
  }

  return casFailure(
    createCasError(
      'CAS_UNSUPPORTED_DERIVATIVE',
      'La regla general de potencias no estÃ¡ soportada simbÃ³licamente.'
    )
  );
}

function differentiateConstantExponentPower(
  base: CasExpression,
  exponent: CasExpression,
  baseDerivative: CasExpression
): CasResult<CasExpression> {
  return casSuccess(
    multiplyChain([
      cloneCasExpression(exponent),
      binaryNode(
        '^',
        cloneCasExpression(base),
        binaryNode('-', cloneCasExpression(exponent), numberNode(1))
      ),
      baseDerivative,
    ])
  );
}

function differentiateConstantBasePower(
  base: CasExpression,
  exponent: CasExpression,
  variable: string,
  limits: CasLimits
): CasResult<CasExpression> {
  if (base.kind === 'number') {
    if (base.value === 1) {
      return casSuccess(numberNode(0));
    }

    if (base.value <= 0) {
      return unsupportedDerivativeError(undefined);
    }
  }

  const exponentDerivative = differentiateNode(exponent, variable, limits);
  if (!exponentDerivative.ok) {
    return exponentDerivative;
  }

  return casSuccess(
    multiplyChain([
      binaryNode('^', cloneCasExpression(base), cloneCasExpression(exponent)),
      functionCallNode('ln', [cloneCasExpression(base)]),
      exponentDerivative.value,
    ])
  );
}

function differentiateFunction(
  node: CasFunctionCallNode,
  variable: string,
  limits: CasLimits
): CasResult<CasExpression> {
  if (node.name === 'pow') {
    return differentiatePowerFunction(node, variable, limits);
  }

  if (!SUPPORTED_UNARY_FUNCTIONS.has(node.name)) {
    return unsupportedDerivativeError(node.name);
  }

  if (node.arguments.length === 0) {
    return casSuccess(numberNode(0));
  }

  if (node.arguments.length !== 1) {
    return unsupportedDerivativeError(node.name);
  }

  const argument = node.arguments[0];
  const argumentDerivative = differentiateNode(argument, variable, limits);
  if (!argumentDerivative.ok) {
    return argumentDerivative;
  }

  switch (node.name) {
    case 'sin':
      return casSuccess(
        multiplyChain([
          argumentDerivative.value,
          functionCallNode('cos', [cloneCasExpression(argument)]),
        ])
      );
    case 'cos':
      return casSuccess(
        multiplyChain([
          numberNode(-1),
          argumentDerivative.value,
          functionCallNode('sin', [cloneCasExpression(argument)]),
        ])
      );
    case 'tan':
      return casSuccess(
        binaryNode(
          '/',
          argumentDerivative.value,
          binaryNode(
            '^',
            functionCallNode('cos', [cloneCasExpression(argument)]),
            numberNode(2)
          )
        )
      );
    case 'asin':
      return casSuccess(
        binaryNode(
          '/',
          argumentDerivative.value,
          functionCallNode('sqrt', [
            binaryNode(
              '-',
              numberNode(1),
              binaryNode(
                '^',
                cloneCasExpression(argument),
                numberNode(2)
              )
            ),
          ])
        )
      );
    case 'acos':
      return casSuccess(
        multiplyChain([
          numberNode(-1),
          binaryNode(
            '/',
            argumentDerivative.value,
            functionCallNode('sqrt', [
              binaryNode(
                '-',
                numberNode(1),
                binaryNode(
                  '^',
                  cloneCasExpression(argument),
                  numberNode(2)
                )
              ),
            ])
          ),
        ])
      );
    case 'atan':
      return casSuccess(
        binaryNode(
          '/',
          argumentDerivative.value,
          binaryNode(
            '+',
            numberNode(1),
            binaryNode(
              '^',
              cloneCasExpression(argument),
              numberNode(2)
            )
          )
        )
      );
    case 'sinh':
      return casSuccess(
        multiplyChain([
          argumentDerivative.value,
          functionCallNode('cosh', [cloneCasExpression(argument)]),
        ])
      );
    case 'cosh':
      return casSuccess(
        multiplyChain([
          argumentDerivative.value,
          functionCallNode('sinh', [cloneCasExpression(argument)]),
        ])
      );
    case 'tanh':
      return casSuccess(
        binaryNode(
          '/',
          argumentDerivative.value,
          binaryNode(
            '^',
            functionCallNode('cosh', [cloneCasExpression(argument)]),
            numberNode(2)
          )
        )
      );
    case 'asinh':
      return casSuccess(
        binaryNode(
          '/',
          argumentDerivative.value,
          functionCallNode('sqrt', [
            binaryNode(
              '+',
              binaryNode(
                '^',
                cloneCasExpression(argument),
                numberNode(2)
              ),
              numberNode(1)
            ),
          ])
        )
      );
    case 'acosh':
      return casSuccess(
        binaryNode(
          '/',
          argumentDerivative.value,
          binaryNode(
            '*',
            functionCallNode('sqrt', [
              binaryNode('-', cloneCasExpression(argument), numberNode(1)),
            ]),
            functionCallNode('sqrt', [
              binaryNode('+', cloneCasExpression(argument), numberNode(1)),
            ])
          )
        )
      );
    case 'atanh':
      return casSuccess(
        binaryNode(
          '/',
          argumentDerivative.value,
          binaryNode(
            '-',
            numberNode(1),
            binaryNode(
              '^',
              cloneCasExpression(argument),
              numberNode(2)
            )
          )
        )
      );
    case 'sech':
      return casSuccess(
        multiplyChain([
          numberNode(-1),
          functionCallNode('sech', [cloneCasExpression(argument)]),
          functionCallNode('tanh', [cloneCasExpression(argument)]),
          argumentDerivative.value,
        ])
      );
    case 'csch':
      return casSuccess(
        multiplyChain([
          numberNode(-1),
          functionCallNode('csch', [cloneCasExpression(argument)]),
          functionCallNode('coth', [cloneCasExpression(argument)]),
          argumentDerivative.value,
        ])
      );
    case 'coth':
      return casSuccess(
        multiplyChain([
          numberNode(-1),
          argumentDerivative.value,
          binaryNode(
            '/',
            numberNode(1),
            binaryNode(
              '^',
              functionCallNode('sinh', [cloneCasExpression(argument)]),
              numberNode(2)
            )
          )
        ])
      );
    case 'ln':
    case 'log':
      return casSuccess(binaryNode('/', argumentDerivative.value, cloneCasExpression(argument)));
    case 'abs':
      return casSuccess(
        multiplyChain([
          functionCallNode('sign', [cloneCasExpression(argument)]),
          argumentDerivative.value,
        ])
      );
    case 'exp':
    case 'expe':
      return casSuccess(
        multiplyChain([
          argumentDerivative.value,
          functionCallNode(node.name, [cloneCasExpression(argument)]),
        ])
      );
    case 'sqrt':
      return casSuccess(
        binaryNode(
          '/',
          argumentDerivative.value,
          multiplyChain([
            numberNode(2),
            functionCallNode('sqrt', [cloneCasExpression(argument)]),
          ])
        )
      );
    case 'cbrt':
      return casSuccess(
        binaryNode(
          '/',
          argumentDerivative.value,
          multiplyChain([
            numberNode(3),
            binaryNode(
              '^',
              functionCallNode('cbrt', [cloneCasExpression(argument)]),
              numberNode(2)
            ),
          ])
        )
      );
    default:
      return unsupportedDerivativeError(node.name);
  }
}

function differentiatePowerFunction(
  node: CasFunctionCallNode,
  variable: string,
  limits: CasLimits
): CasResult<CasExpression> {
  if (node.arguments.length !== 2) {
    return unsupportedDerivativeError('pow');
  }

  return differentiatePower(
    node.arguments[0],
    node.arguments[1],
    variable,
    limits
  );
}

function differentiateEquation(
  node: CasExpression & { readonly kind: 'equation' },
  variable: string,
  limits: CasLimits
): CasResult<CasExpression> {
  const left = differentiateNode(node.left, variable, limits);
  if (!left.ok) return left;

  const right = differentiateNode(node.right, variable, limits);
  if (!right.ok) return right;

  return casSuccess(equationNode(left.value, right.value));
}

function multiplyChain(items: readonly CasExpression[]): CasExpression {
  if (items.length === 0) {
    return numberNode(1);
  }

  if (items.length === 1) {
    return items[0];
  }

  return items.slice(1).reduce(
    (left, right) => binaryNode('*', left, right),
    items[0]
  );
}

function cloneCasExpression(expression: CasExpression): CasExpression {
  switch (expression.kind) {
    case 'number':
      return numberNode(expression.value);
    case 'symbol':
      return { kind: 'symbol', name: expression.name };
    case 'unary':
      return {
        kind: 'unary',
        operator: expression.operator,
        operand: cloneCasExpression(expression.operand),
      };
    case 'binary':
      return {
        kind: 'binary',
        operator: expression.operator,
        left: cloneCasExpression(expression.left),
        right: cloneCasExpression(expression.right),
      };
    case 'function':
      return functionCallNode(
        expression.name,
        expression.arguments.map(argument => cloneCasExpression(argument))
      );
    case 'equation':
      return equationNode(
        cloneCasExpression(expression.left),
        cloneCasExpression(expression.right)
      );
    default: {
      const _exhaustive: never = expression;
      return _exhaustive;
    }
  }
}

function normalizeVariableName(variable: string): string | null {
  return normalizeCasVariableName(variable);
}

function dependsOnNode(expression: CasExpression, variable: string): boolean {
  switch (expression.kind) {
    case 'number':
      return false;
    case 'symbol':
      return expression.name === variable;
    case 'unary':
      return dependsOnNode(expression.operand, variable);
    case 'binary':
      return (
        dependsOnNode(expression.left, variable) ||
        dependsOnNode(expression.right, variable)
      );
    case 'function':
      return expression.arguments.some(argument =>
        dependsOnNode(argument, variable)
      );
    case 'equation':
      return (
        dependsOnNode(expression.left, variable) ||
        dependsOnNode(expression.right, variable)
      );
    default: {
      const _exhaustive: never = expression;
      return _exhaustive;
    }
  }
}

function findUnsupportedDerivativeFunctionName(
  expression: CasExpression
): string | null {
  switch (expression.kind) {
    case 'number':
    case 'symbol':
      return null;
    case 'unary':
      return findUnsupportedDerivativeFunctionName(expression.operand);
    case 'binary':
      return (
        findUnsupportedDerivativeFunctionName(expression.left) ??
        findUnsupportedDerivativeFunctionName(expression.right)
      );
    case 'equation':
      return (
        findUnsupportedDerivativeFunctionName(expression.left) ??
        findUnsupportedDerivativeFunctionName(expression.right)
      );
    case 'function':
      if (expression.name === 'pow') {
        if (expression.arguments.length !== 2) {
          return expression.name;
        }
      } else if (!SUPPORTED_UNARY_FUNCTIONS.has(expression.name)) {
        return expression.name;
      } else if (expression.arguments.length > 1) {
        return expression.name;
      }

      for (const argument of expression.arguments) {
        const unsupported = findUnsupportedDerivativeFunctionName(argument);
        if (unsupported) {
          return unsupported;
        }
      }

      return null;
    default: {
      const _exhaustive: never = expression;
      return _exhaustive;
    }
  }
}

function unsupportedDerivativeError(
  functionName?: string
): CasResult<CasExpression> {
  return casFailure(
    createCasError(
      'CAS_UNSUPPORTED_DERIVATIVE',
      functionName
        ? `La funciÃ³n ${functionName} no estÃ¡ soportada simbÃ³licamente.`
        : 'La regla general de potencias no estÃ¡ soportada simbÃ³licamente.',
      undefined,
      functionName
    )
  );
}

function withinLimits(
  depth: number,
  nodeCount: number,
  limits: CasLimits
): boolean {
  return depth <= limits.maxDepth && nodeCount <= limits.maxNodes;
}
