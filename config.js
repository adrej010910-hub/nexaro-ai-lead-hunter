// Central configuration loader.
// All external integration settings are read from .env (server-side only).
require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  owner: {
    name: process.env.OWNER_NAME || 'Андрей',
    telegram: process.env.OWNER_TELEGRAM || 'https://t.me/ShadowwLi',
    vk: process.env.OWNER_VK || 'https://vk.ru/id677188861',
    email: process.env.OWNER_EMAIL || 'adrej010910@gmail.com'
  },
  ai: {
    provider: process.env.AI_PROVIDER || 'openai',
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    baseUrl: process.env.AI_BASE_URL || 'https://api.openai.com/v1'
  },
  search: {
    provider: process.env.SEARCH_PROVIDER || 'duckduckgo',
    bingApiKey: process.env.BING_API_KEY || '',
    bingEndpoint: process.env.BING_ENDPOINT || '',
    serpapiKey: process.env.SERPAPI_KEY || '',
    googleCx: process.env.GOOGLE_CX || '',
    googleApiKey: process.env.GOOGLE_API_KEY || ''
  }
};

module.exports = config;
