import { Injectable } from '@angular/core';
import { Complex } from 'complex.js';
import { Token } from './tokenizer';
import { CalculationAngleMode } from '../engine-services/calculation-engine.contract';
import { factorial, polishMath } from './polish-math';
export type Step = {
  type: "Operator" | "Function",
  name: string,
  operands: (number | Complex)[];
  result: number | Complex;
  stackBefore?: (number | Complex)[];
  stackAfter?: (number | Complex)[];
}
@Injectable({
  providedIn: 'root'
})

export class evaluator {
  constructor() {
  }
  public evaluatePostFix(tokens: Token[], variables: Record<string, number> = {},
    returnSteps = false, angleMode: CalculationAngleMode = 'RAD',
    includeStackSnapshots = false):
    number | Complex | { result: number | Complex; steps: Step[] } {
    const stack: (number | Complex)[] = [];
    const steps: Step[] = [];
    const unaryOps = new Set(['!', 'u-']);
    const toReal = (val: number | Complex): Complex => {
      if (val instanceof Complex) return val;
      return new Complex(val);
    };
    const toRadians = (value: number): number => {
      if (angleMode === 'DEG') return value * Math.PI / 180;
      if (angleMode === 'GRAD') return value * Math.PI / 200;
      return value;
    };
    const fromRadians = (value: number): number => {
      if (angleMode === 'DEG') return value * 180 / Math.PI;
      if (angleMode === 'GRAD') return value * 200 / Math.PI;
      return value;
    };
    const addStep = (step: Step, stackBefore?: (number | Complex)[]): void => {
      if (includeStackSnapshots && stackBefore) {
        step.stackBefore = stackBefore;
        step.stackAfter = [...stack];
      }
      steps.push(step);
    };
    for (const token of tokens) {
      // number if  
      if (token.type === 'number') {
        stack.push(Number(token.value));
      }
      // var if
      else if (token.type === 'variable') {
        if (token.value === 'π') stack.push(Math.PI);
        else if (token.value === 'e') stack.push(Math.E);
        else if (variables && Object.prototype.hasOwnProperty.call(variables, token.value)) {
          stack.push(variables[token.value]);
        } else {
          throw new Error(`Variable no definida: ${token.value}`);
        }
      }
      // operator if
      else if (token.type === 'operator') {
        const stackBefore = includeStackSnapshots ? [...stack] : undefined;
        if (unaryOps.has(token.value)) {
          const a = stack.pop();
          if (a === undefined) throw new Error('Error: operandos insuficientes');
          const result = this.applyOperation(token.value, a);
          stack.push(result);
          addStep({
            type: 'Operator',
            name: token.value,
            operands: [a],
            result
          }, stackBefore);
        } else {
          const b = stack.pop();
          const a = stack.pop();
          if (a === undefined || b === undefined)
            throw new Error('Error: operandos insuficientes');
          const result = this.applyOperation(token.value, a, b);
          stack.push(result);
          addStep({
            type: 'Operator',
            name: token.value,
            operands: [a, b],
            result
          }, stackBefore);
        }
      }

      // function if
      else if (token.type === 'function') {
        const stackBefore = includeStackSnapshots ? [...stack] : undefined;
        const a = stack.pop();
        if (a === undefined) throw new Error(`Argumento faltante para ${token.value}`);
        let result: number | Complex;

        switch (token.value) {
          // Funciones trigonométricas unarias
          case 'sin': result = Math.sin(toRadians(toReal(a).re)); break;
          case 'cos': result = Math.cos(toRadians(toReal(a).re)); break;
          case 'tan': result = Math.tan(toRadians(toReal(a).re)); break;
          case 'sec': result = polishMath.sec(toRadians(toReal(a).re)); break;
          case 'csc': result = polishMath.csc(toRadians(toReal(a).re)); break;
          case 'cot': result = polishMath.cot(toRadians(toReal(a).re)); break;
          case 'asin': result = fromRadians(Math.asin(toReal(a).re)); break;
          case 'acos': result = fromRadians(Math.acos(toReal(a).re)); break;
          case 'atan': result = fromRadians(Math.atan(toReal(a).re)); break;
          case 'asec': result = fromRadians(polishMath.asec(toReal(a).re)); break;
          case 'acsc': result = fromRadians(polishMath.acsc(toReal(a).re)); break;
          case 'acot': result = fromRadians(polishMath.acot(toReal(a).re)); break;
          case 'sinh': result = Math.sinh(toReal(a).re); break;
          case 'cosh': result = Math.cosh(toReal(a).re); break;
          case 'tanh': result = Math.tanh(toReal(a).re); break;
          case 'sech': result = polishMath.sech(toReal(a).re); break;
          case 'csch': result = polishMath.csch(toReal(a).re); break;
          case 'coth': result = polishMath.coth(toReal(a).re); break;
          case 'asinh': result = Math.asinh(toReal(a).re); break;
          case 'acosh': result = Math.acosh(toReal(a).re); break;
          case 'atanh': result = Math.atanh(toReal(a).re); break;
          case 'asech': result = polishMath.asech(toReal(a).re); break;
          case 'acsch': result = polishMath.acsch(toReal(a).re); break;
          case 'acoth': result = polishMath.acoth(toReal(a).re); break;

          // Funciones matemáticas unarias
          case 'ln': result = Math.log(toReal(a).re); break;
          case 'log': result = Math.log10(toReal(a).re); break;
          case 'sqrt': result = toReal(a).sqrt(); break;
          case 'cbrt': result = toReal(a).pow(new Complex(1 / 3)); break;
          case 'abs': result = Math.abs(toReal(a).re); break;
          case 'sign': result = Math.sign(toReal(a).re); break;
          case 'floor': result = Math.floor(toReal(a).re); break;
          case 'ceil': result = Math.ceil(toReal(a).re); break;
          case 'expe': result = Math.exp(toReal(a).re); break;
          case '%': result = toReal(a).re * 0.01; break;
          case 'dms': result = polishMath.dms(toReal(a).re); break;

          // Funciones de varios argumentos
          case 'logxy': {
            const y = stack.pop();
            if (y === undefined) throw new Error("Argumento faltante para logxy");
            const operands = [y, a];
            result = polishMath.logxy(toReal(y).re, toReal(a).re);
            stack.push(result);
            addStep({ type: 'Function', name: 'logxy', operands, result }, stackBefore);
            break;
          }
          case 'exp': {
            const b = stack.pop();
            if (b === undefined) throw new Error("Argumento faltante para exp");
            const operands = [b, a];
            result = polishMath.scientificNotation(toReal(b).re, toReal(a).re);
            stack.push(result);
            addStep({ type: 'Function', name: 'exp', operands, result }, stackBefore);
            break;
          }
          case 'pow': {
            const base = stack.pop();
            if (base === undefined) throw new Error("Argumento faltante para pow");
            const operands = [base, a];
            result = toReal(base).pow(toReal(a));
            stack.push(result);
            addStep({ type: 'Function', name: 'pow', operands, result }, stackBefore);
            break;
          }
          case 'yroot': {
            const y = stack.pop();
            if (y === undefined) throw new Error("Argumento faltante para yroot");
            const operands = [y, a];
            result = Math.pow(toReal(y).re, 1 / toReal(a).re);
            stack.push(result);
            addStep({ type: 'Function', name: 'yroot', operands, result }, stackBefore);
            break;
          }
          case 'deg': {
            const m = stack.pop();
            const g = stack.pop();
            if (g === undefined || m === undefined)
              throw new Error("Argumento faltante para DEG");
            const operands = [g, m, a];
            result = polishMath.deg(toReal(g).re, toReal(m).re, toReal(a).re);
            stack.push(result);
            addStep({ type: 'Function', name: 'deg', operands, result }, stackBefore);
            break;
          }
          case 'mod': {
            const b = stack.pop();
            if (b === undefined) throw new Error("Argumento faltante para mod");
            const operands = [b, a];
            result = polishMath.mod(toReal(b).re, toReal(a).re);
            stack.push(result);
            addStep({ type: 'Function', name: 'mod', operands, result }, stackBefore);
            break;
          }

          default:
            throw new Error(`Función desconocida: ${token.value}`);
        }

        // Para funciones unarias
        if (!['logxy', 'exp', 'pow', 'yroot', 'deg', 'mod'].includes(token.value)) {
          stack.push(result);
          addStep({
            type: 'Function',
            name: token.value,
            operands: [a],
            result
          }, stackBefore);
        }
      }

    }

    if (stack.length !== 1)
      throw new Error('Error: expresión mal formada');

    if (returnSteps) return { result: stack[0], steps };
    return stack[0];

  }
  private applyOperation(op: string, a: number | Complex, b?: number | Complex): number | Complex {
    const A = a instanceof Complex ? a : new Complex(a);
    const B = b instanceof Complex ? b : b !== undefined ? new Complex(b) : undefined;

    switch (op) {
      case 'u-':
        return a instanceof Complex ? a.mul(-1) : -a;
      // operadores binarios
      case '+': return A.add(B!);
      case '-': return A.sub(B!);
      case '*': return A.mul(B!);
      case '/': return A.div(B!);
      case '^': return A.pow(B!);

      // operador unario factorial
      case '!':
        if (a instanceof Complex) throw new Error("No se puede calcular factorial de un número complejo");
        return factorial(a);

      // comparadores
      case '<':
      case '>':
      case '≤':
      case '≥':
      case '=':
      case '==':
      case '⩵':
      case '≠':
        if (a instanceof Complex || b instanceof Complex)
          throw new Error("No se pueden comparar números complejos");
        switch (op) {
          case '<': return a < b! ? 1 : 0;
          case '>': return a > b! ? 1 : 0;
          case '≤': return a <= b! ? 1 : 0;
          case '≥': return a >= b! ? 1 : 0;
          case '=':
          case '==':
          case '⩵': return a === b! ? 1 : 0;
          case '≠': return a !== b! ? 1 : 0;
        }

      default:
        throw new Error(`Operador desconocido: ${op}`);
    }
  }


}
