// AIProvider - abstraction for AI/LLM services.
// Currently the AI analysis is handled by the heuristic engine in
// WebsiteAnalyzer, with optional OpenAI-compatible enrichment when a key
// is present. This interface keeps the door open for plugging in other
// AI providers (OpenAI, OpenRouter, Anthropic, local models) via .env.
const config = require('../config');

class AIProvider {
  constructor() {
    this.provider = config.ai.provider || 'openai';
    this.hasKey = !!config.ai.apiKey;
  }

  isConfigured() {
    return this.hasKey;
  }

  getProviderName() {
    return this.provider;
  }

  /**
   * Send a chat completion request to an OpenAI-compatible endpoint.
   * Returns text response or null on failure.
   */
  async chat(messages, { temperature = 0.7, maxTokens = 500 } = {}) {
    if (!this.hasKey) return null;
    try {
      const res = await fetch(config.ai.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.ai.apiKey },
        body: JSON.stringify({
          model: config.ai.model,
          messages,
          temperature,
          max_tokens: maxTokens
        }),
        signal: AbortSignal.timeout(20000)
      });
      if (!res.ok) throw new Error('AI HTTP ' + res.status);
      const data = await res.json();
      return (data.choices && data.choices[0] && data.choices[0].message.content) || null;
    } catch (e) {
      console.warn('AI chat failed:', e.message);
      return null;
    }
  }
}

module.exports = new AIProvider();
