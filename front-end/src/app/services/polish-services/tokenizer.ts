import { Injectable } from '@angular/core';

export interface Token {
  type: 'number' | 'operator' | 'variable' | 'function' | 'paren' | 'comma';
  value: string;
}

export interface TokenizeOptions {
  readonly unaryOperators?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class Tokenizer {
  private readonly operators = '+-*/^!=';
  private readonly piSymbols = ['π', 'Ï€'];
  private readonly functions = [
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
    'asec', 'acsc', 'acot',
    'sinh', 'cosh', 'tanh',
    'sech', 'csch', 'coth',
    'asinh', 'acosh', 'atanh',
    'asech', 'acsch', 'acoth',
    'ln', 'log', 'sqrt', 'cbrt', 'abs', 'sign', 'floor', 'ceil', 'exp', 'expe', 'yroot',
    'logxy', 'pow', 'mod', 'deg', 'dms', 'factorial', 'xylog', '%',
  ];

  tokenize(expression: string, options: TokenizeOptions = {}): Token[] {
    const tokens: Token[] = [];
    let current = '';
    let canBeUnary = true;

    const flushCurrent = (): void => {
      if (!current) {
        return;
      }

      tokens.push(this.createToken(current));
      current = '';
      canBeUnary = false;
    };

    for (let i = 0; i < expression.length; i++) {
      const char = expression[i];
      const next = expression[i + 1];

      if (char === ' ') {
        continue;
      }

      if (this.operators.includes(char)) {
        flushCurrent();

        if (options.unaryOperators && canBeUnary && char === '-') {
          tokens.push({ type: 'operator', value: 'u-' });
          canBeUnary = true;
          continue;
        }

        if (options.unaryOperators && canBeUnary && char === '+') {
          canBeUnary = true;
          continue;
        }

        tokens.push({ type: 'operator', value: char });
        canBeUnary = true;
        continue;
      }

      if (char === ',') {
        flushCurrent();
        tokens.push({ type: 'comma', value: ',' });
        canBeUnary = true;
        continue;
      }

      if (/[<>â©µâ‰ â‰¤â‰¥]/.test(char)) {
        flushCurrent();
        let op = char;
        if ((char === '<' || char === '>') && next === '=') {
          op += '=';
          i++;
        } else if (char === '=' && next === '=') {
          op = '==';
          i++;
        }
        tokens.push({ type: 'operator', value: op });
        canBeUnary = true;
        continue;
      }

      if (/[0-9.]/.test(char)) {
        if (current && /[a-zA-ZπÏ€]/.test(current[current.length - 1])) {
          flushCurrent();
          tokens.push({ type: 'operator', value: '*' });
          canBeUnary = true;
        }
        current += char;
        canBeUnary = false;
        continue;
      }

      if (/[a-zA-ZπÏ€]/.test(char)) {
        if (current && !isNaN(Number(current))) {
          flushCurrent();
          tokens.push({ type: 'operator', value: '*' });
          canBeUnary = true;
        }
        current += char;
        canBeUnary = false;
        continue;
      }

      if (char === '%') {
        flushCurrent();
        tokens.push({ type: 'function', value: '%' });
        canBeUnary = false;
        continue;
      }

      if (char === '(' || char === ')') {
        flushCurrent();
        tokens.push({ type: 'paren', value: char });
        canBeUnary = char === '(';
        continue;
      }
    }

    flushCurrent();

    const finalTokens: Token[] = [];
    for (let i = 0; i < tokens.length; i++) {
      finalTokens.push(tokens[i]);
      if (i < tokens.length - 1) {
        const cur = tokens[i];
        const next = tokens[i + 1];
        if (
          (cur.type === 'number' && (
            next.type === 'variable' ||
            next.type === 'function' ||
            (next.type === 'paren' && next.value === '(')
          )) ||
          (cur.type === 'variable' && (
            next.type === 'number' ||
            next.type === 'function' ||
            (next.type === 'paren' && next.value === '(')
          )) ||
          (cur.type === 'paren' && cur.value === ')' && (
            next.type === 'variable' ||
            next.type === 'number' ||
            (next.type === 'paren' && next.value === '(')
          ))
        ) {
          finalTokens.push({ type: 'operator', value: '*' });
        }
      }
    }

    return finalTokens;
  }

  private createToken(str: string): Token {
    if (!isNaN(Number(str))) {
      return { type: 'number', value: str };
    }
    if (this.piSymbols.includes(str)) {
      return { type: 'variable', value: 'π' };
    }

    if (this.functions.includes(str)) {
      return { type: 'function', value: str };
    }
    return { type: 'variable', value: str };
  }
}
