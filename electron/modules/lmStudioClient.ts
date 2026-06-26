import axios, { AxiosInstance } from 'axios'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface CompletionResult {
  success: boolean
  content?: string
  error?: string
  model?: string
  tokensUsed?: number
}

export interface ModelInfo {
  id: string
  object: string
}

/**
 * LMStudioClient
 * ALL LM Studio LLM calls go through this class only.
 * No cloud APIs. No Anthropic. No OpenAI cloud.
 */
export class LMStudioClient {
  private baseUrl: string
  private model: string
  private http: AxiosInstance

  constructor(baseUrl: string, model: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.model = model
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 120000,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  async healthCheck(): Promise<{ connected: boolean; error?: string; models?: string[] }> {
    try {
      const res = await this.http.get('/models', { timeout: 5000 })
      const models = (res.data?.data || []).map((m: ModelInfo) => m.id)
      return { connected: true, models }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { connected: false, error: `Cannot reach LM Studio at ${this.baseUrl}: ${message}` }
    }
  }

  async listModels(): Promise<{ success: boolean; models: string[]; error?: string }> {
    try {
      const res = await this.http.get('/models', { timeout: 8000 })
      const models = (res.data?.data || []).map((m: ModelInfo) => m.id)
      return { success: true, models }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, models: [], error: message }
    }
  }

  async chatCompletion(
    messages: ChatMessage[],
    temperature = 0.7,
    maxTokens = 2048
  ): Promise<CompletionResult> {
    const modelToUse = this.model || 'local-model'
    try {
      const res = await this.http.post('/chat/completions', {
        model: modelToUse,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
      })
      const choice = res.data?.choices?.[0]
      if (!choice) return { success: false, error: 'No response choices returned from LM Studio' }
      return {
        success: true,
        content: choice.message?.content || '',
        model: res.data?.model || modelToUse,
        tokensUsed: res.data?.usage?.total_tokens,
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      let userError = `LM Studio error: ${message}`
      if (axios.isAxiosError(err)) {
        if (err.code === 'ECONNREFUSED') {
          userError = `Cannot connect to LM Studio at ${this.baseUrl}. Is LM Studio running with the local server enabled?`
        } else if (err.response?.status === 404) {
          userError = `LM Studio endpoint not found. Check your base URL: ${this.baseUrl}`
        } else if (err.response?.data?.error) {
          userError = `LM Studio: ${err.response.data.error.message || err.response.data.error}`
        }
      }
      return { success: false, error: userError }
    }
  }

  setModel(model: string) { this.model = model }
  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, '')
    this.http.defaults.baseURL = this.baseUrl
  }
}
