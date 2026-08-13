import { CasParser } from './cas-parser';
import {
  binaryNode,
  equationNode,
  functionCallNode,
  numberNode,
  symbolNode,
  unaryNode,
} from '../ast/cas-ast';

describe('CasParser', () => {
  const parser = new CasParser();

  it('parses numbers, symbols and precedence', () => {
    expect(parser.parse('2 + 3 * x')).toEqual({
      ok: true,
      value: binaryNode(
        '+',
        numberNode(2),
        binaryNode('*', numberNode(3), symbolNode('x'))
      ),
    });
  });

  it('parses unary operators and parentheses', () => {
    expect(parser.parse('-(x + 1)')).toEqual({
      ok: true,
      value: unaryNode('-', binaryNode('+', symbolNode('x'), numberNode(1))),
    });
  });

  it('parses chained unary operators and unary terms after operators', () => {
    expect(parser.parse('-x')).toEqual({
      ok: true,
      value: unaryNode('-', symbolNode('x')),
    });

    expect(parser.parse('-(-x)')).toEqual({
      ok: true,
      value: unaryNode('-', unaryNode('-', symbolNode('x'))),
    });

    expect(parser.parse('2 * -x')).toEqual({
      ok: true,
      value: binaryNode('*', numberNode(2), unaryNode('-', symbolNode('x'))),
    });

    expect(parser.parse('x + -y')).toEqual({
      ok: true,
      value: binaryNode('+', symbolNode('x'), unaryNode('-', symbolNode('y'))),
    });
  });

  it('parses simple function calls', () => {
    expect(parser.parse('sin(x)')).toEqual({
      ok: true,
      value: functionCallNode('sin', [symbolNode('x')]),
    });

    expect(parser.parse('abs(x)')).toEqual({
      ok: true,
      value: functionCallNode('abs', [symbolNode('x')]),
    });

    expect(parser.parse('sign(x)')).toEqual({
      ok: true,
      value: functionCallNode('sign', [symbolNode('x')]),
    });
  });

  it('parses equations at top level', () => {
    expect(parser.parse('x = 2')).toEqual({
      ok: true,
      value: equationNode(symbolNode('x'), numberNode(2)),
    });
  });

  it('rejects empty input', () => {
    expect(parser.parse('   ')).toEqual({
      ok: false,
      error: jasmine.objectContaining({
        code: 'UNSUPPORTED_EXPRESSION',
      }),
    });
  });

  it('rejects malformed syntax', () => {
    expect(parser.parse('sin(x')).toEqual({
      ok: false,
      error: jasmine.objectContaining({
        code: 'UNSUPPORTED_EXPRESSION',
      }),
    });
  });

  it('rejects multiple top level equations', () => {
    expect(parser.parse('x = y = 2')).toEqual({
      ok: false,
      error: jasmine.objectContaining({
        code: 'UNSUPPORTED_EXPRESSION',
      }),
    });

    expect(parser.parse('x = (y = 2)')).toEqual({
      ok: false,
      error: jasmine.objectContaining({
        code: 'UNSUPPORTED_EXPRESSION',
      }),
    });
  });
});
