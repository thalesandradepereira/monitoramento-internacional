import cron from 'node-cron'
import { config } from './config'
import { runPipeline } from './run'
import { startServer } from './server'

console.log(`[Monitoramento Internacional] Iniciado. Cron agendado para: "${config.cron}" (${config.timezone})`)
startServer()

cron.schedule(
  config.cron,
  async () => {
    console.log(`\n--- Rotina disparada via Cron às ${new Date().toLocaleString()} ---`)
    await runPipeline()
  },
  {
    scheduled: true,
    timezone: config.timezone,
  }
)
