// Arma la carpeta www/ que Capacitor empaqueta dentro del APK.
// Copia la app y le agrega los complementos nativos para guardar y compartir archivos.
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync, existsSync, cpSync } from 'node:fs';

const out = 'www';
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/cap`, { recursive: true });
cpSync('icons', `${out}/icons`, { recursive: true });
copyFileSync('manifest.webmanifest', `${out}/manifest.webmanifest`);

const libs = [
  ['node_modules/@capacitor/core/dist/capacitor.js', 'capacitor.js'],
  ['node_modules/@capacitor/synapse/dist/synapse.js', 'synapse.js'],
  ['node_modules/@capacitor/filesystem/dist/plugin.js', 'filesystem.js'],
  ['node_modules/@capacitor/share/dist/plugin.js', 'share.js'],
  ['node_modules/@capacitor/app/dist/plugin.js', 'app.js'],
  ['node_modules/@capacitor/local-notifications/dist/plugin.js', 'notifications.js'],
  ['node_modules/@aparajita/capacitor-biometric-auth/dist/plugin.js', 'biometric.js'],
];
for (const [from, to] of libs) {
  if (!existsSync(from)) { console.error(`Falta ${from}. Ejecuta "npm install" primero.`); process.exit(1); }
  copyFileSync(from, `${out}/cap/${to}`);
}

const tags = [
  '<script src="cap/capacitor.js"></script>',
  '<script src="cap/synapse.js"></script>',
  '<script>window.synapse = window.outsystemsSynapse;</script>',
  '<script src="cap/filesystem.js"></script>',
  '<script src="cap/share.js"></script>',
  '<script src="cap/app.js"></script>',
  '<script>window.app = window.capacitorApp;</script>',
  '<script src="cap/notifications.js"></script>',
  '<script src="cap/biometric.js"></script>',
].join('\n');

let html = readFileSync('index.html', 'utf8');
// En el APK no hay usd.json ni usd-history.json locales: se leen los que actualiza GitHub en tu sitio publicado.
const { homepage } = JSON.parse(readFileSync('package.json', 'utf8'));
if (homepage && !homepage.includes('TU_USUARIO')) {
  const base = homepage.replace(/\/?$/, '/');
  html = html.replace("const USD_JSON = 'usd.json';", `const USD_JSON = '${base}usd.json';`);
  html = html.replace("const USD_HIST_JSON = 'usd-history.json';", `const USD_HIST_JSON = '${base}usd-history.json';`);
} else {
  console.warn('Aviso: define "homepage" en package.json con la dirección de tu GitHub Pages para que el APK lea el dólar diario.');
}
const i = html.lastIndexOf('<script>');
html = html.slice(0, i) + tags + '\n' + html.slice(i);
writeFileSync(`${out}/index.html`, html);
console.log('Listo: www/ preparada para Capacitor.');
