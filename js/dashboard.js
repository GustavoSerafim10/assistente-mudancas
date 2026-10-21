/* =========================================================================
   Dashboard — gráficos SVG feitos à mão (sem bibliotecas externas)
   ========================================================================= */
'use strict';

const DASH = { periodo: 365, tips: [] };
/* ordem de empilhamento validada (Normal → Padrão → Emergencial) */
const TIPOS_STACK = [
  { tipo: 'Normal', cor: 'var(--normal)', cls: 'normal' },
  { tipo: 'Padrão', cor: 'var(--padrao)', cls: 'padrao' },
  { tipo: 'Emergencial', cor: 'var(--emerg)', cls: 'emergencial' },
];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function dataBR(s) {           // "dd-mm-yyyy hh:mm"
  const m = String(s || '').match(/(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)) : null;
}
const cancelada = r => /cancel|recus/i.test(r.status);
const fmt = n => n.toLocaleString('pt-BR');
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
const curtoGrupo = g => g.replace(/^CIA > DISTI > /, '').replace(/^CGGT > /, '');

/* ---------- tooltip ---------- */
function tipId(html) { DASH.tips.push(html); return DASH.tips.length - 1; }
const tipEl = () => document.getElementById('tip');
document.addEventListener('mousemove', e => {
  const alvo = e.target.closest && e.target.closest('[data-tip]');
  const t = tipEl(); if (!t) return;
  if (!alvo) { t.classList.remove('on'); return; }
  t.innerHTML = DASH.tips[+alvo.dataset.tip] || '';
  const w = t.offsetWidth, h = t.offsetHeight;
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + w > innerWidth - 8) x = e.clientX - w - 14;
  if (y + h > innerHeight - 8) y = e.clientY - h - 14;
  t.style.left = x + 'px'; t.style.top = y + 'px'; t.classList.add('on');
});
const linhaTip = (cor, nome, val) => `<div class="linha"><span>${cor ? `<i style="background:${cor}"></i>` : ''}${esc(nome)}</span><span>${val}</span></div>`;

/* ---------- dados ---------- */
function filtrar() {
  const H = Historico.dados.map(r => ({ ...r, dt: dataBR(r.abertura), dtFim: dataBR(r.atualizacao) })).filter(r => r.dt);
  if (!DASH.periodo) return H;
  const corte = new Date(); corte.setHours(0, 0, 0, 0); corte.setDate(corte.getDate() - DASH.periodo);
  return H.filter(r => r.dt >= corte);
}

/* ---------- KPIs ---------- */
function contarAte(el, alvo, sufixo = '') {
  if (document.documentElement.classList.contains('estatico')) { el.textContent = fmt(alvo) + sufixo; return; }
  const ini = performance.now(), dur = 900;
  const passo = t => {
    const p = Math.min(1, (t - ini) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(Math.round(alvo * e)) + sufixo;
    if (p < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

function renderKpis(L) {
  const validas = L.filter(r => !cancelada(r));
  const tip = t => validas.filter(r => r.tipo === t).length;
  const p = tip('Padrão'), n = tip('Normal'), em = tip('Emergencial'), tipadas = p + n + em;
  const canc = L.length - validas.length;
  const dias = validas.filter(r => /fechado/i.test(r.status) && r.dtFim).map(r => (r.dtFim - r.dt) / 864e5).filter(d => d >= 0).sort((a, b) => a - b);
  const mediana = dias.length ? dias[Math.floor(dias.length / 2)] : 0;
  const itens = [
    { rot: 'RDMs no período', num: L.length, det: `${fmt(validas.length)} válidas`, kc: 'var(--grad)' },
    { rot: 'Padrão', num: p, det: `${pct(p, tipadas)}% das tipadas`, kc: 'var(--padrao)' },
    { rot: 'Normal', num: n, det: `${pct(n, tipadas)}% das tipadas`, kc: 'var(--normal)' },
    { rot: 'Emergencial', num: em, det: `${pct(em, tipadas)}% das tipadas`, kc: 'var(--emerg)' },
    { rot: 'Canceladas', num: canc, det: `${pct(canc, L.length)}% do total`, kc: 'var(--req)' },
    { rot: 'Lead time (mediana)', num: Math.round(mediana * 10) / 10, suf: ' d', det: 'abertura → última atualização (fechadas)', kc: 'var(--a3)' },
  ];
  const box = document.getElementById('kpis');
  box.innerHTML = itens.map((k, i) => `<div class="kpi" style="--kc:${k.kc};animation-delay:${i * .05}s">
      <div class="rotulo"><i></i>${k.rot}</div><div class="num" data-alvo="${k.num}" data-suf="${k.suf || ''}">0</div><div class="det">${k.det}</div></div>`).join('');
  box.querySelectorAll('.num').forEach(el => {
    const alvo = +el.dataset.alvo;
    if (Number.isInteger(alvo)) contarAte(el, alvo, el.dataset.suf);
    else el.textContent = alvo.toLocaleString('pt-BR') + el.dataset.suf;
  });
}

/* ---------- RDMs por período (barras empilhadas) ---------- */
function baldes(L) {
  const porDia = DASH.periodo && DASH.periodo <= 30, porSemana = DASH.periodo && DASH.periodo > 30 && DASH.periodo <= 90;
  const chave = d => {
    if (porDia) return d.toISOString().slice(0, 10);
    if (porSemana) { const s = new Date(d); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); s.setHours(0, 0, 0, 0); return s.toISOString().slice(0, 10); }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const rotulo = k => {
    if (porDia || porSemana) { const [, m, d] = k.split('-'); return `${d}/${m}`; }
    const [a, m] = k.split('-'); return `${MESES[+m - 1]}/${a.slice(2)}`;
  };
  const mapa = new Map();
  for (const r of L) {
    if (cancelada(r)) continue;
    const k = chave(r.dt);
    if (!mapa.has(k)) mapa.set(k, { k, rot: rotulo(k), Normal: 0, 'Padrão': 0, Emergencial: 0, outros: 0, total: 0 });
    const b = mapa.get(k);
    if (b[r.tipo] != null) b[r.tipo]++; else b.outros++;
    b.total++;
  }
  return { lista: [...mapa.values()].sort((a, b) => a.k.localeCompare(b.k)), unidade: porDia ? 'dia' : porSemana ? 'semana' : 'mês' };
}

function renderMes(L) {
  const el = document.getElementById('chMes');
  const { lista, unidade } = baldes(L);
  document.getElementById('legMes').innerHTML = [...TIPOS_STACK].reverse().map(t => `<span><i class="c-${t.cls}"></i>${t.tipo}</span>`).join('');
  if (!lista.length) { el.innerHTML = '<div class="vazio-chart">Sem dados no período.</div>'; return; }
  const W = 760, H = 270, pad = { l: 34, r: 8, t: 22, b: 28 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const max = Math.max(...lista.map(b => b.total)) || 1;
  const passoY = max > 50 ? 20 : max > 20 ? 10 : max > 8 ? 4 : 1;
  const topo = Math.ceil(max / passoY) * passoY;
  const bw = iw / lista.length, larg = Math.max(4, Math.min(38, bw * .62));
  const y = v => pad.t + ih - v / topo * ih;
  const mostrarTodos = lista.length <= 14;
  const imax = lista.findIndex(b => b.total === max);
  let svg = '';
  for (let v = 0; v <= topo; v += passoY) svg += `<line class="eixo" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  const cadaRot = Math.ceil(lista.length / 14);
  lista.forEach((b, i) => {
    const cx = pad.l + bw * i + bw / 2, x = cx - larg / 2;
    let base = 0, segs = '';
    const visiveis = TIPOS_STACK.filter(t => b[t.tipo] > 0);
    visiveis.forEach((t, j) => {
      const v = b[t.tipo], y0 = y(base), y1 = y(base + v);
      const h = Math.max(0, y0 - y1 - (j > 0 ? 2 : 0)); // 2px de respiro entre segmentos
      const topoSeg = j === visiveis.length - 1;
      const r = Math.min(4, h, larg / 2);
      segs += topoSeg
        ? `<path fill="${t.cor}" d="M${x},${y1 + h} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + larg - r} Q${x + larg},${y1} ${x + larg},${y1 + r} V${y1 + h} Z"/>`
        : `<rect fill="${t.cor}" x="${x}" y="${y1}" width="${larg}" height="${h}"/>`;
      base += v;
    });
    svg += `<g class="barra-anim" style="animation-delay:${i * 25}ms">${segs}</g>`;
    if (mostrarTodos || i === imax) svg += `<text class="val" x="${cx}" y="${y(b.total) - 7}" text-anchor="middle">${b.total}</text>`;
    if (i % cadaRot === 0) svg += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${b.rot}</text>`;
    const tip = tipId(`<div class="tt">${esc(b.rot)} · ${b.total} RDMs</div>` + [...TIPOS_STACK].reverse().map(t => linhaTip(t.cor, t.tipo, b[t.tipo])).join('')
      + (b.outros ? linhaTip('var(--req)', 'Outros', b.outros) : ''));
    svg += `<rect class="hit" data-tip="${tip}" x="${pad.l + bw * i}" y="${pad.t}" width="${bw}" height="${ih}"/>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="RDMs por ${unidade}, empilhadas por tipo">${svg}</svg>`;
}

/* ---------- barras horizontais (uma série) ---------- */
function renderBarrasH(id, pares, rotulo, cor = 'var(--serie)') {
  const el = document.getElementById(id);
  if (!pares.length) { el.innerHTML = '<div class="vazio-chart">Sem dados no período.</div>'; return; }
  const W = 420, linha = 30, H = pares.length * linha + 4, labW = 176, valW = 44;
  const max = Math.max(...pares.map(p => p[1]));
  const total = pares.reduce((a, p) => a + p[1], 0);
  let svg = '';
  pares.forEach(([nome, v], i) => {
    const yy = i * linha + 6, w = Math.max(3, (W - labW - valW) * v / max), x = labW, h = 16, r = Math.min(4, w);
    const nomeC = nome.length > 30 ? nome.slice(0, 29) + '…' : nome;
    svg += `<text x="${labW - 10}" y="${yy + 12}" text-anchor="end">${esc(nomeC)}</text>
      <path class="barra-h" style="animation-delay:${i * 50}ms" fill="${cor}" d="M${x},${yy} H${x + w - r} Q${x + w},${yy} ${x + w},${yy + r} V${yy + h - r} Q${x + w},${yy + h} ${x + w - r},${yy + h} H${x} Z"/>
      <text class="val" x="${x + w + 8}" y="${yy + 12}">${fmt(v)}</text>
      <rect class="hit" data-tip="${tipId(`<div class="tt">${esc(nome)}</div>` + linhaTip(cor, rotulo, fmt(v)) + linhaTip('', 'Participação', pct(v, total) + '%'))}" x="0" y="${yy - 6}" width="${W}" height="${linha}"/>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(rotulo)}">${svg}</svg>`;
}

function topN(contagem, n) { return Object.entries(contagem).sort((a, b) => b[1] - a[1]).slice(0, n); }

/* ---------- abertura por dia da semana (colunas, uma série) ---------- */
function renderSemana(L) {
  const el = document.getElementById('chStatus');
  const nomes = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'], cont = [0, 0, 0, 0, 0, 0, 0];
  for (const r of L) if (!cancelada(r)) cont[(r.dt.getDay() + 6) % 7]++;
  const total = cont.reduce((a, b) => a + b, 0);
  if (!total) { el.innerHTML = '<div class="vazio-chart">Sem dados no período.</div>'; return; }
  const W = 420, H = 250, pad = { l: 10, r: 10, t: 22, b: 26 }, iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const max = Math.max(...cont), bw = iw / 7, larg = bw * .56;
  let svg = `<line class="eixo" x1="${pad.l}" x2="${W - pad.r}" y1="${pad.t + ih}" y2="${pad.t + ih}"/>`;
  cont.forEach((v, i) => {
    const h = Math.max(v ? 3 : 0, v / max * ih), x = pad.l + bw * i + (bw - larg) / 2, y = pad.t + ih - h, r = Math.min(4, h);
    svg += `<path class="barra-anim" style="animation-delay:${i * 50}ms" fill="${i === cont.indexOf(max) ? 'var(--a2)' : 'var(--serie)'}" d="M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + larg - r} Q${x + larg},${y} ${x + larg},${y + r} V${y + h} Z"/>
      <text class="val" x="${x + larg / 2}" y="${y - 7}" text-anchor="middle">${v}</text>
      <text x="${x + larg / 2}" y="${H - 8}" text-anchor="middle">${nomes[i]}</text>
      <rect class="hit" data-tip="${tipId(`<div class="tt">${nomes[i]}</div>` + linhaTip('', 'RDMs abertas', v) + linhaTip('', 'Participação', pct(v, total) + '%'))}" x="${pad.l + bw * i}" y="${pad.t}" width="${bw}" height="${ih}"/>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="RDMs abertas por dia da semana">${svg}</svg>`;
}

/* ---------- mix de tipo por categoria (100% empilhado) ---------- */
function renderCategorias(L) {
  const el = document.getElementById('chCat');
  document.getElementById('legCat').innerHTML = [...TIPOS_STACK].reverse().map(t => `<span><i class="c-${t.cls}"></i>${t.tipo}</span>`).join('');
  const cats = {};
  for (const r of L) {
    if (cancelada(r) || !r.categoria) continue;
    const c = cats[r.categoria] ??= { Normal: 0, 'Padrão': 0, Emergencial: 0, total: 0 };
    if (c[r.tipo] != null) { c[r.tipo]++; c.total++; }
  }
  const lista = Object.entries(cats).filter(([, c]) => c.total).sort((a, b) => b[1].total - a[1].total).slice(0, 8);
  if (!lista.length) { el.innerHTML = '<div class="vazio-chart">Sem dados no período.</div>'; return; }
  const W = 1180, linha = 34, H = lista.length * linha + 4, labW = 360, valW = 60, bw = W - labW - valW;
  let svg = '';
  lista.forEach(([nome, c], i) => {
    const yy = i * linha + 7, h = 18;
    let x = labW;
    const vis = TIPOS_STACK.filter(t => c[t.tipo] > 0);
    vis.forEach((t, j) => {
      const w = bw * c[t.tipo] / c.total - (j < vis.length - 1 ? 2 : 0);
      const ultimo = j === vis.length - 1, r = ultimo ? Math.min(4, w) : 0;
      svg += ultimo
        ? `<path class="barra-h" style="animation-delay:${i * 60}ms" fill="${t.cor}" d="M${x},${yy} H${x + w - r} Q${x + w},${yy} ${x + w},${yy + r} V${yy + h - r} Q${x + w},${yy + h} ${x + w - r},${yy + h} H${x} Z"/>`
        : `<rect class="barra-h" style="animation-delay:${i * 60}ms" fill="${t.cor}" x="${x}" y="${yy}" width="${Math.max(0, w)}" height="${h}"/>`;
      if (w > 34) svg += `<text x="${x + w / 2}" y="${yy + 13}" text-anchor="middle" style="fill:#fff;font-weight:650">${pct(c[t.tipo], c.total)}%</text>`;
      x += w + 2;
    });
    svg += `<text x="${labW - 12}" y="${yy + 13}" text-anchor="end">${esc(nome.length > 52 ? nome.slice(0, 51) + '…' : nome)}</text>
      <text class="val" x="${W - valW + 10}" y="${yy + 13}">${fmt(c.total)}</text>
      <rect class="hit" data-tip="${tipId(`<div class="tt">${esc(nome)}</div>` + [...TIPOS_STACK].reverse().map(t => linhaTip(t.cor, t.tipo, `${c[t.tipo]} (${pct(c[t.tipo], c.total)}%)`)).join(''))}" x="0" y="${yy - 7}" width="${W}" height="${linha}"/>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mix de tipo de mudança por categoria">${svg}</svg>`;
}

/* ---------- feed ---------- */
function renderFeed(L) {
  const cor = { 'Padrão': 'var(--padrao)', Normal: 'var(--normal)', Emergencial: 'var(--emerg)' };
  const ult = [...L].sort((a, b) => b.dt - a.dt).slice(0, 12);
  document.getElementById('feed').innerHTML = ult.length ? ult.map((r, i) => `<li style="animation-delay:${i * 40}ms">
      <span class="ponto" style="background:${cor[r.tipo] || 'var(--req)'}"></span>
      <span class="t">${esc(r.titulo.replace(/^\s*\[(rdm|rmd|gmud)\]\s*-?\s*/i, ''))}</span>
      <span class="m"><span class="pill ${classeTipo(r.tipo)}">${esc(r.tipo || '—')}</span>${esc(r.id)} · ${r.dt.toLocaleDateString('pt-BR')} · ${esc(r.status)}</span></li>`).join('')
    : '<li><span></span><span class="dica">Sem RDMs no período.</span></li>';
}

/* ---------- principal ---------- */
function renderDashboard() {
  if (!document.getElementById('kpis')) return;
  DASH.tips = [];
  // boas-vindas: aparece enquanto faltar o CSV ou a configuração do nome
  const temDados = Historico.dados.length > 0;
  const cfgOk = typeof cfg !== 'undefined' && cfg.meuNome && !cfg.meuNome.startsWith('(');
  document.getElementById('dashVazio').hidden = temDados;   // só no painel vazio; importou o CSV, some
  document.getElementById('bvPasso1').classList.toggle('feito', temDados);
  document.getElementById('bvPasso2').classList.toggle('feito', cfgOk);
  document.getElementById('kpis').hidden = !temDados;
  document.querySelector('.dash-grade').hidden = !temDados;
  const L = filtrar();
  const base = Historico.base;
  document.getElementById('dashSub').textContent = Historico.dados.length
    ? `${fmt(L.length)} RDMs no período · base de ${fmt(Historico.dados.length)} mudanças${base ? ' · atualizada em ' + new Date(base.geradoEm).toLocaleDateString('pt-BR') : ''}`
    : 'Sem histórico — importe o CSV na aba Histórico.';
  renderKpis(L);
  renderMes(L);
  renderFeed(L);
  const valid = L.filter(r => !cancelada(r));
  const apps = {}, torres = {};
  for (const r of valid) { if (r.app) apps[r.app] = (apps[r.app] || 0) + 1; for (const g of r.obs) torres[curtoGrupo(g)] = (torres[curtoGrupo(g)] || 0) + 1; }
  renderBarrasH('chApps', topN(apps, 8), 'RDMs');
  renderBarrasH('chTorres', topN(torres, 8), 'RDMs como observador');
  renderSemana(L);
  renderCategorias(L);
}

document.querySelectorAll('[data-periodo]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-periodo]').forEach(x => x.classList.toggle('sel', x === b));
  DASH.periodo = +b.dataset.periodo;
  renderDashboard();
}));
document.querySelectorAll('.aba').forEach(b => b.addEventListener('click', () => { if (b.dataset.aba === 'dashboard') renderDashboard(); }));
renderDashboard();

/* botões da boas-vindas */
document.getElementById('btnBvCSV').addEventListener('click', () => document.getElementById('inCSV').click());
document.getElementById('btnBvCfg').addEventListener('click', () => document.querySelector('.aba[data-aba="config"]').click());
