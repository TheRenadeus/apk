# Mis cuentas

Control de ingresos, gastos, tarjetas, créditos, suscripciones y metas de ahorro.
Funciona como app web instalable (PWA) y se puede empaquetar como APK para Android con Capacitor.

Tus datos se guardan **solo en el dispositivo**. El repositorio no contiene datos personales,
así que puede ser público sin problema.

---

## 1. Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub, por ejemplo `mis-cuentas`.
2. Sube el contenido de esta carpeta (sin `node_modules/` ni `www/`, el `.gitignore` ya los excluye):
   ```bash
   git init
   git add .
   git commit -m "Primera versión"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/mis-cuentas.git
   git push -u origin main
   ```
3. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   elige `main` y la carpeta `/ (root)`, y guarda.
4. En uno o dos minutos la app queda en `https://TU_USUARIO.github.io/mis-cuentas/`.

## 2. Instalarla en el celular

1. Abre la dirección en **Chrome** en tu Android.
2. Menú ⋮ → **Instalar app** (o **Agregar a la pantalla principal**).
   También aparece el botón *Instalar la app* en **Resumen → Datos** cuando Chrome lo permite.
3. Queda con ícono propio, se abre a pantalla completa y funciona sin internet.

## 3. Pasar tus datos desde la versión de Claude

1. En la app dentro de Claude: **Resumen → Datos → Descargar respaldo**.
2. En la app instalada: **Resumen → Datos → Importar respaldo** y elige ese archivo.

Descarga un respaldo de vez en cuando: si borras los datos de Chrome o desinstalas la app,
la información se pierde.

## Dólar diario automático

Una tarea de GitHub (`.github/workflows/dolar.yml`) consulta el **dólar observado del Banco Central**
(vía mindicador.cl) cada día hábil a las 10:30 y 19:30 y lo guarda en `usd.json` dentro de tu sitio.
La app lo lee al abrirse (máximo cada 6 horas). Si ese archivo no existe, consulta directo a mindicador.cl
y, como último recurso, un tipo de cambio de mercado (open.er-api.com).

**Activarlo (una sola vez):**
1. En GitHub: **Settings → Actions → General → Workflow permissions** → marca **Read and write permissions** y guarda.
2. En la pestaña **Actions**, abre **Actualizar dólar** y toca **Run workflow** para crear el primer `usd.json`.
   Desde ahí se ejecuta solo.

**Para el APK:** en `package.json`, cambia `homepage` por la dirección de tu sitio
(por ejemplo `https://renato.github.io/mis-cuentas/`). Así el APK lee el mismo `usd.json`.

Siempre puedes corregirlo a mano en **Resumen → Datos**. Dentro de Claude no se puede consultar internet,
así que ahí se ingresa manualmente.

## 4. Publicar cambios

1. Reemplaza `index.html` por la versión nueva.
2. En `sw.js`, sube el número de versión (por ejemplo `mis-cuentas-v3` → `mis-cuentas-v4`).
3. `git commit` y `git push`. El teléfono toma la versión nueva la próxima vez que abras la app con internet.

---

## 5. Generar el APK con Capacitor

### Requisitos
- Node.js 22 o superior.
- Android Studio (incluye el SDK de Android y el JDK que necesita Gradle).

### Pasos
La carpeta `android/` y sus íconos ya vienen listos en el repositorio, así que no hace falta
crearlos de nuevo:
```bash
npm install
npm run build            # arma la carpeta www/ con los complementos nativos
npm run android           # sincroniza y abre el proyecto en Android Studio
```
Si cambias el ícono en `assets/icon-only.png`, ejecuta `npm run icons` para regenerarlos.

En Android Studio:
- **Build → Build App Bundle(s) / APK(s) → Build APK(s)** para un APK de prueba.
  Queda en `android/app/build/outputs/apk/debug/app-debug.apk`.
- Para instalarlo, cópialo al teléfono y ábrelo (Android pedirá permitir instalar apps de esta fuente).
- Para una versión firmada (necesaria para Play Store): **Build → Generate Signed App Bundle / APK**.

Cada vez que cambies `index.html`, ejecuta `npm run sync` y vuelve a compilar.

### Funciones que solo existen en el APK
- **Recordatorios** (Resumen → Datos): avisos antes de cada vencimiento y un recordatorio diario
  para registrar gastos. Usa `@capacitor/local-notifications`. En Android 13 o superior la app pide
  permiso para mostrar notificaciones la primera vez que los activas.
- **Desbloqueo con huella**: al activar el PIN, si el teléfono tiene huella configurada, la app la ofrece.
  Usa `@aparajita/capacitor-biometric-auth`. El PIN funciona en todas las versiones.

### Notas
- En el APK, "Descargar respaldo" y los CSV abren el menú de compartir de Android,
  para guardarlos en Drive, Descargas o enviarlos por WhatsApp.
  Este flujo usa `@capacitor/filesystem` y `@capacitor/share`; pruébalo en tu teléfono la primera vez.
- Si quieres cambiar el identificador de la app (`appId` en `capacitor.config.json`), edítalo ahí y
  vuelve a ejecutar `npx cap add android` (borrando antes la carpeta `android/` existente) para que
  el proyecto nativo quede con el nuevo identificador.
- La versión PWA y el APK guardan sus datos por separado. Para pasar datos entre ellas, usa el respaldo.
