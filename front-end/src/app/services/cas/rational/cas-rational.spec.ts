import { numberNode, symbolNode } from '../ast/cas-ast';
import { formatCasExpression } from '../format/cas-formatter';
import { buildExactDivision, reduceExactRationalExpression } from './cas-rational';
import { expectExactFraction } from '../testing/cas-test-helpers';

describe('cas-rational', () => {
  describe('normalization', () => {
    it('reduces exact rational numbers without decimals', () => {
      const cases: Array<[number, number, string]> = [
        [1, 2, '1 / 2'],
        [2, 4, '1 / 2'],
        [10, 15, '2 / 3'],
        [-2, 4, '-1 / 2'],
        [2, -4, '-1 / 2'],
        [-2, -4, '1 / 2'],
        [0, 5, '0'],
        [6, 3, '2'],
      ];

      for (const [numerator, denominator, expected] of cases) {
        const result = reduceExactRationalExpression(numerator, denominator);
        expect(formatCasExpression(result)).withContext(`${numerator}/${denominator}`).toBe(
          expected
        );
      }
    });
  });

  describe('sign normalization', () => {
    it('keeps negative denominators normalized', () => {
      expect(formatCasExpression(buildExactDivision(symbolNode('x'), -2))).toBe('-x / 2');
      expect(formatCasExpression(buildExactDivision(numberNode(1), -2))).toBe('-1 / 2');
    });
  });

  describe('exact AST division', () => {
    it('builds exact symbolic divisions without decimal leakage', () => {
      const expression = buildExactDivision(symbolNode('x'), 2);
      expect(formatCasExpression(expression)).toBe('x / 2');
    });

    it('keeps numeric numerators exact when building symbolic divisions', () => {
      const expression = buildExactDivision(numberNode(3), 4);
      expect(formatCasExpression(expression)).toBe('3 / 4');
    });
  });

  describe('round-trip', () => {
    it('round-trips exact rational text through parser and formatter', () => {
      for (const source of ['x ^ 2 / 2', 'x ^ 3 / 3', '-1 / 2', '2 * x / 3']) {
        expectExactFraction(source, source);
      }
    });
  });
});
