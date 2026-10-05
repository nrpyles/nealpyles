
'use strict';

/* ============================================================
   Data model
============================================================ */
const COLORS = ['#e74c3c', '#e8b64c', '#5aa9d6', '#b48cf6'];
const PAY_KEYS = ['pi', 'mi', 'tax', 'ins', 'hoa'];
const PAY_LABELS = { pi: 'Principal and interest', mi: 'Mortgage insurance', tax: 'Property taxes', ins: 'Home insurance', hoa: 'HOA' };
const PAY_COLORS = {
  dark:  { pi: '#ece0c4', mi: '#e74c3c', tax: '#e8b64c', ins: '#5aa9d6', hoa: '#8a93a6' },
  light: { pi: '#00285e', mi: '#c2172b', tax: '#d99a2b', ins: '#4a7fa5', hoa: '#9aa5b1' },
};
const STORE_KEY = 'loanCompareV5';

// Fee defaults calibrated to real Lone Star Financing initial fee worksheets (July 2026)
function defaultFees() {
  return {
    lenderFlat: 1075,
    processing: 850,
    appraisal: 695,
    creditFees: 700,
    titleMode: 'tx',
    ownerTitle: 'quote',
    manualTitle: 2500,
    ownersOptional: 300,
    endorsements: 175,
    escrowFee: 795,
    titleMisc: 585,
    recording: 182,
    survey: 0,
    hoaTransfer: 0,
    prepaidDays: 28,
    taxEscrowMo: 3,
    insEscrowMo: 3,
  };
}
function defaultScenarios() {
  return [
    mkScenario('Conventional', 'conv', 515000, 11.65, 6.875),
    mkScenario('FHA', 'fha', 515000, 11.65, 6.0),
    mkScenario('Conventional 5% Down', 'conv', 515000, 5, 6.875),
  ];
}
function mkScenario(name, type, price, downPct, rate) {
  return {
    name, type, price,
    downPct, rate,
    termYears: 30,
    points: 0,
    sellerCredit: 0,
    lenderCredit: 0,
    extraMonthly: 0,
    miOverride: '',
    vaFirstUse: true,
    vaExempt: false,
  };
}

const DEFAULT_BRAND = { name: 'Neal Pyles', nmls: 'NMLS 1929617', phone: '(469) 734-6352', client: '' };
let state = load() || { scenarios: defaultScenarios(), fees: defaultFees(), brand: Object.assign({}, DEFAULT_BRAND), globals: {}, prop: null };
if (!state.fees) state.fees = defaultFees();
state.fees = Object.assign(defaultFees(), state.fees);
state.brand = Object.assign({}, DEFAULT_BRAND,
  Object.fromEntries(Object.entries(state.brand || {}).filter(([k, v]) => v)));

function load() {
  try { return JSON.parse(safeStorage.getItem(STORE_KEY)); } catch (e) { return null; }
}
function save() {
  state.brand = {
    name: el('brandName').value, nmls: el('brandNmls').value,
    phone: el('brandPhone').value, client: el('clientName').value
  };
  state.globals = readGlobals();
  try { safeStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
}
const DEFAULT_GLOBALS = { taxPct: 1.26, insAnnual: 3600, hoa: 0, apprec: 3.5, horizon: '7', rent: 2200, rentInc: 3 };
function readGlobals() {
  return {
    taxPct: el('gTaxPct').value, insAnnual: el('gInsAnnual').value, hoa: el('gHoa').value,
    apprec: el('gApprec').value, horizon: el('gHorizon').value,
    rent: el('gRent').value, rentInc: el('gRentInc').value
  };
}
function restoreGlobals() {
  const g = Object.assign({}, DEFAULT_GLOBALS, state.globals || {});
  const setIf = (id, v) => { if (v !== undefined && v !== '') el(id).value = v; };
  setIf('gTaxPct', g.taxPct); setIf('gInsAnnual', g.insAnnual); setIf('gHoa', g.hoa);
  setIf('gApprec', g.apprec); setIf('gHorizon', g.horizon);
  setIf('gRent', g.rent); setIf('gRentInc', g.rentInc);
}
function resetAll() {
  if (!confirm('Reset everything back to the starting examples?')) return;
  safeStorage.removeItem(STORE_KEY);
  state = { scenarios: defaultScenarios(), fees: defaultFees(), brand: Object.assign({}, DEFAULT_BRAND), globals: {}, prop: null };
  restoreGlobals(); buildFeeFields(); buildCards(); renderProp();
  recalc();
}

/* ============================================================
   Automatic rate rules — all overridable per option
============================================================ */
function autoPmiRate(ltvPct) {
  if (ltvPct <= 80) return 0;
  if (ltvPct <= 85) return 0.22;
  if (ltvPct <= 90) return 0.32;
  if (ltvPct <= 95) return 0.48;
  return 0.65;
}
function autoMipRate(ltvPct, termYears) {
  if (termYears > 15) return ltvPct > 95 ? 0.55 : 0.50;
  return ltvPct > 90 ? 0.40 : 0.15;
}
function autoVaFee(downPct, firstUse) {
  if (downPct >= 10) return 1.25;
  if (downPct >= 5) return 1.50;
  return firstUse ? 2.15 : 3.30;
}

/* ============================================================
   Texas title insurance, promulgated rates effective March 1, 2026.
   Always computed live from the current price and loan amount.
============================================================ */
function txTitlePremium(face) {
  if (face <= 0) return 0;
  if (face <= 25000) return 308;
  if (face <= 100000) return Math.round(308 + (face - 25000) * 0.0062933);
  if (face <= 1000000) return Math.round((face - 100000) * 0.00494 + 780);
  if (face <= 5000000) return Math.round((face - 1000000) * 0.00406 + 5226);
  return Math.round((face - 5000000) * 0.00334 + 21466);
}

/* ============================================================
   Closing cost itemization (buyer side)
============================================================ */
function itemizeClosing(s, g, price, loan, taxMo) {
  const F = state.fees;
  const items = [];
  const add = (label, amt, kind) => { if (Math.abs(amt) >= 0.5) items.push({ label, amt: Math.round(amt), kind }); };

  if (num(s.points, 0) > 0) add('Discount points (' + num(s.points, 0) + '%)', loan * num(s.points, 0) / 100, 'fee');
  add('Lender fees (admin, underwriting)', num(F.lenderFlat, 0), 'fee');
  add('Processing', num(F.processing, 0), 'fee');
  add('Appraisal', num(F.appraisal, 0), 'fee');
  add('Credit, verifications, tax service', num(F.creditFees, 0), 'fee');

  if (F.titleMode === 'manual') {
    add('Title policies (manual)', num(F.manualTitle, 0), 'fee');
  } else {
    if (F.ownerTitle === 'seller') {
      add("Lender's title policy (simultaneous issue)", 100, 'fee');
    } else if (F.ownerTitle === 'buyer') {
      add("Owner's title policy (TX rate on price)", txTitlePremium(price), 'fee');
      add("Lender's title policy (simultaneous issue)", 100, 'fee');
    } else {
      add("Lender's title policy (TX rate on loan)", txTitlePremium(loan), 'fee');
      add("Owner's title policy (optional)", num(F.ownersOptional, 0), 'fee');
    }
  }
  add('Title endorsements', num(F.endorsements, 0), 'fee');
  add('Settlement / closing fee', num(F.escrowFee, 0), 'fee');
  add('Title services (deed prep, notary, attorney)', num(F.titleMisc, 0), 'fee');
  add('Recording fees', num(F.recording, 0), 'fee');
  add('Survey', num(F.survey, 0), 'fee');
  if (num(F.hoaTransfer, 0) > 0 || num(g.hoa, 0) > 0) add('HOA transfer / capitalization', num(F.hoaTransfer, 0), 'fee');

  add('Prepaid interest (' + num(F.prepaidDays, 15) + ' days)', loan * num(s.rate, 0) / 100 / 365 * num(F.prepaidDays, 15), 'fee');
  add('Homeowners insurance, first year', num(g.insAnnual, 0), 'prepaid');
  add('Insurance escrow (' + num(F.insEscrowMo, 3) + ' mo)', num(g.insAnnual, 0) / 12 * num(F.insEscrowMo, 3), 'prepaid');
  add('Property tax escrow (' + num(F.taxEscrowMo, 3) + ' mo)', taxMo * num(F.taxEscrowMo, 3), 'prepaid');

  add('Seller credit', -num(s.sellerCredit, 0), 'credit');
  add('Lender credit', -num(s.lenderCredit, 0), 'credit');

  const fees = items.filter(i => i.kind === 'fee').reduce((a, i) => a + i.amt, 0);
  const prepaids = items.filter(i => i.kind === 'prepaid').reduce((a, i) => a + i.amt, 0);
  const credits = items.filter(i => i.kind === 'credit').reduce((a, i) => a + i.amt, 0);
  return { items, fees, prepaids, credits, total: fees + prepaids + credits };
}

/* ============================================================
   Math engine
============================================================ */
function compute(s, g) {
  const price = num(s.price, 1);
  const down = price * clampPct(s.downPct) / 100;
  const baseLoan = Math.max(price - down, 0);
  const ltvPct = price > 0 ? baseLoan / price * 100 : 0;
  const downFrac = price > 0 ? down / price : 0;

  let financedFee = 0;
  if (s.type === 'fha') financedFee = baseLoan * 0.0175;
  if (s.type === 'va' && !s.vaExempt) financedFee = baseLoan * autoVaFee(clampPct(s.downPct), s.vaFirstUse !== false) / 100;
  const loan = baseLoan + financedFee;

  const n = Math.round(num(s.termYears, 30) * 12);
  const r = num(s.rate, 0) / 100 / 12;
  const pi = r > 0 ? loan * r / (1 - Math.pow(1 + r, -n)) : (n > 0 ? loan / n : 0);
  const extra = Math.max(num(s.extraMonthly, 0), 0);

  const override = s.miOverride !== '' && isFinite(parseFloat(s.miOverride)) ? parseFloat(s.miOverride) : null;
  let miMode = 'none', miRate = 0, miMaxMonths = 0, miAutoRate = 0;
  if (s.type === 'conv' && ltvPct > 80) {
    miMode = 'conv';
    miAutoRate = autoPmiRate(ltvPct);
    miRate = (override !== null ? override : miAutoRate) / 100;
  }
  if (s.type === 'fha') {
    miMode = 'fha';
    miAutoRate = autoMipRate(ltvPct, num(s.termYears, 30));
    miRate = (override !== null ? override : miAutoRate) / 100;
    miMaxMonths = (downFrac >= 0.10) ? 132 : n;
  }

  const taxMo = price * num(g.taxPct, 0) / 100 / 12;
  const insMo = num(g.insAnnual, 0) / 12;
  const hoaMo = num(g.hoa, 0);

  const closing = itemizeClosing(s, g, price, loan, taxMo);
  const sunkAtClose = closing.fees + closing.credits;
  const cashToClose = down + closing.total;

  let bal = loan, totInt = 0, miEndsMonth = 0, payoffMonth = n;
  const months = 360;
  const balArr = [loan], eqArr = [price - loan], netArr = [];
  let outlay = down + sunkAtClose;
  netArr.push(outlay - (price - loan));

  let miMonthlyFirst = 0;
  for (let m = 1; m <= months; m++) {
    let mi = 0;
    if (bal > 0.005) {
      if (miMode === 'conv' && bal > 0.78 * price) mi = miRate * baseLoan / 12;
      if (miMode === 'fha' && m <= miMaxMonths) mi = miRate * bal / 12;
      if (mi > 0) miEndsMonth = m;
      if (m === 1) miMonthlyFirst = mi;

      const interest = bal * r;
      let princ = pi - interest + extra;
      if (princ > bal) princ = bal;
      totInt += interest;
      bal -= princ;
      outlay += interest + princ + mi + taxMo + insMo + hoaMo;
      if (bal <= 0.005) { bal = 0; payoffMonth = m; }
    } else {
      outlay += taxMo + insMo + hoaMo;
    }
    const value = price * Math.pow(1 + num(g.apprec, 0) / 100, m / 12);
    balArr.push(bal);
    eqArr.push(value - bal);
    netArr.push(outlay - (value - bal));
  }

  const H = Math.min(num(g.horizon, 7) * 12, months);

  return {
    price, down, baseLoan, loan, financedFee, ltvPct,
    pi, miMonthly: miMonthlyFirst, miAutoRate, taxMo, insMo, hoaMo,
    totalMo: pi + extra + miMonthlyFirst + taxMo + insMo + hoaMo,
    piPlusExtra: pi + extra,
    closing, cashToClose,
    miEndsMonth, payoffMonth, totInt,
    balArr, eqArr, netArr,
    equityAtH: eqArr[H], netAtH: netArr[H],
    intAtH: interestThrough(loan, r, pi, extra, H),
  };
}
function interestThrough(loan, r, pi, extra, H) {
  let bal = loan, tot = 0;
  for (let m = 1; m <= H && bal > 0.005; m++) {
    const i = bal * r;
    tot += i;
    let p = pi - i + extra;
    if (p > bal) p = bal;
    bal -= p;
  }
  return tot;
}
function rentSeries(g) {
  const rent0 = num(g.rent, 0), inc = num(g.rentInc, 0) / 100;
  const arr = [0];
  let tot = 0;
  for (let m = 1; m <= 360; m++) {
    tot += rent0 * Math.pow(1 + inc, Math.floor((m - 1) / 12));
    arr.push(tot);
  }
  return arr;
}

function num(v, d) { const x = parseFloat(v); return isFinite(x) ? x : d; }
function clampPct(v) { return Math.min(Math.max(num(v, 0), 0), 100); }

/* ============================================================
   Property lookup (RentCast)
============================================================ */
function renderProp() {
  const p = state.prop;
  const chips = el('propChips');
  const applyBtn = el('applyBtn');
  chips.innerHTML = '';
  if (!p) { applyBtn.style.display = 'none'; return; }
  el('propAddr').value = p.address || '';
  const c = (t, v) => { const d = document.createElement('div'); d.className = 'chip'; d.innerHTML = escapeHtml(t) + '<b>' + escapeHtml(v) + '</b>'; chips.appendChild(d); };
  if (p.value) c('Estimated value', fmt$(p.value));
  if (p.taxAnnual) c('Annual property taxes', fmt$(p.taxAnnual) + (p.taxYear ? ' (' + p.taxYear + ')' : ''));
  if (p.taxPct) c('Effective tax rate', p.taxPct.toFixed(2) + '%');
  if (p.hoaFee) c('HOA dues', fmt$(p.hoaFee) + ' / mo');
  if (p.beds || p.baths) c('Home', (p.beds || '?') + ' bed / ' + (p.baths || '?') + ' bath' + (p.sqft ? ' / ' + p.sqft.toLocaleString() + ' sqft' : ''));
  if (p.yearBuilt) c('Year built', String(p.yearBuilt));
  if (p.lastSalePrice) c('Last sale', fmt$(p.lastSalePrice) + (p.lastSaleDate ? ' (' + String(p.lastSaleDate).slice(0, 4) + ')' : ''));
  applyBtn.style.display = (p.value || p.taxAnnual || p.hoaFee) ? '' : 'none';
}

async function lookupProperty() {
  const addr = el('propAddr').value.trim();
  const key = el('apiKey').value.trim();
  const status = el('propStatus');
  status.className = 'prop-status';
  if (!addr) { status.textContent = 'Type a property address first.'; return; }
  if (!key) {
    status.className = 'prop-status err';
    status.textContent = 'No API key yet. Open "Data connection settings" below, grab a free key at rentcast.io/api, and paste it in. Until then you can type the numbers in by hand.';
    document.querySelector('.mortgage-calculator details.settings').open = true;
    return;
  }
  safeStorage.setItem('rentcastKey', key);
  const btn = el('lookupBtn');
  btn.disabled = true; btn.textContent = 'Looking up…';
  status.textContent = 'Pulling public records…';
  try {
    const h = { 'X-Api-Key': key, 'Accept': 'application/json' };
    const q = encodeURIComponent(addr);
    const [recRes, avmRes] = await Promise.allSettled([
      fetch('https://api.rentcast.io/v1/properties?address=' + q, { headers: h }),
      fetch('https://api.rentcast.io/v1/avm/value?address=' + q, { headers: h })
    ]);

    let rec = null, avm = null, errMsg = '';
    if (recRes.status === 'fulfilled') {
      if (recRes.value.ok) {
        const j = await recRes.value.json();
        rec = Array.isArray(j) ? j[0] : j;
      } else errMsg = 'Records: HTTP ' + recRes.value.status + (
        recRes.value.status === 401 ? ' (check the API key)' :
        recRes.value.status === 403 ? ' (key is valid but no active plan; open your RentCast dashboard, go to Billing, and activate the free Developer plan)' :
        recRes.value.status === 404 ? ' (address not found, use the format Street, City, State, Zip)' :
        recRes.value.status === 429 ? ' (monthly lookup limit reached)' : '');
    } else errMsg = 'Records request blocked: ' + recRes.reason;
    if (avmRes.status === 'fulfilled' && avmRes.value.ok) avm = await avmRes.value.json();

    if (!rec && !avm) throw new Error(errMsg || 'No data returned for that address.');

    const p = { address: (rec && rec.formattedAddress) || addr };
    if (rec && rec.propertyTaxes) {
      const years = Object.keys(rec.propertyTaxes).sort();
      const last = years[years.length - 1];
      if (last) { p.taxAnnual = rec.propertyTaxes[last].total; p.taxYear = last; }
    }
    let assessed = null;
    if (rec && rec.taxAssessments) {
      const years = Object.keys(rec.taxAssessments).sort();
      const last = years[years.length - 1];
      if (last) assessed = rec.taxAssessments[last].value;
    }
    p.value = (avm && avm.price) || assessed || (rec && rec.lastSalePrice) || null;
    if (p.taxAnnual && p.value) p.taxPct = p.taxAnnual / p.value * 100;
    if (rec) {
      if (rec.hoa && rec.hoa.fee) p.hoaFee = rec.hoa.fee;
      p.beds = rec.bedrooms; p.baths = rec.bathrooms; p.sqft = rec.squareFootage;
      p.yearBuilt = rec.yearBuilt; p.lastSalePrice = rec.lastSalePrice; p.lastSaleDate = rec.lastSaleDate;
    }
    state.prop = p;
    renderProp();
    status.className = 'prop-status ok';
    status.textContent = 'Found it. Review the numbers, then click "Use this property".';
    save();
  } catch (e) {
    status.className = 'prop-status err';
    status.textContent = 'Lookup failed. ' + (e && e.message ? e.message : e) + ' You can still type the numbers in by hand.';
  } finally {
    btn.disabled = false; btn.textContent = 'Look up property';
  }
}

function applyProperty() {
  const p = state.prop;
  if (!p) return;
  if (p.taxPct) el('gTaxPct').value = Math.round(p.taxPct * 100) / 100;
  if (p.hoaFee) el('gHoa').value = p.hoaFee;
  if (p.value) state.scenarios.forEach(s => { s.price = Math.round(p.value / 1000) * 1000; });
  buildCards();
  recalc();
  const status = el('propStatus');
  status.className = 'prop-status ok';
  status.textContent = 'Applied. Every option now uses this property’s value, tax rate, and HOA dues.';
}

/* ============================================================
   Formatting
============================================================ */
const fmt$ = v => '$' + Math.round(v).toLocaleString('en-US');
const fmt$0 = v => (v < 0 ? '−$' + Math.round(-v).toLocaleString('en-US') : '$' + Math.round(v).toLocaleString('en-US'));
const fmtK = v => {
  const a = Math.abs(v), sign = v < 0 ? '−' : '';
  if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return sign + '$' + (a / 1e3 >= 10 ? Math.round(a / 1e3) : (a / 1e3).toFixed(1).replace(/\.0$/, '')) + 'k';
  return sign + '$' + Math.round(a);
};
const fmtPct = v => v.toFixed(v % 1 ? 2 : 0).replace(/\.00$/, '') + '%';
function fmtMonths(m) {
  if (!m) return 'None';
  const y = Math.floor(m / 12), mo = m % 12;
  if (y && mo) return y + ' yr ' + mo + ' mo';
  if (y) return y + ' years';
  return mo + ' months';
}
const TYPE_LABEL = { conv: 'Conventional', fha: 'FHA', va: 'VA', jumbo: 'Jumbo', none: 'Other (no MI)' };

/* ============================================================
   Fee settings UI
============================================================ */
const FEE_DEFS = [
  { k: 'lenderFlat', label: 'Lender fees $', step: 50 },
  { k: 'processing', label: 'Processing $', step: 50 },
  { k: 'appraisal', label: 'Appraisal $', step: 25 },
  { k: 'creditFees', label: 'Credit / verifications $', step: 10 },
  { k: 'titleMode', label: 'Title premium', type: 'select', opts: [['tx', 'Texas rates (auto, tracks price)'], ['manual', 'Manual amount']] },
  { k: 'ownerTitle', label: 'Title quoting', type: 'select', opts: [['quote', 'Full lender policy (worksheet style)'], ['seller', "Seller pays owner's, $100 lender"], ['buyer', 'Buyer pays both']] },
  { k: 'manualTitle', label: 'Manual title total $', step: 50 },
  { k: 'ownersOptional', label: "Owner's optional add on $", step: 25 },
  { k: 'endorsements', label: 'Endorsements $', step: 25 },
  { k: 'escrowFee', label: 'Settlement / closing $', step: 25 },
  { k: 'titleMisc', label: 'Title services $', step: 25 },
  { k: 'recording', label: 'Recording $', step: 10 },
  { k: 'survey', label: 'Survey $', step: 25 },
  { k: 'hoaTransfer', label: 'HOA transfer fee $', step: 25 },
  { k: 'prepaidDays', label: 'Prepaid interest days', step: 1 },
  { k: 'taxEscrowMo', label: 'Tax escrow months', step: 1 },
  { k: 'insEscrowMo', label: 'Insurance escrow months', step: 1 },
];
function buildFeeFields() {
  const host = el('feeFields');
  host.innerHTML = '';
  FEE_DEFS.forEach(d => {
    const w = document.createElement('div');
    w.className = 'g-field';
    if (d.type === 'select') {
      w.innerHTML = `<label>${d.label}</label><select data-fee="${d.k}">${d.opts.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('')}</select>`;
      w.querySelector('select').value = state.fees[d.k];
    } else {
      w.innerHTML = `<label>${d.label}</label><input data-fee="${d.k}" type="number" step="${d.step}" value="${state.fees[d.k]}">`;
    }
    host.appendChild(w);
  });
  setInputModes();
}
document.addEventListener('input', e => {
  const k = e.target.dataset && e.target.dataset.fee;
  if (!k) return;
  state.fees[k] = e.target.tagName === 'SELECT' ? e.target.value : num(e.target.value, state.fees[k]);
  recalc();
});

/* ============================================================
   Scenario cards UI
============================================================ */
function el(id) { return document.getElementById(id); }

function setInputModes() {
  document.querySelectorAll('input[type=number]').forEach(i => i.setAttribute('inputmode', 'decimal'));
}

function buildCards() {
  const host = el('cards');
  host.innerHTML = '';
  state.scenarios.forEach((s, i) => host.appendChild(cardNode(s, i)));
  if (state.scenarios.length < 4) {
    const add = document.createElement('button');
    add.className = 'addcard';
    add.textContent = '+ Add another option';
    add.onclick = () => {
      const src = state.scenarios[state.scenarios.length - 1];
      const copy = JSON.parse(JSON.stringify(src));
      copy.name = 'Option ' + (state.scenarios.length + 1);
      state.scenarios.push(copy);
      buildCards(); recalc();
    };
    host.appendChild(add);
  }
  const b = state.brand || {};
  el('brandName').value = b.name || ''; el('brandNmls').value = b.nmls || '';
  el('brandPhone').value = b.phone || ''; el('clientName').value = b.client || '';
  setInputModes();
}

function cardNode(s, i) {
  const c = COLORS[i % COLORS.length];
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <div class="head" style="border-top-color:${c}">
      <input class="name" data-k="name" aria-label="Scenario name" value="${escapeHtml(s.name)}">
      ${state.scenarios.length > 1 ? '<button title="Remove this option" data-del="1">✕</button>' : ''}
    </div>
    <div class="body">
      <div class="row2">
        <div class="f">
          <label>Loan type</label>
          <select data-k="type">
            <option value="conv">Conventional</option>
            <option value="fha">FHA</option>
            <option value="va">VA</option>
            <option value="jumbo">Jumbo</option>
            <option value="none">Other</option>
          </select>
        </div>
        <div class="f">
          <label>Term</label>
          <select data-k="termYears">
            <option value="30">30 years</option><option value="25">25 years</option>
            <option value="20">20 years</option><option value="15">15 years</option><option value="10">10 years</option>
          </select>
        </div>
      </div>
      <div class="f">
        <label>Purchase price</label>
        <input data-k="price" type="number" step="5000" value="${s.price}">
        <div class="slider-row"><input data-k="price" data-slider="1" type="range" min="100000" max="1500000" step="5000" value="${s.price}" style="accent-color:${c}"></div>
      </div>
      <div class="f">
        <label>Down payment</label>
        <div class="row2">
          <input data-k="downPct" type="number" step="0.5" min="0" max="100" value="${s.downPct}" title="Percent down">
          <input data-k="downPct" data-dollar="1" type="number" step="1000" title="Dollar amount down">
        </div>
        <div class="slider-row"><input data-k="downPct" data-slider="1" type="range" min="0" max="50" step="0.5" value="${s.downPct}" style="accent-color:${c}"></div>
      </div>
      <div class="f">
        <label>Interest rate %</label>
        <input data-k="rate" type="number" step="0.125" value="${s.rate}">
      </div>
      <div class="mi-line"></div>
      <details class="more">
        <summary>Advanced (optional)</summary>
        <div class="inner">
          <div class="row2">
            <div class="f"><label>Discount points %</label><input data-k="points" type="number" step="0.125" value="${s.points}"></div>
            <div class="f"><label>Extra payment $ / mo</label><input data-k="extraMonthly" type="number" step="25" value="${s.extraMonthly}"></div>
          </div>
          <div class="row2">
            <div class="f"><label>Seller credit $</label><input data-k="sellerCredit" type="number" step="500" value="${s.sellerCredit}"></div>
            <div class="f"><label>Lender credit $</label><input data-k="lenderCredit" type="number" step="500" value="${s.lenderCredit}"></div>
          </div>
          <div class="row2 adv-mi">
            <div class="f"><label>Mortgage insurance % / yr</label><input data-k="miOverride" type="number" step="0.05" value="${s.miOverride}" placeholder="auto"></div>
          </div>
          <div class="row2 adv-va" style="display:none">
            <div class="f"><label>First VA use</label>
              <select data-k="vaFirstUse"><option value="true">Yes</option><option value="false">No</option></select>
            </div>
            <div class="f"><label>Funding fee exempt</label>
              <select data-k="vaExempt"><option value="false">No</option><option value="true">Yes</option></select>
            </div>
          </div>
        </div>
      </details>
    </div>
    <div class="quick">
      <div class="big"><span class="q-pay"></span> <small>/ month</small></div>
      <div class="sub">Cash to close <b class="q-cash"></b> · title <b class="q-title"></b></div>
    </div>`;

  div.querySelector('[data-k=type]').value = s.type;
  div.querySelector('[data-k=termYears]').value = String(s.termYears);
  div.querySelector('[data-k=vaFirstUse]').value = String(s.vaFirstUse !== false);
  div.querySelector('[data-k=vaExempt]').value = String(!!s.vaExempt);

  div.addEventListener('input', e => {
    const k = e.target.dataset.k;
    if (!k || e.target.dataset.fee) return;
    let v = e.target.value;
    if (k === 'vaExempt' || k === 'vaFirstUse') v = (v === 'true');
    else if (k === 'miOverride') v = e.target.value.trim();
    else if (k !== 'name' && k !== 'type') {
      if (e.target.dataset.dollar) {
        const p = num(state.scenarios[i].price, 1);
        v = p > 0 ? Math.min(100, Math.max(0, num(v, 0) / p * 100)) : 0;
      } else {
        v = num(v, state.scenarios[i][k]);
      }
    }
    state.scenarios[i][k] = v;
    syncCard(div, state.scenarios[i], e.target);
    recalc();
  });
  div.addEventListener('click', e => {
    if (e.target.dataset.del) {
      state.scenarios.splice(i, 1);
      buildCards(); recalc();
    }
  });
  syncCard(div, s, null);
  return div;
}

function syncCard(div, s, src) {
  div.querySelectorAll('[data-k=price]').forEach(inp => { if (inp !== src) inp.value = s.price; });
  div.querySelectorAll('[data-k=downPct]').forEach(inp => {
    if (inp === src) return;
    if (inp.dataset.dollar) inp.value = Math.round(num(s.price, 0) * clampPct(s.downPct) / 100);
    else inp.value = Math.round(clampPct(s.downPct) * 100) / 100;
  });
  div.querySelector('.adv-va').style.display = s.type === 'va' ? 'grid' : 'none';
  div.querySelector('.adv-mi').style.display = (s.type === 'va') ? 'none' : 'grid';
}

function miLineText(s, r) {
  const t = s.type;
  if (t === 'conv') {
    if (r.miMonthly > 0) return `Includes ${fmt$(r.miMonthly)}/mo mortgage insurance (automatic at ${fmtPct(Math.round(r.ltvPct))} financing). It drops off by itself once you reach 22% equity.`;
    return 'No mortgage insurance needed at this down payment.';
  }
  if (t === 'fha') return `Includes FHA mortgage insurance: ${fmt$(r.miMonthly)}/mo plus a financed upfront fee of ${fmt$(r.financedFee)}. Figured automatically.`;
  if (t === 'va') return r.financedFee > 0
    ? `Includes the VA funding fee of ${fmt$(r.financedFee)}, financed into the loan. No monthly mortgage insurance.`
    : 'Funding fee exempt. No monthly mortgage insurance.';
  if (t === 'jumbo' || t === 'none') return 'No mortgage insurance applied.';
  return '';
}

function escapeHtml(t) { return String(t).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c])); }

/* ============================================================
   Recalculate and render everything (single sync path:
   every input funnels here, and everything re-renders)
============================================================ */
let results = [];

function recalc() {
  const g = readGlobals();
  results = state.scenarios.map(s => compute(s, g));

  document.querySelectorAll('#cards .card').forEach((card, i) => {
    const r = results[i];
    if (!r) return;
    card.querySelector('.q-pay').textContent = fmt$(r.totalMo);
    card.querySelector('.q-cash').textContent = fmt$(r.cashToClose);
    const titleItems = r.closing.items.filter(it => it.label.indexOf('title') >= 0 || it.label.indexOf('Title') >= 0);
    card.querySelector('.q-title').textContent = fmt$(titleItems.reduce((a, it) => a + it.amt, 0));
    card.querySelector('.mi-line').textContent = miLineText(state.scenarios[i], r);
    const miInp = card.querySelector('[data-k=miOverride]');
    if (miInp && state.scenarios[i].type !== 'va') {
      miInp.placeholder = r.miAutoRate ? 'auto: ' + r.miAutoRate + '%' : 'auto: none';
    }
    syncCard(card, state.scenarios[i], null);
  });

  syncTaxAmt();
  renderCallouts(g);
  renderTable(g);
  renderCloseTable();
  drawAll(g);
  updatePrintMeta();
  save();
  reportHeight();
}

function updatePrintMeta() {
  buildPrintSheet();
}

// Purpose-built print summary: formatted, readable, generated from results
function buildPrintSheet() {
  const g = readGlobals();
  const client = el('clientName').value.trim();
  const bits = [];
  if (client) bits.push('Prepared for ' + escapeHtml(client));
  if (state.prop && state.prop.address) bits.push(escapeHtml(state.prop.address));
  bits.push(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));
  const logoSrc = document.querySelector('.logo-chip img').src;
  const b = state.brand || {};

  const cards = results.map((r, i) => {
    const s = state.scenarios[i];
    return `<div class="ps-card" style="border-top-color:${COLORS[i % 4]}">
      <div class="ps-name">${escapeHtml(s.name)}</div>
      <div class="ps-line">${TYPE_LABEL[s.type]} · ${s.termYears} yr · ${s.rate}% rate</div>
      <div class="ps-line">${fmt$(r.price)} price · ${fmt$(r.down)} down (${fmtPct(r.price ? r.down / r.price * 100 : 0)})</div>
      <div class="ps-pay">${fmt$(r.totalMo)}<span> / month</span></div>
      <div class="ps-cash">Cash to close <b>${fmt$(r.cashToClose)}</b></div>
      <div class="ps-mi">${escapeHtml(miLineText(s, r))}</div>
    </div>`;
  }).join('');

  el('printSheet').innerHTML = `
    <div class="ps-head">
      <img src="${logoSrc}" alt="Lone Star Financing">
      <div class="ps-contact"><b>${escapeHtml(b.name || '')}</b><br>${escapeHtml(b.nmls || '')} · ${escapeHtml(b.phone || '')}<br>npyles@lonestarfinancing.com</div>
    </div>
    <div class="ps-title">${client ? 'Loan options for <em>' + escapeHtml(client) + '</em>' : 'Every option, <em>side by side.</em>'}</div>
    <div class="ps-meta">${bits.join('  ·  ')}</div>
    <div class="ps-assume">Assumptions: property taxes ${num(g.taxPct, 0)}% per year · home insurance ${fmt$(num(g.insAnnual, 0))} per year · HOA ${fmt$(num(g.hoa, 0))} per month · home appreciation ${num(g.apprec, 0)}% per year · compared over ${num(g.horizon, 7)} years. Mortgage insurance, FHA and VA fees, and Texas title premiums are computed automatically from each option.</div>
    <div class="ps-cards">${cards}</div>`;
}

/* ---------- Callouts ---------- */
function renderCallouts(g) {
  const host = el('callouts');
  host.innerHTML = '';
  if (results.length < 2) { return; }
  const names = state.scenarios.map(s => s.name);
  const H = num(g.horizon, 7);

  const items = [];
  const loPay = idxMin(results.map(r => r.totalMo));
  const hiPay = idxMax(results.map(r => r.totalMo));
  if (loPay !== hiPay) {
    items.push(`<b>${escapeHtml(names[loPay])}</b> has the lowest monthly payment, saving <b>${fmt$(results[hiPay].totalMo - results[loPay].totalMo)}</b> every month compared to ${escapeHtml(names[hiPay])}.`);
  }
  const loCash = idxMin(results.map(r => r.cashToClose));
  const hiCash = idxMax(results.map(r => r.cashToClose));
  if (loCash !== hiCash) {
    items.push(`<b>${escapeHtml(names[loCash])}</b> needs the least cash to close, about <b>${fmt$(results[hiCash].cashToClose - results[loCash].cashToClose)}</b> less than ${escapeHtml(names[hiCash])}.`);
  }
  const loNet = idxMin(results.map(r => r.netAtH));
  items.push(`Looking ${H} years out, <b>${escapeHtml(names[loNet])}</b> comes out ahead with the lowest true net cost after counting the equity you build.`);

  if (loPay !== loCash) {
    const extraCash = results[loPay].cashToClose - results[loCash].cashToClose;
    const moSave = results[loCash].totalMo - results[loPay].totalMo;
    if (extraCash > 0 && moSave > 0) {
      const be = Math.ceil(extraCash / moSave);
      items.push(`${escapeHtml(names[loPay])} asks for <b>${fmt$(extraCash)}</b> more upfront than ${escapeHtml(names[loCash])}, and the lower payment earns that back in about <b>${fmtMonths(be)}</b>.`);
    }
  }
  const rent = num(g.rent, 0);
  if (rent > 0) {
    const rentTot = rentSeries(g)[Math.min(H * 12, 360)];
    items.push(`Keep renting at ${fmt$(rent)} per month and after ${H} years you will have paid <b>${fmt$(rentTot)}</b> in rent with zero equity to show for it.`);
  }

  items.slice(0, 4).forEach(html => {
    const d = document.createElement('div');
    d.className = 'callout';
    d.innerHTML = html;
    host.appendChild(d);
  });
}
function idxMin(a) { let k = 0; a.forEach((v, i) => { if (v < a[k]) k = i; }); return k; }
function idxMax(a) { let k = 0; a.forEach((v, i) => { if (v > a[k]) k = i; }); return k; }

/* ---------- Comparison table ---------- */
function renderTable(g) {
  const H = num(g.horizon, 7);
  const t = el('cmpTable');
  const names = state.scenarios.map(s => s.name);

  const head = `<thead><tr><th></th>${results.map((r, i) =>
    `<th style="background:${COLORS[i % 4]}">${escapeHtml(names[i])}</th>`).join('')}</tr></thead>`;

  const rows = [];
  const G = label => rows.push(`<tr class="group"><td colspan="${results.length + 1}">${label}</td></tr>`);
  const R = (label, fn, best) => {
    const vals = results.map(fn);
    let bi = -1;
    if (best === 'min') bi = idxMin(vals.map(v => v.raw));
    if (best === 'max') bi = idxMax(vals.map(v => v.raw));
    rows.push(`<tr><td>${label}</td>${vals.map((v, i) =>
      `<td class="${i === bi && results.length > 1 ? 'best' : ''}">${v.txt}</td>`).join('')}</tr>`);
  };
  const V = (raw, txt) => ({ raw, txt });

  G('The Loan');
  R('Loan type', (r, i) => V(0, TYPE_LABEL[state.scenarios[i].type]));
  R('Purchase price', r => V(r.price, fmt$(r.price)));
  R('Down payment', r => V(r.down, `${fmt$(r.down)} (${fmtPct(r.price ? r.down / r.price * 100 : 0)})`));
  R('Financed fee (FHA / VA)', r => V(r.financedFee, r.financedFee ? fmt$(r.financedFee) : '—'));
  R('Total loan amount', r => V(r.loan, fmt$(r.loan)));
  R('Rate / term', (r, i) => V(0, `${state.scenarios[i].rate}% / ${state.scenarios[i].termYears} yr`));

  G('Monthly Payment');
  R('Principal and interest', r => V(r.piPlusExtra, fmt$(r.piPlusExtra)));
  R('Mortgage insurance', r => V(r.miMonthly, r.miMonthly ? fmt$(r.miMonthly) : '—'));
  R('Property taxes', r => V(r.taxMo, fmt$(r.taxMo)));
  R('Home insurance', r => V(r.insMo, fmt$(r.insMo)));
  R('HOA dues', r => V(r.hoaMo, r.hoaMo ? fmt$(r.hoaMo) : '—'));
  R('Total monthly payment', r => V(r.totalMo, fmt$(r.totalMo)), 'min');
  R('Mortgage insurance ends', r => V(r.miEndsMonth, r.miEndsMonth ? 'after ' + fmtMonths(r.miEndsMonth) : 'None'));

  G('Upfront');
  R('Closing costs and prepaids', r => V(r.closing.total, fmt$(r.closing.total)), 'min');
  R('Cash to close (with down payment)', r => V(r.cashToClose, fmt$(r.cashToClose)), 'min');

  G(`After ${H} Years`);
  R('Interest paid', r => V(r.intAtH, fmt$(r.intAtH)), 'min');
  R('Equity built', r => V(r.equityAtH, fmt$(r.equityAtH)), 'max');
  R('True net cost', r => V(r.netAtH, fmt$0(r.netAtH)), 'min');

  G('Life of Loan');
  R('Total interest', r => V(r.totInt, fmt$(r.totInt)), 'min');
  R('Paid off in', r => V(r.payoffMonth, fmtMonths(r.payoffMonth)));

  t.innerHTML = head + '<tbody>' + rows.join('') + '</tbody>';
}

/* ---------- Itemized closing table ---------- */
function renderCloseTable() {
  const t = el('closeTable');
  const names = state.scenarios.map(s => s.name);
  const head = `<thead><tr><th></th>${results.map((r, i) =>
    `<th style="background:${COLORS[i % 4]}">${escapeHtml(names[i])}</th>`).join('')}</tr></thead>`;

  const labels = [];
  results.forEach(r => r.closing.items.forEach(it => { if (!labels.includes(it.label)) labels.push(it.label); }));

  const rows = [];
  const G = label => rows.push(`<tr class="group"><td colspan="${results.length + 1}">${label}</td></tr>`);
  const kindOf = lbl => { for (const r of results) { const it = r.closing.items.find(x => x.label === lbl); if (it) return it.kind; } return 'fee'; };

  const section = (title, kind) => {
    const ls = labels.filter(l => kindOf(l) === kind);
    if (!ls.length) return;
    G(title);
    ls.forEach(lbl => {
      rows.push(`<tr><td>${escapeHtml(lbl)}</td>${results.map(r => {
        const it = r.closing.items.find(x => x.label === lbl);
        return `<td>${it ? fmt$0(it.amt) : '—'}</td>`;
      }).join('')}</tr>`);
    });
  };
  section('Loan and Title Fees', 'fee');
  section('Prepaids and Escrow Deposits', 'prepaid');
  section('Credits', 'credit');

  G('Totals');
  rows.push(`<tr><td>Closing costs and prepaids</td>${results.map(r => `<td>${fmt$(r.closing.total)}</td>`).join('')}</tr>`);
  rows.push(`<tr><td>Down payment</td>${results.map(r => `<td>${fmt$(r.down)}</td>`).join('')}</tr>`);
  const loCash = idxMin(results.map(r => r.cashToClose));
  rows.push(`<tr class="sum"><td>Estimated cash to close</td>${results.map((r, i) =>
    `<td class="${i === loCash && results.length > 1 ? 'best' : ''}">${fmt$(r.cashToClose)}</td>`).join('')}</tr>`);

  t.innerHTML = head + '<tbody>' + rows.join('') + '</tbody>';
}

/* ============================================================
   Charts (plain canvas, theme aware for screen and print)
============================================================ */
const CHART_THEME = {
  dark:  { grid: 'rgba(245,234,211,.13)', label: 'rgba(245,234,211,.6)', value: '#f5ead3', zero: 'rgba(245,234,211,.35)', rent: 'rgba(245,234,211,.5)' },
  light: { grid: '#e5eaf1', label: '#94a3b8', value: '#1c2733', zero: '#cbd5e1', rent: '#94a3b8' },
};
function setupCanvas(cv) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 500, h = cv.clientHeight || 260;
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}
const PAD = { l: 52, r: 12, t: 12, b: 26 };

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function drawAxes(ctx, w, h, yMin, yMax, years, T) {
  ctx.strokeStyle = T.grid; ctx.fillStyle = T.label;
  ctx.font = '11px Manrope, -apple-system, sans-serif'; ctx.lineWidth = 1;
  const plotW = w - PAD.l - PAD.r, plotH = h - PAD.t - PAD.b;
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const v = yMin + (yMax - yMin) * i / ticks;
    const y = PAD.t + plotH - plotH * i / ticks;
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(w - PAD.r, y); ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillText(fmtK(v), PAD.l - 6, y + 4);
  }
  const step = years <= 10 ? 2 : 5;
  ctx.textAlign = 'center';
  for (let yr = 0; yr <= years; yr += step) {
    const x = PAD.l + plotW * yr / years;
    ctx.fillText(yr + 'y', x, h - 8);
  }
  return { plotW, plotH };
}

function drawLines(cvId, seriesList, years, extraSeries, T) {
  const cv = el(cvId);
  const { ctx, w, h } = setupCanvas(cv);
  const N = years * 12;
  let lo = 0, hi = 0;
  const all = seriesList.concat(extraSeries ? [extraSeries] : []);
  all.forEach(s => { for (let m = 0; m <= N; m++) { hi = Math.max(hi, s.data[m]); lo = Math.min(lo, s.data[m]); } });
  hi = niceMax(hi); if (lo < 0) lo = -niceMax(-lo);
  const { plotW, plotH } = drawAxes(ctx, w, h, lo, hi, years, T);
  const X = m => PAD.l + plotW * m / N;
  const Y = v => PAD.t + plotH - plotH * (v - lo) / (hi - lo || 1);

  if (lo < 0) {
    ctx.strokeStyle = T.zero; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(PAD.l, Y(0)); ctx.lineTo(w - PAD.r, Y(0)); ctx.stroke();
    ctx.setLineDash([]);
  }
  all.forEach(s => {
    ctx.strokeStyle = s.color; ctx.lineWidth = s.dash ? 1.8 : 2.4;
    if (s.dash) ctx.setLineDash([6, 4]);
    ctx.beginPath();
    for (let m = 0; m <= N; m++) {
      const x = X(m), y = Y(s.data[m]);
      m === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  });
}

function drawPaymentBars(T, PC) {
  const cv = el('chPayment');
  const { ctx, w, h } = setupCanvas(cv);
  const vals = results.map(r => ({ pi: r.piPlusExtra, mi: r.miMonthly, tax: r.taxMo, ins: r.insMo, hoa: r.hoaMo }));
  const maxTot = niceMax(Math.max(...results.map(r => r.totalMo), 1));
  const plotW = w - PAD.l - PAD.r, plotH = h - PAD.t - PAD.b;

  ctx.strokeStyle = T.grid; ctx.fillStyle = T.label; ctx.font = '11px Manrope, sans-serif';
  for (let i = 0; i <= 4; i++) {
    const v = maxTot * i / 4, y = PAD.t + plotH - plotH * i / 4;
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(w - PAD.r, y); ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillText(fmtK(v), PAD.l - 6, y + 4);
  }
  const n = results.length;
  const slot = plotW / n, barW = Math.min(slot * 0.5, 90);
  results.forEach((r, i) => {
    const x = PAD.l + slot * i + (slot - barW) / 2;
    let yTop = PAD.t + plotH;
    PAY_KEYS.forEach(p => {
      const v = vals[i][p];
      if (v <= 0) return;
      const hh = plotH * v / maxTot;
      yTop -= hh;
      ctx.fillStyle = PC[p];
      ctx.fillRect(x, yTop, barW, hh);
    });
    ctx.fillStyle = T.value; ctx.font = 'bold 12px Manrope, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(fmt$(r.totalMo), x + barW / 2, yTop - 6);
    ctx.fillStyle = T.label; ctx.font = '11px Manrope, sans-serif';
    const nm = state.scenarios[i].name;
    ctx.fillText(nm.length > 18 ? nm.slice(0, 17) + '…' : nm, PAD.l + slot * i + slot / 2, h - 8);
  });
}

function legendHtml(entries) {
  return entries.map(e => `<span><i style="background:${e.c}"></i>${escapeHtml(e.t)}</span>`).join('');
}

function drawAll(g, mode) {
  const T = CHART_THEME[mode || 'dark'];
  const PC = PAY_COLORS[mode || 'dark'];
  const years = Math.max(num(g.horizon, 7), 5) === 30 ? 30 : Math.max(num(g.horizon, 7), 10);
  const names = state.scenarios.map(s => s.name);
  const mk = key => results.map((r, i) => ({ data: r[key], color: COLORS[i % 4] }));

  drawPaymentBars(T, PC);
  el('legPayment').innerHTML = legendHtml(PAY_KEYS.map(k => ({ c: PC[k], t: PAY_LABELS[k] })));

  drawLines('chBalance', mk('balArr'), years, null, T);
  drawLines('chEquity', mk('eqArr'), years, null, T);

  const rentArr = rentSeries(g);
  const showRent = num(g.rent, 0) > 0;
  drawLines('chNetCost', mk('netArr'), years, showRent ? { data: rentArr, color: T.rent, dash: true } : null, T);

  const lineLegend = legendHtml(names.map((n, i) => ({ c: COLORS[i % 4], t: n })));
  el('legLines1').innerHTML = lineLegend;
  el('legLines2').innerHTML = lineLegend;
  el('legLines3').innerHTML = lineLegend + (showRent ? legendHtml([{ c: T.rent, t: 'Renting (total rent paid)' }]) : '');
}

/* ============================================================
   Wire up globals and boot
============================================================ */
// Tax dollars and tax percent stay linked (dollars keyed to the first option's price)
function taxRefPrice() { return state.scenarios.length ? num(state.scenarios[0].price, 0) : 0; }
function syncTaxAmt() {
  const p = taxRefPrice();
  const amtEl = el('gTaxAmt');
  if (p > 0 && document.activeElement !== amtEl) amtEl.value = Math.round(p * num(el('gTaxPct').value, 0) / 100);
}
el('gTaxAmt').addEventListener('input', () => {
  const p = taxRefPrice();
  if (p > 0) el('gTaxPct').value = Math.round(num(el('gTaxAmt').value, 0) / p * 10000) / 100;
  recalc();
});

['gTaxPct', 'gInsAnnual', 'gHoa', 'gApprec', 'gHorizon', 'gRent', 'gRentInc',
 'brandName', 'brandNmls', 'brandPhone', 'clientName']
  .forEach(id => el(id).addEventListener('input', () => {
    if (id === 'clientName') {
      const v = el('clientName').value.trim();
      el('titleText').innerHTML = v ? 'Loan options for <em>' + escapeHtml(v) + '</em>' : 'Every option, <em>side by side.</em>';
    }
    recalc();
  }));

window.addEventListener('resize', () => drawAll(readGlobals()));
window.addEventListener('beforeprint', () => { recalc(); drawAll(readGlobals(), 'light'); });
window.addEventListener('afterprint', () => drawAll(readGlobals()));

el('apiKey').value = safeStorage.getItem('rentcastKey') || '';
el('apiKey').addEventListener('input', () => safeStorage.setItem('rentcastKey', el('apiKey').value.trim()));
el('propAddr').addEventListener('keydown', e => { if (e.key === 'Enter') lookupProperty(); });

/* ============================================================
   Fee worksheet upload: parse a lender Initial Fees Worksheet
   PDF in the browser and populate the tool from it
============================================================ */
let pdfjsReady = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve();
  if (pdfjsReady) return pdfjsReady;
  pdfjsReady = new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    sc.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      res();
    };
    sc.onerror = () => { pdfjsReady = null; rej(new Error('Could not load the PDF reader. This feature needs an internet connection.')); };
    document.head.appendChild(sc);
  });
  return pdfjsReady;
}

function pdfLinesFromTextContent(tc) {
  const rows = [];
  tc.items.forEach(it => {
    const y = it.transform[5], x = it.transform[4];
    let row = rows.find(r => Math.abs(r.y - y) <= 2.5);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push({ x, s: it.str });
  });
  return rows.sort((a, b) => b.y - a.y)
    .map(r => r.items.sort((a, b) => a.x - b.x).map(o => o.s).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const wsMoney = t => parseFloat(String(t).replace(/[$,]/g, ''));

// Split a joined PDF row into (label, amount) pairs. Two column worksheets
// merge into one line per row, so classify each pair, not each line.
// "@ $300.00" rate annotations stay attached to their label.
function wsPairsFromLine(line) {
  const tokens = [];
  const re = /\$\s?([\d,]+(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(line))) {
    const pre = line.slice(Math.max(0, m.index - 2), m.index);
    tokens.push({ idx: m.index, end: re.lastIndex, val: wsMoney(m[1]), isRate: /@\s?$/.test(pre) });
  }
  const pairs = [];
  let cursor = 0;
  tokens.forEach(t => {
    if (t.isRate) return;
    const label = line.slice(cursor, t.idx).trim();
    pairs.push({ label, amt: t.val });
    cursor = t.end;
  });
  return pairs;
}

const WS_IGNORE = /^(lender fees|third party fees|taxes and other government fees|prepaids and initial escrow|initial escrow payment|prepaids|funds due|estimated|total|downpayment|credits applied|first mortgage|other financing|supp property|aggregate)/i;

function wsClassifyPair(p, label, amt) {
  const L = label.toLowerCase();
  const addSum = (k, v) => { p.sums[k] = (p.sums[k] || 0) + v; };
  const monthsIn = lbl => { const m = lbl.match(/\((\d+)\s*(?:months?|mos?)/i); return m ? parseInt(m[1], 10) : null; };
  const rateIn = lbl => { const m = lbl.match(/@\s*\$\s?([\d,]+(?:\.\d+)?)/); return m ? wsMoney(m[1]) : null; };

  if (WS_IGNORE.test(L)) return;
  if (/% of (?:total )?loan amount|originator compensation|\(points\)/i.test(L)) { addSum('points', amt); return; }
  if (/underwriting|admin fee|application fee|commitment fee/i.test(L)) { addSum('lenderFlat', amt); return; }
  if (/processing/i.test(L)) { addSum('processing', amt); return; }
  if (/appraisal/i.test(L)) { p.fees.appraisal = amt; return; }
  if (/rent schedule|1007/i.test(L)) { p.fees.rentSchedule = amt; return; }
  if (/title.*attorney/i.test(L)) { addSum('titleMisc', amt); return; }
  if (/credit report|verification of employment|flood cert|tax monitoring|tax status|tax service|udm|attorney/i.test(L)) { addSum('creditFees', amt); return; }
  if (/title.*(deed preparation|notary|tax certificate|guaranty)/i.test(L)) { addSum('titleMisc', amt); return; }
  if (/endorsement/i.test(L)) { addSum('endorsements', amt); return; }
  if (/owner'?s title/i.test(L)) { p.fees.ownersOptional = amt; return; }
  if (/lender'?s title/i.test(L)) { p.lenderTitle = amt; return; }
  if (/settlement or closing|escrow fee/i.test(L)) { p.fees.escrowFee = amt; return; }
  if (/survey/i.test(L)) { if (amt > 0) p.fees.survey = amt; return; }
  if (/recording|transfer tax/i.test(L)) { addSum('recording', amt); return; }
  if (/hazard insurance premium|homeowner'?s insurance premium/i.test(L)) {
    const r = rateIn(label);
    if (r) p.insAnnual = r * 12; else if (amt > 0) p.insAnnual = amt;
    return;
  }
  if (/prepaid interest/i.test(L)) {
    const m = label.match(/\((\d+)\s*days?/i);
    if (m) p.fees.prepaidDays = parseInt(m[1], 10);
    return;
  }
  if (/^property taxes/i.test(L)) {
    const mo = monthsIn(label), r = rateIn(label);
    if (mo) p.fees.taxEscrowMo = mo;
    if (r) p.taxMonthly = r;
    else if (!label.includes('(') && amt > 0 && !p.taxMonthly) p.taxMonthly = amt;
    return;
  }
  if (/hazard insurance reserve/i.test(L)) { const mo = monthsIn(label); if (mo) p.fees.insEscrowMo = mo; return; }
  if (/mortgage insurance (?:premium|reserve)/i.test(L)) { const r = rateIn(label); if (r > 0) p.miMonthly = r; return; }
  if (/^mortgage insurance$/i.test(L.trim())) { if (amt > 0) p.miMonthly = amt; return; }
  if (/^homeowner'?s insurance$/i.test(L.trim())) { if (amt > 0 && !p.insAnnual) p.insAnnual = amt * 12; return; }
  if (/lender credit/i.test(L)) { if (amt > 0.5) p.lenderCredit = amt; return; }
  if (/seller credit/i.test(L)) { if (amt > 0.5) p.sellerCredit = amt; return; }
}

function parseWorksheetLines(lines) {
  const p = { fees: {}, sums: {} };
  let m;
  for (const line of lines) {
    if ((m = line.match(/purchase price:?\s*\$?\s?([\d,]+(?:\.\d{2})?)/i))) p.price = wsMoney(m[1]);
    if ((m = line.match(/(?:total )?loan amount:?\s*\$?\s?([\d,]+(?:\.\d{2})?)/i))) p.loan = wsMoney(m[1]);
    if ((m = line.match(/rate\s*\/\s*apr:?\s*([\d.]+)\s*%/i))) p.rate = parseFloat(m[1]);
    if ((m = line.match(/product:?\s*(\d+)\s*year\s*([a-z\- ]*?)(?:fixed|arm)/i))) {
      p.term = parseInt(m[1], 10);
      const prod = m[2].toLowerCase();
      p.type = prod.includes('fha') ? 'fha' : prod.includes('va') ? 'va' : prod.includes('jumbo') ? 'jumbo' : 'conv';
      p.io = /interest only|\bio\b/i.test(line);
    }
    if ((m = line.match(/downpayment\/funds from borrower\s*\$?\s?([\d,]+(?:\.\d{2})?)/i))) p.down = wsMoney(m[1]);
    wsPairsFromLine(line).forEach(pair => { if (pair.label) wsClassifyPair(p, pair.label, pair.amt); });
  }
  return p;
}
async function handleWorksheetFile(file) {
  const status = el('wsStatus');
  status.className = 'prop-status';
  status.textContent = 'Reading ' + file.name + '…';
  try {
    await loadPdfJs();
    const buf = await file.arrayBuffer();
    const doc = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let lines = [];
    for (let pg = 1; pg <= Math.min(doc.numPages, 4); pg++) {
      const page = await doc.getPage(pg);
      lines = lines.concat(pdfLinesFromTextContent(await page.getTextContent()));
    }
    const p = parseWorksheetLines(lines);
    if (!p.price || !p.rate) throw new Error('Could not find a purchase price and rate in this PDF. It may be a scan; this works best with digital fee worksheets.');
    applyWorksheet(p);
  } catch (e) {
    status.className = 'prop-status err';
    status.textContent = 'Worksheet upload failed. ' + (e && e.message ? e.message : e);
  } finally {
    el('wsFile').value = '';
  }
}

function applyWorksheet(p) {
  const F = state.fees;
  const applied = [];

  // Shared fees, only where the worksheet gave us a number
  const feeMap = { lenderFlat: 'lender fees', processing: 'processing', creditFees: 'credit and verifications',
                   titleMisc: 'title services', endorsements: 'endorsements', recording: 'recording' };
  Object.keys(feeMap).forEach(k => { if (p.sums[k] > 0) { F[k] = Math.round(p.sums[k]); } });
  Object.keys(p.fees).forEach(k => { F[k] = p.fees[k]; });

  // Property numbers
  if (p.insAnnual) { el('gInsAnnual').value = Math.round(p.insAnnual); applied.push('insurance ' + fmt$(p.insAnnual) + '/yr'); }
  if (p.taxMonthly && p.price) {
    const pct = Math.round(p.taxMonthly * 12 / p.price * 10000) / 100;
    el('gTaxPct').value = pct;
    applied.push('tax rate ' + pct + '%');
  }

  // The loan itself, as a new option card
  const s = mkScenario('Worksheet', p.type || 'conv', Math.round(p.price), 20, p.rate);
  if (p.term) s.termYears = p.term;
  if (p.down && p.price) s.downPct = Math.round(p.down / p.price * 10000) / 100;
  else if (p.loan && p.price) s.downPct = Math.round(Math.max(p.price - p.loan, 0) / p.price * 10000) / 100;
  if (p.sums.points > 0 && p.loan) s.points = Math.round(p.sums.points / p.loan * 100 * 1000) / 1000;
  if (p.lenderCredit) s.lenderCredit = Math.round(p.lenderCredit);
  if (p.sellerCredit) s.sellerCredit = Math.round(p.sellerCredit);
  if (p.miMonthly && p.loan) s.miOverride = (p.miMonthly * 12 / p.loan * 100).toFixed(2);
  s.name = (TYPE_LABEL[s.type] || 'Loan') + ' ' + p.rate + '% (worksheet)';

  if (state.scenarios.length >= 4) state.scenarios[state.scenarios.length - 1] = s;
  else state.scenarios.push(s);

  buildFeeFields();
  buildCards();
  recalc();

  const status = el('wsStatus');
  status.className = 'prop-status ok';
  const desc = [TYPE_LABEL[s.type], s.termYears + ' yr', p.rate + '%', fmt$(p.price), 'down ' + fmtPct(s.downPct)].join(' · ');
  status.textContent = 'Worksheet loaded: ' + desc + '. Added as the "' + s.name + '" option and updated shared fees'
    + (applied.length ? ' plus ' + applied.join(', ') : '') + '. Everything stays editable, and title premiums keep tracking price automatically.';
}

el('wsFile').addEventListener('change', e => {
  if (e.target.files && e.target.files[0]) handleWorksheetFile(e.target.files[0]);
});

// When embedded in an iframe (nealpyles.com/compare), tell the parent our height
let lastReportedHeight = 0;
function reportHeight() {
  if (window.parent === window) return;
  const h = document.body.offsetHeight;
  if (Math.abs(h - lastReportedHeight) < 8) return;
  lastReportedHeight = h;
  try { window.parent.postMessage({ lsfToolHeight: h }, '*'); } catch (e) {}
}
window.addEventListener('load', reportHeight);
window.addEventListener('resize', reportHeight);
document.addEventListener('toggle', reportHeight, true);

restoreGlobals();
buildFeeFields();
buildCards();
renderProp();
if (state.brand && state.brand.client) {
  el('titleText').innerHTML = 'Loan options for <em>' + escapeHtml(state.brand.client) + '</em>';
}
recalc();
