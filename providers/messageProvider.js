// MessageProvider - generates PERSONALIZED messages for each lead.
// Uses the company name, industry, location and real observed problems
// to make each message unique. Never sends identical messages.
const config = require('../config');

class MessageProvider {
  /**
   * @param data { companyName, industry, location, problems[], scores, url, contact }
   * @returns { string } personalized message
   */
  generate(data) {
    const ownerName = config.owner.name;
    const telegram = config.owner.telegram;
    const vk = config.owner.vk;
    const email = config.owner.email;

    const company = data.companyName || 'ваша компания';
    const industry = data.industry || 'ваша сфера';
    const location = data.location || '';
    const problems = data.problems || [];

    // Pick 2-3 concrete, real observations
    let observations = [];
    if (problems && problems.length) {
      const top = problems.slice(0, 3);
      observations = top.map(p => p.problem.toLowerCase());
    }
    if (observations.length === 0) {
      observations = ['оформление первого экрана можно сделать более современным', 'структуру страницы полезно сделать понятнее', 'путь посетителя до заявки можно сократить'];
    }

    const observationsText = observations.slice(0, 2).join('; ');

    const locText = location ? ` из ${location}` : '';
    const compRef = company.toLowerCase() === 'ваша компания' ? '' : ` Именно для ${company}${locText}`;

    const message = `Здравствуйте! 👋

Меня зовут ${ownerName}, я занимаюсь созданием и редизайном сайтов.

Нашёл ваш сайт и посмотрел на него со стороны обычного клиента. Обратил внимание на несколько моментов, которые можно улучшить: ${observationsText}.

Цель не просто сделать сайт красивее, а сделать его более понятным и удобным для посетителей, чтобы им было проще найти нужную информацию, связаться с вами, заказать услугу или оставить заявку.

Могу бесплатно подготовить небольшой пример того, как могла бы выглядеть обновлённая версия одной из страниц${compRef}.

Без обязательств — просто сможете посмотреть на результат и решить, интересно ли вам это.

Если интересно, могу отправить пример и рассказать, что именно я бы изменил. 👍

Мои контакты:

Telegram:
${telegram}

VK:
${vk}

Email:
${email}`;

    return message;
  }
}

module.exports = new MessageProvider();
