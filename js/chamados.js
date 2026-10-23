/* =========================================================================
   Aba Chamados — controle por STATUS × TIPO de todas as RDMs do histórico
   (sem excluir nada: cada RDM entra uma vez, e os totais fecham com o GLPI)
   ========================================================================= */
'use strict';

const CH = { grupo: 'andamento', preset: '0', de: '', ate: '', celula: null };   // celula = {status, tipo} clicada na matriz
const CH_TIPOS = ['Padrão', 'Normal', 'Emergencial', 'Requisição', 'Outros', '(sem tipo)'];

/* Agrupamento dos status do GLPI */
function grupoStatus(st) {
  const n = norm(st);
  if (/cancel|recus/.test(n)) return 'cancelados';
  if (/fechad|aplicad|encerrad|resolvid|solucionad|conclu/.test(n)) return 'fechados';
  return 'andamento';   // Pendente, Novo, Em avaliação, Em aprovação, Aceito, Em teste, Planejado…
}
const NOME_GRUPO = { andamento: 'Em andamento', fechados: 'Fechados', cancelados: 'Cancelados/Recusados', todos: 'Todas' };
/* Tipo exatamente como veio, só agrupando o que não é um dos 4 tipos de mudança (Incidente, "Cancelado" escrito no campo tipo…) */
const tipoCh = r => (!r.tipo ? '(sem tipo)' : ['Padrão', 'Normal', 'Emergencial', 'Requisição'].includes(r.tipo) ? r.tipo : 'Outros');

function intervaloCh() {
  if (CH.preset !== 'custom') return intervaloDoPreset(CH.preset);
  return { de: CH.de ? new Date(CH.de + 'T00:00:00') : null, ate: CH.ate ? new Date(CH.ate + 'T23:59:59') : null };
}

function dadosCh() {
  const iv = intervaloCh(), agora = new Date();
  return Historico.dados.map(r => {
    const dt = dataBR(r.abertura), up = dataBR(r.atualizacao), g = grupoStatus(r.status);
    const dias = dt ? Math.max(0, Math.floor(((g === 'andamento' ? agora : (up || agora)) - dt) / 864e5)) : null;
    return { ...r, dt, up, grupo: g, tipoC: tipoCh(r), dias };
  }).filter(r => !iv.de && !iv.ate ? true : r.dt && (!iv.de || r.dt >= iv.de) && (!iv.ate || r.dt <= iv.ate));
}

function renderChamados() {
  if (!document.getElementById('chKpis')) return;
  const L = dadosCh(), iv = intervaloCh();
  // controles
  document.querySelectorAll('[data-chper]').forEach(b => b.classList.toggle('sel', b.dataset.chper === CH.preset));
  document.getElementById('chDe').value = iv.de ? isoDia(iv.de) : '';
  document.getElementById('chAte').value = iv.ate ? isoDia(iv.ate) : '';
  document.querySelectorAll('[data-grupo]').forEach(b => b.classList.toggle('sel', b.dataset.grupo === CH.grupo));
  const porG = g => L.filter(r => r.grupo === g);
  document.getElementById('cntAnd').textContent = fmt(porG('andamento').length);
  document.getElementById('cntFec').textContent = fmt(porG('fechados').length);
  document.getElementById('cntCan').textContent = fmt(porG('cancelados').length);
  document.getElementById('cntTod').textContent = fmt(L.length);
  const periodo = CH.preset === '0' ? 'todo o período' : descreverPeriodoCh(iv);
  document.getElementById('chSub').textContent = Historico.dados.length
    ? `${fmt(L.length)} RDMs abertas em ${periodo} · base com ${fmt(Historico.dados.length)} RDMs`
    : 'Sem histórico — importe o CSV do GLPI na aba Histórico.';

  // alerta de base incompleta (mesma regra da importação)
  const alerta = document.getElementById('chAlerta');
  const semAberto = Historico.dados.length && !Historico.dados.some(r => grupoStatus(r.status) === 'andamento');
  alerta.hidden = !semAberto;
  alerta.innerHTML = '⚠️ <b>Nenhuma RDM em andamento na base</b> — a exportação do GLPI provavelmente estava filtrada só com encerradas. Exporte com <b>Status = Todos</b> e <b>“Todas as páginas”</b>.';

  // KPIs
  const semTipo = L.filter(r => r.tipoC === '(sem tipo)').length;
  desenharKpis('chKpis', [
    { rot: 'Total no período', num: L.length, det: `todas as RDMs, qualquer status`, kc: 'var(--grad)' },
    { rot: 'Em andamento', num: porG('andamento').length, det: resumoTipos(porG('andamento')), kc: 'var(--a1)' },
    { rot: 'Fechados', num: porG('fechados').length, det: resumoTipos(porG('fechados')), kc: 'var(--padrao)' },
    { rot: 'Cancelados/Recusados', num: porG('cancelados').length, det: resumoTipos(porG('cancelados')), kc: 'var(--req)' },
    { rot: 'Sem tipo preenchido', num: semTipo, det: semTipo ? 'campo "Tipo da Mudança" vazio no GLPI' : 'todas com tipo ✓', kc: semTipo ? 'var(--normal)' : 'var(--padrao)' },
  ]);

  renderMatriz(L);
  renderListaCh(L);
}

function resumoTipos(G) {
  const c = t => G.filter(r => r.tipo === t).length;
  return `Padrão ${c('Padrão')} · Normal ${c('Normal')} · Emerg. ${c('Emergencial')}`;
}
function descreverPeriodoCh(iv) {
  const h = new Date();
  if (CH.preset === 'mes') return `${MESES_LONGO[h.getMonth()]} de ${h.getFullYear()}`;
  if (CH.preset === 'mesant') { const d = new Date(h.getFullYear(), h.getMonth() - 1, 1); return `${MESES_LONGO[d.getMonth()]} de ${d.getFullYear()}`; }
  return `${iv.de ? iv.de.toLocaleDateString('pt-BR') : 'início'} a ${iv.ate ? iv.ate.toLocaleDateString('pt-BR') : 'hoje'}`;
}

/* ---------- matriz Status × Tipo ---------- */
function matrizDados(L) {
  const status = [...new Set(L.map(r => r.status || '(sem status)'))]
    .sort((a, b) => ['andamento', 'fechados', 'cancelados'].indexOf(grupoStatus(a)) - ['andamento', 'fechados', 'cancelados'].indexOf(grupoStatus(b)) || a.localeCompare(b));
  const cel = (st, t) => L.filter(r => (r.status || '(sem status)') === st && (!t || r.tipoC === t)).length;
  return { status, cel };
}

function renderMatriz(L) {
  const { status, cel } = matrizDados(L);
  const tipos = CH_TIPOS.filter(t => L.some(r => r.tipoC === t) || ['Padrão', 'Normal', 'Emergencial'].includes(t));
  const pill = { 'Padrão': 'padrao', Normal: 'normal', Emergencial: 'emergencial', 'Requisição': 'requisicao' };
  const num = (n, st, t) => n ? `<button class="link celula${CH.celula && CH.celula.status === st && CH.celula.tipo === t ? ' sel' : ''}" data-st="${esc(st)}" data-tp="${esc(t)}">${fmt(n)}</button>` : '<span class="zero">0</span>';
  const totalTipo = t => L.filter(r => r.tipoC === t).length;
  document.getElementById('chMatriz').innerHTML =
    `<tr><th>Status</th><th>Grupo</th>${tipos.map(t => `<th>${pill[t] ? `<span class="pill ${pill[t]}">${t}</span>` : esc(t)}</th>`).join('')}<th>Total</th></tr>` +
    status.map(st => `<tr><td><b>${esc(st)}</b></td><td class="grupos">${NOME_GRUPO[grupoStatus(st)]}</td>
      ${tipos.map(t => `<td class="num-cel">${num(cel(st, t), st, t)}</td>`).join('')}
      <td class="num-cel"><b>${num(cel(st), st, '')}</b></td></tr>`).join('') +
    `<tr class="total"><td><b>Total</b></td><td></td>${tipos.map(t => `<td class="num-cel"><b>${num(totalTipo(t), '', t)}</b></td>`).join('')}<td class="num-cel"><b>${fmt(L.length)}</b></td></tr>`;
}

/* ---------- lista ---------- */
function listaCh(L) {
  const q = norm(document.getElementById('chBusca').value), tp = document.getElementById('chTipo').value;
  let lista = L;
  if (CH.celula) lista = lista.filter(r => (!CH.celula.status || (r.status || '(sem status)') === CH.celula.status) && (!CH.celula.tipo || r.tipoC === CH.celula.tipo));
  else if (CH.grupo !== 'todos') lista = lista.filter(r => r.grupo === CH.grupo);
  if (tp) lista = lista.filter(r => r.tipoC === tp);
  if (q) lista = lista.filter(r => norm([r.id, r.titulo, r.categoria, r.app, r.status].join(' ')).includes(q));
  // em andamento: as mais antigas primeiro (as que estão paradas há mais tempo); demais: mais recentes primeiro
  return [...lista].sort((a, b) => (CH.grupo === 'andamento' && !CH.celula ? (b.dias || 0) - (a.dias || 0) : (b.dt || 0) - (a.dt || 0)));
}

function renderListaCh(L) {
  const lista = listaCh(L);
  const titulo = CH.celula
    ? `RDMs ${CH.celula.status ? `com status “${esc(CH.celula.status)}”` : ''}${CH.celula.status && CH.celula.tipo ? ' e ' : ''}${CH.celula.tipo ? `do tipo ${esc(CH.celula.tipo)}` : ''} <button class="link" id="chLimparCelula">✕ limpar</button>`
    : `${NOME_GRUPO[CH.grupo]}${CH.grupo === 'andamento' ? ' <span class="dica">— mais antigas primeiro</span>' : ''}`;
  document.getElementById('chListaTitulo').innerHTML = `${titulo} <span class="dica">· ${fmt(lista.length)}</span>`;
  const lim = document.getElementById('chLimparCelula');
  if (lim) lim.onclick = () => { CH.celula = null; renderChamados(); };
  const rotDias = CH.grupo === 'andamento' && !CH.celula ? 'Dias em aberto' : 'Dias (abertura → atualização)';
  const corDias = (r) => (r.grupo === 'andamento' && r.dias >= 60 ? 'emerg' : r.grupo === 'andamento' && r.dias >= 30 ? 'normal' : '');
  document.getElementById('chLista').innerHTML =
    `<tr><th>ID</th><th>Título</th><th>Tipo</th><th>Status</th><th>Abertura</th><th>${rotDias}</th></tr>` +
    (lista.length ? lista.slice(0, 600).map(r => `<tr>
      <td>${esc(r.id)}</td>
      <td>${esc(r.titulo)}<div class="grupos">${esc(r.categoria || '')}</div></td>
      <td><span class="pill ${classeTipo(r.tipo)}">${esc(r.tipo || 'sem tipo')}</span></td>
      <td>${esc(r.status)}</td>
      <td>${r.dt ? r.dt.toLocaleDateString('pt-BR') : '—'}</td>
      <td class="num-cel">${r.dias == null ? '—' : `<span class="dias ${corDias(r)}">${fmt(r.dias)}</span>`}</td></tr>`).join('')
      + (lista.length > 600 ? `<tr><td colspan="6" class="dica">Mostrando 600 de ${fmt(lista.length)} — use os filtros ou exporte a lista.</td></tr>` : '')
      : `<tr><td colspan="6" class="dica">Nenhuma RDM com esses filtros.</td></tr>`);
}

/* ---------- eventos ---------- */
document.querySelectorAll('[data-grupo]').forEach(b => b.addEventListener('click', () => { CH.grupo = b.dataset.grupo; CH.celula = null; renderChamados(); }));
document.querySelectorAll('[data-chper]').forEach(b => b.addEventListener('click', () => { CH.preset = b.dataset.chper; renderChamados(); }));
['chDe', 'chAte'].forEach(id => document.getElementById(id).addEventListener('change', () => {
  CH.preset = 'custom'; CH.de = document.getElementById('chDe').value; CH.ate = document.getElementById('chAte').value; renderChamados();
}));
document.getElementById('chBusca').addEventListener('input', () => renderListaCh(dadosCh()));
document.getElementById('chTipo').addEventListener('change', () => renderListaCh(dadosCh()));
document.getElementById('chMatriz').addEventListener('click', e => {
  const b = e.target.closest('.celula'); if (!b) return;
  CH.celula = { status: b.dataset.st, tipo: b.dataset.tp };
  renderChamados();
  document.getElementById('chLista').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
document.getElementById('btnChMatrizCSV').addEventListener('click', () => {
  const L = dadosCh(), { status, cel } = matrizDados(L);
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  const linhas = [['Status', 'Grupo', ...CH_TIPOS, 'Total'].map(q).join(';')]
    .concat(status.map(st => [st, NOME_GRUPO[grupoStatus(st)], ...CH_TIPOS.map(t => cel(st, t)), cel(st)].map(q).join(';')))
    .concat([['Total', '', ...CH_TIPOS.map(t => L.filter(r => r.tipoC === t).length), L.length].map(q).join(';')]);
  const iv = intervaloCh();
  baixarArquivo(`status_x_tipo_${iv.de ? isoDia(iv.de) : 'tudo'}.csv`, '﻿' + linhas.join('\r\n'));
});
document.getElementById('btnChListaCSV').addEventListener('click', () => {
  const lista = listaCh(dadosCh());
  if (!lista.length) { toast('Nada para exportar'); return; }
  baixarArquivo(`rdms_${CH.celula ? 'selecao' : CH.grupo}_${isoDia(new Date())}.csv`, registrosParaCSV(lista));
});
document.querySelectorAll('.aba').forEach(b => b.addEventListener('click', () => { if (b.dataset.aba === 'chamados') renderChamados(); }));
renderChamados();
