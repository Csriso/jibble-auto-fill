# Jibble Auto Fill

Rellena automáticamente las jornadas laborales que falten en Jibble, sin necesitar acceso de administrador a la API oficial.

*[English version](README.md)*

## Cómo funciona

Tu cuenta no tiene permisos de admin, así que no hay `client_id`/`client_secret` para el flujo OAuth2 `client_credentials`. La alternativa: iniciar sesión una vez con Playwright y capturar el **token de usuario** que la propia webapp de Jibble usa internamente — el mismo que verías en las herramientas de desarrollador del navegador. Con ese token, el resto del programa habla directamente con la API pública documentada de Jibble (`time-tracking.prod.jibble.io/v1/TimeEntries`, la misma que aparece en `docs.api.jibble.io`), sin depender de clicks ni de la estructura visual de la página.

Esto se confirmó auditando tu cuenta real (`npm run inspect`):

- La webapp llama exactamente al endpoint público `GET/POST /v1/TimeEntries` documentado, autenticada con un token de usuario normal (rol `Member`, no admin).
- Tu cuenta ya tenía un fichaje con `isManual: true` cuyo `belongsToDate` es de mucho antes que su `createdAt` — prueba directa de que Jibble permite crear fichajes con fecha pasada sin ser admin.

Por eso `fill`, tras crear cada fichaje, vuelve a leer ese día en Jibble para comprobar que quedó con la fecha/hora esperada. Si no es así, **detiene todo el proceso** de inmediato en vez de seguir creando registros potencialmente incorrectos.

## Requisitos

- Node.js 18.17 o superior.
- Tu email y contraseña normales de Jibble (login sin 2FA).

## 1. Instalar dependencias

```bash
npm install
```

Descarga también Chromium para Playwright (`postinstall`), usado solo para el login y para capturar el token de sesión (siempre en segundo plano, sin ventana, salvo en `npm run login`/`npm run inspect`).

## 2. Configurar `.env`

```bash
cp .env.example .env
```

```env
JIBBLE_EMAIL=tu-email@empresa.com
JIBBLE_PASSWORD=tu-contraseña
TIMEZONE=Europe/Madrid
```

No hace falta indicar tu `personId`: se obtiene automáticamente del token de tu sesión.

## 3. Iniciar sesión (una vez)

```bash
npm run login
```

Abre una ventana de Chromium e intenta rellenar el login automáticamente. Si no encaja con tu pantalla, termínalo tú mismo en esa misma ventana — el script espera hasta 5 minutos y guarda la sesión (`.auth/state.json`) en cuanto detecta que ya no estás en la pantalla de login.

A partir de aquí, `dry-run`/`fill`/`verify`/`gaps` no vuelven a abrir ventana: reutilizan esa sesión guardada para capturar un token nuevo (headless, un par de segundos) cada vez que el anterior caduca (dura ~16h, se cachea en `.auth/token.json`).

Si en algún momento los comandos fallan con un error de autenticación, repite `npm run login` (la sesión guardada puede caducar tras varias semanas de inactividad).

## 4. Horario configurable

Por defecto el horario es turno partido: entrada 08:00, comida 12:00–14:00, salida 18:00 (8h trabajadas, 10h de presencia). Se configura en `.env`:

```env
WORK_START_TIME=08:00
WORK_END_TIME=18:00
BREAK_START_TIME=12:00
BREAK_END_TIME=14:00
```

- **Turno partido** (con descanso, 4 marcaciones In/Out/In/Out): rellena las 4 variables.
- **Turno único** (sin descanso, 2 marcaciones In/Out): deja `BREAK_START_TIME` y `BREAK_END_TIME` **ambas vacías**. No se admite dejar solo una vacía — o las dos rellenas, o las dos vacías.
- Formato siempre `HH:MM`, 24 horas. El programa valida que `WORK_START_TIME < BREAK_START_TIME < BREAK_END_TIME < WORK_END_TIME` (o `WORK_START_TIME < WORK_END_TIME` en turno único) y falla con un mensaje claro si no se cumple.

**¿Y si necesitas 3 o más tramos** (p. ej. mañana/tarde/noche, o dos descansos)? Eso no cabe en 4 variables de entorno, así que es un ajuste de código: edita el array `PUNCH_SCHEDULE` en [src/services/schedule.ts](src/services/schedule.ts). Es una lista de `{ type: "In"|"Out", hour, minute }` sin límite de longitud — el resto del programa (detección de huecos, tolerancia, creación) funciona igual para cualquier número de tramos, siempre que alternen In/Out en orden cronológico.

Esto afecta a `dry-run`, `fill`, `verify` y `gaps` por igual — todos usan el mismo horario configurado.

## 5. Festivos

Antes de calcular qué días hay que rellenar, el programa consulta `GET /v1/PersonHolidays`: el calendario de festivos que tu organización ya tiene configurado en Jibble (en tu caso, festivos nacionales de España: Año Nuevo, Epifanía, Viernes Santo, Asunción, Fiesta Nacional, Inmaculada, Navidad...). No hace falta configurar nada — se excluyen automáticamente igual que los fines de semana, tanto al autodetectar `START_DATE` como al generar la lista de días a rellenar. Si un festivo cae en fin de semana no cambia nada (ya estaba excluido).

## 6. Dry-run

```bash
npm run dry-run
```

No realiza ningún `POST`. Solo analiza y muestra qué se crearía.

### Ejemplo de salida

```
Jibble Auto Fill
────────────────────────────
Periodo analizado: 2026-08-03 → 2026-08-18
Zona horaria: Europe/Madrid

Días laborables analizados: 12
Días completos: 8
Días incompletos: 1
Días sin registros: 3
Días irregulares (no se tocan): 0

Registros a crear: 13

Detalle de registros que se crearían:
  2026-08-11 [missing]
    - In 08:00
    - Out 12:00
    - In 14:00
    - Out 18:00
  2026-08-12 [incomplete]
    - Out 18:00

Modo DRY RUN: no se ha realizado ningún POST. Ejecuta 'npm run fill' para aplicar los cambios.
```

## 7. Rellenar de verdad

```bash
npm run fill
```

Crea únicamente los fichajes que faltan, día por día. Tras cada día, relee ese día en Jibble para confirmar que quedó como se esperaba; si no, se detiene con un error explícito. Es seguro reejecutarlo: los días ya completos se detectan y se saltan (idempotente — puedes ejecutarlo repetidamente sin duplicar nada).

Recomendación: la primera vez, acota `START_DATE`/`END_DATE` en `.env` a un solo día o una semana pasada y revisa a mano en Jibble (Timesheets) que quedó bien antes de lanzarlo sobre todo el periodo.

### Pausa entre creaciones (429 Too Many Requests)

```env
CREATE_DELAY_MS=200
```

Si al rellenar muchos días ves en los logs bastantes avisos de `429 Too Many Requests` (el cliente reintenta solo respetando `Retry-After`, pero cada reintento tarda más), sube `CREATE_DELAY_MS` — es una pausa fija en milisegundos después de cada fichaje creado, antes de crear el siguiente. `0` = sin pausa (por defecto). Valores típicos: `150`–`300`.

## 8. Verificar

```bash
npm run verify
```

Vuelve a consultar Jibble y confirma que cada día laborable (dentro de `START_DATE`/`END_DATE`) tiene sus marcaciones completas. Código de salida distinto de 0 si queda alguna discrepancia.

## 9. Auditoría de huecos completa

```bash
npm run gaps
```

Distinto de `verify`: en vez de mirar solo el rango de `START_DATE`/`END_DATE` de `.env`, busca la fecha del fichaje **más antiguo** que tengas en Jibble (hasta 5 años atrás) y audita **todos** los días laborables no festivos desde esa fecha hasta hoy, listando cualquiera que no esté completo — falte del todo, esté a medias, o tenga marcaciones que no encajan en el horario estándar (`irregular`, revisión manual). Útil para tener una foto completa de qué queda por revisar en toda tu cuenta, no solo en el rango que estés rellenando ahora.

## 10. Interpretar los logs

Los logs de reintentos/errores se imprimen como JSON de una línea: `{"ts": "...", "level": "info|warn|error", "message": "..."}`. Ni la contraseña ni el token de acceso se escriben nunca en logs.

Clasificación de cada día en los reportes (`dry-run`, `fill`, `verify`, `gaps`):

- `complete`: todas las marcaciones del horario configurado existen (dentro de ±90 min de su hora estándar). No se toca.
- `incomplete`: faltan una o varias; se crean solo las que faltan.
- `missing`: no hay ningún registro ese día; se crean todas.
- `irregular`: hay registros que no encajan en el patrón estándar (p. ej. una marcación a una hora muy distinta, o fichajes reales de antes de usar esta herramienta con otro horario). No se crea ni modifica nada ese día — revisión manual.

## 11. Detener el proceso ante un error

`npm run fill` procesa los días en orden cronológico y se detiene en el primer error (red agotada, 401/403 → sesión caducada, verificación fallida, etc.), sin continuar con los días siguientes. Para reintentar, vuelve a ejecutar `npm run fill`: los días ya completados no se tocan.

## 12. Herramienta de diagnóstico opcional

```bash
npm run inspect
```

Navega a Timesheets con tu sesión guardada y vuelca a `.auth/` todas las respuestas JSON de red, el texto visible y el HTML completo. Útil solo si algo deja de funcionar y quieres ver qué está devolviendo Jibble realmente. **Contiene tu token de acceso y datos personales** — no lo compartas fuera de este equipo, y no lo subas a ningún repositorio (ya está en `.gitignore`).

## 13. Limitaciones conocidas

- El token de sesión capturado dura lo que dure la sesión de login (~16h de token, semanas de cookie); si caduca del todo, repite `npm run login`.
- Un día con marcaciones que no siguen el patrón estándar se marca `irregular` y no se toca automáticamente (incluye días con tu horario real de antes de usar esta herramienta, si no coincide con `WORK_START_TIME`/etc.).
- La autodetección de `START_DATE` (cuando se deja vacío) busca hacia atrás como máximo 180 días buscando el último día completo; `npm run gaps` en cambio mira hasta 5 años atrás para encontrar la primera fecha con fichajes.
- Esta automatización puede entrar en conflicto con los Términos de Servicio de Jibble si no está explícitamente permitida por tu organización; es responsabilidad tuya confirmar que el uso que le das (rellenar tu propia jornada realmente trabajada) es aceptable.

## Estructura del proyecto

```
jibble-auto-fill/
├── src/
│   ├── api/
│   │   ├── auth.ts           Token de sesión (vía navegador) + personId
│   │   ├── jibble.ts         Cliente HTTP: reintentos, backoff, 429/401/403/400/5xx
│   │   ├── timeEntries.ts    GET/POST TimeEntries (API pública documentada)
│   │   └── holidays.ts       GET PersonHolidays (calendario de festivos de la organización)
│   ├── browser/
│   │   ├── session.ts        Login persistente (storageState) con Playwright
│   │   └── tokenCapture.ts   Captura el token de usuario de una sesión ya logueada
│   ├── services/
│   │   ├── schedule.ts             Horario configurable (WORK_*/BREAK_* + tolerancia)
│   │   ├── timezone.ts             Helpers Europe/Madrid con Luxon (DST-safe)
│   │   ├── attendanceAnalyzer.ts   Clasificación de días y resumen
│   │   ├── attendanceFiller.ts     Creación con verificación post-escritura + CREATE_DELAY_MS
│   │   └── gapReport.ts            Auditoría completa desde la primera fecha con fichajes
│   ├── cli/
│   │   ├── login.ts
│   │   ├── inspect.ts        (diagnóstico opcional)
│   │   ├── dryRun.ts
│   │   ├── fill.ts
│   │   ├── verify.ts
│   │   └── gaps.ts
│   └── config.ts             Contexto compartido (token, personId, festivos, rango de fechas)
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```
