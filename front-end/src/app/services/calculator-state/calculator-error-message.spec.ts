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

  it('maps CAS integral errors to readable messages', () => {
    expect(
      service.getMessage({
        code: 'CAS_UNSUPPORTED_INTEGRAL',
        message: 'La función factorial no está soportada simbólicamente en integrales.',
        functionName: 'factorial',
      })
    ).toBe('No se puede integrar simbólicamente la función "factorial" todavía.');
  });

  it('maps CAS limit errors to readable messages', () => {
    expect(
      service.getMessage({
        code: 'CAS_UNSUPPORTED_LIMIT',
        message: 'raw',
      })
    ).toBe('Este límite todavía no está soportado.');

    expect(
      service.getMessage({
        code: 'CAS_LIMIT_DOMAIN_ERROR',
        message: 'raw',
      })
    ).toBe('El límite queda fuera del dominio real soportado.');

    expect(
      service.getMessage({
        code: 'INVALID_LIMIT_DIRECTION',
        message: 'raw',
      })
    ).toBe('La dirección del límite no es válida.');
  });

  it('maps Taylor errors to readable messages', () => {
    expect(
      service.getMessage({
        code: 'CAS_TAYLOR_DOMAIN_ERROR',
        message: 'raw',
      })
    ).toBe('La serie no puede construirse en ese punto dentro del dominio real soportado.');

    expect(
      service.getMessage({
        code: 'INVALID_TAYLOR_ORDER',
        message: 'raw',
      })
    ).toBe('El orden de Taylor debe ser un entero no negativo.');

    expect(
      service.getMessage({
        code: 'TAYLOR_ORDER_LIMIT',
        message: 'raw',
      })
    ).toBe('El orden solicitado es demasiado alto.');
  });

  it('maps CAS series convergence errors to readable messages', () => {
    expect(
      service.getMessage({
        code: 'CAS_SERIES_DOMAIN_ERROR',
        message: 'raw',
      })
    ).toBe('El centro de convergencia no puede depender de la variable.');
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
