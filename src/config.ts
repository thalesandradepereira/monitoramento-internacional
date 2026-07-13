import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

export const config = {
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  },
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  fromName: process.env.FROM_NAME || 'Monitoramento Internacional',
  destEmail: process.env.DEST_EMAIL || '',
  cron: process.env.CRON_EXPR || '45 2 * * *',
  timezone: process.env.TIMEZONE || 'America/Sao_Paulo',
  maxTopicos: Number(process.env.MAX_TOPICOS || 50),
  janelaHoras: Number(process.env.JANELA_HORAS || 24),
  unsubscribeSecret: process.env.UNSUBSCRIBE_SECRET || '',
  unsubscribeWorkerUrl: (process.env.UNSUBSCRIBE_WORKER_URL || '').replace(/\/$/, ''),
  port: Number(process.env.PORT || 3000),
  webUrl: process.env.WEB_URL || 'http://localhost:3000'
}
