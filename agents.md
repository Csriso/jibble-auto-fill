# Objetivo

Desarrolla un script completo para automatizar el registro de jornadas laborales faltantes en Jibble utilizando exclusivamente la API oficial de Jibble:

https://docs.api.jibble.io/

El script debe completar automáticamente todas las jornadas laborales que falten desde la primera semana sin registros hasta **hoy (fecha de ejecución)**.

## Horario laboral

Utiliza siempre la zona horaria:

`Europe/Madrid`

Horario estándar de lunes a viernes:

- Entrada: `08:00`
- Inicio descanso comida: `12:00`
- Fin descanso comida: `14:00`
- Salida: `18:00`

Por tanto, cada día trabajado debe representar:

- 08:00 → 12:00 = 4 horas
- 12:00 → 14:00 = descanso
- 14:00 → 18:00 = 4 horas
- Total trabajado: 8 horas
- Presencia total: 10 horas

No generar registros para sábados ni domingos.

## Comportamiento requerido

El script debe ser seguro e idempotente.

Antes de crear cualquier registro:

1. Autenticarse contra Jibble mediante OAuth 2.0.
2. Obtener el `personId` correspondiente al usuario actual.
3. Consultar los `TimeEntries` existentes.
4. Analizar las jornadas existentes por fecha.
5. Detectar qué días laborables están completos, incompletos o ausentes.
6. Crear únicamente los registros que realmente falten.

Nunca crear duplicados.

Si un día ya contiene registros válidos, no modificarlo.

Si un día tiene solamente una parte de la jornada, analizar exactamente qué falta antes de crear nuevos registros.

## Registros que debe crear

Para una jornada completamente ausente:

### 08:00

Crear:

```json
{
	"personId": "<PERSON_ID>",
	"type": "In",
	"clientType": "Web",
	"platform": {
		"clientVersion": "jibble-auto-fill",
		"os": "Windows",
		"deviceModel": "Automation",
		"deviceName": "Jibble Auto Fill"
	}
}
```

### 12:00

Crear:

```json
{
	"personId": "<PERSON_ID>",
	"type": "Out",
	"clientType": "Web",
	"platform": {
		"clientVersion": "jibble-auto-fill",
		"os": "Windows",
		"deviceModel": "Automation",
		"deviceName": "Jibble Auto Fill"
	}
}
```

### 14:00

Crear:

```json
{
	"personId": "<PERSON_ID>",
	"type": "In",
	"clientType": "Web",
	"platform": {
		"clientVersion": "jibble-auto-fill",
		"os": "Windows",
		"deviceModel": "Automation",
		"deviceName": "Jibble Auto Fill"
	}
}
```

### 18:00

Crear:

```json
{
	"personId": "<PERSON_ID>",
	"type": "Out",
	"clientType": "Web",
	"platform": {
		"clientVersion": "jibble-auto-fill",
		"os": "Windows",
		"deviceModel": "Automation",
		"deviceName": "Jibble Auto Fill"
	}
}
```

Sin embargo, verifica primero en la documentación de Jibble si el endpoint permite especificar directamente la fecha/hora histórica del `TimeEntry`. Si la API no permite introducir timestamps históricos mediante este endpoint, NO intentes falsificar la fecha mediante campos no documentados.

En ese caso:

- Identifica el endpoint oficial apropiado para introducir registros históricos.
- Si no existe, detén el proceso y explica claramente la limitación.
- No utilices endpoints internos de la aplicación web.
- No manipules directamente la base de datos.
- No falsifiques headers, cookies ni requests internos.

## Consulta de registros

Utiliza el endpoint oficial:

`GET /v1/TimeEntries`

y filtra por:

- `personId`
- rango de fechas
- `status ne 'Archived'`

Aprovecha OData `$filter`, `$select`, `$orderby`, `$skip` y `$top` cuando corresponda.

La API documenta, por ejemplo, filtros mediante `belongsToDate`, y permite obtener `type`, `time`, `localTime`, `belongsToDate`, `personId`, etc.

## Detección de jornadas

Construye una estructura interna similar a:

```text
2026-08-17
  08:00 IN   ✓
  12:00 OUT  ✓
  14:00 IN   ✓
  18:00 OUT  ✓

2026-08-18
  08:00 IN   ✗
  12:00 OUT  ✗
  14:00 IN   ✗
  18:00 OUT  ✗
```

Y genera un resumen antes de realizar cambios:

```text
Jibble Auto Fill
────────────────────────────
Periodo analizado: YYYY-MM-DD → YYYY-MM-DD
Zona horaria: Europe/Madrid

Días laborables analizados: XX
Días completos: XX
Días incompletos: XX
Días sin registros: XX

Registros a crear: XX
```

## Modo DRY RUN

Implementa obligatoriamente:

```bash
npm run dry-run
```

que solamente analice los datos y muestre qué registros se crearían.

No debe realizar ningún `POST`.

Después:

```bash
npm run fill
```

debe realizar realmente las modificaciones.

Añade también:

```bash
npm run verify
```

para volver a consultar Jibble y comprobar que los registros esperados existen.

## Seguridad

Nunca hardcodees:

- `client_id`
- `client_secret`
- access tokens
- person IDs

Utiliza `.env`:

```env
JIBBLE_CLIENT_ID=
JIBBLE_CLIENT_SECRET=
JIBBLE_PERSON_ID=
JIBBLE_BASE_URL=
TIMEZONE=Europe/Madrid
```

El `client_secret` nunca debe aparecer en logs.

El access token tampoco.

## Autenticación

Implementa OAuth 2.0 utilizando el endpoint oficial de Jibble:

`https://identity.prod.jibble.io/connect/token`

con:

```text
grant_type=client_credentials
client_id=<CLIENT_ID>
client_secret=<CLIENT_SECRET>
```

y utiliza posteriormente:

```http
Authorization: Bearer <ACCESS_TOKEN>
```

Cachea el token durante su periodo de validez y evita solicitar uno nuevo para cada request.

## Control de errores

Implementa:

- retries para errores temporales
- exponential backoff
- gestión de HTTP 429
- gestión de 401/403
- gestión de 400
- gestión de 500
- timeout de requests
- logging estructurado

Si Jibble devuelve `429 Too Many Requests`, respeta `Retry-After` si está disponible.

Nunca continúes creando registros si la API devuelve respuestas ambiguas.

## Prevención de duplicados

Antes de cada creación:

1. Comprobar si existe un registro equivalente.
2. Si existe, no crearlo.
3. Si existe un registro parcialmente incorrecto, no modificarlo automáticamente.
4. Informar del problema en el resultado.

El script debe poder ejecutarse 10 veces consecutivas sin crear registros duplicados.

## Fechas

La fecha final debe ser automáticamente la fecha actual de ejecución en `Europe/Madrid`.

No utilizar UTC directamente para determinar el día.

Ejemplo:

```javascript
new Date();
```

debe convertirse correctamente a:

```text
Europe/Madrid
```

antes de determinar la fecha laboral.

El script debe funcionar correctamente durante cambios de horario de verano/invierno.

## Rango inicial

Permite configurar opcionalmente:

```env
START_DATE=
END_DATE=
```

Si `START_DATE` está vacío:

- detectar automáticamente el primer día que necesite registros.

Si `END_DATE` está vacío:

- utilizar hoy.

Si se especifican ambas:

- utilizar exactamente ese rango.

## Restricción importante

No rellenar automáticamente días futuros.

No rellenar sábados ni domingos.

No crear jornadas en días donde Jibble ya tenga una jornada completa.

No borrar registros existentes.

No modificar registros existentes salvo que se añada explícitamente un modo de reparación separado.

## Arquitectura

Utiliza Node.js moderno y TypeScript.

Estructura recomendada:

```text
jibble-auto-fill/
├── src/
│   ├── api/
│   │   ├── auth.ts
│   │   ├── jibble.ts
│   │   └── timeEntries.ts
│   ├── services/
│   │   ├── attendanceAnalyzer.ts
│   │   ├── attendanceFiller.ts
│   │   └── timezone.ts
│   ├── cli/
│   │   ├── dryRun.ts
│   │   ├── fill.ts
│   │   └── verify.ts
│   └── index.ts
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

Utiliza una librería robusta para trabajar con zonas horarias, por ejemplo:

```text
luxon
```

o una alternativa equivalente.

## README

Genera un README completo explicando:

1. Cómo crear las credenciales OAuth de Jibble.
2. Cómo configurar `.env`.
3. Cómo obtener el `personId`.
4. Cómo instalar dependencias.
5. Cómo ejecutar `dry-run`.
6. Cómo ejecutar el rellenado real.
7. Cómo verificar los resultados.
8. Cómo interpretar los logs.
9. Cómo detener el proceso si aparece un error.
10. Qué limitaciones tiene la API respecto a introducir registros históricos.

## Resultado final

Quiero que entregues:

1. El proyecto completo.
2. Todos los archivos necesarios.
3. `package.json`.
4. Código TypeScript funcional.
5. `.env.example`.
6. README.
7. Comandos de instalación.
8. Comandos de ejecución.
9. Ejemplo de salida del `dry-run`.

Antes de implementar el método de creación, revisa específicamente la documentación actual de Jibble y confirma cuál es el mecanismo oficial para crear **TimeEntries históricos**.

No inventes endpoints ni parámetros que no aparezcan documentados en la API oficial.

Prioridad:

**Seguridad > no duplicar registros > respetar zona horaria > detectar correctamente días incompletos > crear registros.**
