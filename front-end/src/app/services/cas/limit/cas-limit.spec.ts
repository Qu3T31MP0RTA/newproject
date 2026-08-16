import { CasParser } from '../parser/cas-parser';
import { formatCasExpression } from '../format/cas-formatter';
import { limitCasExpression, limitCasText } from './cas-limit';

describe('limitCasExpression', () => {
  const parser = new CasParser();

  function parse(source: string) {
    const parsed = parser.parse(source);
    expect(parsed.ok).withContext(source).toBeTrue();
    if (!parsed.ok) {
      throw new Error('failed to parse CAS source');
    }

    return parsed.value;
  }

  function expectLimitText(
    source: string,
    variable: string,
    point: string,
    expectedText: string,
    direction?: 'both' | 'left' | 'right'
  ): void {
    const limited = limitCasText(source, variable, point, parser, { direction });

    expect(limited.ok).withContext(source).toBeTrue();
    if (!limited.ok) return;

    expect(limited.value.text).withContext(source).toBe(expectedText);
    if (typeof limited.value.expression === 'string') {
      expect(limited.value.expression).withContext(source).toBe(expectedText);
    } else {
      expect(formatCasExpression(limited.value.expression)).withContext(source).toBe(expectedText);
    }
  }

  function expectUnsupported(
    source: string,
    variable: string,
    point: string,
    direction?: 'both' | 'left' | 'right'
  ): void {
    const limited = limitCasText(source, variable, point, parser, { direction });

    expect(limited.ok).withContext(source).toBeFalse();
    if (!limited.ok) {
      expect(limited.error.code).withContext(source).toBe('CAS_UNSUPPORTED_LIMIT');
    }
  }

  function expectLimitDoesNotExist(
    source: string,
    variable: string,
    point: string,
    direction?: 'both' | 'left' | 'right'
  ): void {
    const limited = limitCasText(source, variable, point, parser, { direction });

    expect(limited.ok).withContext(source).toBeTrue();
    if (!limited.ok) return;

    expect(limited.value.kind).toBe('does-not-exist');
    expect(limited.value.text).toBe('El límite no existe');
  }

  it('returns constants and independent expressions unchanged', () => {
    expectLimitText('5', 'x', '2', '5');
    expectLimitText('y', 'x', '2', 'y');
  });

  it('evaluates simple substitutions exactly', () => {
    expectLimitText('x^2', 'x', '2', '4');
    expectLimitText('1 / x', 'x', '2', '1 / 2');
    expectLimitText('sin(x)', 'x', '0', '0');
    expectLimitText('cos(x)', 'x', '0', '1');
    expectLimitText('exp(x)', 'x', '0', '1');
    expectLimitText('abs(x)', 'x', '0', '0');
    expectLimitText('ln(x)', 'x', '1', '0');
  });

  it('supports removable singularities with polynomial cancellation', () => {
    expectLimitText('(x^2 - 1) / (x - 1)', 'x', '1', '2');
    expectLimitText('(x^2 + 2 * x + 1) / (x + 1)', 'x', '-1', '0');
  });

  it('supports left and right limits near finite points', () => {
    expectLimitText('1 / x', 'x', '0', '-∞', 'left');
    expectLimitText('1 / x', 'x', '0', '+∞', 'right');
    expectLimitDoesNotExist('1 / x', 'x', '0');

    expectLimitText('sign(x)', 'x', '0', '-1', 'left');
    expectLimitText('sign(x)', 'x', '0', '1', 'right');
    expectLimitDoesNotExist('sign(x)', 'x', '0');

    expectLimitText('abs(x)', 'x', '0', '0', 'left');
    expectLimitText('abs(x)', 'x', '0', '0', 'right');
    expectLimitText('abs(x)', 'x', '0', '0');

    expectLimitText('1 / (x - 2)', 'x', '2', '-∞', 'left');
    expectLimitText('1 / (x - 2)', 'x', '2', '+∞', 'right');
    expectLimitDoesNotExist('1 / (x - 2)', 'x', '2');

    expectLimitText('1 / x^2', 'x', '0', '+∞', 'left');
    expectLimitText('1 / x^2', 'x', '0', '+∞', 'right');
    expectLimitText('1 / x^2', 'x', '0', '+∞');

    expectLimitText('ln(x)', 'x', '0', '-∞', 'right');
    expectUnsupported('ln(x)', 'x', '0', 'left');

    expectLimitText('sqrt(x)', 'x', '0', '0', 'right');
    expectUnsupported('sqrt(x)', 'x', '0', 'left');
  });

  it('supports infinite points', () => {
    expectLimitText('1 / x', 'x', 'inf', '0');
    expectLimitText('x', 'x', 'inf', '+∞');
    expectLimitText('x', 'x', '-inf', '-∞');
    expectLimitText('x^2', 'x', '-inf', '+∞');
    expectLimitText('(2 * x + 1) / (3 * x - 5)', 'x', 'inf', '2 / 3');
    expectLimitDoesNotExist('sin(x)', 'x', 'inf');
    expectLimitDoesNotExist('cos(x)', 'x', 'inf');
  });

  it('preserves symbolic parameters outside the limit variable', () => {
    const result = limitCasExpression(parse('x + y'), 'x', parse('2'));

    expect(result.ok).toBeTrue();
    if (!result.ok) return;

    expect(['2 + y', 'y + 2']).toContain(formatCasExpression(result.value.expression));
  });

  it('rejects unsupported or discontinuous cases', () => {
    expectUnsupported('sin(x) / x', 'x', '0');
    expectUnsupported('factorial(x)', 'x', '1');
  });

  it('rejects invalid variables and invalid directions', () => {
    const invalidVariable = limitCasExpression(parse('x^2'), '5', parse('2'));
    expect(invalidVariable.ok).toBeFalse();
    if (!invalidVariable.ok) {
      expect(invalidVariable.error.code).toBe('INVALID_VARIABLE');
    }

    const invalidDirection = limitCasText('x^2', 'x', '2', parser, {
      direction: 'sideways' as never,
    });
    expect(invalidDirection.ok).toBeFalse();
    if (!invalidDirection.ok) {
      expect(invalidDirection.error.code).toBe('INVALID_LIMIT_DIRECTION');
    }

    expectUnsupported('x^2', 'x', 'x');
  });
});


