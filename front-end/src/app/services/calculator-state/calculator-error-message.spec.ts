import { CalculatorErrorMessageService } from './calculator-error-message';

describe('CalculatorErrorMessageService', () => {
  const service = new CalculatorErrorMessageService();

  it('maps CAS derivative errors to readable messages', () => {
    expect(
      service.getMessage({
        code: 'CAS_UNSUPPORTED_DERIVATIVE',
        message: 'La función foo no está soportada simbólicamente.',
        functionName: 'foo',
      })
    ).toBe('No se puede derivar la función "foo".');
  });

  it('maps command arity errors to readable messages', () => {
    expect(
      service.getMessage({
        code: 'CAS_COMMAND_ARITY_ERROR',
        message: 'raw',
      })
    ).toBe('Número incorrecto de argumentos.');
  });

  it('keeps a friendly fallback message for unknown errors', () => {
    expect(
      service.getMessage({
        code: 'WHATEVER',
        message: 'No se pudo procesar la expresión',
      })
    ).toBe('No se pudo procesar la expresión');
  });
});
