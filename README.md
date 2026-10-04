# Flow Money — Simulador de intercambio de dinero

Landing page de Flow Money + simulador web de intercambio de divisas con cuentas
y transferencias en tiempo real entre dos computadores.

## Requisitos

- Node.js 18+ (probado con Node 25)

## Cómo ejecutar

```bash
npm install
npm start
```

El servidor queda en el puerto 3000. Al iniciar muestra las URLs disponibles:

```
Local:    http://localhost:3000
Red LAN:  http://192.168.x.x:3000   <- abrir esto en el otro notebook
```

## Uso en el tribunal (dos notebooks)

1. En el **notebook 1**, ejecuta `npm start` y anota la URL "Red LAN" que imprime.
2. Ambos notebooks deben estar en la **misma red Wi-Fi**.
3. En el **notebook 1** abre `http://localhost:3000/login.html` e inicia sesión con **evaluador1**.
4. En el **notebook 2** abre `http://192.168.x.x:3000/login.html` (la IP del notebook 1) e inicia sesión con **evaluador2**.
5. Cada evaluador puede enviarse dinero simulado al otro con conversión de moneda.
   Los saldos y el historial se actualizan solos cada 3 segundos en ambas pantallas.

> Si Windows pregunta por el firewall, permite el acceso en redes privadas.
> Si los notebooks no están en la misma red, puedes exponer el servidor con
> `cloudflared tunnel --url http://localhost:3000` y usar la URL que entrega.

## Cuentas de demostración

| Usuario    | Contraseña | Saldos iniciales |
|------------|------------|------------------|
| evaluador1 | flow101    | 5.000 USD · 2.000 EUR · 1.000.000 CLP · 10.000 MXN |
| evaluador2 | flow102    | 5.000 USD · 2.000 EUR · 1.000.000 CLP · 10.000 MXN |
| evaluador3 | flow103    | 5.000 USD · 2.000 EUR · 1.000.000 CLP · 10.000 MXN |
| evaluador4 | flow104    | 5.000 USD · 2.000 EUR · 1.000.000 CLP · 10.000 MXN |
| evaluador5 | flow105    | 5.000 USD · 2.000 EUR · 1.000.000 CLP · 10.000 MXN |
| evaluador6 | flow106    | 5.000 USD · 2.000 EUR · 1.000.000 CLP · 10.000 MXN |
| demo       | demo123    | 3.000 USD · 1.000 EUR · 500.000 CLP · 5.000 MXN |

## Versión online (GitHub Pages + Render)

- **Landing page**: está publicada en GitHub Pages
  (`https://nearcinho.github.io/flow-money/`). Solo incluye la página pública;
  GitHub Pages no ejecuta Node, por lo que el simulador no funciona ahí.
- **Simulador completo (landing + login + transferencias)**: el repo incluye
  `render.yaml` para desplegarlo gratis en [Render](https://render.com):
  1. Entra a render.com con tu cuenta de GitHub.
  2. "New" → "Blueprint" y selecciona el repo `Nearcinho/flow-money`.
  3. Render levanta `server.js` y te da una URL pública (ej. `https://flow-money.onrender.com`).
  4. Esa URL se abre en ambos notebooks: cada evaluador inicia sesión con su cuenta.

> En el plan gratuito de Render la app "duerme" tras ~15 min sin uso: la primera
> carga puede tardar ~1 minuto. Actívala unos minutos antes de la evaluación.
> Los saldos se guardan en `data.json` dentro del servidor; si Render reinicia
> la instancia, los saldos vuelven a los valores iniciales (para una demo es ideal).

## Estructura

- `index.html`, `styles.css`, `script.js` — landing page pública
- `login.html` — inicio de sesión
- `app.html`, `app.js`, `app.css` — dashboard: saldos, transferencias e historial
- `server.js` — API (login, transferencias, tasas) y servidor de archivos estáticos
- `data.json` — se genera solo; guarda cuentas, saldos e historial

## Notas

- Las tasas de cambio son fijas (base USD) y están en `server.js` (`RATES`).
- El botón "Reiniciar demo" del dashboard restaura saldos y borra el historial.
- Es un simulador: las contraseñas se guardan en texto plano en `data.json`,
  no usar con datos reales.
