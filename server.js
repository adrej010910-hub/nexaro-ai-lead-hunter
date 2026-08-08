// NEXARO AI LEAD HUNTER - Express server
// Provides REST API + static frontend. API keys stay server-side only.
const express = require('express');
const path = require('path');
const config = require('./config');
const db = require('./database/db');
const agent = require('./agents/agent-controller');
const providers = require('./providers');
const { QueryGenerator } = providers;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Simple request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// ---------- Agent control ----------
app.get('/api/agent/state', (req, res) => {
  res.json({ state: agent.getState(), stats: db.getStats() });
});

app.post('/api/agent/start', (req, res) => {
  res.json(agent.start());
});
app.post('/api/agent/stop', (req, res) => {
  res.json(agent.stop());
});
app.post('/api/agent/pause', (req, res) => {
  res.json(agent.pause());
});
app.post('/api/agent/resume', (req, res) => {
  res.json(agent.resume());
});
app.post('/api/agent/mode', (req, res) => {
  const { mode } = req.body || {};
  res.json({ mode: agent.setMode(mode) });
});
app.post('/api/agent/autopilot', (req, res) => {
  const cfg = req.body || {};
  res.json({ autopilot: agent.setAutopilot(cfg) });
});

// ---------- Data ----------
app.get('/api/websites', (req, res) => {
  const snap = db.snapshot();
  const { industry, city, country, analyzed, notAnalyzed, newToday, newThisWeek, minScore, contactAvailable } = req.query;
  let websites = snap.websites;

  if (industry) websites = websites.filter(w => (w.industry || '').toLowerCase().includes(industry.toLowerCase()));
  if (city) websites = websites.filter(w => (w.location || '').toLowerCase().includes(city.toLowerCase()));
  if (country) websites = websites.filter(w => (w.location || '').toLowerCase().includes(country.toLowerCase()));

  const now = new Date();
  if (newToday) {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    websites = websites.filter(w => new Date(w.firstFoundAt) >= todayStart);
  }
  if (newThisWeek) {
    const weekStart = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    websites = websites.filter(w => new Date(w.firstFoundAt) >= weekStart);
  }

  if (analyzed) websites = websites.filter(w => snap.analyses.some(a => a.websiteId === w.id));
  if (notAnalyzed) websites = websites.filter(w => !snap.analyses.some(a => a.websiteId === w.id));

  if (minScore) {
    const ms = parseInt(minScore, 10);
    websites = websites.filter(w => {
      const a = snap.analyses.find(x => x.websiteId === w.id);
      return a && a.redesignScore <= ms;
    });
  }
  if (contactAvailable) {
    websites = websites.filter(w => snap.leads.some(l => l.websiteId === w.id && l.contact));
  }

  return res.json({ websites });
});

app.get('/api/leads', (req, res) => {
  const snap = db.snapshot();
  const { category, status } = req.query;
  let leads = snap.leads;

  // enrich with website + message
  leads = leads.map(l => {
    const web = snap.websites.find(w => w.id === l.websiteId);
    const msg = snap.messages.find(m => m.leadId === l.id);
    const analysis = snap.analyses.find(a => a.websiteId === l.websiteId);
    return { ...l, website: web, message: msg, analysis };
  });

  if (category) leads = leads.filter(l => l.category === category);
  if (status) leads = leads.filter(l => l.status === status);
  leads.sort((a, b) => b.leadScore - a.leadScore);
  res.json({ leads });
});

app.get('/api/leads/:id', (req, res) => {
  const snap = db.snapshot();
  const lead = snap.leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'not found' });
  const web = snap.websites.find(w => w.id === lead.websiteId);
  const msg = snap.messages.find(m => m.leadId === lead.id);
  const analysis = snap.analyses.find(a => a.websiteId === lead.websiteId);
  res.json({ lead: { ...lead, website: web, message: msg, analysis } });
});

// ---------- Messages / approval workflow ----------
app.post('/api/leads/:id/approve', (req, res) => {
  const lead = db.getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: 'not found' });
  db.approveMessage(req.params.id);
  db.updateLead(req.params.id, { status: 'approved' });
  res.json({ ok: true });
});

app.post('/api/leads/:id/edit-message', (req, res) => {
  const { message } = req.body || {};
  const lead = db.getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: 'not found' });
  const msg = db.getMessage(req.params.id);
  if (msg) { msg.message = message; db._save(); }
  res.json({ ok: true });
});

app.post('/api/leads/:id/reject', (req, res) => {
  const lead = db.getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: 'not found' });
  db.updateLead(req.params.id, { status: 'rejected' });
  res.json({ ok: true });
});

app.post('/api/leads/:id/mark-sent', (req, res) => {
  const lead = db.getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: 'not found' });
  db.markMessageSent(req.params.id);
  db.updateLead(req.params.id, { status: 'contacted' });
  res.json({ ok: true });
});

// mark contacted by domain (for do-not-contact protection)
app.post('/api/leads/:id/contacted', (req, res) => {
  const lead = db.getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: 'not found' });
  const web = db.getWebsite(lead.websiteId);
  if (web) db.markContacted(web.domain);
  db.updateLead(req.params.id, { status: 'contacted' });
  res.json({ ok: true });
});

// ---------- Activity ----------
app.get('/api/activity', (req, res) => {
  const snap = db.snapshot();
  res.json({ activity: snap.activity.slice(0, 100) });
});

// ---------- Industries ----------
app.get('/api/industries', (req, res) => {
  res.json({ industries: QueryGenerator.listIndustries() });
});

// ---------- Manual single-scan (test) ----------
app.post('/api/agent/scan-once', async (req, res) => {
  const { industry, region, results } = req.body || {};
  if (!industry) return res.json({ error: 'industry required' });
  const queries = QueryGenerator.generate({ industry, region: region || '', limit: 5 });
  const found = [];
  for (const q of queries) {
    try {
      const r = await providers.SearchProvider.search(q, results || 5);
      found.push(...r);
    } catch (e) { /* continue */ }
  }
  res.json({ queries, resultsCount: found.length, results: found.slice(0, 20) });
});

// ---------- Export ----------
app.get('/api/export', (req, res) => {
  const snap = db.snapshot();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="nexaro-leads.json"');
  res.send(JSON.stringify(snap, null, 2));
});

// 404 for unknown api
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// ---------- Vercel serverless export ----------
// On Vercel the app is exported as a handler; `listen` only runs locally.
module.exports = app;

if (require.main === module) {
  app.listen(config.port, () => {
    console.log('==================================================');
    console.log('  NEXARO AI LEAD HUNTER');
    console.log('  http://localhost:' + config.port);
    console.log('  Search provider: ' + config.search.provider);
    console.log('  AI provider: ' + (config.ai.apiKey ? 'openai (key set)' : 'heuristic fallback'));
    console.log('==================================================');
  });
}
