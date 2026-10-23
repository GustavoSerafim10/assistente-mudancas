/* =========================================================================
   Histórico de mudanças — lê o CSV exportado do GLPI (separador ";")
   e calcula estatísticas de mudanças parecidas (mesmo sistema/categoria).
   ========================================================================= */
'use strict';

function parseCSV(text, sep = ';') {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

/* Tenta UTF-8; se o arquivo vier em Windows-1252 (comum em exportações), usa esse */
function decodificar(buffer) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { return new TextDecoder('windows-1252').decode(buffer); }
}

function normTipo(t) {
  const n = norm(t);
  if (!n) return '';
  if (n.startsWith('padr')) return 'Padrão';
  if (n.startsWith('normal')) return 'Normal';
  if (n.startsWith('emergen')) return 'Emergencial';
  if (n.startsWith('requisi')) return 'Requisição';
  if (n.startsWith('incid')) return 'Incidente';
  return 'Outro';
}

const splitBr = s => String(s || '').split(/<br\s*\/?>|<hr\s*\/?>/i).map(x => x.trim()).filter(Boolean);

function csvParaRegistros(text) {
  const rows = parseCSV(text.replace(/^﻿/, ''));
  if (rows.length < 2) throw new Error('CSV vazio ou sem cabeçalho.');
  const head = rows[0].map(h => norm(h));
  const col = (...keys) => head.findIndex(h => keys.some(k => h.includes(k)));
  const ix = {
    id: col('id'), titulo: col('titulo'), status: col('status'), atualizacao: col('ultima atualizacao'),
    abertura: col('data de abertura'), categoria: col('categoria'), atribuido: col('atribuido'),
    tarefas: col('numero de tarefas'), tipo: col('tipo da mudanca', 'tipomudanca'), obs: col('grupo observador', 'observador'), origem: col('origem (assistente)'),
  };
  // "categoria" também casa com "Tarefas - Categoria": força a primeira coluna exata
  ix.categoria = head.findIndex(h => h === 'categoria');
  if (ix.id < 0 || ix.titulo < 0) throw new Error('Não encontrei as colunas "ID" e "Título". É a exportação de Mudanças do GLPI?');

  const g = (r, i) => (i >= 0 && r[i] != null ? r[i].trim() : '');
  return rows.slice(1).map(r => {
    const titulo = g(r, ix.titulo);
    return {
      id: g(r, ix.id), titulo, status: g(r, ix.status), atualizacao: g(r, ix.atualizacao), abertura: g(r, ix.abertura),
      categoria: g(r, ix.categoria), atribuido: splitBr(g(r, ix.atribuido)), tarefas: +g(r, ix.tarefas) || 0,
      tipo: normTipo(g(r, ix.tipo)), obs: splitBr(g(r, ix.obs)),
      app: appFromTitle(titulo), ambiente: detectarAmbiente(titulo),
      ...(/assistente/i.test(g(r, ix.origem)) ? { origem: 'assistente' } : {}),
    };
  }).filter(r => r.id);
}

/* ---------- exportar no mesmo formato da exportação do GLPI (reimportável) ---------- */
function registrosParaCSV(lista) {
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const cab = ['ID', 'Título', 'Status', 'Última atualização', 'Data de abertura', 'Categoria', 'Atribuído - Grupo técnico',
    'Tarefas - Número de tarefas', 'Plug-ins - TipoMudanca - Tipo da Mudança', 'Observador - Grupo observador', 'Origem (assistente)'];
  const linhas = [cab.map(q).join(';')];
  for (const r of lista) linhas.push([r.id, r.titulo, r.status, r.atualizacao, r.abertura, r.categoria, (r.atribuido || []).join('<br>'),
    r.tarefas, r.tipo, (r.obs || []).join('<br>'), r.origem === 'assistente' ? 'assistente' : ''].map(q).join(';'));
  return '﻿' + linhas.join('\r\n');
}

/* ---------- armazenamento local ---------- */
const HIST_KEY = 'assistMudancas.historico.v1';
const Historico = {
  dados: [],
  /* base embutida (js/historico-base.js, gerada pelo ATUALIZAR-BASE.bat) + importações feitas neste navegador */
  base: (typeof window !== 'undefined' && window.HISTORICO_BASE) || null,
  locais: [],
  dados: [],
  carregar() {
    try { this.locais = JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch { this.locais = []; }
    this.combinar();
    return this.dados;
  },
  combinar() {
    const map = new Map();
    if (!this.baseDesativada()) for (const r of (this.base ? this.base.registros : [])) map.set(r.id, r);
    for (const r of this.locais) map.set(r.id, r);           // importação local é mais recente: prevalece
    this.dados = [...map.values()].sort((a, b) => b.id.localeCompare(a.id));
  },
  salvar() {
    try { localStorage.setItem(HIST_KEY, JSON.stringify(this.locais)); return true; } catch { return false; }
  },
  mesclar(novos) {
    const ids = new Set(this.dados.map(r => r.id));
    const map = new Map(this.locais.map(r => [r.id, r]));
    let add = 0, upd = 0;
    for (const r of novos) { ids.has(r.id) ? upd++ : add++; map.set(r.id, r); }
    this.locais = [...map.values()];
    this.combinar();
    return { add, upd, total: this.dados.length, salvo: this.salvar() };
  },
  /* RDM analisada no Assistente: entra (ou é atualizada) nas importações locais.
     Um CSV do GLPI importado depois com o mesmo ID substitui este registro. */
  registrarAnalise(reg) {
    const i = this.locais.findIndex(r => r.id === reg.id);
    if (i >= 0) this.locais[i] = reg; else this.locais.push(reg);
    this.combinar();
    return this.salvar();
  },
  removerAnalise(id) {
    this.locais = this.locais.filter(r => !(r.id === id && r.origem === 'assistente'));
    this.combinar();
    return this.salvar();
  },
  limpar() { this.locais = []; try { localStorage.removeItem(HIST_KEY); } catch { } this.combinar(); },
  /* "Apagar tudo": tira as importações E desliga a base embutida (o arquivo não pode ser apagado pelo navegador,
     então fica guardado um aviso "não usar a base" neste navegador). Dá para desfazer com restaurarBase(). */
  baseDesativada() { try { return localStorage.getItem(HIST_KEY + '.semBase') === '1'; } catch { return false; } },
  apagarTudo() {
    this.locais = [];
    try { localStorage.removeItem(HIST_KEY); localStorage.setItem(HIST_KEY + '.semBase', '1'); } catch { }
    this.combinar();
  },
  restaurarBase() { try { localStorage.removeItem(HIST_KEY + '.semBase'); } catch { } this.combinar(); },
};

/* ---------- títulos parecidos (para casos sem regra) ---------- */
const STOP_TITULO = new Set(('rdm gmud rmd exec de da do das dos e em a o as os para com no na nos nas por um uma producao homologacao ' +
  'acre alagoas amapa amazonas bahia ceara distrito federal espirito santo goias maranhao mato grosso sul minas gerais para paraiba ' +
  'parana pernambuco piaui rio janeiro norte rondonia roraima santa catarina sao paulo sergipe tocantins uniprf').split(' '));
function tokensTitulo(t) {
  return new Set(norm(t).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !/[0-9]/.test(w) && !STOP_TITULO.has(w)));
}
function titulosParecidos(titulo, ignorarId) {
  const A = tokensTitulo(titulo);
  if (A.size < 2) return [];
  const out = [];
  for (const r of Historico.dados) {
    if (r.id === ignorarId) continue;
    const B = tokensTitulo(r.titulo);
    if (B.size < 2) continue;
    let inter = 0; for (const w of A) if (B.has(w)) inter++;
    const score = inter / Math.min(A.size, B.size);
    if (inter >= 2 && score >= 0.75) out.push({ r, score });
  }
  return out.sort((a, b) => b.score - a.score || b.r.id.localeCompare(a.r.id)).map(x => x.r);
}

/* ---------- semelhantes ---------- */
const ENCERRADOS_INVALIDOS = ['cancelado', 'recusado'];

function estatisticas(lista) {
  const validos = lista.filter(r => !ENCERRADOS_INVALIDOS.includes(norm(r.status)));
  const porTipo = {};
  for (const r of validos) if (r.tipo) porTipo[r.tipo] = (porTipo[r.tipo] || 0) + 1;
  const totalTipado = Object.values(porTipo).reduce((a, b) => a + b, 0);
  const dominante = Object.entries(porTipo).sort((a, b) => b[1] - a[1])[0] || null;
  const grupos = {};
  for (const r of validos) for (const g of r.obs) grupos[g] = (grupos[g] || 0) + 1;
  return {
    total: lista.length, validos: validos.length, cancelados: lista.length - validos.length,
    porTipo, totalTipado, dominante: dominante ? { tipo: dominante[0], n: dominante[1], pct: dominante[1] / totalTipado } : null,
    grupos: Object.entries(grupos).sort((a, b) => b[1] - a[1]),
  };
}

function buscarSemelhantes(d) {
  const H = Historico.dados.filter(r => r.id !== d.info.numero);   // não comparar a RDM com ela mesma
  if (!H.length) return null;
  const app = d.info.app;
  const cat = d.categoria && !d.categoria.startsWith('—') ? d.categoria : '';
  const mesmoApp = app ? H.filter(r => r.app === app) : [];
  const mesmoAppCat = cat ? mesmoApp.filter(r => r.categoria === cat) : [];
  const mesmaCat = cat ? H.filter(r => r.categoria === cat) : [];
  const parecidosBase = !cat ? titulosParecidos(d.info.titulo, d.info.numero) : [];
  const base = mesmoAppCat.length >= 3 ? mesmoAppCat : mesmoApp.length >= 3 ? mesmoApp : mesmaCat.length ? mesmaCat : parecidosBase;
  const escopo = base === mesmoAppCat ? `${app} + mesma categoria` : base === mesmoApp ? `sistema ${app}` : base === mesmaCat ? 'mesma categoria (todos os sistemas)' : 'títulos parecidos';
  const st = estatisticas(base);
  // grupos observadores usados em mudanças NORMAIS dessa categoria (ajuda a escolher torres do PLAN)
  const normaisCat = mesmaCat.filter(r => r.tipo === 'Normal');
  // mesmo host/IP citado no título de RDMs anteriores (mostra quem foi envolvido da outra vez)
  const hosts = d.hosts || [];
  const mesmoHost = hosts.length ? H.filter(r => hosts.some(h => norm(r.titulo).includes(h))).slice(0, 10) : [];
  // títulos parecidos: usados para sugerir categoria/torres quando o motor não reconheceu o cenário
  const parecidos = titulosParecidos(d.info.titulo, d.info.numero).filter(r => !ENCERRADOS_INVALIDOS.includes(norm(r.status)));
  let sugestaoCat = null;
  if (parecidos.length >= 3) {
    const cont = {};
    for (const r of parecidos) if (r.categoria) cont[r.categoria] = (cont[r.categoria] || 0) + 1;
    const top = Object.entries(cont).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] / parecidos.length >= 0.6) sugestaoCat = { categoria: top[0], n: top[1], de: parecidos.length };
  }
  const gruposParecidos = {};
  for (const r of parecidos) for (const g of new Set([...r.obs, ...r.atribuido])) if (!/apoio governanca/i.test(g)) gruposParecidos[g] = (gruposParecidos[g] || 0) + 1;
  return { app, escopo, mesmoHost, hosts, parecidos, sugestaoCat, stParecidos: estatisticas(parecidos),
    gruposParecidos: Object.entries(gruposParecidos).sort((a, b) => b[1] - a[1]), base, st, recentes: (mesmoApp.length ? mesmoApp : base).slice(0, 10), gruposNormais: estatisticas(normaisCat).grupos.slice(0, 8), nNormaisCat: normaisCat.length };
}

if (typeof module !== 'undefined') module.exports = { parseCSV, csvParaRegistros, estatisticas };
