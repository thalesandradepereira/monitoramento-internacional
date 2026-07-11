import { GenerativeModel } from '@google/generative-ai';

export async function generateContentWithRetry(model: GenerativeModel, prompt: string, retries = 3): Promise<any> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      const result = await model.generateContent(prompt);
      return result;
    } catch (err: any) {
      attempt++;
      console.error(`[geminiHelper] Erro ao chamar o Gemini na tentativa ${attempt}: ${err.message || err}`);
      if (attempt >= retries) {
        throw err;
      }
      const waitTime = Math.pow(2, attempt) * 1000;
      console.log(`[geminiHelper] Aguardando ${waitTime}ms antes da próxima tentativa...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}
