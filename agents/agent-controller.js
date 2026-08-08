// AgentController - the autonomous agent state machine.
// Manages START / STOP / PAUSE / AUTOPILOT and scheduled discovery cycles.
const db = require('../database/db');
const providers = require('../providers');
const { QueryGenerator } = providers;
const { SearchProvider } = providers;
const { WebsiteAnalyzer } = providers;
const { ContactFinder } = providers;
const { MessageProvider } = providers;
const LeadScoring = require('../scoring/leadScoring');

const FREQUENCIES = {
  '15min': 15 * 60 * 1000,
  '30min': 30 * 60 * 1000,
  '1hour': 60 * 60 * 1000,
  '3hours': 3 * 60 * 60 * 1000,
  'daily': 24 * 60 * 60 * 1000
};

class AgentController {
  constructor() {
    this.state = {
      status: 'stopped', // stopped | running | paused
      mode: 'demo',      // demo | live
      startedAt: null,
      lastRunAt: null,
      nextRunAt: null,
      timer: null,
      running: false,
      autopilot: {
        enabled: false,
        industries: [],
        regions: [],
        frequency: '3hours',
        maxPerScan: 50,
        minRedesignScore: 70,
        minLeadScore: 70
      },
      counters: {
        searches: 0,
        found: 0,
        newWebsites: 0,
        duplicates: 0,
        analyzed: 0,
        highPotential: 0,
        mediumPotential: 0,
        lowPotential: 0,
        notALead: 0,
        contactsFound: 0,
        messagesGenerated: 0,
        errors: 0
      }
    };
    this._resolve = null;
  }

getState() {
    const { timer, ...rest } = this.state;
    return JSON.parse(JSON.stringify(rest));
  }

  setMode(mode) {
    this.state.mode = mode === 'live' ? 'live' : 'demo';
    return this.state.mode;
  }

  setAutopilot(cfg) {
    this.state.autopilot = { ...this.state.autopilot, ...cfg };
    return this.state.autopilot;
  }

  start() {
    if (this.state.status === 'running') return { ok: false, msg: 'Already running' };
    this.state.status = 'running';
    this.state.startedAt = new Date().toISOString();
    this.state.running = false;
    db.logActivity({ type: 'status', text: '🟢 Agent started' });
    this._scheduleNext();
    // Kick off immediately
    this._runCycle().catch(() => {});
    return { ok: true, status: this.state.status };
  }

  stop() {
    this.state.status = 'stopped';
    if (this.state.timer) { clearTimeout(this.state.timer); this.state.timer = null; }
    this.state.running = false;
    this.state.nextRunAt = null;
    db.logActivity({ type: 'status', text: '⏹ Agent stopped' });
    return { ok: true, status: this.state.status };
  }

  pause() {
    if (this.state.status === 'running') {
      this.state.status = 'paused';
      if (this.state.timer) { clearTimeout(this.state.timer); this.state.timer = null; }
      this.state.running = false;
      this.state.nextRunAt = null;
      db.logActivity({ type: 'status', text: '⏸ Agent paused' });
    }
    return { ok: true, status: this.state.status };
  }

  resume() {
    if (this.state.status === 'paused') {
      this.state.start();
      return { ok: true, status: this.state.status };
    }
    return { ok: true, status: this.state.status };
  }

  _scheduleNext() {
    if (this.state.status !== 'running') return;
    const freq = this.state.autopilot.frequency || '3hours';
    const ms = FREQUENCIES[freq] || FREQUENCIES['3hours'];
    this.state.nextRunAt = new Date(Date.now() + ms).toISOString();
    if (this.state.timer) clearTimeout(this.state.timer);
    this.state.timer = setTimeout(() => {
      this._runCycle().catch(() => {}).finally(() => this._scheduleNext());
    }, ms);
  }

  async _runCycle() {
    if (this.state.running || this.state.status !== 'running') return;
    this.state.running = true;
    this.state.lastRunAt = new Date().toISOString();
    db.logActivity({ type: 'cycle', text: '🔎 Starting discovery cycle...' });

    const ap = this.state.autopilot;
    const industries = ap.industries && ap.industries.length ? ap.industries : ['Рестораны'];
    const regions = ap.regions && ap.regions.length ? ap.regions : [''];
    const maxPerScan = ap.maxPerScan || 50;
    const minRedesign = ap.minRedesignScore || 0;
    const minLead = ap.minLeadScore || 0;

    try {
      for (const industry of industries) {
        for (const region of regions) {
          if (this.state.status !== 'running') break;
          await this._processIndustry(industry, region, maxPerScan, minRedesign, minLead);
        }
      }
    } catch (e) {
      this.state.counters.errors++;
      db.logActivity({ type: 'error', text: '⚠️ Cycle error: ' + e.message });
    } finally {
      this.state.running = false;
      if (this.state.status === 'running') {
        db.logActivity({ type: 'cycle', text: '✅ Discovery cycle complete. Next run scheduled.' });
      }
    }
  }

  async _processIndustry(industry, region, maxPerScan, minRedesign, minLead) {
    db.logActivity({ type: 'search', text: `🔎 Searching: ${region ? region + ' ' : ''}${industry}` });
    // 1) Generate dynamic queries
    const queries = QueryGenerator.generate({ industry, region, limit: 12 });
    this.state.counters.searches += queries.length;

    let foundThisScan = 0;
    for (const query of queries) {
      if (this.state.status !== 'running') break;
      if (foundThisScan >= maxPerScan) break;

      let results;
      try {
        results = await SearchProvider.search(query, 10);
      } catch (e) {
        this.state.counters.errors++;
        db.logActivity({ type: 'error', text: `⚠️ Search error (${query}): ${e.message}` });
        continue;
      }

      for (const result of results) {
        if (this.state.status !== 'running') return;
        if (foundThisScan >= maxPerScan) break;

        const url = result.url;
        if (!url || !/^https?:\/\//i.test(url)) continue;
        const domain = db.normalizeDomain(url);

// 2) Deduplication
        if (db.isDomainKnown(domain)) {
          this.state.counters.duplicates++;
          // skip already-known
          continue;
        }

        // 3) Add website
        const addRes = db.addWebsite({
          domain,
          url,
          industry,
          location: region
        });
        if (!addRes.added) {
          this.state.counters.duplicates++;
          continue;
        }
        foundThisScan++;
        this.state.counters.newWebsites++;
        const website = addRes.website;
        db.logActivity({ type: 'found', text: `🌐 Found new website: ${domain}` });

// 4) Analyze with AI
        db.logActivity({ type: 'analyze', text: `🧠 AI analyzing ${domain}...` });
        const analysis = await WebsiteAnalyzer.analyze(url);
        if (!analysis.ok) {
          this.state.counters.errors++;
          db.updateWebsiteStatus(website.id, 'failed');
          db.logActivity({ type: 'error', text: `⚠️ ${domain}: ${analysis.error}` });
          continue;
        }

        const scores = analysis.scores;
        this.state.counters.analyzed++;
        db.updateWebsiteStatus(website.id, 'analyzed');
        db.addAnalysis({
          websiteId: website.id,
          designScore: scores.design,
          mobileScore: scores.mobile,
          uxScore: scores.ux,
          conversionScore: scores.conversion,
          redesignScore: scores.redesign,
          problems: analysis.problems,
          recommendations: analysis.recommendations,
          analyzedAt: new Date().toISOString()
        });
        db.logActivity({ type: 'score', text: `📊 Redesign score: ${scores.redesign}` });

        // 5) Find contacts
        const contacts = await ContactFinder.findContacts({ url, domain });
        const contact = contacts[0] || null;
        if (contact) {
          this.state.counters.contactsFound++;
          db.logActivity({ type: 'contact', text: `📧 Public contact found: ${contact.type}` });
        } else {
          db.logActivity({ type: 'contact', text: `🔍 No public contact found for ${domain}` });
        }

        // 6) Lead scoring
        const scoring = LeadScoring.score({
          analysis,
          contactAvailable: !!contact,
          commercialPotential: 70
        });

        // 7) Qualification
        if (scoring.category === 'HIGH') this.state.counters.highPotential++;
        else if (scoring.category === 'MEDIUM') this.state.counters.mediumPotential++;
        else if (scoring.category === 'LOW') this.state.counters.lowPotential++;
        else this.state.counters.notALead++;

// Only create lead if score meets autopilot thresholds and it's a real lead
        const aboveThreshold = scoring.leadScore >= minLead && scores.redesign <= minRedesign;
        // Simpler: create lead if category is HIGH or MEDIUM and contact exists and above thresholds
        const createLead = (scoring.category === 'HIGH' || scoring.category === 'MEDIUM') && contact && aboveThreshold;

        if (createLead) {
          const lead = db.addLead({
            websiteId: website.id,
            leadScore: scoring.leadScore,
            contact: contact.value,
            contactType: contact.type,
            status: 'new',
            category: scoring.category
          });

          // 8) Generate personalized message
          const message = MessageProvider.generate({
            companyName: website.companyName || domain,
            industry,
            location: region,
            problems: analysis.problems,
            scores,
            url
          });
          db.addMessage({ leadId: lead.id, message });
          this.state.counters.messagesGenerated++;
          db.logActivity({ type: 'lead', text: `🔥 ${scoring.category === 'HIGH' ? 'HIGH' : 'MEDIUM'} potential lead added: ${domain}` });
          db.logActivity({ type: 'message', text: `✍️ Personalized message generated for ${domain}` });
        } else {
          db.logActivity({ type: 'lead', text: `⚪ ${scoring.category} - not a strong lead: ${domain}` });
        }
      }
    }
  }
}

module.exports = new AgentController();
