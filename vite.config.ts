import { defineConfig, type Plugin } from 'vite';

/**
 * Ludo developer test controller (local development only).
 *
 * - Enabled only for `vite serve` when LUDO_DEV_MODE=true (never in builds).
 * - Binds to the dev server on 127.0.0.1; the Telegram control service
 *   running on the same machine POSTs forced dice values here.
 * - A forced value is consumed exactly once by the next Ludo roll.
 */
function ludoDevControl(enabled: boolean): Plugin {
  let next: number | null = null;

  const send = (res: import('node:http').ServerResponse, code: number, body: unknown): void => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const readBody = (req: import('node:http').IncomingMessage): Promise<string> =>
    new Promise((resolve) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => resolve(data));
      req.on('error', () => resolve(''));
    });

  return {
    name: 'ludo-dev-control',
    apply: 'serve',
    configureServer(server) {
      if (!enabled) return;
      server.middlewares.use((req, res, done) => {
        const url = (req.url ?? '').split('?')[0];
        if (!url.startsWith('/ludo-dev')) return done();
        const origin = req.headers.origin ?? '';
        if (origin && !origin.includes('127.0.0.1') && !origin.includes('localhost')) {
          send(res, 403, { error: 'forbidden' });
          return;
        }
        if (req.method === 'GET' && url === '/ludo-dev/state') {
          send(res, 200, { devMode: true, next });
          return;
        }
        if (req.method === 'POST' && url === '/ludo-dev/set') {
          void readBody(req).then((raw) => {
            let value: unknown = null;
            try {
              value = JSON.parse(raw || '{}')?.value;
            } catch {
              value = null;
            }
            const n = typeof value === 'string' ? Number(value) : value;
            if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 6) {
              send(res, 400, { error: 'value must be an integer from 1 to 6' });
              return;
            }
            next = n;
            send(res, 200, { ok: true, next });
          });
          return;
        }
        if (req.method === 'POST' && url === '/ludo-dev/consume') {
          const value = next;
          next = null;
          send(res, 200, { value });
          return;
        }
        if (req.method === 'POST' && url === '/ludo-dev/reset') {
          next = null;
          send(res, 200, { ok: true, next });
          return;
        }
        send(res, 404, { error: 'not found' });
      });
    },
  };
}

export default defineConfig(({ command }) => {
  // Hard production gate: the dev flag is only ever true for `vite serve`
  // with LUDO_DEV_MODE=true. `vite build` always defines it as false, so
  // every reference to dev mode is stripped from the shipped bundle.
  const devMode = command === 'serve' && process.env.LUDO_DEV_MODE === 'true';

  return {
    base: './',
    define: {
      __LUDO_DEV__: JSON.stringify(devMode),
    },
    plugins: [ludoDevControl(devMode)],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
    },
    preview: {
      host: '127.0.0.1',
      port: 4173,
      strictPort: true,
    },
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 2000,
    },
  };
});
