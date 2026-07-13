import { GenerativeModel } from '@google/generative-ai';

export async function generateContentWithRetry(model: GenerativeModel, prompt: string, retries = 3): Promise<any> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      // Free Tier Limit mitigation: 15 RPM. Wait 4s to guarantee < 15 requests per minute
      console.log(`[geminiHelper] Aguardando 4s para evitar limite de cota da API (Free Tier)...`);
      await new Promise(resolve => setTimeout(resolve, 4000));

      const result = await model.generateContent(prompt);
      return result;
    } catch (err: any) {
      attempt++;
      console.error(`[geminiHelper] Erro ao chamar o Gemini na tentativa ${attempt}: ${err.message || err}`);
      if (attempt >= retries) {
        throw err;
      }
      // Se for um erro 429 (Too Many Requests), vamos ser mais generosos e esperar 15 segundos
      const isRateLimit = err.message && err.message.includes('429');
      const waitTime = isRateLimit ? 15000 : Math.pow(2, attempt) * 1000;
      
      console.log(`[geminiHelper] Aguardando ${waitTime}ms antes da próxima tentativa...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

export function cleanGeminiJson(text: string): string {
  return text.replace(/```json/gi, '').replace(/```/g, '').trim();
}
