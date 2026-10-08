// POST /api/subir-cv — autoriza la subida del CV directo a Vercel Blob.
//
// El navegador no sube el PDF a esta función (las funciones tienen un
// tope de 4.5 MB). Pide permiso aquí, sube el archivo directo al
// almacén y luego nos devuelve la URL.

import { handleUpload } from '@vercel/blob/client';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // Sin almacén conectado no hay a dónde subir. Se avisa aquí para que
  // el registro diga qué falta, en vez de un error genérico.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('falta BLOB_READ_WRITE_TOKEN: crea el almacén Blob en Vercel > Storage y vuelve a desplegar');
    return res.status(500).json({ error: 'El almacenamiento de archivos no está configurado.' });
  }

  try {
    const respuesta = await handleUpload({
      request: req,
      body: req.body,

      // Se ejecuta antes de entregar el permiso de subida.
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['application/pdf'],
        maximumSizeInBytes: 5 * 1024 * 1024,
        addRandomSuffix: true,
        tokenPayload: null
      }),

      // Vercel avisa aquí cuando la subida terminó. No hacemos nada:
      // la postulación se guarda recién cuando el formulario se envía.
      onUploadCompleted: async () => {}
    });

    return res.status(200).json(respuesta);

  } catch (e) {
    console.error('subir-cv:', e);
    return res.status(400).json({ error: 'No se pudo subir el archivo.' });
  }
}
