# Reclutamiento de Personal — CC0174

Digitalización del proceso de postulación de JJC Contratistas Generales. Reemplaza la recepción de currículums por correo con un formulario web, y entrega a Recursos Humanos un panel donde filtra postulantes, abre los CV y exporta todo a Excel.

Incluye un puente seguro hacia un servicio autorizado de verificación de identidad: el postulante escribe su DNI y sus nombres se completan solos.

> **Sobre RENIEC:** este proyecto no asume la existencia de un endpoint público. La consulta se hace contra un proveedor debidamente autorizado, cuyo token vive en una variable de entorno del servidor y nunca llega al navegador. El convenio oficial de RENIEC es una alternativa que no cambia el contrato de la API, solo la función que llama al proveedor.

---

## Índice

- [1. Qué hace](#1-qué-hace)
- [2. Arquitectura](#2-arquitectura)
- [3. Estructura del proyecto](#3-estructura-del-proyecto)
- [4. Endpoints](#4-endpoints)
- [5. Consulta de DNI](#5-consulta-de-dni)
- [6. Ubigeo](#6-ubigeo)
- [7. Errores](#7-errores)
- [8. Autenticación](#8-autenticación)
- [9. Seguridad](#9-seguridad)
- [10. Control de caudal](#10-control-de-caudal)
- [11. Protección de datos personales](#11-protección-de-datos-personales)
- [12. Variables de entorno](#12-variables-de-entorno)
- [13. Instalación](#13-instalación)
- [14. Base de datos](#14-base-de-datos)
- [15. Exportación a Excel](#15-exportación-a-excel)
- [16. Pendientes](#16-pendientes)

---

## 1. Qué hace

**Para el postulante** — una página pública donde completa sus datos, elige el puesto y adjunta su CV en PDF. Al enviar recibe un código correlativo (`POST-00001`) con el que RR.HH. puede ubicar su expediente.

**Para Recursos Humanos** — un panel con usuario y contraseña donde ve todas las postulaciones, filtra por puesto, estado y fechas, abre cada CV, cambia el estado del proceso y descarga un Excel con los filtros aplicados.

Nadie necesita cuenta de Vercel ni de Neon. Son dos direcciones web.

---

## 2. Arquitectura

```text
┌──────────────────────────────┐
│     POSTULANTE / RR.HH.      │
└──────────────┬───────────────┘
               │ HTTPS
               ▼
┌──────────────────────────────┐
│   index.html / panel.html    │
│   Sin credenciales           │
└──────────────┬───────────────┘
               │ fetch
               ▼
┌──────────────────────────────┐
│   FUNCIONES EN /api          │
│                              │
│   Validación                 │
│   Sesión y permisos          │
│   Control de caudal          │
│   Credenciales               │
└───┬──────────┬───────────┬───┘
    │          │           │
    ▼          ▼           ▼
┌────────┐ ┌────────┐ ┌──────────────┐
│  NEON  │ │ VERCEL │ │  PROVEEDOR   │
│Postgres│ │  BLOB  │ │  AUTORIZADO  │
│        │ │  (CV)  │ │      │       │
└────────┘ └────────┘ └──────┼───────┘
                             ▼
                          RENIEC
```

**Principio fundamental:** el navegador nunca habla con el proveedor de identidad ni con la base de datos. Las funciones de `/api` son el único puente, y son quienes guardan las credenciales.

---

## 3. Estructura del proyecto

```text
reclutamiento-personal/
│
├── index.html                 Formulario público
├── panel.html                 Panel de RR.HH.
├── ubigeo.json                Catálogo INEI de distritos
├── package.json
├── neon-reclutamiento.sql     Esquema de la base
│
├── lib/
│   ├── db.mjs                 Conexión a Neon
│   └── sesion.mjs             Contraseñas y cookies firmadas
│
└── api/
    ├── dni.mjs                Consulta de identidad
    ├── puestos.mjs            Catálogo de vacantes
    ├── subir-cv.mjs           Autorización de subida
    ├── postular.mjs           Registro de postulación
    ├── ingresar.mjs           Inicio de sesión
    ├── salir.mjs              Cierre de sesión
    ├── crear-usuario.mjs      Alta de cuentas
    ├── postulantes.mjs        Listado y cambio de estado
    └── exportar.mjs           Generación del Excel
```

Vercel convierte en función cada archivo de `api/`. Las extensiones `.mjs` son obligatorias porque el código usa módulos ES.

---

## 4. Endpoints

| Método | Ruta | Sesión | Qué hace |
| --- | --- | --- | --- |
| GET | `/api/dni?numero=` | No | Consulta identidad por DNI |
| GET | `/api/puestos` | No | Lista los puestos abiertos |
| POST | `/api/subir-cv` | No | Autoriza la subida del PDF |
| POST | `/api/postular` | No | Registra la postulación |
| POST | `/api/ingresar` | No | Inicia sesión de RR.HH. |
| GET | `/api/ingresar` | — | Devuelve la sesión activa |
| POST | `/api/salir` | — | Cierra la sesión |
| POST | `/api/crear-usuario` | Sí* | Crea una cuenta de RR.HH. |
| GET | `/api/postulantes` | Sí | Listado con filtros |
| PATCH | `/api/postulantes` | Sí | Cambia estado y observaciones |
| GET | `/api/exportar` | Sí | Descarga el Excel |

\* La primera cuenta se crea con `CLAVE_INSTALACION` en lugar de sesión.

---

## 5. Consulta de DNI

```http
GET /api/dni?numero=12345678
```

Respuesta:

```json
{
  "numero": "12345678",
  "nombres": "JUAN CARLOS",
  "apellido_paterno": "APELLIDO",
  "apellido_materno": "APELLIDO"
}
```

> Estructura de ejemplo. No corresponde a una consulta real.

**Solo devuelve nombres.** El domicilio queda deliberadamente fuera: un formulario público que entrega direcciones a partir de un DNI es, en la práctica, un buscador de domicilios de cualquier peruano. Si en el futuro se incorpora, debe ir detrás del panel con sesión iniciada y sobre postulantes que ya enviaron su solicitud.

Cada consulta queda registrada en `consultas_dni` con fecha, IP y resultado.

---

## 6. Ubigeo

Departamento, provincia y distrito son tres listas desplegables encadenadas: al elegir una se filtra la siguiente. Imposible escribir mal un distrito o inventar una combinación.

El catálogo (`ubigeo.json`) cubre **25 departamentos, 196 provincias y 1874 distritos** del INEI.

Cada postulación guarda el nombre más los dos códigos oficiales:

```json
{
  "departamento": "Ica",
  "provincia": "Nazca",
  "distrito": "Marcona",
  "ubigeo_inei": "110304",
  "ubigeo_reniec": "100304"
}
```

**Los dos códigos no coinciden.** INEI y RENIEC son catastros distintos para el mismo lugar, como muestra el ejemplo. Guardar ambos evita que un cruce posterior con planillas o SUNAT use el equivocado. El 97.6% de los distritos tiene equivalencia en ambos; el resto guarda solo el INEI.

Si `ubigeo.json` no carga, los tres campos vuelven a ser texto libre y el formulario sigue funcionando.

---

## 7. Errores

Todos los errores comparten la misma estructura:

```json
{
  "error": "No se encontró ese DNI. Escribe tus datos a mano."
}
```

El mensaje está redactado para mostrarse tal cual al usuario final: en español, sin jerga y diciendo qué hacer.

| HTTP | Cuándo | Qué hace el frontend |
| --- | --- | --- |
| 400 | Formato inválido | Marca el campo, no gasta consulta |
| 401 | Sesión vencida | Recarga hacia el login |
| 404 | DNI no encontrado | Habilita captura manual |
| 405 | Método no permitido | — |
| 429 | Demasiadas consultas | Pide esperar |
| 500 | Falta configuración | Alerta a soporte |
| 502 | Proveedor sin respuesta | Captura manual |

**Regla que sostiene todo:** ningún error puede impedir que una persona postule. Si la consulta falla, los campos quedan editables y el postulante escribe sus datos. La consulta es una comodidad, no un requisito.

Se prueba desconectando el proveedor a propósito: si el formulario sigue siendo utilizable, está bien construido.

---

## 8. Autenticación

**Postulantes:** ninguna. El formulario es público por diseño.

**Recursos Humanos:** usuario y contraseña. La contraseña se guarda cifrada con `scrypt` y sal aleatoria, nunca en texto plano. La sesión viaja en una cookie `HttpOnly`, `Secure` y `SameSite=Strict`, firmada con HMAC-SHA256 y válida por 12 horas.

Un token con la firma o la carga alteradas se rechaza.

**Por qué API key y no OAuth 2.0 hacia el proveedor:** OAuth existe para que un usuario autorice a una aplicación a actuar en su nombre. Aquí no hay usuario que autorice nada — es un sistema propio llamando a un servicio contratado. OAuth agregaría un flujo de consentimiento y un servidor de autorización para resolver un problema que no existe.

### Crear la primera cuenta

Una sola vez, desde la consola del navegador:

```javascript
fetch('/api/crear-usuario', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    instalacion: 'valor-de-CLAVE_INSTALACION',
    usuario: 'rrhh',
    nombre: 'Recursos Humanos',
    clave: 'contraseña-de-al-menos-10-caracteres'
  })
}).then(r => r.json()).then(console.log)
```

Después, cualquier cuenta con sesión activa puede crear otras sin la clave de instalación.

---

## 9. Seguridad

### Las credenciales nunca llegan al navegador

Cualquier cosa que el navegador reciba es pública: basta abrir la consola. Una llave ahí es una llave regalada.

Incorrecto:

```javascript
const TOKEN = "mi-token-secreto";   // visible en el código fuente
```

Correcto:

```text
Navegador  →  /api  →  Proveedor
          sin llave   con llave
```

### Otras medidas

- HTTPS en todo el tráfico, sin excepción.
- Doble validación: navegador y servidor. El servidor nunca confía en lo que llega.
- El enlace del CV se verifica contra el dominio del almacén propio, para que nadie registre una URL arbitraria.
- Comparación de contraseñas en tiempo constante, para que no se deduzcan midiendo demoras.
- CV con nombre aleatorio en el enlace y acceso restringido.
- Detección de postulación repetida dentro de 10 minutos: devuelve el mismo código en lugar de duplicar.

### La librería de subida se carga diferida

```javascript
const cargarSubida = () => import('https://esm.sh/@vercel/blob@0.27.0/client');
```

Importada al inicio del módulo, un CDN caído tumbaría todo el JavaScript y dejaría el formulario inservible. Cargada al enviar, el resto de la página sigue viva.

---

## 10. Control de caudal

Los límites no solo protegen el servidor: protegen el presupuesto e impiden que la herramienta se use para extraer datos en masa.

| Alcance | Límite | Propósito |
| --- | --- | --- |
| Consulta DNI por IP | 12 cada 10 minutos | Frena a quien prueba números en serie |
| Intentos de login por IP | 6 cada 15 minutos | Frena la adivinanza de contraseñas |

Viven en memoria del proceso, así que se reinician con cada despliegue. Para volumen alto conviene moverlos a un almacén compartido.

**Un límite diario importa más que uno de diez minutos.** Quien quiere extraer datos en serio hace 11 consultas cada 10 minutos durante toda la noche. El tope de 24 horas es el que cierra esa puerta, y está pendiente.

---

## 11. Protección de datos personales

Cumplimiento de la **Ley N.° 29733 — Ley de Protección de Datos Personales**.

### Implementado

- Casilla de autorización sin marcar por defecto, con finalidad declarada.
- Registro de cada consulta de DNI con fecha, IP y resultado.
- Solo se solicitan datos con finalidad definida en un proceso de selección.
- CV con acceso restringido.
- Trazabilidad del cambio de estado: quién revisó y cuándo.

### Pendiente de gestión

- Inscripción del banco de datos ante la ANPD del Ministerio de Justicia. Es la omisión más común y la más fácil de detectar en una fiscalización.
- Plazo de conservación definido, con depuración automática al cumplirse.
- Correo publicado y responsable asignado para derechos ARCO.
- Contrato de encargo de tratamiento con el proveedor de identidad.

### Minimización

Se guarda lo necesario para evaluar una postulación. Los logs registran códigos de resultado, no respuestas completas.

---

## 12. Variables de entorno

| Variable | Origen | Para qué |
| --- | --- | --- |
| `DATABASE_URL` | Automática al conectar Neon | Conexión a Postgres |
| `BLOB_READ_WRITE_TOKEN` | Automática al crear Blob | Almacenamiento de CV |
| `DNI_API_TOKEN` | Manual | Token del proveedor de identidad |
| `SESION_SECRET` | Manual | Firma de las cookies de sesión |
| `CLAVE_INSTALACION` | Manual | Crear la primera cuenta |

Las dos primeras las crea Vercel sola. Las tres últimas se agregan en Settings → Environment Variables.

`SESION_SECRET` y `CLAVE_INSTALACION` deben ser cadenas largas y aleatorias, distintas entre sí.

> Las variables solo se aplican en despliegues nuevos. Después de agregar una, hay que volver a desplegar.

Nunca subir al repositorio:

```gitignore
.env
.env.local
node_modules/
```

---

## 13. Instalación

1. **Neon** — en Vercel, Storage → Create Database → Neon. Crea `DATABASE_URL` sola.
2. **Blob** — Storage → Create → Blob. Crea `BLOB_READ_WRITE_TOKEN` sola.
3. **Esquema** — pegar `neon-reclutamiento.sql` completo en el SQL Editor de Neon.
4. **Variables** — agregar `DNI_API_TOKEN`, `SESION_SECRET` y `CLAVE_INSTALACION`.
5. **Desplegar** — push a GitHub; Vercel despliega solo.
6. **Primera cuenta** — ejecutar el bloque de la sección 8.

No hay paso de compilación. Es HTML estático más funciones.

---

## 14. Base de datos

| Tabla | Contenido |
| --- | --- |
| `puestos` | Catálogo de vacantes, con área |
| `postulantes` | Postulaciones y su seguimiento |
| `usuarios` | Cuentas de RR.HH. con contraseña cifrada |
| `consultas_dni` | Registro de consultas para auditoría |

El código correlativo lo genera un disparador en Postgres, no la aplicación. Dos postulaciones simultáneas no pueden recibir el mismo número.

Estados del proceso: `Nuevo` → `En revisión` → `Entrevista` → `Seleccionado` / `Descartado`.

---

## 15. Exportación a Excel

```http
GET /api/exportar?puesto=&estado=&desde=&hasta=&buscar=
```

Acepta los mismos filtros que el listado: se descarga exactamente lo que está en pantalla.

El archivo trae 35 columnas, con la edad calculada a partir de la fecha de nacimiento, filtros ya puestos en el encabezado, fila superior congelada y el CV como enlace clicable dentro de la celda.

---

## 16. Pendientes

### Corto plazo

- [ ] Tope diario de consultas por IP.
- [ ] Alerta al consumir el 80% de la cuota del proveedor.
- [ ] Cortacircuitos ante fallos repetidos.
- [ ] Interruptor para apagar la consulta sin desplegar.

### Mediano plazo

- [ ] Preselección automática del ubigeo desde el DNI.
- [ ] Llaves separadas por aplicación consumidora.
- [ ] Depuración automática al vencer el plazo de conservación.
- [ ] Dominio propio en lugar de la dirección de Vercel.

### Gestión

- [ ] Inscripción del banco de datos ante la ANPD.
- [ ] Responsable asignado para derechos ARCO.
- [ ] Evaluar el convenio oficial con RENIEC.

---

## Consideración crítica

Este proyecto es una **capa de integración**, no un mecanismo para evadir controles. No se implementa ni se implementará:

- Scraping no autorizado
- Bases de datos filtradas u obtenidas ilegalmente
- Credenciales de terceros
- Elusión de mecanismos de seguridad

Cualquier dato de identidad proviene de un servicio oficial o de un proveedor debidamente autorizado, con contrato vigente y dentro de la finalidad declarada.
