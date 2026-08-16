import { Injectable } from '@angular/core';

export interface CalculatorErrorLike {
  readonly code: string;
  readonly message: string;
  readonly functionName?: string;
}

@Injectable({ providedIn: 'root' })
export class CalculatorErrorMessageService {
  getMessage(error: CalculatorErrorLike): string {
    switch (error.code) {
      case 'CAS_COMMAND_ARITY_ERROR':
        return 'Número incorrecto de argumentos.';
      case 'CAS_COMMAND_SYNTAX_ERROR':
        return 'La sintaxis del comando CAS es inválida.';
      case 'CAS_COMMAND_UNSUPPORTED':
        return error.functionName
          ? `El comando CAS "${error.functionName}" no está soportado.`
          : 'El comando CAS no está soportado.';
      case 'INVALID_VARIABLE':
        return 'La variable de derivación no es válida.';
      case 'CAS_UNSUPPORTED_DERIVATIVE':
        return error.functionName
          ? `No se puede derivar la función "${error.functionName}".`
          : 'La función no admite derivación simbólica.';
      case 'CAS_UNSUPPORTED_INTEGRAL':
        return error.functionName
          ? `No se puede integrar simbólicamente la función "${error.functionName}" todavía.`
          : 'Esta integral todavía no está soportada.';
      case 'CAS_UNSUPPORTED_LIMIT':
        return 'Este límite todavía no está soportado.';
      case 'CAS_TAYLOR_DOMAIN_ERROR':
        return 'La serie no puede construirse en ese punto dentro del dominio real soportado.';
      case 'CAS_SERIES_DOMAIN_ERROR':
        return 'El centro de convergencia no puede depender de la variable.';
      case 'INVALID_TAYLOR_ORDER':
        return 'El orden de Taylor debe ser un entero no negativo.';
      case 'TAYLOR_ORDER_LIMIT':
        return 'El orden solicitado es demasiado alto.';
      case 'CAS_LIMIT_DOMAIN_ERROR':
        return 'El límite queda fuera del dominio real soportado.';
      case 'INVALID_LIMIT_DIRECTION':
        return 'La dirección del límite no es válida.';
      case 'UNSUPPORTED_EXPRESSION':
      case 'UNSUPPORTED_OPERATION':
        return 'No se pudo procesar la expresión.';
      case 'DIVISION_BY_ZERO':
        return 'No se puede dividir entre cero.';
      case 'TOO_COMPLEX':
        return 'La expresión supera el límite de complejidad.';
      case 'ITERATION_LIMIT':
        return 'La simplificación no convergió dentro del límite permitido.';
      default:
        return error.message;
    }
  }
}
