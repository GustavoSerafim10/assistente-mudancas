/* =========================================================================
   Dashboard — dois painéis (Histórico GLPI × Meus atendimentos)
   Gráficos SVG feitos à mão (sem bibliotecas externas)
   ========================================================================= */
'use strict';

const DASH = {
  visao: 'glpi',
  tips: [],
  filtro: { glpi: { preset: '365' }, atend: { preset: 'mes' } },   // cada painel lembra o próprio período
};
/* ordem de empilhamento validada (Normal → Padrão → Emergencial) */
const TIPOS_STACK = [
  { tipo: 'Normal', cor: 'var(--normal)', cls: 'normal' },
  { tipo: 'Padrão', cor: 'var(--padrao)', cls: 'padrao' },
  { tipo: 'Emergencial', cor: 'var(--emerg)', cls: 'emergencial' },
];
const TIPOS_LEITURA = ['Padrão', 'Normal', 'Emergencial'].map(t => TIPOS_STACK.find(x => x.tipo === t));
const legendaTipos = extra => TIPOS_LEITURA.map(t => `<span class="chip"><i class="c-${t.cls}"></i>${t.tipo}</span>`).join('') + (extra || '');
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function dataBR(s) {           // "dd-mm-yyyy hh:mm"
  const m = String(s || '').match(/(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)) : null;
}
const ehCancelada = r => /cancel|recus/i.test(r.status || '');
const cancelada = r => !r._contar && ehCancelada(r);   // _contar = "Incluir canceladas" ligado
const fmt = n => n.toLocaleString('pt-BR');
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
const curtoGrupo = g => String(g || '').replace(/^CIA > DISTI > /, '').replace(/^CGGT > /, '');
const isoDia = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const vazioChart = '<div class="vazio-chart">Sem dados no período.</div>';

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

/* ---------- período ---------- */
function intervaloDoPreset(preset) {
  const hoje = new Date(), ini = d => { d.setHours(0, 0, 0, 0); return d; }, fim = d => { d.setHours(23, 59, 59, 999); return d; };
  if (preset === 'mes') return { de: ini(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: fim(new Date(hoje)) };
  if (preset === 'mesant') return { de: ini(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)), ate: fim(new Date(hoje.getFullYear(), hoje.getMonth(), 0)) };
  if (preset === '0') return { de: null, ate: null };
  const n = +preset, de = ini(new Date(hoje)); de.setDate(de.getDate() - n);
  return { de, ate: fim(new Date(hoje)) };
}
function intervaloAtual() {
  const f = DASH.filtro[DASH.visao];
  if (f.preset !== 'custom') return intervaloDoPreset(f.preset);
  return {
    de: f.de ? new Date(f.de + 'T00:00:00') : null,
    ate: f.ate ? new Date(f.ate + 'T23:59:59') : null,
  };
}
function descreverIntervalo({ de, ate }) {
  const f = DASH.filtro[DASH.visao];
  const hoje = new Date();
  if (f.preset === 'mes') return `${MESES_LONGO[hoje.getMonth()]} de ${hoje.getFullYear()}`;
  if (f.preset === 'mesant') { const d = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1); return `${MESES_LONGO[d.getMonth()]} de ${d.getFullYear()}`; }
  if (!de && !ate) return 'todo o período';
  return `${de ? de.toLocaleDateString('pt-BR') : 'início'} a ${ate ? ate.toLocaleDateString('pt-BR') : 'hoje'}`;
}
function noIntervalo(lista, iv) { return lista.filter(r => r.dt && (!iv.de || r.dt >= iv.de) && (!iv.ate || r.dt <= iv.ate)); }

function sincronizarControlesPeriodo() {
  const f = DASH.filtro[DASH.visao], iv = intervaloAtual();
  document.querySelectorAll('[data-periodo]').forEach(b => b.classList.toggle('sel', b.dataset.periodo === f.preset));
  document.getElementById('dtDe').value = iv.de ? isoDia(iv.de) : '';
  document.getElementById('dtAte').value = iv.ate ? isoDia(iv.ate) : '';
}

/* ---------- dados ---------- */
function dadosGLPI() { return Historico.dados.map(r => ({ ...r, dt: dataBR(r.abertura), dtFim: dataBR(r.atualizacao), _contar: !!DASH.incluirCanc })).filter(r => r.dt); }
function dadosAtend() { return Atendimentos.lista.map(r => ({ ...r, dt: new Date(r.quando), status: '' })).filter(r => !isNaN(r.dt)); }

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
function desenharKpis(boxId, itens) {
  const box = document.getElementById(boxId);
  box.innerHTML = itens.map((k, i) => `<div class="kpi" style="--kc:${k.kc};animation-delay:${i * .05}s">
      <div class="rotulo"><i></i>${k.rot}</div><div class="num" data-alvo="${k.num}" data-suf="${k.suf || ''}">0</div><div class="det">${k.det}</div></div>`).join('');
  box.querySelectorAll('.num').forEach(el => {
    const alvo = +el.dataset.alvo;
    if (Number.isInteger(alvo)) contarAte(el, alvo, el.dataset.suf);
    else el.textContent = alvo.toLocaleString('pt-BR') + el.dataset.suf;
  });
}

function kpisGLPI(L) {
  const validas = L.filter(r => !cancelada(r));
  const tip = t => validas.filter(r => r.tipo === t).length;
  const p = tip('Padrão'), n = tip('Normal'), em = tip('Emergencial'), tipadas = p + n + em;
  const canc = L.filter(ehCancelada).length;
  const cancDo = t => L.filter(r => ehCancelada(r) && r.tipo === t).length;
  const extraCanc = t => (DASH.incluirCanc ? ` · inclui ${fmt(cancDo(t))} canceladas` : (cancDo(t) ? ` · +${fmt(cancDo(t))} canceladas` : ''));
  const dias = validas.filter(r => /fechado/i.test(r.status) && r.dtFim).map(r => (r.dtFim - r.dt) / 864e5).filter(d => d >= 0).sort((a, b) => a - b);
  const mediana = dias.length ? dias[Math.floor(dias.length / 2)] : 0;
  desenharKpis('kpis', [
    { rot: 'RDMs no período', num: L.length, det: `${fmt(L.length - canc)} não canceladas`, kc: 'var(--grad)' },
    { rot: 'Padrão', num: p, det: `${pct(p, tipadas)}% das tipadas` + extraCanc('Padrão'), kc: 'var(--padrao)' },
    { rot: 'Normal', num: n, det: `${pct(n, tipadas)}% das tipadas` + extraCanc('Normal'), kc: 'var(--normal)' },
    { rot: 'Emergencial', num: em, det: `${pct(em, tipadas)}% das tipadas` + extraCanc('Emergencial'), kc: 'var(--emerg)' },
    { rot: 'Canceladas', num: canc, det: `${pct(canc, L.length)}% do total` + (DASH.incluirCanc ? ' · incluídas nos números' : ' · fora dos números'), kc: 'var(--req)' },
    { rot: 'Lead time (mediana)', num: Math.round(mediana * 10) / 10, suf: ' d', det: 'abertura → última atualização (fechadas)', kc: 'var(--a3)' },
  ]);
}

function kpisAtend(L) {
  const tip = t => L.filter(r => r.tipo === t).length;
  const p = tip('Padrão'), n = tip('Normal'), em = tip('Emergencial'), req = tip('Requisição');
  const corrigidas = L.filter(r => r.corrigido).length;
  const dias = new Set(L.map(r => isoDia(r.dt))).size;
  desenharKpis('kpisAt', [
    { rot: 'Atendimentos', num: L.length, det: dias ? `em ${dias} dia${dias > 1 ? 's' : ''} · média ${(L.length / dias).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/dia` : '—', kc: 'var(--grad)' },
    { rot: 'Padrão', num: p, det: `${pct(p, L.length)}% dos atendimentos`, kc: 'var(--padrao)' },
    { rot: 'Normal', num: n, det: `${pct(n, L.length)}% dos atendimentos`, kc: 'var(--normal)' },
    { rot: 'Emergencial', num: em, det: `${pct(em, L.length)}% dos atendimentos`, kc: 'var(--emerg)' },
    { rot: 'Devolvidas (requisição)', num: req, det: `${pct(req, L.length)}% dos atendimentos`, kc: 'var(--req)' },
    { rot: 'Acerto do assistente', num: L.length ? pct(L.length - corrigidas, L.length) : 0, suf: '%', det: `${corrigidas} corrigida${corrigidas === 1 ? '' : 's'} manualmente`, kc: 'var(--a3)' },
  ]);
}

/* ---------- barras empilhadas por período ---------- */
function baldes(L, iv) {
  const t0 = iv.de || (L.length ? new Date(Math.min(...L.map(r => r.dt))) : new Date());
  const t1 = iv.ate || new Date();
  const span = (t1 - t0) / 864e5;
  const porDia = span <= 45, porSemana = !porDia && span <= 120;
  const chave = d => {
    if (porDia) return isoDia(d);
    if (porSemana) { const s = new Date(d); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); return isoDia(s); }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const rotulo = k => {
    if (porDia || porSemana) { const [, m, d] = k.split('-'); return `${d}/${m}`; }
    const [a, m] = k.split('-'); return `${MESES[+m - 1]}/${a.slice(2)}`;
  };
  const novo = k => ({ k, rot: rotulo(k), Normal: 0, 'Padrão': 0, Emergencial: 0, outros: 0, total: 0 });
  const mapa = new Map();
  // no modo diário de um intervalo fechado, mostra todos os dias (inclusive os vazios) — dá a "cara" do mês
  if (porDia && iv.de) for (let d = new Date(iv.de); d <= t1; d.setDate(d.getDate() + 1)) mapa.set(isoDia(d), novo(isoDia(d)));
  for (const r of L) {
    if (cancelada(r)) continue;
    const k = chave(r.dt);
    if (!mapa.has(k)) mapa.set(k, novo(k));
    const b = mapa.get(k);
    if (b[r.tipo] != null) b[r.tipo]++; else b.outros++;
    b.total++;
  }
  return { lista: [...mapa.values()].sort((a, b) => a.k.localeCompare(b.k)), unidade: porDia ? 'dia' : porSemana ? 'semana' : 'mês' };
}

function renderEmpilhado(L, iv, chId, legId, rotUnidade, nomeItem = 'RDMs', outrosNome = 'Outros') {
  const el = document.getElementById(chId);
  const { lista, unidade } = baldes(L, iv);
  document.getElementById(legId).innerHTML = legendaTipos(lista.some(b => b.outros) ? `<span class="chip"><i class="c-outro"></i>${outrosNome}</span>` : '');
  if (rotUnidade) document.getElementById(rotUnidade.id).textContent = rotUnidade.prefixo + ' ' + unidade;
  if (!lista.some(b => b.total)) { el.innerHTML = vazioChart; return unidade; }
  const W = 760, H = 270, pad = { l: 34, r: 8, t: 22, b: 28 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const max = Math.max(...lista.map(b => b.total)) || 1;
  const passoY = max > 50 ? 20 : max > 20 ? 10 : max > 8 ? 4 : max > 4 ? 2 : 1;
  const topo = Math.ceil(max / passoY) * passoY;
  const bw = iw / lista.length, larg = Math.max(4, Math.min(38, bw * .62));
  const y = v => pad.t + ih - v / topo * ih;
  const mostrarTodos = lista.length <= 16;
  const imax = lista.findIndex(b => b.total === max);
  const series = [...TIPOS_STACK, { tipo: 'outros', cor: 'var(--req)' }];
  let svg = '';
  for (let v = 0; v <= topo; v += passoY) svg += `<line class="eixo" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  const cadaRot = Math.ceil(lista.length / 16);
  lista.forEach((b, i) => {
    const cx = pad.l + bw * i + bw / 2, x = cx - larg / 2;
    let base = 0, segs = '';
    const visiveis = series.filter(t => b[t.tipo] > 0);
    visiveis.forEach((t, j) => {
      const v = b[t.tipo], y0 = y(base), y1 = y(base + v);
      const h = Math.max(0, y0 - y1 - (j > 0 ? 2 : 0)); // 2px de respiro entre segmentos
      const r = Math.min(4, h, larg / 2);
      segs += j === visiveis.length - 1
        ? `<path fill="${t.cor}" d="M${x},${y1 + h} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + larg - r} Q${x + larg},${y1} ${x + larg},${y1 + r} V${y1 + h} Z"/>`
        : `<rect fill="${t.cor}" x="${x}" y="${y1}" width="${larg}" height="${h}"/>`;
      base += v;
    });
    svg += `<g class="barra-anim" style="animation-delay:${i * 20}ms">${segs}</g>`;
    if (b.total && (mostrarTodos || i === imax)) svg += `<text class="val" x="${cx}" y="${y(b.total) - 7}" text-anchor="middle">${b.total}</text>`;
    if (i % cadaRot === 0) svg += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${b.rot}</text>`;
    const tip = tipId(`<div class="tt">${esc(b.rot)} · ${b.total} ${nomeItem}</div>` + TIPOS_LEITURA.map(t => linhaTip(t.cor, t.tipo, b[t.tipo])).join('')
      + (b.outros ? linhaTip('var(--req)', outrosNome, b.outros) : ''));
    svg += `<rect class="hit" data-tip="${tip}" x="${pad.l + bw * i}" y="${pad.t}" width="${bw}" height="${ih}"/>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${nomeItem} por ${unidade}, empilhadas por tipo">${svg}</svg>`;
  return unidade;
}

/* ---------- barras horizontais (uma série) ---------- */
function renderBarrasH(id, pares, rotulo, cor = 'var(--serie)') {
  const el = document.getElementById(id);
  if (!pares.length) { el.innerHTML = vazioChart; return; }
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
function contar(L, f) { const c = {}; for (const r of L) for (const k of [].concat(f(r) || [])) if (k) c[k] = (c[k] || 0) + 1; return c; }

/* ---------- dia da semana (colunas, uma série) ---------- */
function renderSemana(L, id, rotulo) {
  const el = document.getElementById(id);
  const nomes = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'], cont = [0, 0, 0, 0, 0, 0, 0];
  for (const r of L) if (!cancelada(r)) cont[(r.dt.getDay() + 6) % 7]++;
  const total = cont.reduce((a, b) => a + b, 0);
  if (!total) { el.innerHTML = vazioChart; return; }
  const W = 420, H = 250, pad = { l: 10, r: 10, t: 22, b: 26 }, iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const max = Math.max(...cont), bw = iw / 7, larg = bw * .56;
  let svg = `<line class="eixo" x1="${pad.l}" x2="${W - pad.r}" y1="${pad.t + ih}" y2="${pad.t + ih}"/>`;
  cont.forEach((v, i) => {
    const h = Math.max(v ? 3 : 0, v / max * ih), x = pad.l + bw * i + (bw - larg) / 2, y = pad.t + ih - h, r = Math.min(4, h);
    svg += `<path class="barra-anim" style="animation-delay:${i * 50}ms" fill="${i === cont.indexOf(max) ? 'var(--a2)' : 'var(--serie)'}" d="M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + larg - r} Q${x + larg},${y} ${x + larg},${y + r} V${y + h} Z"/>
      <text class="val" x="${x + larg / 2}" y="${y - 7}" text-anchor="middle">${v}</text>
      <text x="${x + larg / 2}" y="${H - 8}" text-anchor="middle">${nomes[i]}</text>
      <rect class="hit" data-tip="${tipId(`<div class="tt">${nomes[i]}</div>` + linhaTip('', rotulo, v) + linhaTip('', 'Participação', pct(v, total) + '%'))}" x="${pad.l + bw * i}" y="${pad.t}" width="${bw}" height="${ih}"/>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(rotulo)} por dia da semana">${svg}</svg>`;
}

/* ---------- mix de tipo por categoria (100% empilhado) ---------- */
function renderCategorias(L) {
  const el = document.getElementById('chCat');
  document.getElementById('legCat').innerHTML = legendaTipos();
  const cats = {};
  for (const r of L) {
    if (cancelada(r) || !r.categoria) continue;
    const c = cats[r.categoria] ??= { Normal: 0, 'Padrão': 0, Emergencial: 0, total: 0 };
    if (c[r.tipo] != null) { c[r.tipo]++; c.total++; }
  }
  const lista = Object.entries(cats).filter(([, c]) => c.total).sort((a, b) => b[1].total - a[1].total).slice(0, 8);
  if (!lista.length) { el.innerHTML = vazioChart; return; }
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
      <rect class="hit" data-tip="${tipId(`<div class="tt">${esc(nome)}</div>` + TIPOS_LEITURA.map(t => linhaTip(t.cor, t.tipo, `${c[t.tipo]} (${pct(c[t.tipo], c.total)}%)`)).join(''))}" x="0" y="${yy - 7}" width="${W}" height="${linha}"/>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mix de tipo de mudança por categoria">${svg}</svg>`;
}

/* ---------- feed (GLPI) ---------- */
function renderFeed(L) {
  const cor = { 'Padrão': 'var(--padrao)', Normal: 'var(--normal)', Emergencial: 'var(--emerg)' };
  const ult = [...L].sort((a, b) => b.dt - a.dt).slice(0, 12);
  document.getElementById('feed').innerHTML = ult.length ? ult.map((r, i) => `<li style="animation-delay:${i * 40}ms">
      <span class="ponto" style="background:${cor[r.tipo] || 'var(--req)'}"></span>
      <span class="t">${esc(r.titulo.replace(/^\s*\[(rdm|rmd|gmud)\]\s*-?\s*/i, ''))}</span>
      <span class="m"><span class="pill ${classeTipo(r.tipo)}">${esc(r.tipo || '—')}</span>${esc(r.id)} · ${r.dt.toLocaleDateString('pt-BR')} · ${esc(r.status)}</span></li>`).join('')
    : '<li><span></span><span class="dica">Sem RDMs no período.</span></li>';
}

/* ---------- tabela de atendimentos ---------- */
function renderTabelaAt(L) {
  const q = norm(document.getElementById('atBusca').value);
  const lista = [...L].filter(r => !q || norm([r.id, r.titulo, r.analista, r.destino, r.tipo, r.app].join(' ')).includes(q)).sort((a, b) => b.dt - a.dt);
  document.getElementById('atResumo').textContent = `— ${fmt(lista.length)} de ${fmt(L.length)}`;
  const eu = typeof cfg !== 'undefined' ? norm(cfg.meuNome) : '';
  document.getElementById('tabAt').innerHTML = `<tr><th>Data</th><th>ID</th><th>Título</th><th>Tipo</th><th>Encaminhado para</th><th>Analista</th><th></th></tr>` +
    (lista.length ? lista.slice(0, 500).map(r => `<tr>
      <td>${r.dt.toLocaleDateString('pt-BR')}<div class="grupos">${r.dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div></td>
      <td>${esc(r.id)}</td>
      <td>${esc(r.titulo)}<div class="grupos">${esc(r.categoria || '')}</div></td>
      <td><span class="pill ${classeTipo(r.tipo)}">${esc(r.tipo)}</span>${r.corrigido ? `<div class="grupos">corrigido (assistente: ${esc(r.tipoMotor)})</div>` : ''}</td>
      <td class="grupos">${esc(r.destino || '—')}</td>
      <td class="grupos">${esc(r.analista)}</td>
      <td>${norm(r.analista) === eu ? `<button class="link" data-at-remover="${esc(r.id)}" title="Remover este atendimento">remover</button>` : ''}</td></tr>`).join('')
      : `<tr><td colspan="7" class="dica">Nenhum atendimento ${q ? 'com esse filtro' : 'no período'}.</td></tr>`);
}

/* ---------- filtro e resumo por analista ---------- */
DASH.analista = '';   // '' = equipe toda; senão, nome normalizado
const nomeAnalista = (L, chave) => (L.find(r => norm(r.analista) === chave) || {}).analista || chave;
const filtrarAnalista = L => (DASH.analista ? L.filter(r => norm(r.analista) === DASH.analista) : L);
function atendFiltrados() { return filtrarAnalista(noIntervalo(dadosAtend(), intervaloAtual())); }

function preencherAnalistas(Lequipe) {
  const sel = document.getElementById('atAnalista');
  const eu = typeof cfg !== 'undefined' ? norm(cfg.meuNome) : '';
  const nomes = [...new Map(Lequipe.map(r => [norm(r.analista), r.analista])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  if (DASH.analista && !nomes.some(([k]) => k === DASH.analista)) DASH.analista = '';   // analista sem registros no período
  sel.innerHTML = `<option value="">Equipe toda (${nomes.length})</option>` +
    (eu && nomes.some(([k]) => k === eu) ? `<option value="${esc(eu)}">Só eu</option>` : '') +
    nomes.filter(([k]) => k !== eu).map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join('');
  sel.value = DASH.analista;
  document.getElementById('atAnalistaInfo').textContent = DASH.analista ? 'KPIs, gráficos e tabela mostram só este analista. O resumo abaixo continua com a equipe toda.' : '';
}

function resumoPorAnalista(Lequipe) {
  const m = new Map();
  for (const r of Lequipe) {
    const k = norm(r.analista);
    const s = m.get(k) || { analista: r.analista, total: 0, 'Padrão': 0, Normal: 0, Emergencial: 0, 'Requisição': 0, corrigidas: 0, dias: new Set() };
    s.total++; if (s[r.tipo] != null) s[r.tipo]++; if (r.corrigido) s.corrigidas++; s.dias.add(isoDia(r.dt));
    m.set(k, s);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

function renderResumoAnalistas(Lequipe) {
  const linhas = resumoPorAnalista(Lequipe);
  const tot = linhas.reduce((a, s) => { for (const k of ['total', 'Padrão', 'Normal', 'Emergencial', 'Requisição', 'corrigidas']) a[k] += s[k]; return a; },
    { total: 0, 'Padrão': 0, Normal: 0, Emergencial: 0, 'Requisição': 0, corrigidas: 0 });
  const max = Math.max(1, ...linhas.map(s => s.total));
  const celulaTipo = (s, t, cls) => `<td class="num-cel"><span class="pill ${cls}">${s[t]}</span></td>`;
  const acerto = s => (s.total ? pct(s.total - s.corrigidas, s.total) + '%' : '—');
  document.getElementById('tabAtResumo').innerHTML =
    `<tr><th>Analista</th><th>Atendimentos</th><th>Padrão</th><th>Normal</th><th>Emergencial</th><th>Devolvidas</th><th>Dias com registro</th><th>Média/dia</th><th>Acerto do assistente</th></tr>` +
    linhas.map(s => `<tr class="${norm(s.analista) === DASH.analista ? 'sel' : ''}" data-analista="${esc(norm(s.analista))}" title="Clique para filtrar por este analista">
      <td><b>${esc(s.analista)}</b></td>
      <td><div class="mini-barra"><span style="width:${(s.total / max * 100).toFixed(1)}%"></span></div><b>${s.total}</b> <span class="dica">(${pct(s.total, tot.total)}%)</span></td>
      ${celulaTipo(s, 'Padrão', 'padrao')}${celulaTipo(s, 'Normal', 'normal')}${celulaTipo(s, 'Emergencial', 'emergencial')}${celulaTipo(s, 'Requisição', 'requisicao')}
      <td class="num-cel">${s.dias.size}</td><td class="num-cel">${(s.total / s.dias.size).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td><td class="num-cel">${acerto(s)}</td></tr>`).join('') +
    (linhas.length > 1 ? `<tr class="total"><td><b>Equipe</b></td><td><b>${tot.total}</b></td><td class="num-cel">${tot['Padrão']}</td><td class="num-cel">${tot.Normal}</td><td class="num-cel">${tot.Emergencial}</td><td class="num-cel">${tot['Requisição']}</td><td></td><td></td><td class="num-cel">${acerto(tot)}</td></tr>` : '');
}

/* ---------- principal ---------- */
function renderDashboard() {
  if (!document.getElementById('kpis')) return;
  DASH.tips = [];
  const v = DASH.visao;
  document.querySelectorAll('[data-visao]').forEach(b => b.classList.toggle('sel', b.dataset.visao === v));
  document.getElementById('visao-glpi').hidden = v !== 'glpi';
  document.getElementById('visao-atend').hidden = v !== 'atend';
  document.getElementById('contAt').textContent = fmt(Atendimentos.lista.length);
  sincronizarControlesPeriodo();
  const iv = intervaloAtual(), periodoTxt = descreverIntervalo(iv);

  if (v === 'glpi') {
    document.getElementById('dashTitulo').innerHTML = 'Painel de <span class="grad">Mudanças</span>';
    const temDados = Historico.dados.length > 0;
    const cfgOk = typeof cfg !== 'undefined' && cfg.meuNome && !cfg.meuNome.startsWith('(');
    document.getElementById('dashVazio').hidden = temDados;
    document.getElementById('bvPasso1').classList.toggle('feito', temDados);
    document.getElementById('bvPasso2').classList.toggle('feito', cfgOk);
    document.getElementById('kpis').hidden = !temDados;
    document.querySelector('#visao-glpi .dash-grade').hidden = !temDados;
    const L = noIntervalo(dadosGLPI(), iv);
    const base = Historico.base;
    document.getElementById('dashSub').textContent = temDados
      ? `${fmt(L.length)} RDMs em ${periodoTxt} · base de ${fmt(Historico.dados.length)} mudanças do GLPI${base ? ' · atualizada em ' + new Date(base.geradoEm).toLocaleDateString('pt-BR') : ''}`
      : 'Sem histórico — importe o CSV na aba Histórico.';
    // base sem nenhuma RDM em andamento = exportação filtrada só com encerradas → números menores que o GLPI
    const emAberto = Historico.dados.filter(r => r.status && !/fechad|cancel|recus|aplicad|encerrad|resolvid/i.test(r.status)).length;
    const alerta = document.getElementById('alertaBase');
    alerta.hidden = !temDados || emAberto > 0;
    alerta.innerHTML = `⚠️ <b>A base não tem nenhuma RDM em andamento</b> (só Fechado/Cancelado). As Pendentes/abertas não estão sendo contadas — os números do mês ficam <b>menores que no GLPI</b>. Exporte do GLPI com <b>Status = Todos</b> e <b>“Todas as páginas”</b> e importe na aba Histórico.`;
    if (!temDados) return;
    kpisGLPI(L);
    renderEmpilhado(L, iv, 'chMes', 'legMes', { id: 'tituloMes', prefixo: 'RDMs por' }, 'RDMs');
    renderFeed(L);
    const valid = L.filter(r => !cancelada(r));
    renderBarrasH('chApps', topN(contar(valid, r => r.app), 8), 'RDMs');
    renderBarrasH('chTorres', topN(contar(valid, r => r.obs.map(curtoGrupo)), 8), 'RDMs como observador');
    renderSemana(L, 'chStatus', 'RDMs abertas');
    renderCategorias(L);
  } else {
    document.getElementById('dashTitulo').innerHTML = 'Meus <span class="grad">Atendimentos</span>';
    const Lequipe = noIntervalo(dadosAtend(), iv);
    preencherAnalistas(Lequipe);
    const L = filtrarAnalista(Lequipe);
    const analistas = new Set(Lequipe.map(r => norm(r.analista))).size;
    const quem = DASH.analista ? ` de ${nomeAnalista(Lequipe, DASH.analista)}` : '';
    document.getElementById('dashSub').textContent = `${fmt(L.length)} atendimento${L.length === 1 ? '' : 's'}${quem} em ${periodoTxt}${!DASH.analista && analistas > 1 ? ` · ${analistas} analistas` : ''} · ${fmt(Atendimentos.lista.length)} registrados no total`;
    const vazio = Lequipe.length === 0;
    document.getElementById('atVazio').hidden = !vazio;
    document.getElementById('barraAnalista').hidden = vazio;
    document.getElementById('kpisAt').hidden = vazio;
    document.getElementById('gradeAt').hidden = vazio;
    if (vazio) return;
    renderResumoAnalistas(Lequipe);
    kpisAtend(L);
    renderEmpilhado(L, iv, 'chAt', 'legAt', { id: 'tituloAtMes', prefixo: 'Atendimentos por' }, 'atendimentos', 'Devolvidas (requisição)');
    renderBarrasH('chAtDest', topN(contar(L, r => curtoGrupo(r.destino)), 8), 'atendimentos', 'var(--a2)');
    renderBarrasH('chAtApps', topN(contar(L, r => r.app), 8), 'atendimentos');
    renderBarrasH('chAtAnalista', topN(contar(L, r => r.analista), 8), 'atendimentos', 'var(--a3)');
    renderSemana(L, 'chAtSemana', 'atendimentos');
    renderTabelaAt(L);
  }
}

/* ---------- eventos ---------- */
document.getElementById('incluirCanc').addEventListener('change', e => { DASH.incluirCanc = e.target.checked; renderDashboard(); });
document.querySelectorAll('[data-visao]').forEach(b => b.addEventListener('click', () => { DASH.visao = b.dataset.visao; renderDashboard(); }));
document.querySelectorAll('[data-periodo]').forEach(b => b.addEventListener('click', () => {
  DASH.filtro[DASH.visao] = { preset: b.dataset.periodo };
  renderDashboard();
}));
['dtDe', 'dtAte'].forEach(id => document.getElementById(id).addEventListener('change', () => {
  DASH.filtro[DASH.visao] = { preset: 'custom', de: document.getElementById('dtDe').value, ate: document.getElementById('dtAte').value };
  renderDashboard();
}));
document.querySelectorAll('.aba').forEach(b => b.addEventListener('click', () => { if (b.dataset.aba === 'dashboard') renderDashboard(); }));

document.getElementById('atBusca').addEventListener('input', () => { DASH.tips = []; renderTabelaAt(atendFiltrados()); });
document.getElementById('btnAtIrAnalisar').addEventListener('click', () => document.querySelector('.aba[data-aba="analisar"]').click());
document.getElementById('btnAtExportar').addEventListener('click', () => {
  const iv = intervaloAtual();
  const L = atendFiltrados();   // respeita o filtro de analista ("Só eu" = exporta só os seus)
  const sufixo = iv.de ? isoDia(iv.de) + (iv.ate ? '_a_' + isoDia(iv.ate) : '') : 'tudo';
  const quem = DASH.analista ? '_' + DASH.analista.replace(/[^a-z0-9]+/g, '-') : '_equipe';
  baixarArquivo(`atendimentos${quem}_${sufixo}.csv`, Atendimentos.paraCSV(L));
});
document.querySelectorAll('.inAtCSV').forEach(inp => inp.addEventListener('change', async e => {
  const msgs = [];
  for (const f of [...e.target.files]) {
    try { const r = Atendimentos.importarCSV(decodificar(await f.arrayBuffer())); msgs.push(`${f.name}: ${r.add} novos, ${r.upd} atualizados`); }
    catch (err) { msgs.push(`${f.name}: ${err.message}`); }
  }
  e.target.value = '';
  toast(msgs.join(' · '));
  renderDashboard();
}));
document.getElementById('atAnalista').addEventListener('change', e => { DASH.analista = e.target.value; renderDashboard(); });
document.getElementById('tabAtResumo').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-analista]'); if (!tr) return;
  DASH.analista = DASH.analista === tr.dataset.analista ? '' : tr.dataset.analista;   // clicar de novo volta para a equipe
  renderDashboard();
});
document.getElementById('btnAtResumoCSV').addEventListener('click', () => {
  const iv = intervaloAtual(), linhas = resumoPorAnalista(noIntervalo(dadosAtend(), iv));
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  const csv = [['Analista', 'Atendimentos', 'Padrão', 'Normal', 'Emergencial', 'Devolvidas (requisição)', 'Corrigidas manualmente', 'Dias com registro', 'Média por dia', 'Período'].map(q).join(';')]
    .concat(linhas.map(s => [s.analista, s.total, s['Padrão'], s.Normal, s.Emergencial, s['Requisição'], s.corrigidas, s.dias.size,
      (s.total / s.dias.size).toLocaleString('pt-BR', { maximumFractionDigits: 1 }), descreverIntervalo(iv)].map(q).join(';'))).join('\r\n');
  baixarArquivo(`resumo_analistas_${iv.de ? isoDia(iv.de) : 'tudo'}.csv`, '﻿' + csv);
});
document.getElementById('tabAt').addEventListener('click', e => {
  const b = e.target.closest('[data-at-remover]');
  if (!b || !confirm(`Remover o atendimento da RDM ${b.dataset.atRemover}?`)) return;
  Atendimentos.remover(b.dataset.atRemover, cfg.meuNome);
  renderDashboard();
});

/* botões da boas-vindas */
document.getElementById('btnBvCSV').addEventListener('click', () => document.getElementById('inCSV').click());
document.getElementById('btnBvCfg').addEventListener('click', () => document.querySelector('.aba[data-aba="config"]').click());

if (location.hash === '#atendimentos') DASH.visao = 'atend';   // link direto: index.html#atendimentos
renderDashboard();
