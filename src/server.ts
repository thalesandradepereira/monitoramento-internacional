import express from 'express'
import { config } from './config'

export function subscriptionWorkerBaseUrl(): string {
  const configured = config.unsubscribeWorkerUrl.trim()
  if (configured) return configured.replace(/\/$/, '')

  const apiUrl = new URL(config.recipients.apiUrl)
  if (apiUrl.protocol !== 'https:') {
    throw new Error('[server] Subscription worker URL must use HTTPS.')
  }
  return apiUrl.origin
}

export function createSubscriptionApp(workerBaseUrl = subscriptionWorkerBaseUrl()) {
  const app = express()
  const base = workerBaseUrl.replace(/\/$/, '')

  app.disable('x-powered-by')

  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    next()
  })

  // The legacy Express subscription UI no longer stores recipient PII locally.
  // All subscription state is centralized in the Cloudflare Worker + D1.
  app.get('/', (_req, res) => {
    res.redirect(302, `${base}/invite`)
  })

  // Preserve the original POST semantics while delegating the request to the
  // authoritative D1-backed endpoint. 307 instructs the client to replay the
  // POST body at the Worker without reflecting untrusted input in HTML.
  app.post('/subscribe', (_req, res) => {
    res.redirect(307, `${base}/subscribe`)
  })

  app.all('/subscribe', (_req, res) => {
    res.status(405).type('text/plain; charset=utf-8').send('Method not allowed')
  })

  return app
}

export function startServer() {
  const app = createSubscriptionApp()
  return app.listen(config.port, () => {
    console.log(
      `[Web] Legacy subscription gateway listening on ${config.webUrl} (port ${config.port}); storage delegated to Cloudflare D1.`,
    )
  })
}
