/**
 * Dev-server proxy: the browser talks to the same origin (/api), and the Angular
 * dev server forwards to the NestJS API. Same-origin keeps the refresh cookie
 * first-party and avoids CORS.
 *
 * API_PROXY_TARGET overrides the target (used by the e2e tests).
 */
export default {
  '/api': {
    target: process.env['API_PROXY_TARGET'] ?? 'http://localhost:3000',
    secure: false,
    changeOrigin: false,
    logLevel: 'warn',
  },
};
