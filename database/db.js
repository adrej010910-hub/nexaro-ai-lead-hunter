// DatabaseProvider - persistent JSON storage with multi-layer deduplication.
// This is the ONLY place data is persisted. No external DB required.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY_DB = {
  schemaVersion: 1,
  meta: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  websites: [],        // Website { id, domain, url, companyName, industry, location, firstFoundAt, lastCheckedAt, status }
  analyses: [],        // WebsiteAnalysis { websiteId, designScore, mobileScore, uxScore, conversionScore, redesignScore, problems, recommendations, analyzedAt }
  leads: [],           // Lead { id, websiteId, leadScore, contact, contactType, status, createdAt }
  messages: [],        // Message { leadId, message, approved, sentAt }
  discoveredDomains: [], // Set for fast domain dedup
  companies: [],       // Set of company names for company dedup
  contacts: [],        // Set of normalized contacts for contact dedup
  contactedDomains: [],// Domains that have already been messaged
  activity: [],        // Live activity log
  tasks: []            // Worker tasks
};

class DatabaseProvider {
  constructor() {
    this.db = this._load();
    this._ensureIndexes();
  }

  _ensureDir() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  _load() {
    this._ensureDir();
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return { ...EMPTY_DB, ...parsed };
      } catch (e) {
        console.error('DB load failed, starting fresh:', e.message);
        return { ...EMPTY_DB };
      }
    }
    return { ...EMPTY_DB };
  }

  _save() {
    this._ensureDir();
    this.db.meta.updatedAt = new Date().toISOString();
    fs.writeFileSync(DB_FILE, JSON.stringify(this.db, null, 2), 'utf8');
  }

  _ensureIndexes() {
    if (!Array.isArray(this.db.discoveredDomains)) this.db.discoveredDomains = [];
    if (!Array.isArray(this.db.companies)) this.db.companies = [];
    if (!Array.isArray(this.db.contacts)) this.db.contacts = [];
    if (!Array.isArray(this.db.contactedDomains)) this.db.contactedDomains = [];
    if (!Array.isArray(this.db.activity)) this.db.activity = [];
    if (!Array.isArray(this.db.tasks)) this.db.tasks = [];
  }

  _uid() {
    return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.db));
  }

  // ---------- Activity ----------
  logActivity(entry) {
    const item = { id: this._uid(), ts: new Date().toISOString(), ...entry };
    this.db.activity.unshift(item);
    if (this.db.activity.length > 500) this.db.activity = this.db.activity.slice(0, 500);
    this._save();
    return item;
  }

  // ---------- Domain normalization & dedup ----------
  normalizeDomain(url) {
    if (!url) return null;
    let u = url.trim();
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    try {
      const parsed = new URL(u);
      let host = parsed.hostname.toLowerCase();
      host = host.replace(/^www\./, '');
      return host;
    } catch (e) {
      // fallback naive parse
      let host = u.replace(/^https?:\/\//i, '').split('/')[0].split('?')[0].toLowerCase();
      host = host.replace(/^www\./, '');
      return host || null;
    }
  }

  normalizeContact(contact) {
    if (!contact) return null;
    let c = contact.trim().toLowerCase();
    // remove mailto: and tel: prefixes
    c = c.replace(/^mailto:/, '').replace(/^tel:/, '').replace(/^https?:\/\/(www\.)?/i, '');
    return c;
  }

  isDomainKnown(domain) {
    return this.db.discoveredDomains.includes(domain);
  }

  isCompanyKnown(companyName) {
    if (!companyName) return false;
    return this.db.companies.includes(companyName.toLowerCase().trim());
  }

  isContactKnown(contact) {
    const c = this.normalizeContact(contact);
    if (!c) return false;
    return this.db.contacts.includes(c);
  }

  isDomainContacted(domain) {
    return this.db.contactedDomains.includes(domain);
  }

  // ---------- Websites ----------
  addWebsite({ domain, url, companyName, industry, location }) {
    if (!domain) return { added: false, reason: 'NO_DOMAIN' };
    if (this.isDomainKnown(domain)) return { added: false, reason: 'DUPLICATE' };
    if (companyName && this.isCompanyKnown(companyName)) return { added: false, reason: 'DUPLICATE_COMPANY' };

    const website = {
      id: this._uid(),
      domain,
      url,
      companyName: companyName || '',
      industry: industry || '',
      location: location || '',
      firstFoundAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
      status: 'discovered'
    };
    this.db.websites.push(website);
    this.db.discoveredDomains.push(domain);
    if (companyName) this.db.companies.push(companyName.toLowerCase().trim());
    this._save();
    return { added: true, website };
  }

  getWebsite(idOrDomain) {
    return this.db.websites.find(w => w.id === idOrDomain || w.domain === idOrDomain);
  }

  updateWebsiteStatus(id, status) {
    const w = this.getWebsite(id);
    if (w) { w.status = status; w.lastCheckedAt = new Date().toISOString(); this._save(); }
    return w;
  }

  // ---------- Analyses ----------
  addAnalysis(analysis) {
    this.db.analyses.push(analysis);
    this._save();
    return analysis;
  }

  getAnalysis(websiteId) {
    return this.db.analyses.find(a => a.websiteId === websiteId);
  }

  // ---------- Leads ----------
  addLead({ websiteId, leadScore, contact, contactType, status, category }) {
    const lead = {
      id: this._uid(),
      websiteId,
      leadScore,
      contact: contact || '',
      contactType: contactType || '',
      status: status || 'new',
      category: category || 'LOW',
      createdAt: new Date().toISOString()
    };
    if (contact) {
      const norm = this.normalizeContact(contact);
      if (!this.db.contacts.includes(norm)) this.db.contacts.push(norm);
    }
    this.db.leads.push(lead);
    this._save();
    return lead;
  }

  getLead(id) {
    return this.db.leads.find(l => l.id === id || l.websiteId === id);
  }

  updateLead(id, patch) {
    const l = this.getLead(id);
    if (l) { Object.assign(l, patch); l.updatedAt = new Date().toISOString(); this._save(); }
    return l;
  }

  hasLeadForWebsite(websiteId) {
    return this.db.leads.some(l => l.websiteId === websiteId);
  }

  // ---------- Messages ----------
  addMessage({ leadId, message }) {
    const msg = { leadId, message, approved: false, sentAt: null, createdAt: new Date().toISOString() };
    this.db.messages.push(msg);
    this._save();
    return msg;
  }

  getMessage(leadId) {
    return this.db.messages.find(m => m.leadId === leadId);
  }

  hasMessageForLead(leadId) {
    return this.db.messages.some(m => m.leadId === leadId);
  }

  approveMessage(leadId) {
    const m = this.getMessage(leadId);
    if (m) { m.approved = true; this._save(); }
    return m;
  }

  markMessageSent(leadId) {
    const m = this.getMessage(leadId);
    if (m) { m.approved = true; m.sentAt = new Date().toISOString(); this._save(); }
    // record contacted domain (via lead's website)
    const lead = this.getLead(leadId);
    if (lead) {
      const web = this.getWebsite(lead.websiteId);
      if (web && !this.db.contactedDomains.includes(web.domain)) {
        this.db.contactedDomains.push(web.domain);
        this._save();
      }
    }
    return m;
  }

  markContacted(domain) {
    if (!this.db.contactedDomains.includes(domain)) {
      this.db.contactedDomains.push(domain);
      this._save();
    }
  }

  // ---------- Tasks ----------
  addTask(task) {
    const t = { id: this._uid(), createdAt: new Date().toISOString(), status: 'pending', retryCount: 0, ...task };
    this.db.tasks.push(t);
    this._save();
    return t;
  }

  updateTask(id, patch) {
    const t = this.db.tasks.find(x => x.id === id);
    if (t) { Object.assign(t, patch); this._save(); }
    return t;
  }

  getTasks(status) {
    if (!status) return this.db.tasks;
    return this.db.tasks.filter(t => t.status === status);
  }

  // ---------- Stats ----------
  getStats() {
    const websites = this.db.websites;
    const analyses = this.db.analyses;
    const leads = this.db.leads;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

    const newToday = websites.filter(w => new Date(w.firstFoundAt) >= todayStart).length;
    const newThisWeek = websites.filter(w => new Date(w.firstFoundAt) >= weekStart).length;
    const analyzed = analyses.length;
    const highPotential = leads.filter(l => l.category === 'HIGH').length;
    const messagesReady = this.db.messages.filter(m => !m.approved).length;
    const contacted = this.db.contactedDomains.length;
    const replies = this.db.leads.filter(l => l.status === 'replied').length;

    return {
      newWebsites: websites.length,
      analyzed,
      highPotential,
      messagesReady,
      contacted,
      replies,
      newToday,
      newThisWeek,
      leadsCount: leads.length,
      tasks: this.db.tasks.length
    };
  }

  reset() {
    this.db = { ...EMPTY_DB };
    this._ensureIndexes();
    this._save();
  }
}

module.exports = new DatabaseProvider();
