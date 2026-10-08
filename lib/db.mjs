// Conexión a Neon compartida por todas las funciones de /api.
// La cadena de conexión vive en la variable de entorno DATABASE_URL
// (Vercel la crea sola al conectar la integración de Neon).

import { neon } from '@neondatabase/serverless';

export const sql = neon(process.env.DATABASE_URL);
