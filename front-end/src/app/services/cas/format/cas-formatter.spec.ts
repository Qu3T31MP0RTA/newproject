import {
  binaryNode,
  equationNode,
  functionCallNode,
  numberNode,
  symbolNode,
  unaryNode,
} from '../ast/cas-ast';
import { formatCasExpression } from './cas-formatter';

describe('formatCasExpression', () => {
  it('formats precedence with minimum parentheses', () => {
    expect(formatCasExpression(binaryNode('+', symbolNode('x'), numberNode(2)))).toBe('x + 2');
    expect(
      formatCasExpression(binaryNode('*', numberNode(2), symbolNode('x')))
    ).toBe('2 * x');
    expect(
      formatCasExpression(unaryNode('-', binaryNode('+', symbolNode('x'), numberNode(1))))
    ).toBe('-(x + 1)');
    expect(
      formatCasExpression(binaryNode('*', binaryNode('+', symbolNode('x'), numberNode(1)), numberNode(2)))
    ).toBe('(x + 1) * 2');
    expect(
      formatCasExpression(binaryNode('*', binaryNode('+', symbolNode('x'), numberNode(1)), binaryNode('+', symbolNode('y'), numberNode(2))))
    ).toBe('(x + 1) * (y + 2)');
    expect(
      formatCasExpression(binaryNode('/', numberNode(1), binaryNode('+', symbolNode('x'), numberNode(1))))
    ).toBe('1 / (x + 1)');
    expect(
      formatCasExpression(binaryNode('/', binaryNode('*', numberNode(2), symbolNode('x')), binaryNode('+', binaryNode('^', symbolNode('x'), numberNode(2)), numberNode(1))))
    ).toBe('2 * x / (x ^ 2 + 1)');
    expect(formatCasExpression(binaryNode('^', symbolNode('x'), numberNode(2)))).toBe('x ^ 2');
    expect(formatCasExpression(functionCallNode('sin', [symbolNode('x')]))).toBe('sin(x)');
    expect(formatCasExpression(functionCallNode('abs', [symbolNode('x')]))).toBe('abs(x)');
    expect(formatCasExpression(functionCallNode('sign', [symbolNode('x')]))).toBe('sign(x)');
    expect(formatCasExpression(equationNode(symbolNode('x'), numberNode(2)))).toBe('x = 2');
  });
});
