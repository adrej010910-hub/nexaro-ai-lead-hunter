// SearchProvider - modular search integration.
// Default: DuckDuckGo (free, no key). Bing / SerpAPI / Google can be
// enabled via environment variables. Returns REAL web results only.
const config = require('../config');

const DEFAULT_TIMEOUT = 15000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

class SearchProvider {
  constructor() {
    this.provider = config.search.provider || 'duckduckgo';
  }

  async search(query, limit = 10) {
    try {
      switch (this.provider) {
        case 'bing':
          if (config.search.bingApiKey) return await this._searchBing(query, limit);
          break;
        case 'serpapi':
          if (config.search.serpapiKey) return await this._searchSerpapi(query, limit);
          break;
        case 'google':
          if (config.search.googleApiKey && config.search.googleCx) return await this._searchGoogle(query, limit);
          break;
        case 'duckduckgo':
        default:
          return await this._searchDuckDuckGo(query, limit);
      }
      // fallback if configured provider lacks key
      return await this._searchDuckDuckGo(query, limit);
    } catch (e) {
      throw new Error('Search failed: ' + e.message);
    }
  }

  // ---- DuckDuckGo HTML (free, no key) ----
  async _searchDuckDuckGo(query, limit) {
    const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT)
    });
    if (!res.ok) throw new Error('DuckDuckGo HTTP ' + res.status);
    const html = await res.text();
    return this._parseDuckDuckGo(html, limit);
  }

  _parseDuckDuckGo(html, limit) {
    const results = [];
    // match result links: class="result__a" href="..."
    const linkRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
    let m;
    while ((m = linkRe.exec(html)) !== null && results.length < limit) {
      let href = m[1];
      let title = m[2].replace(/<[^>]+>/g, '').trim();
      // DuckDuckGo uses uddg redirect - decode to real URL
      const uddg = href.match(/uddg=([^&]+)/);
      if (uddg) href = decodeURIComponent(uddg[1]);
      if (href && /^https?:\/\//i.test(href)) {
        results.push({ title, url: href });
      }
    }
    return results;
  }

  // ---- Bing Web Search API ----
  async _searchBing(query, limit) {
    const url = (config.search.bingEndpoint || 'https://api.bing.microsoft.com/v7.0/search') +
      '?q=' + encodeURIComponent(query) + '&count=' + limit;
    const res = await fetch(url, {
      headers: { 'Ocp-Apim-Subscription-Key': config.search.bingApiKey },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT)
    });
    if (!res.ok) throw new Error('Bing HTTP ' + res.status);
    const data = await res.json();
    return (data.webPages && data.webPages.value || []).map(item => ({
      title: item.name, url: item.url
    }));
  }

  // ---- SerpAPI ----
  async _searchSerpapi(query, limit) {
    const url = 'https://serpapi.com/search.json?engine=google&q=' + encodeURIComponent(query) +
      '&num=' + limit + '&api_key=' + config.search.serpapiKey;
    const res = await fetch(url, { signal: AbortSignal.timeout(DEFAULT_TIMEOUT) });
    if (!res.ok) throw new Error('SerpAPI HTTP ' + res.status);
    const data = await res.json();
    return (data.organic_results || []).slice(0, limit).map(item => ({
      title: item.title, url: item.link
    }));
  }

  // ---- Google Custom Search ----
  async _searchGoogle(query, limit) {
    const url = 'https://www.googleapis.com/customsearch/v1?key=' + config.search.googleApiKey +
      '&cx=' + config.search.googleCx + '&q=' + encodeURIComponent(query) + '&num=' + Math.min(limit, 10);
    const res = await fetch(url, { signal: AbortSignal.timeout(DEFAULT_TIMEOUT) });
    if (!res.ok) throw new Error('Google HTTP ' + res.status);
    const data = await res.json();
    return (data.items || []).slice(0, limit).map(item => ({
      title: item.title, url: item.link
    }));
  }
}

module.exports = new SearchProvider();
