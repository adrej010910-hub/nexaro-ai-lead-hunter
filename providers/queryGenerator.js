// QueryGenerator - AI-driven creation of dynamic search queries.
// When an OpenAI-compatible API key is present, it uses the LLM to invent
// new query combinations. Without a key, it falls back to a deterministic
// combinator engine so the app still works (still fully dynamic, no hardcoded sites).

const config = require('../config');

const INDUSTRIES = [
  'Рестораны', 'Кафе', 'Отели', 'Салоны красоты', 'Стоматология',
  'Медицинские центры', 'Автосервисы', 'Строительство', 'Недвижимость',
  'Юридические услуги', 'Мебельные магазины', 'Образование', 'Фитнес',
  'Туризм', 'Производство', 'Локальный бизнес'
];

// Query modifiers that combine with the industry + region to form many variants.
const MODIFIERS = [
  'официальный сайт', 'меню', 'цены', 'заказать', 'услуги', 'контакты',
  'прайс', 'каталог', 'отзывы', 'акции', 'бронирование', 'онлайн',
  'купить', 'запись', 'главная', 'вакансии'
];

class QueryGenerator {
  listIndustries() {
    return [...INDUSTRIES];
  }

  // Generate N dynamic queries for a given industry + region.
  generate({ industry, region, language = 'ru', limit = 12 }) {
    const industryTerms = industry ? industry.split(/[,\/]/).map(s => s.trim()).filter(Boolean) : [industry || 'бизнес'];
    const regionTerms = region ? region.split(/[,\/]/).map(s => s.trim()).filter(Boolean) : [];

    const queries = [];
    const add = (q) => {
      const norm = q.trim().replace(/\s+/g, ' ');
      if (norm && !queries.includes(norm)) queries.push(norm);
    };

    for (const ind of industryTerms) {
      // base
      if (regionTerms.length) {
        for (const rg of regionTerms) {
          add(`${ind} ${rg} официальный сайт`);
          add(`${ind} ${rg} контакты`);
          add(`${ind} ${rg} услуги цены`);
        }
      } else {
        add(`${ind} официальный сайт`);
        add(`${ind} услуги цены`);
        add(`${ind} контакты`);
        add(`${ind} заказать`);
        add(`${ind} отзывы`);
      }
      // modifiers
      for (const mod of MODIFIERS) {
        if (regionTerms.length) {
          for (const rg of regionTerms.slice(0, 2)) {
            add(`${ind} ${rg} ${mod}`);
          }
        } else {
          add(`${ind} ${mod}`);
        }
        if (queries.length >= limit) break;
      }
      if (queries.length >= limit) break;
    }

    // If we have an AI key, augment with AI-generated queries (best effort).
    if (config.ai.apiKey && config.ai.provider === 'openai') {
      try {
        this._aiAugment({ industry, region, limit }).then(aiQueries => {
          for (const q of aiQueries) add(q);
        }).catch(() => {});
      } catch (e) { /* ignore */ }
    }

    return queries.slice(0, limit);
  }

  async _aiAugment({ industry, region, limit }) {
    const { default: fetch } = await import('node-fetch').catch(() => ({ default: global.fetch }));
    const prompt = `Ты — генератор поисковых запросов для поиска сайтов компаний. Ниша: "${industry}". Регион: "${region || 'все'}". Придумай ${limit} разнообразных поисковых запросов на русском для поиска официальных сайтов компаний этой ниши. Верни ТОЛЬКО список запросов, по одному на строку, без нумерации.`;
    const res = await fetch(config.ai.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.ai.apiKey },
      body: JSON.stringify({
        model: config.ai.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
        max_tokens: 400
      }),
      signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) throw new Error('AI HTTP ' + res.status);
    const data = await res.json();
    const text = data.choices && data.choices[0] && data.choices[0].message.content || '';
    return text.split('\n').map(l => l.replace(/^\d+[\.\)]\s*/, '').trim()).filter(Boolean);
  }
}

module.exports = new QueryGenerator();
