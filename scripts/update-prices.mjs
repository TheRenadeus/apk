// Busca los productos de precios/canasta.json en cada supermercado y guarda sus precios del día.
// Lo ejecuta una tarea de GitHub cada mañana (.github/workflows/precios.yml).
//
// Archivos que escribe, uno por supermercado: precios/data/<tienda>.json
//   { tienda, nombre, actualizado, productos: { <id>: { n, m, u, i, t: [términos], v: última fecha vista,
//     h: [[fecha, precio, precioNormal|null, precioTarjeta|null], ...] } } }
// El historial 'h' solo agrega una fila cuando el precio cambia; 'v' dice hasta qué día siguió igual.
// Así el archivo crece poco aunque se ejecute todos los días.
// También escribe precios/data/estado.json con el resultado de cada tienda en la última ejecución.
//
// Uso: node scripts/update-prices.mjs [tienda ...]   (sin argumentos, todas)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const DIR = 'precios/data';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const PAUSA_MS = 1500; // espera entre páginas de una misma tienda, para no cargar sus servidores
const OLVIDAR_DIAS = 120; // productos que no aparecen hace más de esto se borran

const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
const dormir = ms => new Promise(r => setTimeout(r, ms));

async function getHtml(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'es-CL,es;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`${new URL(url).host} respondió ${r.status}`);
  return r.text();
}
const motivo = e => (e.cause && (e.cause.code || e.cause.message)) ? `${e.message} (${e.cause.code || e.cause.message})` : e.message;

// Jumbo y Santa Isabel (Cencosud) publican los resultados como lista schema.org (JSON-LD).
function leerJsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let d;
    try { d = JSON.parse(m[1]); } catch { continue; }
    if (d['@type'] !== 'ItemList' || !Array.isArray(d.itemListElement)) continue;
    for (const el of d.itemListElement) {
      const it = el.item || {};
      const of = it.offers || {};
      const precio = Number(of.price);
      if (!it.name || !it.url || !precio) continue;
      const specs = Array.isArray(of.priceSpecification) ? of.priceSpecification : [];
      const tachado = specs.find(s => String(s.priceType || '').includes('StrikethroughPrice'));
      const normal = tachado ? Number(tachado.price) : null;
      const path = new URL(it.url).pathname.replace(/\/p\/?$/, '').replace(/^\//, '');
      out.push({
        id: path,
        n: it.name.trim(),
        m: (it.brand && it.brand.name || '').trim(),
        u: it.url,
        i: it.image || '',
        precio,
        normal: normal && normal > precio ? normal : null,
        tarjeta: null,
        disponible: !of.availability || String(of.availability).includes('InStock'),
      });
    }
  }
  return out;
}

const numCLP = s => Number(String(Array.isArray(s) ? s[0] : s).replace(/[^\d]/g, '')) || null;

// Tottus (Falabella) es una app Next.js: los resultados vienen en __NEXT_DATA__.
function leerTottus(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Tottus: la página no trae __NEXT_DATA__ (¿cambió el sitio?)');
  const pp = JSON.parse(m[1]).props?.pageProps || {};
  const out = [];
  for (const x of pp.results || []) {
    if (x.isSponsored) continue; // los patrocinados no siempre tienen que ver con la búsqueda
    const ps = x.prices || [];
    const de = t => { const p = ps.find(p => p.type === t); return p ? numCLP(p.price) : null; };
    const precio = de('internetPrice') || de('eventPrice') || numCLP(ps.find(p => !p.crossed)?.price);
    if (!precio || !x.productId) continue;
    const normal = de('normalPrice');
    const tarjeta = de('cmrPrice');
    out.push({
      id: String(x.productId),
      n: String(x.displayName || '').trim(),
      m: String(x.brand || '').trim(),
      u: x.url,
      i: (x.mediaUrls && x.mediaUrls[0]) || '',
      precio,
      normal: normal && normal > precio ? normal : null,
      tarjeta: tarjeta && tarjeta < precio ? tarjeta : null,
      disponible: true,
    });
  }
  return out;
}

const TIENDAS = {
  jumbo: {
    nombre: 'Jumbo',
    url: (q, p) => `https://www.jumbo.cl/busqueda?ft=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ''}`,
    leer: leerJsonLd,
  },
  santaisabel: {
    nombre: 'Santa Isabel',
    url: (q, p) => `https://www.santaisabel.cl/busqueda?ft=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ''}`,
    leer: leerJsonLd,
  },
  tottus: {
    nombre: 'Tottus',
    url: (q, p) => `https://www.tottus.cl/tottus-cl/buscar?Ntt=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ''}`,
    leer: leerTottus,
  },
};

function cargar(file, def) {
  if (!existsSync(file)) return def;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return def; }
}

function diasEntre(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }

async function actualizarTienda(clave, canasta) {
  const t = TIENDAS[clave];
  const file = `${DIR}/${clave}.json`;
  const db = cargar(file, { tienda: clave, nombre: t.nombre, productos: {} });
  const vistos = new Map();
  let paginasOk = 0, paginasError = 0, ultimoError = '';

  for (const termino of canasta.terminos) {
    for (let p = 1; p <= (canasta.paginas || 1); p++) {
      try {
        const items = t.leer(await getHtml(t.url(termino, p)));
        paginasOk++;
        for (const it of items) {
          const prev = vistos.get(it.id);
          if (prev) { if (!prev.t.includes(termino)) prev.t.push(termino); continue; }
          vistos.set(it.id, { ...it, t: [termino] });
        }
        if (items.length === 0) break;
      } catch (e) {
        paginasError++;
        ultimoError = motivo(e);
        console.warn(`  ${t.nombre} "${termino}" pág. ${p}: ${ultimoError}`);
        break;
      }
      await dormir(PAUSA_MS);
    }
  }

  if (vistos.size === 0) {
    return { ok: false, productos: 0, paginasOk, paginasError, error: ultimoError || 'sin resultados' };
  }

  for (const [id, it] of vistos) {
    const fila = [hoy, it.precio, it.normal, it.tarjeta];
    const p = db.productos[id] || (db.productos[id] = { h: [] });
    p.n = it.n; p.m = it.m; p.u = it.u; p.i = it.i; p.v = hoy;
    p.t = it.t;
    if (!it.disponible) p.x = 1; else delete p.x;
    // Si hoy ya hubo una ejecución, se reemplaza la fila de hoy.
    if (p.h.length && p.h[p.h.length - 1][0] === hoy) p.h.pop();
    const ult = p.h[p.h.length - 1];
    if (!ult || ult[1] !== fila[1] || ult[2] !== fila[2] || ult[3] !== fila[3]) p.h.push(fila);
  }
  for (const [id, p] of Object.entries(db.productos)) {
    if (diasEntre(p.v, hoy) > OLVIDAR_DIAS) delete db.productos[id];
  }

  db.nombre = t.nombre;
  db.actualizado = new Date().toISOString();
  db.fecha = hoy;
  writeFileSync(file, JSON.stringify(db) + '\n');
  return { ok: true, productos: vistos.size, paginasOk, paginasError, error: paginasError ? ultimoError : '' };
}

const canasta = JSON.parse(readFileSync('precios/canasta.json', 'utf8'));
const pedidas = process.argv.slice(2);
const claves = pedidas.length ? pedidas : Object.keys(TIENDAS);
mkdirSync(DIR, { recursive: true });

const estado = cargar(`${DIR}/estado.json`, { tiendas: {} });
estado.tiendas = estado.tiendas || {};
// Las tiendas se consultan en paralelo; dentro de cada una, las páginas van de a una.
const resultados = await Promise.all(claves.map(async clave => {
  if (!TIENDAS[clave]) { console.error(`Tienda desconocida: ${clave}`); return false; }
  console.log(`${TIENDAS[clave].nombre}: buscando ${canasta.terminos.length} términos…`);
  let r;
  try { r = await actualizarTienda(clave, canasta); } catch (e) { r = { ok: false, productos: 0, error: e.message }; }
  const antes = estado.tiendas[clave] || {};
  estado.tiendas[clave] = {
    nombre: TIENDAS[clave].nombre,
    ok: r.ok,
    productos: r.productos,
    error: r.error || '',
    intento: new Date().toISOString(),
    ultimoOk: r.ok ? hoy : (antes.ultimoOk || null),
  };
  console.log(`${TIENDAS[clave].nombre}: ${r.ok ? `${r.productos} productos` : `falló (${r.error})`}`);
  return r.ok;
}));
estado.fecha = hoy;
writeFileSync(`${DIR}/estado.json`, JSON.stringify(estado, null, 2) + '\n');

if (!resultados.some(Boolean)) {
  console.error('Ninguna tienda respondió.');
  process.exit(1);
}
