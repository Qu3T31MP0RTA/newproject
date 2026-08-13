export interface CasQuickAction {
  readonly id: string;
  readonly label: string;
  readonly template: string;
  readonly caretOffset: number;
  readonly description: string;
  readonly example: string;
  readonly ariaLabel: string;
  readonly selectionTemplate: (selection: string) => string;
}

export interface CasInsertionResult {
  readonly expression: string;
  readonly caretStart: number;
  readonly caretEnd: number;
}

export const CAS_QUICK_ACTIONS: readonly CasQuickAction[] = [
  {
    id: 'differentiate',
    label: 'Derivar',
    template: 'diff(,x)',
    caretOffset: 'diff('.length,
    description: 'Derivada simbólica',
    example: 'diff(x^2,x) → 2*x',
    ariaLabel: 'Derivar expresión',
    selectionTemplate: selection => `diff(${selection},x)`,
  },
  {
    id: 'integrate',
    label: 'Integrar',
    template: 'integrate(,x)',
    caretOffset: 'integrate('.length,
    description: 'Integral simbólica',
    example: 'integrate(x^2,x) → x^3/3',
    ariaLabel: 'Integrar expresión',
    selectionTemplate: selection => `integrate(${selection},x)`,
  },
  {
    id: 'simplify',
    label: 'Simplificar',
    template: 'simplify()',
    caretOffset: 'simplify('.length,
    description: 'Reducir y ordenar',
    example: 'simplify(x+x) → 2*x',
    ariaLabel: 'Simplificar expresión',
    selectionTemplate: selection => `simplify(${selection})`,
  },
  {
    id: 'expand',
    label: 'Expandir',
    template: 'expand()',
    caretOffset: 'expand('.length,
    description: 'Desarrollar productos',
    example: 'expand((x+1)^2) → x^2+2*x+1',
    ariaLabel: 'Expandir expresión',
    selectionTemplate: selection => `expand(${selection})`,
  },
  {
    id: 'factor',
    label: 'Factorizar',
    template: 'factor()',
    caretOffset: 'factor('.length,
    description: 'Factorización simbólica',
    example: 'factor(x^2-1) → (x-1)*(x+1)',
    ariaLabel: 'Factorizar expresión',
    selectionTemplate: selection => `factor(${selection})`,
  },
  {
    id: 'solve',
    label: 'Resolver',
    template: 'solve(,x)',
    caretOffset: 'solve('.length,
    description: 'Resolver ecuaciones',
    example: 'solve(2*x+1=0,x) → -1/2',
    ariaLabel: 'Resolver expresión',
    selectionTemplate: selection => `solve(${selection},x)`,
  },
] as const;

export function buildCasInsertion(
  expression: string,
  selectionStart: number | null,
  selectionEnd: number | null,
  action: CasQuickAction
): CasInsertionResult {
  const safeStart = selectionStart ?? expression.length;
  const safeEnd = selectionEnd ?? safeStart;

  if (safeStart < 0 || safeEnd < 0 || safeStart > expression.length || safeEnd > expression.length) {
    return {
      expression: action.template,
      caretStart: action.caretOffset,
      caretEnd: action.caretOffset,
    };
  }

  if (safeStart !== safeEnd) {
    const selection = expression.slice(safeStart, safeEnd);
    const nextInsertion = action.selectionTemplate(selection);
    const nextExpression = `${expression.slice(0, safeStart)}${nextInsertion}${expression.slice(safeEnd)}`;
    const caretPosition = safeStart + nextInsertion.length;

    return {
      expression: nextExpression,
      caretStart: caretPosition,
      caretEnd: caretPosition,
    };
  }

  const nextExpression = `${expression.slice(0, safeStart)}${action.template}${expression.slice(safeEnd)}`;
  const caretPosition = safeStart + action.caretOffset;

  return {
    expression: nextExpression,
    caretStart: caretPosition,
    caretEnd: caretPosition,
  };
}
