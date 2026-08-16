import {
  binaryNode,
  equationNode,
  functionCallNode,
  isStructurallyEqual,
  numberNode,
  symbolNode,
  unaryNode,
  type CasBinaryNode,
  type CasExpression,
} from '../ast/cas-ast';
import { createCasError } from '../errors/cas-errors';
import { DEFAULT_CAS_LIMITS, resolveCasLimits, type CasLimits } from '../limits/cas-limits';
import { casFailure, casSuccess, type CasFailure, type CasResult } from '../result/cas-result';
import { formatCasExpression } from '../format/cas-formatter';
import { simplifyCasExpression } from '../simplify/cas-simplifier';
import {
  fromPolynomial,
  normalizePolynomial,
  toPolynomial,
  type Polynomial,
  type PolynomialTerm,
} from '../polynomial/cas-polynomial';
import { validateCasVariable } from '../variable/cas-variable';
import { containsVariable, substituteCasExpression } from './cas-substitution';
import { reduceExactRationalExpression } from '../rational/cas-rational';
import type { CasOperationOptions } from '../differentiate/cas-differentiator';

export type CasSolutionKind = 'finite' | 'none' | 'infinite';

export interface CasSolveSuccess {
  readonly ok: true;
  readonly kind: CasSolutionKind;
  readonly variable: string;
  readonly normalizedEquation: CasExpression;
  readonly solutions: readonly CasExpression[];
  readonly text: readonly string[];
  readonly latex: readonly string[];
  readonly exact: boolean;
  readonly conditions?: readonly string[];
}

export type CasSolveResult = CasSolveSuccess | CasFailure;

interface UnivariateCoefficients {
  readonly degree: number;
  readonly coefficients: readonly CasExpression[];
}

export function solveCasExpression(
  equation: CasExpression,
  variable: string,
  options: CasOperationOptions = {}
): CasSolveResult {
  const normalizedVariable = validateCasVariable(variable);
  if (!normalizedVariable.ok) {
    return normalizedVariable;
  }

  const limits = resolveCasLimits(options.limits ?? DEFAULT_CAS_LIMITS);
  const normalizedEquation = normalizeEquation(equation, limits);
  if (!normalizedEquation.ok) {
    return normalizedEquation;
  }

  const specialResult = solveSpecialEquation(
    equation,
    normalizedEquation.value.normalizedExpression,
    normalizedVariable.value,
    limits
  );
  if (specialResult) {
    return specialResult;
  }

  const polynomial = toPolynomial(normalizedEquation.value.normalizedExpression, {
    limits,
    maxExponent: 8,
    maxTerms: 256,
  });
  if (!polynomial.ok) {
    return polynomial;
  }

  const normalizedPolynomial = normalizePolynomial(polynomial.value);
  const coefficients = getUnivariateCoefficients(
    normalizedPolynomial,
    normalizedVariable.value
  );
  if (!coefficients.ok) {
    return coefficients;
  }

  switch (coefficients.value.degree) {
    case 0:
      return isZeroPolynomial(normalizedPolynomial)
        ? createSolveResult('infinite', normalizedVariable.value, normalizedEquation.value.normalizedEquation)
        : createSolveResult('none', normalizedVariable.value, normalizedEquation.value.normalizedEquation);
    case 1:
      return solveLinear(
        coefficients.value,
        normalizedVariable.value,
        normalizedEquation.value.normalizedEquation,
        limits
      );
    case 2:
      return solveQuadratic(
        coefficients.value,
        normalizedVariable.value,
        normalizedEquation.value.normalizedEquation,
        limits
      );
    default:
      return casFailure(
        createCasError(
          'UNSUPPORTED_POLYNOMIAL_DEGREE',
          'La ecuación sólo admite grado 0, 1 y 2.'
        )
      );
  }
}

export function solveCasText(
  source: string,
  variable: string,
  parser: { parse(source: string): CasResult<CasExpression> },
  options: CasOperationOptions = {}
): CasSolveResult {
  const parsed = parser.parse(source);
  if (!parsed.ok) {
    return parsed;
  }

  return solveCasExpression(parsed.value, variable, options);
}

function normalizeEquation(
  equation: CasExpression,
  limits: CasLimits
): CasResult<{
  readonly normalizedExpression: CasExpression;
  readonly normalizedEquation: CasExpression;
}> {
  const expression =
    equation.kind === 'equation'
      ? binaryNode('-', equation.left, equation.right)
      : equation;

  const simplified = simplifyCasExpression(expression, { limits });
  if (!simplified.ok) {
    return simplified;
  }

  const normalizedEquation = equationNode(simplified.value, numberNode(0));
  return casSuccess({
    normalizedExpression: simplified.value,
    normalizedEquation,
  });
}

function solveSpecialEquation(
  originalEquation: CasExpression,
  normalizedExpression: CasExpression,
  variable: string,
  limits: CasLimits
): CasSolveResult | null {
  const transcendentalResult = solveTranscendentalEquation(
    originalEquation,
    variable,
    limits
  );
  if (transcendentalResult) {
    return transcendentalResult;
  }

  const functionResult = solveFunctionEquation(
    originalEquation,
    variable,
    limits
  );
  if (functionResult) {
    return functionResult;
  }

  const productResult = solveProductEquation(
    normalizedExpression,
    variable,
    limits
  );
  if (productResult) {
    return productResult;
  }

  const affineResult = solveAffineEquation(
    originalEquation,
    normalizedExpression,
    variable,
    limits
  );
  if (affineResult) {
    return affineResult;
  }

  const symbolicResult = solveSymbolicPolynomial(
    normalizedExpression,
    variable,
    limits
  );
  if (symbolicResult) {
    return symbolicResult;
  }

  return null;
}

function solveTranscendentalEquation(
  originalEquation: CasExpression,
  variable: string,
  limits: CasLimits
): CasSolveResult | null {
  if (originalEquation.kind !== 'equation') {
    return null;
  }

  const sameFunctionResult = solveSameFunctionEquation(
    originalEquation,
    variable,
    limits
  );
  if (sameFunctionResult) {
    return sameFunctionResult;
  }

  const powerResult = solvePowerEquation(originalEquation, variable, limits);
  if (powerResult) {
    return powerResult;
  }

  return null;
}

function solveSameFunctionEquation(
  equation: CasExpression,
  variable: string,
  limits: CasLimits
): CasSolveResult | null {
  if (equation.kind !== 'equation') {
    return null;
  }

  const left = equation.left;
  const right = equation.right;
  if (
    left.kind !== 'function' ||
    right.kind !== 'function' ||
    left.arguments.length !== 1 ||
    right.arguments.length !== 1 ||
    left.name !== right.name
  ) {
    return null;
  }

  switch (left.name) {
    case 'exp':
    case 'expe':
      return solveTransformedEquation(
        equation,
        equationNode(left.arguments[0], right.arguments[0]),
        variable,
        limits
      );
    case 'ln':
    case 'log': {
      const leftConstant = tryEvaluateConstantNumber(left.arguments[0]);
      const rightConstant = tryEvaluateConstantNumber(right.arguments[0]);

      if (
        (leftConstant !== null && leftConstant <= 0) ||
        (rightConstant !== null && rightConstant <= 0)
      ) {
        return createSolveResult('none', variable, equation);
      }

      return solveTransformedEquation(
        equation,
        equationNode(left.arguments[0], right.arguments[0]),
        variable,
        limits
      );
    }
    default:
      return null;
  }
}

function solvePowerEquation(
  equation: CasExpression,
  variable: string,
  limits: CasLimits
): CasSolveResult | null {
  if (equation.kind !== 'equation') {
    return null;
  }

  const leftResult = solvePowerEquationSide(
    equation.left,
    equation.right,
    variable,
    limits,
    equation
  );
  if (leftResult) {
    return leftResult;
  }

  return solvePowerEquationSide(
    equation.right,
    equation.left,
    variable,
    limits,
    equation
  );
}

function solvePowerEquationSide(
  powerExpression: CasExpression,
  otherExpression: CasExpression,
  variable: string,
  limits: CasLimits,
  equation: CasExpression
): CasSolveResult | null {
  if (
    powerExpression.kind !== 'binary' ||
    powerExpression.operator !== '^'
  ) {
    return null;
  }

  const base = powerExpression.left;
  const exponent = powerExpression.right;
  const normalizedBase = normalizeSolutionExpression(base, limits);
  const baseValue = tryEvaluateConstantNumber(normalizedBase);
  if (baseValue === null) {
    return null;
  }

  if (
    otherExpression.kind === 'binary' &&
    otherExpression.operator === '^'
  ) {
    const normalizedOtherBase = normalizeSolutionExpression(
      otherExpression.left,
      limits
    );

    if (isStructurallyEqual(normalizedBase, normalizedOtherBase)) {
      if (baseValue === 1) {
        return createSolveResult('infinite', variable, equation);
      }

      if (baseValue <= 0) {
        return null;
      }

      return solveTransformedEquation(
        equation,
        equationNode(exponent, otherExpression.right),
        variable,
        limits
      );
    }
  }

  const normalizedOther = normalizeSolutionExpression(otherExpression, limits);
  const otherValue = tryEvaluateConstantNumber(normalizedOther);
  if (otherValue === null) {
    return null;
  }

  if (baseValue === 1) {
    return otherValue === 1
      ? createSolveResult('infinite', variable, equation)
      : createSolveResult('none', variable, equation);
  }

  if (baseValue <= 0) {
    return null;
  }

  if (otherValue <= 0) {
    return createSolveResult('none', variable, equation);
  }

  if (otherValue === 1) {
    return solveTransformedEquation(
      equation,
      equationNode(exponent, numberNode(0)),
      variable,
      limits
    );
  }

  const baseLog = buildNaturalLogExpression(normalizedBase, variable, limits);
  const otherLog = buildNaturalLogExpression(normalizedOther, variable, limits);

  return solveTransformedEquation(
    equation,
    equationNode(exponent, buildDivisionExpression(otherLog, baseLog, limits)),
    variable,
    limits
  );
}

function solveTransformedEquation(
  originalEquation: CasExpression,
  transformedEquation: CasExpression,
  variable: string,
  limits: CasLimits
): CasSolveResult | null {
  const solved = solveCasExpression(transformedEquation, variable, { limits });
  if (!solved.ok) {
    return solved;
  }

  if (solved.kind === 'finite') {
    return buildFiniteSolutionResult(
      variable,
      originalEquation,
      solved.solutions,
      limits,
      solved.conditions
    );
  }

  return createSolveResult(solved.kind, variable, originalEquation);
}

function solveFunctionEquation(
  equation: CasExpression,
  variable: string,
  limits: CasLimits
): CasSolveResult | null {
  if (equation.kind !== 'equation') {
    return null;
  }

  const leftResult = solveFunctionEquationSide(
    equation.left,
    equation.right,
    variable,
    limits
  );
  if (leftResult) {
    return leftResult;
  }

  return solveFunctionEquationSide(
    equation.right,
    equation.left,
    variable,
    limits
  );
}

function solveFunctionEquationSide(
  functionExpression: CasExpression,
  otherExpression: CasExpression,
  variable: string,
  limits: CasLimits
): CasSolveResult | null {
  if (functionExpression.kind !== 'function' || functionExpression.arguments.length !== 1) {
    return null;
  }

  if (containsVariable(otherExpression, variable)) {
    return null;
  }

  const argument = functionExpression.arguments[0];
  const normalizedOther = normalizeSolutionExpression(otherExpression, limits);

  switch (functionExpression.name) {
    case 'sqrt': {
      if (normalizedOther.kind !== 'number') {
        return null;
      }

      if (normalizedOther.value < 0) {
        return createSolveResult(
          'none',
          variable,
          equationNode(functionExpression, otherExpression)
        );
      }

      const squared = buildPowerExpression(normalizedOther, 2, limits);
      return solveCasExpression(equationNode(argument, squared), variable, {
        limits,
      });
    }
    case 'abs': {
      if (normalizedOther.kind !== 'number') {
        return null;
      }

      if (normalizedOther.value < 0) {
        return createSolveResult(
          'none',
          variable,
          equationNode(functionExpression, otherExpression)
        );
      }

      if (normalizedOther.kind === 'number' && normalizedOther.value === 0) {
        return solveCasExpression(equationNode(argument, numberNode(0)), variable, {
          limits,
        });
      }

      const positive = solveCasExpression(
        equationNode(argument, normalizedOther),
        variable,
        { limits }
      );
      if (!positive.ok) {
        return positive;
      }

      const negative = solveCasExpression(
        equationNode(argument, unaryMinus(normalizedOther)),
        variable,
        { limits }
      );
      if (!negative.ok) {
        return negative;
      }

      return mergeSolveResults(
        variable,
        equationNode(functionExpression, otherExpression),
        [positive, negative],
        limits
      );
    }
    case 'ln':
    case 'log': {
      if (!isConstantExpression(normalizedOther, variable)) {
        return null;
      }

      return solveCasExpression(
        equationNode(
          argument,
          buildExponentialExpression(normalizedOther, variable, limits)
        ),
        variable,
        { limits }
      );
    }
    case 'exp':
    case 'expe': {
      if (!isConstantExpression(normalizedOther, variable)) {
        return null;
      }

      const evaluatedOther = tryEvaluateConstantNumber(normalizedOther);
      if (evaluatedOther === null || evaluatedOther <= 0) {
        return createSolveResult(
          'none',
          variable,
          equationNode(functionExpression, otherExpression)
        );
      }

      return solveCasExpression(
        equationNode(
          argument,
          buildNaturalLogExpression(normalizedOther, variable, limits)
        ),
        variable,
        { limits }
      );
    }
    default:
      return null;
  }
}

interface AffineForm {
  readonly coefficient: CasExpression;
  readonly constant: CasExpression;
}

function solveAffineEquation(
  originalEquation: CasExpression,
  normalizedExpression: CasExpression,
  variable: string,
  limits: CasLimits
): CasSolveResult | null {
  const affineForm = parseAffineForm(normalizedExpression, variable, limits);
  if (!affineForm) {
    return null;
  }

  const coefficient = normalizeSolutionExpression(affineForm.coefficient, limits);
  const constant = normalizeSolutionExpression(affineForm.constant, limits);

  if (isZeroExpression(coefficient)) {
    return isZeroExpression(constant)
      ? createSolveResult('infinite', variable, originalEquation)
      : createSolveResult('none', variable, originalEquation);
  }

  const candidate = buildDivisionExpression(unaryMinus(constant), coefficient, limits);
  return buildFiniteSolutionResult(
    variable,
    originalEquation,
    [candidate],
    limits
  );
}

function parseAffineForm(
  expression: CasExpression,
  variable: string,
  limits: CasLimits
): AffineForm | null {
  if (!containsVariable(expression, variable)) {
    return {
      coefficient: numberNode(0),
      constant: normalizeSolutionExpression(expression, limits),
    };
  }

  switch (expression.kind) {
    case 'symbol':
      return expression.name === variable
        ? { coefficient: numberNode(1), constant: numberNode(0) }
        : null;
    case 'number':
      return {
        coefficient: numberNode(0),
        constant: expression,
      };
    case 'unary': {
      const operand = parseAffineForm(expression.operand, variable, limits);
      if (!operand) {
        return null;
      }

      if (expression.operator === '+') {
        return operand;
      }

      return {
        coefficient: unaryMinus(operand.coefficient),
        constant: unaryMinus(operand.constant),
      };
    }
    case 'binary': {
      const leftConstant = !containsVariable(expression.left, variable);
      const rightConstant = !containsVariable(expression.right, variable);

      switch (expression.operator) {
        case '+': {
          const left = parseAffineForm(expression.left, variable, limits);
          const right = parseAffineForm(expression.right, variable, limits);
          if (!left || !right) {
            return null;
          }

          return {
            coefficient: buildAdditionExpression(left.coefficient, right.coefficient, limits),
            constant: buildAdditionExpression(left.constant, right.constant, limits),
          };
        }
        case '-': {
          const left = parseAffineForm(expression.left, variable, limits);
          const right = parseAffineForm(expression.right, variable, limits);
          if (!left || !right) {
            return null;
          }

          return {
            coefficient: buildSubtractionExpression(
              left.coefficient,
              right.coefficient,
              limits
            ),
            constant: buildSubtractionExpression(left.constant, right.constant, limits),
          };
        }
        case '*': {
          if (leftConstant && rightConstant) {
            return {
              coefficient: numberNode(0),
              constant: normalizeSolutionExpression(expression, limits),
            };
          }

          if (leftConstant) {
            const right = parseAffineForm(expression.right, variable, limits);
            if (!right) {
              return null;
            }

            return scaleAffineForm(expression.left, right, limits);
          }

          if (rightConstant) {
            const left = parseAffineForm(expression.left, variable, limits);
            if (!left) {
              return null;
            }

            return scaleAffineForm(expression.right, left, limits);
          }

          return null;
        }
        case '/': {
          if (!rightConstant) {
            return null;
          }

          const numerator = parseAffineForm(expression.left, variable, limits);
          if (!numerator) {
            return null;
          }

          return divideAffineForm(expression.right, numerator, limits);
        }
        case '^':
          return null;
        default:
          return null;
      }
    }
    case 'function':
      return expression.arguments.every(argument => !containsVariable(argument, variable))
        ? {
            coefficient: numberNode(0),
            constant: normalizeSolutionExpression(expression, limits),
          }
        : null;
    case 'equation':
      return null;
    default: {
      const _exhaustive: never = expression;
      return _exhaustive;
    }
  }
}

function scaleAffineForm(
  scalar: CasExpression,
  form: AffineForm,
  limits: CasLimits
): AffineForm {
  return {
    coefficient: buildProductExpression([scalar, form.coefficient], limits),
    constant: buildProductExpression([scalar, form.constant], limits),
  };
}

function divideAffineForm(
  divisor: CasExpression,
  form: AffineForm,
  limits: CasLimits
): AffineForm {
  return {
    coefficient: buildDivisionExpression(form.coefficient, divisor, limits),
    constant: buildDivisionExpression(form.constant, divisor, limits),
  };
}

function solveProductEquation(
  expression: CasExpression,
  variable: string,
  limits: CasLimits
): CasSolveResult | null {
  const factors = collectMultiplicationFactors(expression);
  if (factors.length <= 1) {
    return null;
  }

  const normalizedEquation = equationNode(expression, numberNode(0));
  const results: CasSolveResult[] = [];
  let hadFailure = false;

  for (const factor of factors) {
    const result = solveCasExpression(
      equationNode(factor, numberNode(0)),
      variable,
      { limits }
    );

    if (!result.ok) {
      hadFailure = true;
      continue;
    }

    if (result.kind === 'infinite') {
      return createSolveResult('infinite', variable, normalizedEquation);
    }

    if (result.kind === 'finite' && result.solutions.length > 0) {
      results.push(result);
    }
  }

  if (results.length === 0) {
    return hadFailure ? null : createSolveResult('none', variable, normalizedEquation);
  }

  return mergeSolveResults(variable, normalizedEquation, results, limits);
}

function solveSymbolicPolynomial(
  expression: CasExpression,
  variable: string,
  limits: CasLimits
): CasSolveResult | null {
  const polynomial = toPolynomial(expression, {
    limits,
    maxExponent: 8,
    maxTerms: 256,
  });
  if (!polynomial.ok) {
    return null;
  }

  const normalizedPolynomial = normalizePolynomial(polynomial.value);
  const coefficients = getUnivariateCoefficients(
    normalizedPolynomial,
    variable
  );
  if (!coefficients.ok) {
    return null;
  }

  if (coefficients.value.coefficients.every(coefficient => coefficient.kind === 'number')) {
    return null;
  }

  const normalizedEquation = equationNode(expression, numberNode(0));
  switch (coefficients.value.degree) {
    case 0:
      return isZeroExpression(coefficients.value.coefficients[0] ?? numberNode(0))
        ? createSolveResult('infinite', variable, normalizedEquation)
        : createSolveResult('none', variable, normalizedEquation);
    case 1:
      return solveSymbolicLinear(
        coefficients.value,
        variable,
        normalizedEquation,
        limits
      );
    case 2:
      return solveSymbolicQuadratic(
        coefficients.value,
        variable,
        normalizedEquation,
        limits
      );
    default:
      return null;
  }
}

function solveLinear(
  coefficients: UnivariateCoefficients,
  variable: string,
  normalizedEquation: CasExpression,
  limits: CasLimits
): CasSolveResult {
  const [constant, linear] = coefficients.coefficients;
  if (!constant || !linear) {
    return casFailure(
      createCasError(
        'UNSUPPORTED_EXPRESSION',
        'La ecuación lineal requiere coeficientes.'
      )
    );
  }

  if (constant.kind === 'number' && linear.kind === 'number') {
    const candidate = normalizeExactSolution(
      buildExactDivision(unaryMinus(constant), linear.value)
    );

    return buildFiniteSolutionResult(
      variable,
      normalizedEquation,
      [candidate],
      limits
    );
  }

  return solveSymbolicLinear(coefficients, variable, normalizedEquation, limits);
}

function solveQuadratic(
  coefficients: UnivariateCoefficients,
  variable: string,
  normalizedEquation: CasExpression,
  limits: CasLimits
): CasSolveResult {
  const [constant, linear, quadratic] = coefficients.coefficients;
  if (!constant || !linear || !quadratic) {
    return casFailure(
      createCasError(
        'UNSUPPORTED_EXPRESSION',
        'La ecuación cuadrática requiere coeficientes.'
      )
    );
  }

  if (
    constant.kind === 'number' &&
    linear.kind === 'number' &&
    quadratic.kind === 'number'
  ) {
    const c = constant.value;
    const b = linear.value;
    const a = quadratic.value;
    if (a === 0) {
      return casFailure(
        createCasError(
          'UNSUPPORTED_EXPRESSION',
          'El coeficiente principal de la ecuación cuadrática no puede ser cero.'
        )
      );
    }

    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) {
      return createSolveResult('none', variable, normalizedEquation);
    }

    const denominator = 2 * a;
    const negativeB = numberNode(-b);

    if (discriminant === 0) {
      return buildFiniteSolutionResult(
        variable,
        normalizedEquation,
        [normalizeExactSolution(buildExactDivision(negativeB, denominator))],
        limits
      );
    }

    const sqrtDiscriminant = exactSquareRoot(discriminant);
    if (!sqrtDiscriminant) {
      return casFailure(
        createCasError(
          'UNSUPPORTED_EXPRESSION',
          'La raíz cuadrática no puede representarse con exactitud.'
        )
      );
    }

    const minusNumerator = normalizeExactNode(
      binaryNode('+', negativeB, unaryNode('-', sqrtDiscriminant))
    );
    const plusNumerator = normalizeExactNode(
      binaryNode('+', negativeB, sqrtDiscriminant)
    );

    return buildFiniteSolutionResult(
      variable,
      normalizedEquation,
      [
        normalizeExactSolution(buildExactDivision(minusNumerator, denominator)),
        normalizeExactSolution(buildExactDivision(plusNumerator, denominator)),
      ],
      limits
    );
  }

  return solveSymbolicQuadratic(coefficients, variable, normalizedEquation, limits);
}

function solveSymbolicLinear(
  coefficients: UnivariateCoefficients,
  variable: string,
  normalizedEquation: CasExpression,
  limits: CasLimits
): CasSolveResult {
  const [constant, linear] = coefficients.coefficients;
  const conditions =
    linear && linear.kind !== 'number'
      ? [`${formatCasExpression(linear)} ≠ 0`]
      : undefined;
  const candidate = buildDivisionExpression(
    unaryMinus(constant ?? numberNode(0)),
    linear ?? numberNode(1),
    limits
  );

  return buildFiniteSolutionResult(
    variable,
    normalizedEquation,
    [candidate],
    limits,
    conditions
  );
}

function solveSymbolicQuadratic(
  coefficients: UnivariateCoefficients,
  variable: string,
  normalizedEquation: CasExpression,
  limits: CasLimits
): CasSolveResult {
  const [constant, linear, quadratic] = coefficients.coefficients;
  if (!constant || !linear || !quadratic) {
    return casFailure(
      createCasError(
        'UNSUPPORTED_EXPRESSION',
        'La ecuación cuadrática requiere coeficientes.'
      )
    );
  }

  if (isZeroExpression(quadratic)) {
    return solveSymbolicLinear(
      { degree: 1, coefficients: [constant, linear] },
      variable,
      normalizedEquation,
      limits
    );
  }

  const denominator = buildProductExpression([numberNode(2), quadratic], limits);
  const bSquared = buildPowerExpression(linear, 2, limits);
  const fourAC = buildProductExpression([numberNode(4), quadratic, constant], limits);
  const discriminant = buildSubtractionExpression(bSquared, fourAC, limits);
  const sqrtDiscriminant = buildSquareRootExpression(discriminant, limits);
  if (sqrtDiscriminant === null) {
    return createSolveResult('none', variable, normalizedEquation);
  }

  const negativeB = unaryMinus(linear);
  const minusNumerator = buildAdditionExpression(
    negativeB,
    unaryNode('-', sqrtDiscriminant),
    limits
  );
  const plusNumerator = buildAdditionExpression(negativeB, sqrtDiscriminant, limits);
  const conditions = [
    ...(quadratic.kind !== 'number'
      ? [`${formatCasExpression(quadratic)} ≠ 0`]
      : []),
    ...(discriminant.kind !== 'number'
      ? [`${formatCasExpression(discriminant)} ≥ 0`]
      : []),
  ];

  return buildFiniteSolutionResult(
    variable,
    normalizedEquation,
    [
      buildDivisionExpression(minusNumerator, denominator, limits),
      buildDivisionExpression(plusNumerator, denominator, limits),
    ],
    limits,
    conditions
  );
}

function mergeSolveResults(
  variable: string,
  normalizedEquation: CasExpression,
  results: readonly CasSolveResult[],
  limits: CasLimits
): CasSolveResult {
  const solutions: CasExpression[] = [];
  let sawInfinite = false;

  for (const result of results) {
    if (!result.ok) {
      continue;
    }

    if (result.kind === 'infinite') {
      sawInfinite = true;
      continue;
    }

    if (result.kind !== 'finite') {
      continue;
    }

    for (const solution of result.solutions) {
      if (!solutions.some(existing => isStructurallyEqual(existing, solution))) {
        solutions.push(solution);
      }
    }
  }

  if (sawInfinite) {
    return createSolveResult('infinite', variable, normalizedEquation);
  }

  if (solutions.length === 0) {
    return createSolveResult('none', variable, normalizedEquation);
  }

  return buildFiniteSolutionResult(variable, normalizedEquation, solutions, limits);
}

function buildAdditionExpression(
  left: CasExpression,
  right: CasExpression,
  limits: CasLimits
): CasExpression {
  return normalizeSolutionExpression(binaryNode('+', left, right), limits);
}

function buildSubtractionExpression(
  left: CasExpression,
  right: CasExpression,
  limits: CasLimits
): CasExpression {
  return normalizeSolutionExpression(binaryNode('-', left, right), limits);
}

function buildProductExpression(
  factors: readonly CasExpression[],
  limits: CasLimits
): CasExpression {
  if (factors.length === 0) {
    return numberNode(1);
  }

  const expression = factors.slice(1).reduce(
    (left, right) => binaryNode('*', left, right),
    factors[0]
  );

  return normalizeSolutionExpression(expression, limits);
}

function buildPowerExpression(
  base: CasExpression,
  exponent: number,
  limits: CasLimits
): CasExpression {
  return normalizeSolutionExpression(
    binaryNode('^', base, numberNode(exponent)),
    limits
  );
}

function buildSquareRootExpression(
  expression: CasExpression,
  limits: CasLimits
): CasExpression | null {
  const normalized = normalizeSolutionExpression(expression, limits);
  if (normalized.kind === 'number') {
    if (normalized.value < 0) {
      return null;
    }

    const exact = exactSquareRoot(normalized.value);
    if (exact) {
      return exact;
    }

    return functionCallNode('sqrt', [normalized]);
  }

  return functionCallNode('sqrt', [normalized]);
}

function buildDivisionExpression(
  numerator: CasExpression,
  denominator: CasExpression,
  limits: CasLimits
): CasExpression {
  if (denominator.kind === 'number') {
    return normalizeExactSolution(buildExactDivision(numerator, denominator.value));
  }

  return normalizeSolutionExpression(binaryNode('/', numerator, denominator), limits);
}

function buildNaturalLogExpression(
  expression: CasExpression,
  variable: string,
  limits: CasLimits
): CasExpression {
  const normalized = normalizeSolutionExpression(expression, limits);

  if (!isConstantExpression(normalized, variable)) {
    return functionCallNode('ln', [normalized]);
  }

  if (normalized.kind === 'number') {
    if (normalized.value === 1) {
      return numberNode(0);
    }

    return functionCallNode('ln', [normalized]);
  }

  if (normalized.kind === 'symbol') {
    if (normalized.name === 'e') {
      return numberNode(1);
    }

    if (normalized.name === 'pi' || normalized.name === 'π') {
      return functionCallNode('ln', [normalized]);
    }
  }

  if (
    normalized.kind === 'function' &&
    normalized.name === 'exp' &&
    normalized.arguments.length === 1 &&
    !containsVariable(normalized.arguments[0], variable)
  ) {
    return normalizeSolutionExpression(normalized.arguments[0], limits);
  }

  return functionCallNode('ln', [normalized]);
}

function buildExponentialExpression(
  expression: CasExpression,
  variable: string,
  limits: CasLimits
): CasExpression {
  const normalized = normalizeSolutionExpression(expression, limits);

  if (!isConstantExpression(normalized, variable)) {
    return functionCallNode('exp', [normalized]);
  }

  if (normalized.kind === 'number') {
    if (normalized.value === 0) {
      return numberNode(1);
    }

    if (normalized.value === 1) {
      return symbolNode('e');
    }

    return functionCallNode('exp', [normalized]);
  }

  if (
    normalized.kind === 'function' &&
    normalized.arguments.length === 1 &&
    (normalized.name === 'ln' || normalized.name === 'log') &&
    !containsVariable(normalized.arguments[0], variable)
  ) {
    const argument = normalized.arguments[0];
    if (isPositiveConstantExpression(argument, variable, limits)) {
      return normalizeSolutionExpression(argument, limits);
    }
  }

  if (normalized.kind === 'symbol' && normalized.name === 'e') {
    return numberNode(1);
  }

  return functionCallNode('exp', [normalized]);
}

function isConstantExpression(
  expression: CasExpression,
  variable: string
): boolean {
  return !containsVariable(expression, variable);
}

function isPositiveConstantExpression(
  expression: CasExpression,
  variable: string,
  limits: CasLimits
): boolean {
  if (!isConstantExpression(expression, variable)) {
    return false;
  }

  const normalized = normalizeSolutionExpression(expression, limits);
  const evaluated = tryEvaluateConstantNumber(normalized);
  if (evaluated !== null) {
    return evaluated > 0;
  }

  return (
    normalized.kind === 'symbol' &&
    (normalized.name === 'e' || normalized.name === 'pi' || normalized.name === 'π')
  );
}

function normalizeSolutionExpression(
  expression: CasExpression,
  limits: CasLimits
): CasExpression {
  const simplified = simplifyCasExpression(expression, { limits });
  if (simplified.ok) {
    return simplified.value;
  }

  return expression;
}

function buildFiniteSolutionResult(
  variable: string,
  normalizedEquation: CasExpression,
  candidates: readonly CasExpression[],
  limits: CasLimits,
  conditions: readonly string[] = []
): CasSolveResult {
  const normalizedSolutions: CasExpression[] = [];

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeExactSolution(candidate);

    if (!isSolutionValid(normalizedEquation, variable, normalizedCandidate, limits)) {
      continue;
    }

    if (
      !normalizedSolutions.some(solution =>
        isStructurallyEqual(solution, normalizedCandidate)
      )
    ) {
      normalizedSolutions.push(normalizedCandidate);
    }
  }

  normalizedSolutions.sort(compareSolutions);

  if (normalizedSolutions.length === 0) {
    return createSolveResult('none', variable, normalizedEquation);
  }

  return {
    ok: true,
    kind: 'finite',
    variable,
    normalizedEquation,
    solutions: normalizedSolutions,
    text: normalizedSolutions.map(solution => formatCasExpression(solution)),
    latex: normalizedSolutions.map(solution => formatCasExpression(solution)),
    exact: true,
    conditions: [...conditions],
  };
}

function createSolveResult(
  kind: Exclude<CasSolutionKind, 'finite'>,
  variable: string,
  normalizedEquation: CasExpression
): CasSolveSuccess {
  return {
    ok: true,
    kind,
    variable,
    normalizedEquation,
    solutions: [],
    text: [],
    latex: [],
    exact: true,
  };
}

function getUnivariateCoefficients(
  polynomial: Polynomial,
  variable: string
): CasResult<UnivariateCoefficients> {
  const grouped = new Map<number, PolynomialTerm[]>();
  let degree = 0;

  for (const term of polynomial.terms) {
    const exponent = term.powers[variable] ?? 0;
    if (!Number.isInteger(exponent) || exponent < 0) {
      return casFailure(
        createCasError(
          'UNSUPPORTED_EXPRESSION',
          'La ecuación contiene potencias no soportadas.'
        )
      );
    }

    if (exponent > 2) {
      return casFailure(
        createCasError(
          'UNSUPPORTED_POLYNOMIAL_DEGREE',
          'La ecuación sólo admite grado 0, 1 y 2.'
        )
      );
    }

    degree = Math.max(degree, exponent);

    const strippedPowers: Record<string, number> = {};
    for (const [name, power] of Object.entries(term.powers)) {
      if (name !== variable && power !== 0) {
        strippedPowers[name] = power;
      }
    }

    const bucket = grouped.get(exponent) ?? [];
    bucket.push({
      coefficient: term.coefficient,
      powers: strippedPowers,
    });
    grouped.set(exponent, bucket);
  }

  const coefficients = Array.from({ length: degree + 1 }, (_, currentDegree) =>
    fromPolynomial({
      terms: grouped.get(currentDegree) ?? [],
    })
  );

  return casSuccess({
    degree,
    coefficients,
  });
}

function isSolutionValid(
  normalizedEquation: CasExpression,
  variable: string,
  candidate: CasExpression,
  limits: CasLimits
): boolean {
  const substituted = substituteCasExpression(normalizedEquation, variable, candidate);
  const simplified = simplifyCasExpression(substituted, { limits });
  if (!simplified.ok) {
    return false;
  }

  const polynomial = toPolynomial(simplified.value, {
    limits,
    maxExponent: 8,
    maxTerms: 256,
  });
  if (!polynomial.ok) {
    return true;
  }

  return isZeroPolynomial(normalizePolynomial(polynomial.value));
}

function isZeroPolynomial(polynomial: Polynomial): boolean {
  return polynomial.terms.length === 0
    || (polynomial.terms.length === 1 && polynomial.terms[0].coefficient === 0);
}

function compareSolutions(left: CasExpression, right: CasExpression): number {
  if (left.kind === 'number' && right.kind === 'number') {
    return left.value - right.value;
  }

  return formatCasExpression(left).localeCompare(formatCasExpression(right));
}

function unaryMinus(expression: CasExpression): CasExpression {
  if (expression.kind === 'number') {
    return numberNode(-expression.value);
  }

  if (expression.kind === 'unary' && expression.operator === '-') {
    return expression.operand;
  }

  if (expression.kind === 'binary' && expression.operator === '/') {
    return binaryNode('/', unaryMinus(expression.left), expression.right);
  }

  if (expression.kind === 'binary' && expression.operator === '-') {
    return binaryNode('-', expression.right, expression.left);
  }

  return unaryNode('-', expression);
}

function exactSquareRoot(value: number): CasExpression | null {
  if (!Number.isInteger(value) || value < 0) {
    return null;
  }

  if (value === 0) {
    return numberNode(0);
  }

  const factors = factorSquarePart(value);
  if (factors.perfectSquare === 1 && factors.remainder === 1) {
    return numberNode(1);
  }

  if (factors.remainder === 1) {
    return numberNode(factors.perfectSquare);
  }

  const root = functionCallNode('sqrt', [numberNode(factors.remainder)]);
  if (factors.perfectSquare === 1) {
    return root;
  }

  return binaryNode('*', numberNode(factors.perfectSquare), root);
}

function factorSquarePart(value: number): {
  readonly perfectSquare: number;
  readonly remainder: number;
} {
  let remainder = value;
  let perfectSquare = 1;

  for (let factor = 2; factor * factor <= remainder; factor++) {
    const square = factor * factor;
    while (remainder % square === 0) {
      perfectSquare *= factor;
      remainder /= square;
    }
  }

  return {
    perfectSquare,
    remainder,
  };
}

function buildExactDivision(
  numerator: CasExpression,
  denominator: number
): CasExpression {
  if (denominator === 1) {
    return numerator;
  }

  if (denominator === -1) {
    return unaryMinus(numerator);
  }

  const normalizedNumerator = normalizeExactNode(numerator);
  if (normalizedNumerator.kind === 'unary' && normalizedNumerator.operator === '-') {
    return unaryMinus(buildExactDivision(normalizedNumerator.operand, denominator));
  }

  if (normalizedNumerator.kind === 'number') {
    return reduceExactNumberFraction(normalizedNumerator.value, denominator);
  }

  const factors = collectMultiplicationFactors(normalizedNumerator);
  let numericFactor = 1;
  const nonNumericFactors: CasExpression[] = [];

  for (const factor of factors) {
    if (factor.kind === 'number') {
      numericFactor *= factor.value;
    } else {
      nonNumericFactors.push(factor);
    }
  }

  const normalizedDenominator = denominator < 0 ? -denominator : denominator;
  const normalizedFactor = denominator < 0 ? -numericFactor : numericFactor;

  if (
    Number.isInteger(normalizedFactor) &&
    Number.isInteger(normalizedDenominator)
  ) {
    const divisor = gcdOfIntegers(
      Math.abs(normalizedFactor),
      Math.abs(normalizedDenominator)
    );
    const reducedFactor = normalizedFactor / divisor;
    const reducedDenominator = normalizedDenominator / divisor;
    const rebuilt = buildSignedProduct(reducedFactor, nonNumericFactors);

    if (reducedDenominator === 1) {
      return rebuilt;
    }

    return binaryNode('/', rebuilt, numberNode(reducedDenominator));
  }

  return binaryNode('/', normalizedNumerator, numberNode(normalizedDenominator));
}

function normalizeExactSolution(expression: CasExpression): CasExpression {
  return normalizeExactNode(expression);
}

function normalizeExactNode(expression: CasExpression): CasExpression {
  switch (expression.kind) {
    case 'number':
      return numberNode(expression.value);
    case 'symbol':
      return expression;
    case 'unary': {
      const operand = normalizeExactNode(expression.operand);
      if (expression.operator === '+') {
        return operand;
      }

      if (operand.kind === 'number') {
        return numberNode(-operand.value);
      }

      if (operand.kind === 'unary' && operand.operator === '-') {
        return operand.operand;
      }

      return unaryNode('-', operand);
    }
    case 'binary': {
      const left = normalizeExactNode(expression.left);
      const right = normalizeExactNode(expression.right);
      const operator: CasBinaryNode['operator'] = expression.operator;

      switch (operator) {
        case '+':
          return combineAddition(left, right);
        case '-':
          return combineSubtraction(left, right);
        case '*':
          return combineMultiplication(left, right);
        case '/':
          return combineDivision(left, right);
        case '^':
          return combinePower(left, right);
        default: {
          const _exhaustive: never = operator;
          return _exhaustive;
        }
      }
    }
    case 'function':
      return functionCallNode(
        expression.name,
        expression.arguments.map(argument => normalizeExactNode(argument))
      );
    case 'equation':
      return equationNode(
        normalizeExactNode(expression.left),
        normalizeExactNode(expression.right)
      );
    default: {
      const _exhaustive: never = expression;
      return _exhaustive;
    }
  }
}

function combineAddition(left: CasExpression, right: CasExpression): CasExpression {
  if (isZeroExpression(left)) {
    return right;
  }

  if (isZeroExpression(right)) {
    return left;
  }

  if (left.kind === 'number' && right.kind === 'number') {
    return numberNode(left.value + right.value);
  }

  return binaryNode('+', left, right);
}

function combineSubtraction(left: CasExpression, right: CasExpression): CasExpression {
  if (isZeroExpression(right)) {
    return left;
  }

  if (isZeroExpression(left)) {
    return unaryMinus(right);
  }

  if (left.kind === 'number' && right.kind === 'number') {
    return numberNode(left.value - right.value);
  }

  return binaryNode('-', left, right);
}

function combineMultiplication(left: CasExpression, right: CasExpression): CasExpression {
  const factors = [...collectMultiplicationFactors(left), ...collectMultiplicationFactors(right)];
  let numericFactor = 1;
  const nonNumericFactors: CasExpression[] = [];

  for (const factor of factors) {
    if (factor.kind === 'number') {
      numericFactor *= factor.value;
    } else {
      nonNumericFactors.push(factor);
    }
  }

  if (numericFactor === 0) {
    return numberNode(0);
  }

  return buildSignedProduct(numericFactor, nonNumericFactors);
}

function combineDivision(left: CasExpression, right: CasExpression): CasExpression {
  if (isZeroExpression(left)) {
    return numberNode(0);
  }

  if (right.kind === 'number' && right.value === 1) {
    return left;
  }

  if (left.kind === 'number' && right.kind === 'number') {
    return reduceExactNumberFraction(left.value, right.value);
  }

  if (right.kind === 'number') {
    return buildExactDivision(left, right.value);
  }

  return binaryNode('/', left, right);
}

function combinePower(left: CasExpression, right: CasExpression): CasExpression {
  if (right.kind === 'number') {
    if (right.value === 0) {
      return numberNode(1);
    }

    if (right.value === 1) {
      return left;
    }
  }

  if (left.kind === 'number' && right.kind === 'number') {
    const powered = Math.pow(left.value, right.value);
    if (Number.isFinite(powered)) {
      return numberNode(powered);
    }
  }

  return binaryNode('^', left, right);
}

function reduceExactNumberFraction(numerator: number, denominator: number): CasExpression {
  return reduceExactRationalExpression(numerator, denominator);
}

function buildSignedProduct(
  numericFactor: number,
  factors: readonly CasExpression[]
): CasExpression {
  if (numericFactor === 0) {
    return numberNode(0);
  }

  if (factors.length === 0) {
    return numberNode(numericFactor);
  }

  if (numericFactor === 1) {
    return rebuildMultiplication(factors);
  }

  if (numericFactor === -1) {
    const product = rebuildMultiplication(factors);
    return product.kind === 'number' ? numberNode(-product.value) : unaryNode('-', product);
  }

  return rebuildMultiplication([numberNode(numericFactor), ...factors]);
}

function collectMultiplicationFactors(expression: CasExpression): CasExpression[] {
  if (expression.kind === 'binary' && expression.operator === '*') {
    return [
      ...collectMultiplicationFactors(expression.left),
      ...collectMultiplicationFactors(expression.right),
    ];
  }

  return [expression];
}

function rebuildMultiplication(items: readonly CasExpression[]): CasExpression {
  if (items.length === 0) {
    return numberNode(1);
  }

  const normalizedItems = sortMultiplicationFactors(items);

  if (normalizedItems.length === 1) {
    return normalizedItems[0];
  }

  return normalizedItems.slice(1).reduce(
    (left, right) => binaryNode('*', left, right),
    normalizedItems[0]
  );
}

function gcdOfIntegers(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);

  while (b !== 0) {
    const temp = b;
    b = a % b;
    a = temp;
  }

  return a;
}

function tryEvaluateConstantNumber(expression: CasExpression): number | null {
  switch (expression.kind) {
    case 'number':
      return expression.value;
    case 'symbol':
      return constantSymbolValue(expression.name);
    case 'unary': {
      const operand = tryEvaluateConstantNumber(expression.operand);
      if (operand === null) {
        return null;
      }

      return expression.operator === '+' ? operand : -operand;
    }
    case 'binary': {
      const left = tryEvaluateConstantNumber(expression.left);
      const right = tryEvaluateConstantNumber(expression.right);
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
        case '^': {
          const powered = Math.pow(left, right);
          return Number.isFinite(powered) ? powered : null;
        }
        default:
          return null;
      }
    }
    case 'function': {
      const values = expression.arguments.map(argument =>
        tryEvaluateConstantNumber(argument)
      );
      if (values.some(value => value === null)) {
        return null;
      }

      return evaluateConstantFunction(expression.name, values as readonly number[]);
    }
    case 'equation':
      return null;
    default: {
      const _exhaustive: never = expression;
      return _exhaustive;
    }
  }
}

function evaluateConstantFunction(
  name: string,
  values: readonly number[]
): number | null {
  if (values.length !== 1) {
    return null;
  }

  const value = values[0];

  switch (name) {
    case 'sin':
      return Math.sin(value);
    case 'cos':
      return Math.cos(value);
    case 'tan': {
      const cosine = Math.cos(value);
      if (Math.abs(cosine) < 1e-12) {
        return null;
      }

      return Math.tan(value);
    }
    case 'exp':
    case 'expe':
      return Math.exp(value);
    case 'sqrt':
      return value < 0 ? null : Math.sqrt(value);
    case 'abs':
      return Math.abs(value);
    case 'ln':
    case 'log':
      return value > 0 ? Math.log(value) : null;
    case 'cbrt':
      return Math.cbrt(value);
    default:
      return null;
  }
}

function constantSymbolValue(name: string): number | null {
  switch (name) {
    case 'pi':
    case 'π':
      return Math.PI;
    case 'e':
      return Math.E;
    default:
      return null;
  }
}

function isZeroExpression(expression: CasExpression): boolean {
  return expression.kind === 'number' && expression.value === 0;
}

function sortMultiplicationFactors(
  factors: readonly CasExpression[]
): CasExpression[] {
  return [...factors].sort((left, right) => {
    const leftRank = multiplicationFactorRank(left);
    const rightRank = multiplicationFactorRank(right);
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return formatCasExpression(left).localeCompare(formatCasExpression(right));
  });
}

function multiplicationFactorRank(expression: CasExpression): number {
  switch (expression.kind) {
    case 'number':
      return 0;
    case 'symbol':
      return 1;
    case 'unary':
      return 2;
    case 'function':
      return 3;
    case 'binary':
      return 4;
    case 'equation':
      return 5;
    default: {
      const _exhaustive: never = expression;
      return _exhaustive;
    }
  }
}
