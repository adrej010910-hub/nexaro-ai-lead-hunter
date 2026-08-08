// NEXARO AI Lead Hunter - frontend app
const state = {
  agent: null,
  stats: null,
  refreshTimer: null,
  currentView: 'dashboard'
};

const $ = (sel) => document.querySelector(sel);

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  return res.json();
}

// ---------- Polling ----------
async function refreshAll() {
  try {
    const data = await api('/api/agent/state');
    state.agent = data.state;
    state.stats = data.stats;
    renderAgent();
    renderStats();
    renderMiniActivity();
    if (state.currentView === 'dashboard') renderCardsAndActivity();
  } catch (e) { /* server not ready */ }
}

async function refreshActivity() {
  if (state.currentView !== 'activity') return;
  const data = await api('/api/activity');
  renderActivityList(data.activity);
}

// ---------- Agent state ----------
function renderAgent() {
  const status = state.agent.status;
  const dot = $('#agentStatusDot');
  dot.className = 'status-dot ' + status;
  $('#agentStatusText').textContent = status.toUpperCase();
  $('#nextScan').textContent = state.agent.nextRunAt ? new Date(state.agent.nextRunAt).toLocaleTimeString() : '—';
  $('#lastScan').textContent = state.agent.lastRunAt ? new Date(state.agent.lastRunAt).toLocaleTimeString() : '—';

  $('#btnStart').disabled = status === 'running';
  $('#btnPause').disabled = status !== 'running';
  $('#btnStop').disabled = status === 'stopped' || status === 'paused';

  const modeBtn = $('#modeToggle');
  modeBtn.textContent = state.agent.mode.toUpperCase();
  modeBtn.classList.toggle('live', state.agent.mode === 'live');
}

function renderStats() {
  const s = state.stats;
  if (!s) return;
  $('#statNewWebsites').textContent = s.newWebsites;
  $('#statAnalyzed').textContent = s.analyzed;
  $('#statHigh').textContent = s.highPotential;
  $('#statMed').textContent = s.mediumPotential || s.leadsCount - s.highPotential - s.lowPotential;
  $('#statMessages').textContent = s.messagesReady;
  $('#statContacted').textContent = s.contacted;
  $('#statDuplicates').textContent = state.agent.counters.duplicates;
  $('#statErrors').textContent = state.agent.counters.errors;
}

function renderCardsAndActivity() {
  const c = state.agent.counters;
  const items = [
    ['Searches', c.searches], ['Websites found', c.newWebsites],
    ['Duplicates skipped', c.duplicates], ['Analyzed', c.analyzed],
    ['Contacts found', c.contactsFound], ['Messages generated', c.messagesGenerated],
    ['High potential', c.highPotential], ['Medium', c.mediumPotential],
    ['Low', c.lowPotential], ['Not a lead', c.notALead],
    ['Errors', c.errors]
  ];
  $('#counterList').innerHTML = items.map(([k, v]) =>
    `<div class="counter-row"><span>${k}</span><b>${v}</b></div>`).join('');
}

function renderMiniActivity() {
  // mini activity shown on dashboard panel
  const list = $('#miniActivity');
  if (!list) return;
  // fetch activity
  api('/api/activity').then(d => {
    list.innerHTML = d.activity.slice(0, 12).map(a => activityHtml(a)).join('');
  });
}

function activityHtml(a) {
  const t = new Date(a.ts).toLocaleTimeString();
  return `<div class="activity-item type-${a.type}"><span class="t">${t}</span>${a.text}</div>`;
}

function renderActivityList(activity) {
  $('#activityList').innerHTML = activity.map(activityHtml).join('');
}

// ---------- Leads ----------
async function loadLeads() {
  const cat = $('#filterCategory').value;
  const status = $('#filterStatus').value;
  let url = '/api/leads';
  const params = [];
  if (cat) params.push('category=' + encodeURIComponent(cat));
  if (status) params.push('status=' + encodeURIComponent(status));
  if (params.length) url += '?' + params.join('&');
  const data = await api(url);
  const tbody = $('#leadsTable');
  if (!data.leads.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">No leads yet. Start the agent to discover leads.</td></tr>`;
    return;
  }
  tbody.innerHTML = data.leads.map(l => {
    const company = l.website ? (l.website.companyName || l.website.domain) : '—';
    const contact = l.contact || '—';
    return `<tr>
      <td><strong>${escapeHtml(company)}</strong></td>
      <td><span class="badge badge-${l.category}">${l.category.replace('_',' ')}</span></td>
      <td>${l.leadScore}</td>
      <td><a class="link" href="${getContactLink(l)}" target="_blank">${escapeHtml(contact)}</a></td>
      <td><span class="badge badge-${l.status}">${l.status}</span></td>
      <td><button class="btn btn-sm btn-secondary" onclick="openLead('${l.id}')">View</button></td>
    </tr>`;
  }).join('');
}

function getContactLink(l) {
  if (l.contactType === 'email') return 'mailto:' + l.contact;
  if (l.contactType === 'telegram' || l.contactType === 'vk') return l.contact;
  if (l.contactType === 'phone') return 'tel:' + l.contact;
  return l.contact && l.contact.startsWith('http') ? l.contact : '#';
}

async function openLead(id) {
  const data = await api('/api/leads/' + id);
  const l = data.lead;
  const analysis = l.analysis;
  const msg = l.message;
  const scores = analysis ? `<div class="analysis-box">
    <div class="score-row">
      <span class="score-chip">Design: ${analysis.designScore}</span>
      <span class="score-chip">Mobile: ${analysis.mobileScore}</span>
      <span class="score-chip">UX: ${analysis.uxScore}</span>
      <span class="score-chip">Conversion: ${analysis.conversionScore}</span>
      <span class="score-chip"><b>Redesign: ${analysis.redesignScore}</b></span>
    </div>
    ${(analysis.problems || []).slice(0,4).map(p => `<div class="problem-item">• ${p.problem}</div>`).join('')}
  </div>` : '<div class="analysis-box">No analysis</div>';

  $('#modalBody').innerHTML = `
    <div class="approval-head">
      <h3>${escapeHtml(l.website ? (l.website.companyName || l.website.domain) : 'Lead')}</h3>
      <span class="badge badge-${l.category}">${l.category.replace('_',' ')}</span>
    </div>
    <div class="approval-meta">
      <span>🌐 <a class="link" href="${l.website ? l.website.url : '#'}" target="_blank">${l.website ? l.website.domain : ''}</a></span>
      <span>Lead Score: ${l.leadScore}</span>
      <span>Contact: ${escapeHtml(l.contact || '—')} (${l.contactType})</span>
    </div>
    ${scores}
    <div class="approval-actions">
      <button class="btn btn-success btn-sm" onclick="approveLead('${l.id}')">✓ APPROVE</button>
      <button class="btn btn-warn btn-sm" onclick="openEditor('${l.id}')">✏ EDIT</button>
      <button class="btn btn-danger btn-sm" onclick="rejectLead('${l.id}')">❌ REJECT</button>
    </div>
    <h4 style="margin:16px 0 8px">💬 Message</h4>
    <textarea id="messageEditor" class="message-box" style="width:100%;min-height:200px;background:var(--panel2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:12px;white-space:pre-wrap">${escapeHtml(msg ? msg.message : '')}</textarea>
    <div class="approval-actions" style="margin-top:10px">
      <button class="btn btn-primary btn-sm" onclick="copyMessage()">📋 Copy</button>
      <button class="btn btn-secondary btn-sm" onclick="saveMessage('${l.id}')">💾 Save edit</button>
      <button class="btn btn-secondary btn-sm" onclick="openContact('${l.id}')">👤 Open contact</button>
      <button class="btn btn-secondary btn-sm" onclick="exportLead('${l.id}')">⬇ Export</button>
    </div>
    <div style="margin-top:12px;font-size:12px;color:var(--muted)">Manual approval is ON. Sending requires an official API connection — not simulated.</div>
  `;
  $('#modal').classList.add('open');
}

function closeModal() { $('#modal').classList.remove('open'); }

function openEditor() {
  $('#messageEditor').focus();
}

function copyMessage() {
  const el = $('#messageEditor');
  el.select();
  navigator.clipboard.writeText(el.value).then(() => alert('Message copied to clipboard'));
}

function saveMessage(id) {
  const val = $('#messageEditor').value;
  api('/api/leads/' + id + '/edit-message', { method: 'POST', body: JSON.stringify({ message: val }) })
    .then(() => alert('Message saved'));
}

function approveLead(id) {
  api('/api/leads/' + id + '/approve', { method: 'POST' }).then(() => { closeModal(); loadLeads(); refreshAll(); });
}
function rejectLead(id) {
  api('/api/leads/' + id + '/reject', { method: 'POST' }).then(() => { closeModal(); loadLeads(); refreshAll(); });
}
function openContact(id) {
  api('/api/leads/' + id).then(d => {
    const l = d.lead;
    const link = getContactLink(l);
    window.open(link, '_blank');
    api('/api/leads/' + id + '/contacted', { method: 'POST' }).then(() => refreshAll());
  });
}
function exportLead() {
  window.open('/api/export', '_blank');
}

// ---------- Approval queue ----------
async function loadApproval() {
  const data = await api('/api/leads?status=new');
  const list = $('#approvalList');
  const pending = data.leads.filter(l => l.status === 'new');
  if (!pending.length) {
    list.innerHTML = '<div class="empty">No pending approvals. Messages here await your review.</div>';
    return;
  }
  list.innerHTML = pending.map(l => {
    const analysis = l.analysis;
    const msg = l.message;
    const company = l.website ? (l.website.companyName || l.website.domain) : '—';
    return `<div class="approval-card">
      <div class="approval-head">
        <h3>${escapeHtml(company)}</h3>
        <span class="badge badge-${l.category}">${l.category.replace('_',' ')}</span>
      </div>
      <div class="approval-meta">
        <span>🌐 <a class="link" href="${l.website ? l.website.url : '#'}" target="_blank">${l.website ? l.website.domain : ''}</a></span>
        <span>Industry: ${l.website ? escapeHtml(l.website.industry) : '—'}</span>
        <span>Lead Score: ${l.leadScore}</span>
        <span>Contact: ${escapeHtml(l.contact || '—')}</span>
      </div>
      ${analysis ? `<div class="analysis-box">
        <div class="score-row">
          <span class="score-chip">Design: ${analysis.designScore}</span>
          <span class="score-chip">Mobile: ${analysis.mobileScore}</span>
          <span class="score-chip">UX: ${analysis.uxScore}</span>
          <span class="score-chip">Conv: ${analysis.conversionScore}</span>
          <span class="score-chip"><b>Redesign: ${analysis.redesignScore}</b></span>
        </div>
        ${(analysis.problems||[]).slice(0,3).map(p=>`<div class="problem-item">• ${p.problem}</div>`).join('')}
      </div>` : ''}
      <div class="message-box">${escapeHtml(msg ? msg.message : 'No message')}</div>
      <div class="approval-actions">
        <button class="btn btn-success btn-sm" onclick="approveLead('${l.id}')">✓ APPROVE</button>
        <button class="btn btn-warn btn-sm" onclick="openLead('${l.id}')">✏ EDIT</button>
        <button class="btn btn-danger btn-sm" onclick="rejectLead('${l.id}')">❌ REJECT</button>
      </div>
    </div>`;
  }).join('');
}

// ---------- Websites ----------
async function loadWebsites() {
  const params = [];
  const ind = $('#filterIndustry').value;
  const city = $('#filterCity').value;
  const score = $('#filterScore').value;
  if (ind) params.push('industry=' + encodeURIComponent(ind));
  if (city) params.push('city=' + encodeURIComponent(city));
  if (score) params.push('minScore=' + encodeURIComponent(score));
  const url = '/api/websites' + (params.length ? '?' + params.join('&') : '');
  const data = await api(url);
  const tbody = $('#websitesTable');
  if (!data.websites.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">No websites yet. Start the agent.</td></tr>`;
    return;
  }
  tbody.innerHTML = data.websites.map(w => {
    const analysis = state.stats ? w : null;
    return `<tr>
      <td><a class="link" href="${escapeHtml(w.url)}" target="_blank">${escapeHtml(w.domain)}</a></td>
      <td>${escapeHtml(w.industry || '—')}</td>
      <td>${escapeHtml(w.location || '—')}</td>
      <td>${w.status}</td>
      <td>${new Date(w.firstFoundAt).toLocaleDateString()}</td>
      <td><span class="badge badge-${w.status}">${w.status}</span></td>
    </tr>`;
  }).join('');
}

// ---------- Settings ----------
async function loadSettings() {
  api('/api/agent/state').then(d => {
    const ap = d.state.autopilot;
    $('#setIndustries').value = (ap.industries || []).join(', ');
    $('#setRegions').value = (ap.regions || []).join(', ');
    $('#setFrequency').value = ap.frequency;
    $('#setMaxPerScan').value = ap.maxPerScan;
    $('#setMinRedesign').value = ap.minRedesignScore;
    $('#setMinLead').value = ap.minLeadScore;
  });
  api('/api/industries').then(d => {
    $('#integrationStatus').innerHTML = integrationStatusHtml();
  });
}

function integrationStatusHtml() {
  // We don't want to expose keys; just show which providers are configured.
  return `
    <div class="integration-row"><span>Search provider</span><span id="searchStatus">...</span></div>
    <div class="integration-row"><span>AI provider</span><span id="aiStatus">...</span></div>
    <div class="integration-row"><span>Database</span><span class="ok">✓ JSON persistent db</span></div>
    <div class="integration-row"><span>Demo/Live mode</span><span class="ok">✓ Separated</span></div>
  `;
}

function saveAutopilot() {
  const industries = $('#setIndustries').value.split(',').map(s => s.trim()).filter(Boolean);
  const regions = $('#setRegions').value.split(',').map(s => s.trim()).filter(Boolean);
  const cfg = {
    industries,
    regions,
    frequency: $('#setFrequency').value,
    maxPerScan: parseInt($('#setMaxPerScan').value, 10),
    minRedesignScore: parseInt($('#setMinRedesign').value, 10),
    minLeadScore: parseInt($('#setMinLead').value, 10)
  };
  api('/api/agent/autopilot', { method: 'POST', body: JSON.stringify(cfg) })
    .then(() => alert('Autopilot settings saved'));
}

async function scanOnce() {
  const industry = $('#scanIndustry').value;
  const region = $('#scanRegion').value;
  const results = $('#scanResults').value || 5;
  if (!industry) { alert('Enter an industry'); return; }
  $('#scanOutput').textContent = 'Searching...';
  const data = await api('/api/agent/scan-once', { method: 'POST', body: JSON.stringify({ industry, region, results: parseInt(results,10) }) });
  if (data.error) { $('#scanOutput').textContent = data.error; return; }
  $('#scanOutput').textContent = 'Queries:\n' + data.queries.join('\n') + '\n\nFound ' + data.resultsCount + ' results (top ' + data.results.length + '):\n' +
    data.results.map(r => r.url).join('\n');
}

// ---------- Navigation ----------
function setView(view) {
  state.currentView = view;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  if (view === 'leads') loadLeads();
  if (view === 'websites') loadWebsites();
  if (view === 'approval') loadApproval();
  if (view === 'activity') refreshActivity();
  if (view === 'settings') loadSettings();
}

// ---------- Event bindings ----------
function bindEvents() {
  document.querySelectorAll('.nav-item').forEach(n => n.addEventListener('click', (e) => {
    e.preventDefault();
    setView(n.dataset.view);
  }));

  $('#btnStart').onclick = () => api('/api/agent/start', { method: 'POST' }).then(refreshAll);
  $('#btnPause').onclick = () => api('/api/agent/pause', { method: 'POST' }).then(refreshAll);
  $('#btnStop').onclick = () => api('/api/agent/stop', { method: 'POST' }).then(refreshAll);
  $('#modeToggle').onclick = () => {
    const next = state.agent.mode === 'demo' ? 'live' : 'demo';
    api('/api/agent/mode', { method: 'POST', body: JSON.stringify({ mode: next }) }).then(refreshAll);
  };
  $('#btnSaveAutopilot').onclick = saveAutopilot;
  $('#btnScanOnce').onclick = scanOnce;
  $('#btnApplyFilters').onclick = loadWebsites;
  $('#btnExport').onclick = () => window.open('/api/export', '_blank');
  $('#filterCategory').onchange = loadLeads;
  $('#filterStatus').onchange = loadLeads;
  $('#modalClose').onclick = closeModal;
  $('#modal').addEventListener('click', (e) => { if (e.target === $('#modal')) closeModal(); });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
}

// ---------- Init ----------
function init() {
  bindEvents();
  refreshAll();
  setInterval(refreshAll, 3000);
  setInterval(refreshActivity, 2000);
}

document.addEventListener('DOMContentLoaded', init);
