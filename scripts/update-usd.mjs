// Consulta el dólar del día y lo guarda en usd.json, que la app lee al abrirse.
// Primero usa el dólar observado del Banco Central (mindicador.cl); si falla, un tipo de cambio de mercado.
import { writeFileSync } from 'node:fs';

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'mis-cuentas' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${url} respondió ${r.status}`);
  return r.json();
}

let out;
try {
  const d = await getJson('https://mindicador.cl/api/dolar');
  const s = d.serie && d.serie[0];
  if (!s || !s.valor) throw new Error('mindicador sin datos');
  out = { valor: s.valor, fecha: s.fecha.slice(0, 10), fuente: 'Dólar observado, Banco Central (mindicador.cl)' };
} catch (e) {
  console.warn('mindicador no respondió:', e.message);
  const d = await getJson('https://open.er-api.com/v6/latest/USD');
  if (!d.rates || !d.rates.CLP) throw new Error('open.er-api sin datos');
  out = { valor: d.rates.CLP, fecha: new Date(d.time_last_update_unix * 1000).toISOString().slice(0, 10), fuente: 'Tipo de cambio de mercado (open.er-api.com)' };
}
out.actualizado = new Date().toISOString();
writeFileSync('usd.json', JSON.stringify(out, null, 2) + '\n');
console.log('Dólar guardado:', out.valor, out.fecha);
