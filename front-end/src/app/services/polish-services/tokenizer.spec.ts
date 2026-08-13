import { Tokenizer } from './tokenizer';

describe('Tokenizer', () => {
  const tokenizer = new Tokenizer();

  it('keeps unary minus as a standalone operator token', () => {
    expect(tokenizer.tokenize('-x').map(token => token.value)).toEqual(['-', 'x']);
    expect(tokenizer.tokenize('-(-x)').map(token => token.value)).toEqual([
      '-',
      '(',
      '-',
      'x',
      ')',
    ]);
    expect(tokenizer.tokenize('2 * -x').map(token => token.value)).toEqual([
      '2',
      '*',
      '-',
      'x',
    ]);
    expect(tokenizer.tokenize('x + -y').map(token => token.value)).toEqual([
      'x',
      '+',
      '-',
      'y',
    ]);
  });

  it('can emit unary minus tokens for postfix evaluation', () => {
    expect(tokenizer.tokenize('-x', { unaryOperators: true }).map(token => token.value)).toEqual([
      'u-',
      'x',
    ]);
    expect(tokenizer.tokenize('2 * -3', { unaryOperators: true }).map(token => token.value)).toEqual([
      '2',
      '*',
      'u-',
      '3',
    ]);
  });

  it('recognizes sign as a function token', () => {
    expect(tokenizer.tokenize('sign(x)').map(token => token.value)).toEqual([
      'sign',
      '(',
      'x',
      ')',
    ]);
  });
});
