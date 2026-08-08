// WebsiteAnalyzer - fetches a real website, parses its structure with cheerio,
// and computes UI/UX/mobile/conversion/redesign scores based on REAL observed
// signals (not fabricated problems). Works without AI key via heuristic engine;
// upgrades to AI-assisted analysis when an OpenAI-compatible key is present.
const cheerio = require('cheerio');
const config = require('../config');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const TIMEOUT = 15000;

class WebsiteAnalyzer {
  async analyze(url) {
    // 1) Fetch real page
    let html = '';
    let statusCode = 0;
    let error = null;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'ru,en;q=0.8' },
        signal: AbortSignal.timeout(TIMEOUT),
        redirect: 'follow'
      });
      statusCode = res.status;
      html = await res.text();
    } catch (e) {
      error = e.message;
    }

    if (error || !html) {
      return { ok: false, error: error || 'NO_CONTENT', statusCode };
    }
    if (statusCode >= 400) {
      return { ok: false, error: 'HTTP_' + statusCode, statusCode };
    }

    // 2) Parse real signals
    const $ = cheerio.load(html);
    const signals = this._extractSignals($, html);

    // 3) Score
    const scores = this._computeScores(signals);

    // 4) Problems & recommendations (evidence-based)
    const { problems, recommendations } = this._buildEvidence(signals, scores);

    // 5) If AI key present, try to enrich (best effort, never blocks)
    let aiInsights = null;
    if (config.ai.apiKey && config.ai.provider === 'openai') {
      try {
        aiInsights = await this._aiEnrich(url, signals);
      } catch (e) { aiInsights = null; }
    }

    return {
      ok: true,
      statusCode,
      scores,
      problems,
      recommendations,
      signals,
      aiInsights
    };
  }

  _extractSignals($, html) {
    const title = $('title').first().text().trim();
    const metaDesc = $('meta[name="description"]').attr('content') || '';
    const h1Count = $('h1').length;
    const h2Count = $('h2').length;
    const h3Count = $('h3').length;
    const headings = $('h1,h2,h3').length;
    const images = $('img').length;
    const imagesWithoutAlt = $('img:not([alt])').length + $('img[alt=""]').length;
    const links = $('a').length;
    const navMenus = $('nav').length + $('header nav').length;
    const buttons = $('button').length;
    const ctaText = ['заказать', 'оставить заявку', 'купить', 'записаться', 'позвонить', 'связаться', 'кнопка', 'заявк', 'заказать звонок', 'обратный звонок'];
    let ctaCount = 0;
    $('a,button').each((i, el) => {
      const t = $(el).text().toLowerCase();
      if (ctaText.some(k => t.includes(k))) ctaCount++;
    });
    const forms = $('form').length;
    const inputs = $('input,textarea,select').length;
    const iframes = $('iframe').length;
    const hasPhone = /[\+]?[0-9][0-9\s\-\(\)]{5,}/.test(html);
    const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(html);
    const hasAddress = /(г\.|город|ул\.|улица|просп\.|пр-т|д\.|дом)/i.test(html);
    const hasMap = /yandex\.ru[^"']*map|google\.com\/maps|maps\.yandex/i.test(html) || $('script').text().match(/map|ymaps/gi) ? true : false;
    const hasSocial = /whatsapp|telegram|t\.me|vk\.com|vk\.ru|instagram|facebook/i.test(html);
    const hasWhatsapp = /wa\.me|whatsapp/i.test(html);
    const hasTelegram = /t\.me\//i.test(html);
    const hasVk = /vk\.com|vk\.ru/i.test(html);
    const scriptLen = $('script').length;
    const linkStyles = $('link[rel="stylesheet"]').length;
    const inlineStyles = $('*[style]').length;
    const hasViewport = !!$('meta[name="viewport"]').attr('content');
    const hasFavicon = !!$('link[rel="icon"]').attr('href') || !!$('link[rel="shortcut icon"]').attr('href');
const textLen = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
    const wordCount = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').length;
    const hasLongText = textLen > 3000;
    const hasCopyright = /©|&#169;/i.test(html);
    const hasAbout = /о компании|о нас|about/i.test(html);
    const hasServices = /услуг|услуги|наши услуги|services/i.test(html);
    const hasContactsSection = /контакт|наши контакты/i.test(html);
    const hasLogo = /logo|png.*logo|svg.*logo/i.test(html);
    const hasNavigation = links > 5;
    const hasFooter = !!$('footer').length;
    const hasHeader = !!$('header').length;
    const hasMobileMenu = /burger|menu|мобильн/i.test(html);
    const hasFormFields = inputs >= 2;
    const hasMultipleCtas = ctaCount >= 2;
    const hasTrust = /сертификат|лиценз|гарант|отзыв|\bрейтинг\b|награда|партнер/i.test(html);
    const hasLiveChat = /jivo|livechat|tawk|crisp|sendpulse|intercom/i.test(html);
const hasAnalytics = /googletagmanager|gtag|yandex\.metrika|yaCounter|gtm\.js/i.test(html);
    const hasFaq = /faq|вопрос-ответ|вопросы и ответы/i.test(html);
    const hasBlog = /блог|blog|новости|статьи/i.test(html);
    const hasPortfolio = /портфолио|наши работы|выполненные работы|portfolio/i.test(html);
    const hasPricing = /прайс|цена|цены|тариф|стоимость/i.test(html);
    const hasReviews = /отзывы|отзыв|reviews/i.test(html);
    const hasCertificates = /сертификат|диплом|лицензия/i.test(html);
    const hasTimetable = /расписание|режим работы|график работы|открыто/i.test(html);

    // Detect missing/inner pages
    const has404 = /404|страница не найдена/i.test(title) || /404/i.test(title);

    return {
      title, metaDesc, h1Count, h2Count, h3Count, headings, images, imagesWithoutAlt,
      links, navMenus, buttons, ctaCount, forms, inputs, iframes, hasPhone, hasEmail,
      hasAddress, hasMap, hasSocial, hasWhatsapp, hasTelegram, hasVk, scriptLen,
      linkStyles, inlineStyles, hasViewport, hasFavicon, textLen, wordCount, hasLongText,
      hasCopyright, hasAbout, hasServices, hasContactsSection, hasLogo, hasNavigation,
      hasFooter, hasHeader, hasMobileMenu, hasFormFields, hasMultipleCtas, hasTrust,
      hasLiveChat, hasAnalytics, hasFaq, hasBlog, hasPortfolio, hasPricing, hasReviews,
      hasCertificates, hasTimetable, has404
    };
  }

  _computeScores(s) {
    // Design score (0-100)
    let design = 50;
    if (s.hasFavicon) design += 5;
    if (s.hasLogo) design += 5;
    if (s.linkStyles >= 1) design += 5;
    if (s.inlineStyles <= 10) design += 5; else design -= 5;
    if (s.images >= 5) design += 5;
    if (s.hasHeader) design += 5;
    if (s.hasFooter) design += 5;
    if (s.hasCopyright) design += 3;
    if (s.hasTrust) design += 5;
    if (s.hasPortfolio) design += 5;
    if (s.imagesWithoutAlt > 0) design -= 4;
    design = clamp(design);

    // Mobile score
    let mobile = 50;
    if (s.hasViewport) mobile += 15; else mobile -= 20;
    if (s.hasMobileMenu) mobile += 10;
    if (s.hasFavicon) mobile += 5;
    if (s.hasWhatsapp) mobile += 5;
    if (s.hasTelegram) mobile += 5;
    if (s.hasLiveChat) mobile += 5;
    if (s.hasAddress) mobile += 5;
    mobile = clamp(mobile);

    // UX score
    let ux = 50;
    if (s.h1Count === 1) ux += 8; else if (s.h1Count === 0) ux -= 10;
    if (s.h2Count >= 2) ux += 5;
    if (s.headings >= 3) ux += 5;
    if (s.hasNavigation) ux += 5;
    if (s.hasAbout) ux += 5;
    if (s.hasServices) ux += 5;
    if (s.hasContactsSection) ux += 5;
    if (s.hasMap) ux += 5;
    if (s.hasPricing) ux += 3;
    if (s.hasFaq) ux += 3;
    if (s.navMenus >= 1) ux += 3;
    if (s.has404) ux -= 15;
    ux = clamp(ux);

    // Conversion score
    let conversion = 50;
    if (s.ctaCount >= 1) conversion += 10;
    if (s.hasMultipleCtas) conversion += 5;
    if (s.forms >= 1) conversion += 10;
    if (s.hasFormFields) conversion += 5;
    if (s.hasPhone) conversion += 10;
    if (s.hasEmail) conversion += 5;
    if (s.hasWhatsapp) conversion += 5;
    if (s.hasLiveChat) conversion += 5;
    if (s.hasAddress) conversion += 5;
    if (s.hasTimetable) conversion += 3;
    if (s.ctaCount === 0) conversion -= 15;
    conversion = clamp(conversion);

    // Overall redesign score = weighted
    const redesign = clamp(Math.round(design * 0.3 + mobile * 0.25 + ux * 0.2 + conversion * 0.25));

    return { design: Math.round(design), mobile: Math.round(mobile), ux: Math.round(ux), conversion: Math.round(conversion), redesign };
  }

  _buildEvidence(s, scores) {
    const problems = [];
    const recommendations = [];

    const add = (sev, problem, why, how) => {
      problems.push({ severity: sev, problem, why });
      recommendations.push({ problem, action: how });
    };

    if (!s.hasViewport) add('high', 'Отсутствует meta viewport — на мобильных устройствах сайт отображается некорректно.', 'Большинство посетителей заходят со смартфонов, и без адаптивной вёрстки они покинут сайт.', 'Добавьте корректный viewport и адаптивную вёрстку.');
    if (s.h1Count !== 1) add('medium', `На странице найдено ${s.h1Count} тегов H1 (ожидается ровно один).`, 'Структура заголовков влияет на понимание темы и SEO.', 'Приведите структуру к одному H1 и логичной иерархии заголовков.');
    if (s.ctaCount === 0) add('high', 'Не найдено кнопок призыва к действию (заявка/звонок/заказ).', 'Без явного призыва посетителю сложно понять, как совершить целевое действие.', 'Добавьте заметные кнопки «Заказать» / «Оставить заявку» на первом экране и в шапке.');
    if (s.forms === 0) add('medium', 'На странице нет ни одной формы обратной связи.', 'Посетитель не может оставить заявку напрямую с сайта.', 'Добавьте простую форму заявки с полями имя, телефон и кнопкой отправки.');
    if (!s.hasPhone) add('high', 'На сайте не найден явный телефонный номер.', 'Клиентам сложно быстро связаться с компанией.', 'Разместите номер телефона в шапке и в футере сайта.');
if (!s.hasEmail && s.forms === 0) add('medium', 'Не найдены контактные данные для связи.', 'Снижает доверие и мешает получить заявку.', 'Добавьте e-mail и контактную информацию в раздел «Контакты».');
    if (s.imagesWithoutAlt > 0) add('low', `${s.imagesWithoutAlt} изображений без alt-атрибутов.`, 'Ухудшает доступность и SEO.', 'Добавьте описательные alt-тексты к изображениям.');
    if (s.images === 0) add('low', 'На странице не найдено изображений.', 'Визуально сайт выглядит бедно и не вызывает доверия.', 'Добавьте качественные фото ваших услуг или работ.');
    if (!s.hasAbout) add('low', 'Не найден блок «О компании».', 'Посетители хотят знать, кому доверяют.', 'Добавьте блок о компании и команде.');
    if (!s.hasServices) add('medium', 'Не найден блок с услугами.', 'Сложно понять, что предлагает компания.', 'Структурируйте услуги с ценами и описаниями.');
    if (!s.hasContactsSection) add('medium', 'Не найден раздел «Контакты».', 'Без контактов сложно связаться и доверять.', 'Добавьте полноценный раздел контактов с адресом и картой.');
    if (!s.hasMap && s.hasAddress !== true) add('low', 'Не найден адрес или карта проезда.', 'Клиентам сложно найти офис.', 'Добавьте адрес и встроенную карту.');
    if (!s.hasTrust) add('medium', 'Не найдены элементы доверия (отзывы, сертификаты, лицензии).', 'Доверие напрямую влияет на конверсию.', 'Добавьте отзывы, сертификаты или статистику.');
    if (!s.hasReviews) add('medium', 'Не найдены отзывы клиентов.', 'Отзывы повышают доверие и конверсию.', 'Добавьте блок реальных отзывов.');
    if (!s.hasFaq) add('low', 'Не найден блок «Вопрос-ответ».', 'Частые вопросы клиентов остаются без ответа.', 'Добавьте FAQ по основным вопросам.');
    if (!s.hasTimetable) add('low', 'Не найден режим работы.', 'Клиенты не знают, когда можно обратиться.', 'Укажите график работы.');
    if (s.has404) add('high', 'Страница возвращает ошибку 404.', 'Сломанная страница отпугивает посетителей.', 'Убедитесь, что страница загружается корректно.');
    if (s.scriptLen > 30) add('low', 'Много подключённых скриптов, что может замедлять загрузку.', 'Скорость загрузки влияет на UX и SEO.', 'Оптимизируйте и объедините скрипты.');
    if (s.wordCount < 150) add('low', 'Очень мало текстового контента на странице.', 'Недостаточно информации для принятия решения.', 'Добавьте содержательные тексты о ваших услугах.');

    // limit
    const maxProblems = 8;
    const sorted = problems.sort((a,b) => sevRank(a.severity) - sevRank(b.severity)).slice(0, maxProblems);
    const sortedRecs = recommendations.filter(r => sorted.some(p => p.problem === r.problem));

    return { problems: sorted, recommendations: sortedRecs };
  }

  async _aiEnrich(url, signals) {
    const { default: fetch } = await import('node-fetch').catch(() => ({ default: global.fetch }));
    const prompt = `Проанализируй сайт ${url} как веб-специалист. Вот реально извлечённые сигналы: ${JSON.stringify(signals)}. Кратко (2-3 предложения) опиши основные проблемы и самый важный совет по редизайну. Ответ на русском.`;
    const res = await fetch(config.ai.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.ai.apiKey },
      body: JSON.stringify({ model: config.ai.model, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 300 }),
      signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) throw new Error('AI HTTP ' + res.status);
    const data = await res.json();
    return (data.choices && data.choices[0] && data.choices[0].message.content) || null;
  }
}

function clamp(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}
function sevRank(s) {
  return s === 'high' ? 0 : s === 'medium' ? 1 : 2;
}

module.exports = new WebsiteAnalyzer();
