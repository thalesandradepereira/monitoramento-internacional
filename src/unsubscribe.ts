import crypto from 'crypto'
import { config } from './config'

/**
 * Gera um link de descadastro assinado com HMAC-SHA256.
 * Cada destinatário recebe um link único — impossível forjar sem a chave secreta.
 */
export function gerarLinkDescadastro(email: string): string {
  if (!config.unsubscribeSecret || !config.unsubscribeWorkerUrl) {
    // Sem configuração de descadastro automático — retorna mailto como fallback.
    return `mailto:${config.smtp.user}?subject=${encodeURIComponent('Cancelar inscrição — Monitoramento Internacional')}&body=${encodeURIComponent(`Cancelar para: ${email}`)}`
  }

  const emailNorm = email.toLowerCase().trim()
  const token = crypto
    .createHmac('sha256', config.unsubscribeSecret)
    .update(emailNorm)
    .digest('hex')

  const params = new URLSearchParams({ email: emailNorm, token })
  return `${config.unsubscribeWorkerUrl}/unsubscribe?${params.toString()}`
}
