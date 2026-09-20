// =====================================================================
//  /api/dni  —  Consulta de DNI para el formulario de reclutamiento
//  El token vive en Vercel > Settings > Environment Variables, nunca
//  en el HTML. El navegador solo llama a /api/dni?numero=########
// =====================================================================

const TOKEN = process.env.DNI_API_TOKEN;
const URL_PROVEEDOR = 'https://api.decolecta.com/v1/reniec/dni?numero=';

// Freno simple contra el uso masivo: 12 consultas por IP cada 10 minutos.
// Vive en memoria del proceso; si necesitas algo firme, se pasa a Vercel KV.
const visitas = new Map();
const VENTANA = 10 * 60 * 1000;
const TOPE = 12;

function excedido(ip) {
  const ahora = Date.now();
  const previas = (visitas.get(ip) || []).filter(t => ahora - t < VENTANA);
  previas.push(ahora);
  visitas.set(ip, previas);
  if (visitas.size > 5000) visitas.clear();
  return previas.length > TOPE;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const numero = String(req.query.numero || '').trim();
  if (!/^\d{8}$/.test(numero)) {
    return res.status(400).json({ error: 'El DNI debe tener 8 dígitos.' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'desconocida';
  if (excedido(ip)) {
    return res.status(429).json({ error: 'Demasiadas consultas. Espera unos minutos.' });
  }

  if (!TOKEN) {
    return res.status(500).json({ error: 'Falta configurar DNI_API_TOKEN.' });
  }

  try {
    const r = await fetch(URL_PROVEEDOR + numero, {
      headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/json' }
    });

    if (r.status === 404) {
      return res.status(404).json({ error: 'No se encontró ese DNI. Escribe tus datos a mano.' });
    }
    if (!r.ok) {
      return res.status(502).json({ error: 'El servicio de consulta no respondió. Escribe tus datos a mano.' });
    }

    const d = await r.json();

    // Solo devolvemos lo que el formulario necesita. Nada más sale de aquí.
    return res.status(200).json({
      numero,
      nombres:          d.first_name  || d.nombres          || '',
      apellido_paterno: d.first_last_name || d.apellido_paterno || '',
      apellido_materno: d.second_last_name || d.apellido_materno || ''
    });

  } catch (e) {
    return res.status(502).json({ error: 'No se pudo consultar. Escribe tus datos a mano.' });
  }
}
