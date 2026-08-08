# NEXARO AI LEAD HUNTER

Автономный ИИ-агент, который **постоянно находит новые сайты в интернете**, анализирует их с помощью ИИ, определяет компании, которым может быть нужен редизайн, и создаёт для них персональные предложения.

> **Главный принцип:** НЕ показывать заранее подготовленные сайты, а постоянно находить новые сайты → анализировать → находить потенциальных клиентов.

---

## 🚀 Быстрый старт

```bash
npm install
npm start
```

Откройте **http://localhost:3000**

## ⚙️ Настройка (.env)

Скопируйте `.env.example` → `.env` и при необходимости заполните ключи.

| Параметр | Описание |
|----------|----------|
| `SEARCH_PROVIDER` | `duckduckgo` (по умолчанию, бесплатно) / `bing` / `serpapi` / `google` |
| `BING_API_KEY` | Ключ Bing Web Search API |
| `SERPAPI_KEY` | Ключ SerpAPI |
| `GOOGLE_CX`, `GOOGLE_API_KEY` | Ключ Google Custom Search |
| `AI_API_KEY` | OpenAI-совместимый ключ (опционально). Без ключа работает встроенный эвристический анализатор. |
| `OWNER_*` | Ваши контакты для сообщений |

**API-ключи никогда не попадают во фронтенд** — они хранятся только на сервере.

---

## 🏗 Архитектура

```
AI Query Generator → Search API → Website Discovery → Deduplication
→ AI Site Analyzer → Lead Scoring → Contact Finder → Message Generator
→ Manual Approval → Official API
```

## 📦 Структура

- `server.js` — Express-сервер + REST API
- `agents/agent-controller.js` — машина состояний агента (START / STOP / PAUSE / AUTOPILOT)
- `providers/` — интерфейсы провайдеров (подключаемые)
  - `searchProvider.js` — DuckDuckGo / Bing / SerpAPI / Google
  - `queryGenerator.js` — ИИ-генерация поисковых запросов
  - `websiteAnalyzer.js` — анализ сайтов (реальный fetch + парсинг)
  - `contactFinder.js` — поиск официальных публичных контактов
  - `messageProvider.js` — генерация персональных сообщений
  - `aiProvider.js` — абстракция LLM
- `scoring/leadScoring.js` — расчёт redesign/lead score и категорий
- `database/db.js` — постоянное JSON-хранилище с дедупликацией
- `public/` — интерфейс (Dashboard, Live Activity, Leads, Approval, Settings)

## ✅ Ключевые возможности

- **Реальный поиск** — сайты приходят из внешнего интернета, ничего не захардкожено
- **Динамические запросы** — ИИ создаёт новые поисковые запросы под каждую нишу
- **Дедупликация** — домен, компания, контакт, история сообщений (повторов нет)
- **AI-анализ** — реальные сигналы сайта (forms, CTA, viewport, H1, контакты...)
- **Redesign Score** и **Lead Score** (0-100) + категории HIGH/MEDIUM/LOW/NOT_A_LEAD
- **Персональные сообщения** — имя компании, ниша, город, конкретные проблемы
- **Расписание** — 15 мин / 30 мин / 1 час / 3 часа / ежедневно
- **Manual Approval** — перед отправкой: Approve / Edit / Reject
- **Demo / Live режимы** — отделены
- **Обработка ошибок** — приложение не падает из-за одного сайта

## 🔒 Этика

- Только официальные публичные контакты
- Без утечек данных и украденных баз
- Без обхода CAPTCHA и антибот-защиты
- Rate limits, manual approval, do-not-contact list

## 🔌 Подключение официального API для отправки

Интерфейсы провайдеров позволяют подключить официальные API (Telegram Bot API, рассылки и т.д.) для отправки сообщений после подтверждения пользователя. Пока API не подключён — доступны кнопки **Copy message**, **Open contact**, **Export lead**.
