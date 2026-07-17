declare module 'google-news-url-decoder' {
  export class GoogleDecoder {
    constructor(proxy?: string | null)
    decode(sourceUrl: string): Promise<{ status: boolean; decoded_url?: string; message?: string }>
  }
}
