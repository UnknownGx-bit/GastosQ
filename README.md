# MiGasto

MiGasto es una PWA mobile-first para registrar y analizar gastos personales de forma rápida, privada y sin conexión. No necesita cuenta ni servidor: los movimientos se guardan en IndexedDB dentro del dispositivo y nunca se envían a terceros.

## Funciones

- Registro ultrarrápido con solo monto y descripción.
- Totales de hoy, semana (lunes a domingo), mes y año.
- Movimientos agrupados por día, búsqueda y filtros.
- Edición, cambio avanzado de fecha y eliminación directa desde el detalle.
- Calendario mensual con totales y consulta por día.
- Estadísticas reales, comparación con el periodo anterior y gastos frecuentes.
- Respaldo JSON, exportación CSV e importación con combinación o reemplazo.
- PWA instalable, adaptable a subcarpetas de GitHub Pages y funcional sin conexión.
- Tipografía Inter incluida localmente para conservar el mismo peso visual al instalarla.
- Seis paletas mate configurables: Cobalto, Aurora, Jade, Ámbar, Cereza y Grafito.
- Modo de privacidad para ocultar o mostrar todos los importes desde el icono de ojo.
- Límites de gasto diario, semanal y mensual con alertas rojas al acercarse o alcanzar el límite.
- Animaciones breves en los iconos de navegación al cambiar de apartado.
- Accesibilidad, safe areas, soporte de teclado y reducción de movimiento.

## Estructura

```text
index.html               Estructura y navegación accesible
styles.css               Sistema visual fintech mate y responsive
app.js                   Interfaz, router hash e interacciones
js/db.js                 Persistencia IndexedDB con fallback local
js/utils.js              Fechas locales, moneda y validación
js/analytics.js          Cálculos y agrupaciones reutilizables
js/backup.js             Exportación e importación
manifest.webmanifest     Instalación PWA
sw.js                    Caché offline y actualización
icons/                   Iconos 192, 512 y fuente SVG
fonts/                   Tipografía Inter local y licencia OFL
```

## Ejecutar localmente

Los módulos ES y el service worker necesitan un servidor HTTP local. Desde esta carpeta puedes usar cualquiera de estas opciones:

```bash
python -m http.server 4173
```

o:

```bash
npx serve .
```

Después abre `http://localhost:4173/`. Abrir `index.html` directamente permite ver parte de la interfaz, pero no habilita la instalación ni el modo offline.

## Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub.
2. Sube todos los archivos de esta carpeta a la raíz del repositorio.
3. Abre **Settings** en el repositorio.
4. Entra a **Pages**.
5. En **Build and deployment**, elige **Deploy from a branch**.
6. Selecciona la rama `main`.
7. Selecciona la carpeta `/root`.
8. Guarda la configuración.
9. Espera a que GitHub termine el despliegue.
10. Abre la URL indicada, por ejemplo `https://usuario.github.io/migasto/`.

Todas las rutas son relativas y la navegación usa hashes (`#/inicio`, `#/calendario`), por lo que funciona correctamente dentro de una subcarpeta.

## Instalar en Android

1. Abre la URL publicada en Chrome para Android.
2. Abre el menú de Chrome.
3. Toca **Instalar aplicación** o **Agregar a pantalla principal**.
4. Confirma la instalación.

Después de una primera carga completa, el service worker conserva la interfaz esencial para abrir la app, registrar gastos y consultar datos sin internet.

Si Chrome solo muestra **Agregar a pantalla principal**, confirma que subiste también `manifest.webmanifest`, `sw.js`, las carpetas `icons`, `fonts` y `js`. Abre la página publicada mediante HTTPS, recárgala una vez y usa **Ajustes → Instalar MiGasto** o el menú de Chrome → **Instalar aplicación**. Si había una instalación anterior, desinstálala sin borrar los datos del sitio y vuelve a instalarla después de publicar esta versión.

## Privacidad y respaldos

Los movimientos viven en IndexedDB, asociado al origen de la página. Cerrar la app o actualizar el sitio no los elimina mientras se conserve el almacenamiento del navegador. En **Inicio → Ajustes** puedes descargar un respaldo JSON, exportar un CSV o importar una copia previa. Guarda respaldos periódicos antes de borrar datos del navegador o desinstalar la PWA.
