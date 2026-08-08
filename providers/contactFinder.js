// ContactFinder - finds official PUBLIC contact information from a website.
// It only extracts contacts that are openly published on the site itself
// (email, phone, Telegram, VK, contact form URL). No private data, no leaks.
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const TIMEOUT = 12000;

class ContactFinder {
  /**
   * Find official public contacts for a domain/url.
   * Returns array of { type, value, priority, label }
   */
  async findContacts({ url, domain }) {
    const contacts = [];
    const origins = [url];

    // Also try https://domain and http://domain
    if (domain) {
      origins.push('https://' + domain);
      if (!url || url.indexOf(domain) === -1) addOrigin(origins, 'http://' + domain);
    }

    for (const origin of unique(origins)) {
      try {
        const res = await fetch(origin, {
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(TIMEOUT),
          redirect: 'follow'
        });
        if (!res.ok) continue;
        const html = await res.text();
        const found = this._parseHtml(html, new URL(origin));
        for (const c of found) {
          if (!contacts.some(ex => ex.type === c.type && ex.value.trim().toLowerCase() === c.value.trim().toLowerCase())) {
            contacts.push(c);
          }
        }
        if (this._hasKeyContact(contacts)) break; // got enough
      } catch (e) {
        // skip unreachable origins
      }
    }

    // Sort by priority (email > telegram > vk > form > phone)
    const priority = { email: 1, telegram: 2, vk: 3, form: 4, phone: 5, other: 6 };
    return contacts.sort((a, b) => (priority[a.type] || 9) - (priority[b.type] || 9));
  }

  _hasKeyContact(contacts) {
    return contacts.some(c => ['email', 'telegram', 'vk'].includes(c.type));
  }

  _parseHtml(html, baseUrl) {
    const $ = cheerio.load(html);
    const found = [];
    const add = (type, value, label) => {
      const v = (value || '').trim();
      if (!v) return;
      found.push({ type, value: v, label: label || '' });
    };

    // Emails
    const emailRe = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const text = $('body').text();
    let m;
    while ((m = emailRe.exec(text)) !== null) {
      const em = m[0];
      if (!/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(em)) {
        add('email', em, 'Email');
      }
      if (found.filter(f => f.type === 'email').length >= 3) break;
    }

    // mailto links
    $('a[href^="mailto:"]').each((i, el) => {
      const h = $(el).attr('href').replace('mailto:', '').split('?')[0];
      if (h) add('email', h, 'Email');
    });

    // Telegram
    $('a[href*="t.me/"],a[href*="telegram.me/"]').each((i, el) => {
      const h = $(el).attr('href');
      const tgm = h.match(/t\.me\/([A-Za-z0-9_]+)/i) || h.match(/telegram\.me\/([A-Za-z0-9_]+)/i);
      if (tgm) add('telegram', 'https://t.me/' + tgm[1], 'Telegram');
    });

    // VK
    $('a[href*="vk.com/"],a[href*="vk.ru/"]').each((i, el) => {
      let h = $(el).attr('href');
      h = h.replace(/^\/\//, 'https://');
      if (!/^https?:\/\//.test(h)) h = baseUrl.origin + h;
      if (/vk\.com\/|vk\.ru\//.test(h)) add('vk', h, 'VK');
    });

    // Phone
    $('a[href^="tel:"]').each((i, el) => {
      const h = $(el).attr('href').replace('tel:', '');
      add('phone', h, 'Телефон');
    });

    // Contact form / contacts page link
    $('a').each((i, el) => {
      const href = $(el).attr('href') || '';
      const txt = ($(el).text() || '').toLowerCase();
      if (/контакт|связ|заявк|обратная|contact/i.test(txt) || /контакт/i.test(href)) {
        let h = href;
        if (!/^https?:\/\//.test(h)) h = new URL(h, baseUrl).href;
        if (/^https?:\/\//.test(h)) add('form', h, 'Форма связи');
      }
    });

    return found;
  }
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}
function addOrigin(arr, v) {
  if (v && !arr.includes(v)) arr.push(v);
}

module.exports = new ContactFinder();
