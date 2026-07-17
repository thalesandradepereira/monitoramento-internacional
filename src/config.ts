import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

export const config = {
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: 'gemini-3.1-flash-lite', // Usando 3.1-flash-lite pois 3.5 está sobrecarregado (503) e 2.0 esgotou cota.
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
  cron: process.env.CRON_EXPR || '0 2 * * *',
  timezone: process.env.TIMEZONE || 'America/Sao_Paulo',
  maxTopicos: Number(process.env.MAX_TOPICOS || 50),
  janelaHoras: Number(process.env.JANELA_HORAS || 24),
  unsubscribeSecret: process.env.UNSUBSCRIBE_SECRET || '',
  unsubscribeWorkerUrl: (process.env.UNSUBSCRIBE_WORKER_URL || '').replace(/\/$/, ''),
  port: Number(process.env.PORT || 3000),
  webUrl: process.env.WEB_URL || 'http://localhost:3000',
  dryRun: process.env.DRY_RUN !== 'false',
  executionMode: (process.env.EXECUTION_MODE || 'local') as 'scheduled' | 'manual' | 'local',
  dailyExecutionLogPath: process.env.DAILY_EXECUTION_LOG_PATH || 'state/daily-executions.json'
}
