# CAS.1 — Auditoría y diseño de la arquitectura CAS

Fecha: 2026-07-17
Repositorio: `front-end`

## 1. Resumen ejecutivo

La aplicación actual ya tiene una tubería matemática estable para cálculo numérico:

`texto → tokens → postfix → evaluación → normalización → estado de UI → historial/gráfica`

Lo importante para CAS es esto:

- hoy no existe un AST simbólico persistente de primer nivel;
- el motor actual está orientado a evaluación numérica;
- la UI consume el resultado, el error y algunas trazas, no el árbol sintáctico;
- el proyecto ya detecta variables `x` e `y` para la parte gráfica;
- el resultado normalizado y el mapeo de pasos ya son una base útil, pero no suficiente para álgebra simbólica.

CAS.1 no implementa álgebra simbólica. Esta fase deja el mapa técnico, los contratos sugeridos y el plan incremental para incorporarla sin romper el motor actual.

## 2. Flujo matemático real del proyecto

Los archivos clave son:

- `src/app/services/polish-services/tokenizer.ts`
- `src/app/services/polish-services/preprocess-module.ts`
- `src/app/services/polish-services/polish-notation-parser-service.ts`
- `src/app/services/polish-services/polish-evaluator.ts`
- `src/app/services/engine-services/polish-calculation-engine.ts`
- `src/app/services/calculator-state/calculator-facade.ts`
- `src/app/services/polish-services/result-normalizer.ts`
- `src/app/services/calculation/calculation-parser.ts`
- `src/app/services/mappers/calculation-mapper.ts`
- `src/app/services/polish-services/graph-variable-detector.ts`
- `src/app/services/TreeRendererService/tree-render.ts`
- `src/app/services/book-renderer-service/book-renderer.ts`
- `src/app/services/calculation-renderers/human-render/human-renderer.ts`

Flujo efectivo:

1. `CalculatorFacade` mantiene el estado de la calculadora y llama al motor.
2. `PolishCalculationEngine` normaliza la expresión con `PreprocessModule`.
3. `Tokenizer` convierte texto en tokens.
4. `parser.toPostFix()` transforma tokens a postfix.
5. `evaluator.evaluatePostFix()` evalúa el postfix y, si se pide, genera pasos.
6. `ResultNormalizer` convierte valores numéricos/complex a una forma estable.
7. `CalculatorFacade` publica resultado, error y estado a la UI.
8. `CalculationMapper` serializa/deserializa resultados y pasos para persistencia o restauración.
9. `CalculationParserService` reconstruye un IR de cálculo a partir de pasos ya evaluados para árbol/mapeo visual.
10. La gráfica usa `detectGraphVariables()` y los samplers específicos para `x`/`y`.

## 3. Inventario de representaciones matemáticas actuales

No hay un AST simbólico único. Hay varias representaciones parciales:

| Tipo | Forma real | Archivo | Uso actual | Utilidad para CAS | Cambios necesarios |
|---|---|---|---|---|---|
| `Token` | `{ type: 'number' | 'operator' | 'variable' | 'function' | 'paren' | 'comma'; value: string }` | `tokenizer.ts` | Entrada del parser | Alta | Reutilizable como base léxica |
| Postfix token stream | `Token[]` | `polish-notation-parser-service.ts` | Entrada del evaluador | Media | Sirve como paso intermedio, no como AST simbólico |
| `Step` | `{ type; name; operands; result; stackBefore?; stackAfter? }` | `polish-evaluator.ts` | Trazas de evaluación | Media | Útil para historial y render, no para CAS simbólico |
| `ValueNode` | `{ id; value; label? }` | `calculation-ir.ts` | IR derivado | Baja/Media | Sólo representa valores ya evaluados |
| `OperationNode` | `{ id; type; name; operands; result }` | `calculation-ir.ts` | IR derivado | Media | Sirve para árbol de evaluación, no para álgebra simbólica |
| `CalculationIR` | `Map` de valores + operaciones | `calculation-ir.ts` | Árbol/relación de pasos | Media | Útil como trazado, no como AST persistente |
| `NormalizedValue` | `real` / `complex` con `display` | `result-normalizer.ts` | Normalización de salida | Media | Base para codecs, no para CAS |
| `NormalizedStep` | pasos normalizados | `result-normalizer.ts` | UI / historial / workspace | Media | Útil para render, no para manipulación simbólica |
| `TreeNode` | `{ label; children }` | `TreeRendererService/tree-render.ts` | Árbol visual | Baja | Es una vista, no un modelo simbólico |

Conclusión: el proyecto ya tiene una tubería de evaluación y un IR de trazado, pero no un AST matemático simbólico reusable.

## 4. Arquitectura CAS propuesta

### Principio principal

Reutilizar el lexer y la precedencia ya existente, pero añadir una capa de AST inmutable para CAS. La idea no es tener dos parsers incompatibles, sino una sola entrada léxica y una sola comprensión de precedencia, con dos consumidores:

- evaluador numérico actual;
- motor CAS simbólico.

### Arquitectura recomendada

```text
Texto
  ↓
Tokenizer
  ↓
Parser común / constructor de AST
  ↓
Math AST inmutable
  ├─ Numeric Evaluator
  ├─ Symbolic Simplifier
  ├─ Symbolic Differentiator
  ├─ Symbolic Solver
  └─ Formatter
```

### AST simbólico recomendado

Propuesta de tipos base:

```ts
export type MathNode =
  | NumberNode
  | SymbolNode
  | UnaryNode
  | BinaryNode
  | FunctionCallNode
  | EquationNode
  | AssignmentNode
  | ListNode;
```

Nodos sugeridos:

- `NumberNode`: entero, decimal o racional.
- `SymbolNode`: variable o constante simbólica (`x`, `y`, `π`, `e`).
- `UnaryNode`: negación, factorial, etc.
- `BinaryNode`: suma, resta, producto, división, potencia, comparadores.
- `FunctionCallNode`: `sin(x)`, `log(x)`, `sqrt(x)`, etc.
- `EquationNode`: lado izquierdo y derecho para `=`.
- `AssignmentNode`: sólo si en el futuro se admite asignación simbólica.
- `ListNode`: para vectores/matrices si más adelante aparecen.

### Recomendación clave

El AST CAS debe ser:

- inmutable;
- serializable;
- independiente de Angular;
- independiente del display;
- independiente de la UI gráfica.

## 5. Separación numérico / simbólico

### Numérico

Se mantiene como está hoy:

- evaluación rápida;
- variables numéricas;
- resultados `number` o `Complex`;
- normalización de salida;
- trazas para historial y árboles.

### Simbólico

Debe trabajar con el AST CAS y no con `Step[]` ni con `CalculationIR`.

Las transformaciones simbólicas no deben:

- mutar el AST de entrada;
- depender de componentes Angular;
- llamar al display;
- depender de historial o gráficas.

### Recomendación práctica

- el evaluator numérico sigue siendo el camino principal para `=` y modo normal;
- CAS sólo entra cuando el usuario pida una operación simbólica (`simplify`, `factor`, `expand`, `diff`, `solve`);
- ambos caminos deben compartir tokenizer, precedencia y parte de la normalización léxica.

## 6. API pública propuesta

Sugerencia de servicio de dominio:

```ts
export interface CasEngine {
  simplify(expression: MathExpression): CasResult;
  expand(expression: MathExpression): CasResult;
  factor(expression: MathExpression): CasResult;
  differentiate(expression: MathExpression, variable: string): CasResult;
  solve(equation: MathExpression, variable: string): CasResult;
}
```

Resultado propuesto:

```ts
export type CasResult = CasSuccess | CasFailure;
```

`CasSuccess` debería incluir:

- AST resultante;
- texto plano;
- LaTeX si se necesita más adelante;
- indicador exacto/aproximado;
- metadata opcional de pasos.

`CasFailure` debería incluir:

- código estable;
- mensaje para usuario;
- detalle técnico opcional;
- posición o nodo relacionado si aplica.

No se recomienda lanzar excepciones para errores matemáticos esperables.

## 7. Números exactos

### Estado actual

Hoy el sistema trabaja con:

- `number`;
- `Complex` de `complex.js`.

No hay fracciones exactas persistentes como tipo de dominio.

### Recomendación para CAS

Introducir un tipo exacto interno para racionales:

```ts
interface Rational {
  numerator: bigint;
  denominator: bigint;
}
```

Y, si hace falta después, un tipo exacto compuesto:

- entero;
- racional;
- simbólico;
- complejo exacto (más adelante).

### Motivo

CAS necesita conservar exactitud en casos como:

- `1/3 + 1/6 -> 1/2`
- `2*x + 3*x -> 5*x`

### Decisión de alcance

En CAS.1 sólo se define el contrato y la estrategia. No conviene migrar toda la app a `bigint` ni cambiar el motor numérico actual.

## 8. Simplificación segura

### Reglas seguras

- `x + 0 -> x`
- `0 + x -> x`
- `x - 0 -> x`
- `x * 1 -> x`
- `1 * x -> x`
- `x * 0 -> 0`
- `0 * x -> 0`
- `x^1 -> x`
- `x^0 -> 1` con restricciones
- `-(-x) -> x`

### Reglas que requieren cuidado

- `0 / x -> 0` sólo si el dominio lo permite;
- `x / x -> 1` no debe asumirse sin condiciones;
- `sqrt(x^2) -> x` no es universal;
- `log(a*b) -> log(a)+log(b)` requiere supuestos.

### Orden recomendado

1. simplificación estructural;
2. constantes;
3. identidades neutras;
4. combinación de términos semejantes;
5. canonicalización;
6. reglas de dominio más restrictivas.

## 9. Canonicalización e igualdad

### Funciones propuestas

```ts
isStructurallyEqual(a, b)
isEquivalent(a, b)
```

### Recomendación

- `isStructurallyEqual`: pura, exacta, sin álgebra avanzada.
- `isEquivalent`: puede apoyarse en simplificación canónica y verificación numérica limitada, pero nunca como prueba matemática general.

### Canonicalización

Orden sugerido:

- constantes primero;
- variables después;
- potencias normalizadas;
- productos con factores ordenados;
- sumas con términos ordenados.

La salida debe ser estable para tests y para impresión.

## 10. Variables y supuestos

### Hoy

- el motor numérico acepta variables numéricas por opciones;
- la parte gráfica detecta `x` y `y` por tokenización;
- `CalculatorFacade` combina variables de gráfica si la app está en modo gráfico.

### CAS v1

Se recomienda trabajar en dominio real por defecto.

### Supuestos futuros

- variable libre;
- variable objetivo;
- real/complejo;
- restricciones de dominio.

No introducir assumptions completas en CAS.1.

## 11. Compatibilidad con la gráfica

La gráfica actual depende de:

- expresión original;
- variables detectadas;
- samplers 2D/3D;
- `GraphVariableDetectorService`.

### Requisito CAS

Todo resultado simbólico debe poder volver a texto aceptado por el parser actual, o al menos a una forma canónica compatible.

### Recomendación

- no tocar `GraphVariableDetectorService` en CAS.1;
- asegurar que el formateador CAS produce sintaxis que el tokenizer actual entienda;
- evitar nodos CAS que no se puedan serializar a una expresión del motor actual sin una etapa explícita de formateo.

## 12. Integración con UI e historial

### Display

La UI actual consume `CalculatorFacade.displayValue$` y `error$`.

### Historial y restauración

La restauración y el mapeo pasan por `CalculatorFacade` y por los mappers/result normalizers.

### Recomendación CAS

CAS no debe escribir directamente en componentes visuales. Debe exponer resultados por un servicio de dominio y luego la UI decidir cómo presentarlos.

## 13. Integración con gráficos

### Gráfica 2D/3D

La parte gráfica actual ya trabaja con expresiones y una detección simple de `x`/`y`.

### CAS debe respetar

- no modificar el motor gráfico ahora;
- no romper las trazas numéricas existentes;
- no introducir nodos desconocidos para los samplers.

### Escenario de salida

Un CAS puede devolver una expresión simplificada que luego la gráfica vuelva a consumir, por ejemplo:

`x + x -> 2*x`

## 14. Límites y seguridad

Recomendación de límites CAS:

```ts
interface CasLimits {
  maxDepth: number;
  maxNodes: number;
  maxIterations: number;
}
```

Límites útiles:

- profundidad máxima del AST;
- nodos máximos;
- iteraciones de simplificación;
- expansión máxima;
- protección contra ciclos o reglas no idempotentes.

La simplificación debe converger.

## 15. Catálogo inicial de errores CAS

Se recomienda este conjunto base:

- `UNSUPPORTED_EXPRESSION`
- `UNSUPPORTED_OPERATION`
- `INVALID_VARIABLE`
- `DOMAIN_RESTRICTION`
- `DIVISION_BY_ZERO`
- `TOO_COMPLEX`
- `ITERATION_LIMIT`
- `NO_SOLUTION`
- `INFINITE_SOLUTIONS`
- `NOT_IMPLEMENTED`

Estos códigos deberían ser estables y reutilizables por la UI.

## 16. Roadmap CAS.2–CAS.6

### CAS.2 — Simplificación básica

- identidades aditivas y multiplicativas;
- potencias triviales;
- flattening;
- combinación numérica segura;
- canonicalización mínima.

### CAS.3 — Polinomios

- términos semejantes;
- forma canónica;
- grado;
- expansión;
- factorización básica.

### CAS.4 — Derivación simbólica

- reglas por estructura;
- simplificación posterior;
- soporte para funciones elementales.

### CAS.5 — Resolución de ecuaciones

- lineales;
- cuadráticas;
- casos sin solución;
- identidades;
- verificación numérica.

### CAS.6 — Integración UI

- comandos;
- historial;
- pasos;
- resultados exactos;
- errores;
- accesibilidad;
- Inspector.

## 17. Riesgos principales

- no existe AST simbólico hoy, así que habrá trabajo de base;
- el IR de evaluación no debe confundirse con CAS;
- números repetidos y reconstrucción por valor pueden ser frágiles;
- los resultados exactos pueden entrar en tensión con el formato actual de `number`/`Complex`;
- el parser actual está diseñado para evaluación, no para manipulación simbólica completa;
- la UI y la gráfica consumen resultados ya resueltos, no expresiones CAS;
- la expansión simbólica puede disparar el tamaño de los árboles si no hay límites;
- introducir 3D/CAS a la vez sería demasiado arriesgado; conviene separar rutas de evolución.

## 18. Decisiones abiertas

1. ¿El AST CAS debe vivir en un paquete/servicio nuevo o junto al motor actual?
2. ¿Se adopta `Rational` interno desde la primera iteración CAS.2?
3. ¿Qué sintaxis exacta aceptará el parser para ecuaciones y comandos CAS?
4. ¿El formateador CAS deberá generar texto compatible con el motor actual en todos los casos?
5. ¿Se permitirá complejos en CAS v1 o se pospondrán?

## 19. Conclusión

La base actual es buena para cálculo numérico y trazado, pero no para álgebra simbólica completa. La forma más segura de avanzar es:

- reutilizar tokenizer, precedencia y parte del formateo;
- introducir un AST CAS inmutable;
- mantener el evaluador numérico intacto;
- separar claramente la capa simbólica de la UI y de la gráfica;
- comenzar con simplificación básica y exactitud racional limitada.

CAS.1 deja preparado ese camino sin cambiar el comportamiento existente.

## 20. CAS.2 implementado

La primera capa funcional ya creada vive en:

- `src/app/services/cas/ast/cas-ast.ts`
- `src/app/services/cas/errors/cas-errors.ts`
- `src/app/services/cas/limits/cas-limits.ts`
- `src/app/services/cas/result/cas-result.ts`
- `src/app/services/cas/parser/cas-parser.ts`
- `src/app/services/cas/format/cas-formatter.ts`
- `src/app/services/cas/simplify/cas-simplifier.ts`
- `src/app/services/cas/public-api.ts`

### Lo que hace hoy

- define un AST simbólico mínimo e inmutable;
- parsea texto a AST sin tocar el motor numérico;
- detecta ecuaciones de nivel superior con `=`;
- simplifica de forma segura:
  - identidades neutrales;
  - folding numérico básico;
  - flattening simple de sumas y productos;
  - reglas seguras de unarios, potencias y divisiones;
- formatea AST con paréntesis mínimos;
- expone un `DefaultCasEngine` puro de TypeScript;
- conserva errores tipados y límites de complejidad;
- no toca la UI ni integra comandos CAS en la calculadora.

### Lo que sigue pendiente

- combinar términos semejantes;
- expandir;
- factorizar;
- derivar;
- resolver ecuaciones;
- racionales exactos con `bigint`;
- integración con la UI;
- integración con el historial;
- integración con gráficos;
- simplificación avanzada dependiente de dominio.

## 21. CAS.3 implementado

La fase polinómica básica ya quedó implementada sobre la capa CAS existente.

### Estructura añadida

- `src/app/services/cas/polynomial/cas-polynomial.ts`
- `src/app/services/cas/operations/cas-operations.ts`

### Modelo polinómico

Se usa una representación inmutable de términos:

- `coefficient: number`
- `powers: Readonly<Record<string, number>>`

La clave canónica del monomio ordena las variables alfabéticamente y omite exponentes cero.

### Reglas implementadas

- reconocimiento de monomios y polinomios;
- combinación de términos semejantes;
- forma canónica determinista;
- grado total y grado por variable;
- coeficiente por patrón de potencias;
- expansión algebraica básica;
- factorización elemental segura.

### Ejemplos cubiertos

- `x + x -> 2 * x`
- `2 * x + 3 * x -> 5 * x`
- `x - x -> 0`
- `x * y + y * x -> 2 * x * y`
- `2 * (x + 3) -> 2 * x + 6`
- `(x + 1) * (x + 2) -> x ^ 2 + 3 * x + 2`
- `x ^ 2 - 1 -> (x - 1) * (x + 1)`
- `x ^ 2 + 2 * x + 1 -> (x + 1) ^ 2`

### Límites y decisiones conservadoras

- `number` sigue siendo el tipo numérico base;
- no se introducen racionales exactos;
- no se acepta `x ^ -1`;
- no se acepta `x ^ y`;
- no se acepta división por variable;
- no se implementa factorización general;
- no se implementa división polinómica general.

### CAS.4 implementado

- derivación simbólica básica sobre el AST CAS;
- regla de la cadena para funciones elementales soportadas;
- simplificación posterior tras derivar;
- canonicalización polinómica cuando aplica;
- validación de variables y límites CAS;
- salida de texto y `latex` compatibles con el formateador actual;
- sin integración UI todavía.

### Funciones soportadas en CAS.4

- constantes y símbolos;
- suma y resta;
- producto;
- cociente;
- potencia con exponente constante entero no negativo;
- `sin`, `cos`, `tan`;
- `ln` y `log` como logaritmo natural;
- `exp` y `expe`;
- `sqrt`.

### Decisiones conservadoras

- la regla general `u(x)^v(x)` permanece sin soporte;
- no se aceptan derivadas implícitas;
- no se exponen LaTeX ni comandos UI todavía;
- las funciones no reconocidas con dependencia en la variable devuelven error tipado;
- `pow(u, n)` sólo se acepta si `n` es un entero no negativo;
- las expresiones independientes de la variable derivan a `0` sin expandir reglas.

### Pendiente para CAS.5

- derivadas de orden superior como API propia;
- derivadas parciales y gradiente;
- regla general de potencias;
- simplificación trigonométrica avanzada;
- salida LaTeX dedicada;
- integración UI de comandos CAS.

### CAS.5 implementado

- resolución simbólica básica de ecuaciones sobre el AST CAS;
- normalización interna a `left - right = 0`;
- soporte para ecuaciones de grado 0, 1 y 2;
- diferenciación entre `none` e `infinite`;
- resultados finitos estructurados con AST, texto y LaTeX;
- deduplicación y orden determinista de soluciones;
- validación por sustitución cuando la solución es representable;
- rechazo tipado de ecuaciones no polinómicas o de grado superior;
- reutilización de simplificación, polinomios y validación de variables;
- sin cambios en UI, motor numérico, gráficos ni persistencia.

### CAS.6 implementado

La calculadora ya puede reconocer y ejecutar comandos CAS visibles a través de su API pública:

- `simplify(2*x + 3*x)`
- `expand((x + 1)^2)`
- `factor(x^2 - 1)`
- `diff(sin(x), x)`
- `differentiate(sin(x), x)`
- `solve(2*x + 4 = 0, x)`

#### Flujo de integración real

1. El usuario escribe un comando CAS en la calculadora.
2. `CalculatorFacade` detecta el comando antes de la evaluación numérica.
3. Un router de comandos reconoce la operación y delega sólo en `CasEngine`.
4. El resultado simbólico vuelve a la fachada como texto visible y como metadata estructurada.
5. `DisplayComponent` muestra el resultado sin romper el flujo numérico existente.
6. `HistoryService` conserva el comando, el resultado mostrado y la metadata CAS cuando existe.
7. `HistoryComponent` restaura el comando y, si está disponible, también su metadata CAS.

#### Resultados soportados

- resultados simbólicos de `simplify`, `expand`, `factor` y `differentiate`;
- resultados de `solve` con:
  - soluciones finitas;
  - infinitas soluciones;
  - sin solución;
- mensajes de error localizados para comandos inválidos o no soportados.

#### Limitaciones visibles

- se conserva el evaluador numérico actual para expresiones normales;
- `sin(1)` sigue siendo evaluación numérica;
- no hay inspector CAS dedicado todavía;
- no se cambia el motor numérico ni la gráfica;
- el historial conserva la información CAS de forma retrocompatible, pero sigue siendo legible para entradas antiguas.

## 22. CAS.UI.3 — UX final, documentación y descubribilidad

La interfaz CAS visible queda organizada por familias de uso:

- Álgebra: `simplify`, `expand`, `factor`, `solve`
- Cálculo: `diff` / `differentiate`, `integrate`, `limit`
- Series: `taylor`, `maclaurin`, `convergence`

Cada acción expone plantilla, sintaxis breve y ejemplo corto para acelerar el descubrimiento sin añadir comandos nuevos.

### Resultados visibles

- simbólicos: `2 * x`, `x ^ 3 / 3`, `ln(2)`
- soluciones: `x = -3`, `x = 3`
- sin solución: `Sin solución`
- infinitas soluciones: `Infinitas soluciones`
- límites: `+∞`, `-∞`, `El límite no existe`
- convergencia: `Radio de convergencia: 1`, `Intervalo: (-1, 1]`

### Limitaciones deliberadas

- no se introducen nuevas matemáticas;
- no se tocan `cas-solver.ts`, `cas-integrator.ts`, `cas-differentiator.ts`, `cas-limit.ts`, `cas-taylor.ts`, `cas-series-convergence.ts` ni `cas-simplifier.ts` salvo bug reproducible;
- `solve(sin(x)=0,x)`, `x*exp(x)=1` y otros casos fuera de alcance siguen reportándose como no soportados;
- la documentación sirve como ayuda breve, no como tutorial largo.
