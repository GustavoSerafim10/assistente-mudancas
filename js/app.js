/* =========================================================================
   Interface — liga o motor de regras (core.js) e o histórico (history.js)
   ========================================================================= */
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* ---------- configurações ---------- */
const CFG_KEY = 'assistMudancas.config.v1';
/* nomes ficam fora do repositório: js/config-local.js (só na máquina) ou aba Configurações */
const CFG_PADRAO = {
  meuNome: '(seu nome — preencha em Config)',
  parceiro: '(parceiro atribuído — preencha em Config)',
  grupoGov: 'CGGT > Apoio Governanca',
  observadores: '(observador 1)\n(observador 2)',
  ticketManagers: '(ticket manager 1)\n(ticket manager 2)',
  ...((typeof window !== 'undefined' && window.CONFIG_LOCAL) || {}),
};
let cfg = { ...CFG_PADRAO };
try { cfg = { ...CFG_PADRAO, ...JSON.parse(localStorage.getItem(CFG_KEY) || '{}') }; } catch { }
const linhas = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);

/* ---------- catálogo (planilha [GMUD] Catálogo Mudança Padrão 2025) ---------- */
const CATALOGO = [
  ['Infraestrutura de Aplicacoes > Recursos de Aplicação > Administrar', 'Alterar variável de ambiente em produção', 'Execução com sucesso em ambiente de homologação', 'Quando for necessário reiniciar a aplicação'],
  ['Infraestrutura de Aplicacoes > Recursos de Aplicação > Administrar', 'Atualização mensal GitLab', 'N/A', 'N/A'],
  ['Infraestrutura de Aplicacoes > Recursos de Aplicação > Administrar', 'Atualização mensal Nexus', 'N/A', 'N/A'],
  ['Servidores e virtualizacao > Servidor > Criar', 'Criação de servidor', 'Valores padrão: memória até 8 GB; 2 a 8 CPUs; disco adicional ≤ 100 GB; SO Oracle Linux 9', 'SO/softwares não homologados; recursos acima do padrão'],
  ['Infraestrutura de Aplicacoes > Deploy > Executar', 'Deploy em produção (sem script de banco de dados)', 'Execução com sucesso em homologação e resultado negativo na análise de vulnerabilidade', 'Deploy assistido'],
  ['Infraestrutura de Aplicacoes > Deploy > Executar', 'Deploy na Esteira DevOps', 'Execução com sucesso em homologação e resultado negativo na análise de vulnerabilidade', 'N/A'],
  ['Servidores e virtualizacao > Servidor > Desativar', 'Excluir recursos (ambientes descomissionados — desenvolvimento e homologação)', 'Confirmação de que o ambiente não está em uso', 'Ambiente de Produção'],
  ['Banco de Dados > Script > Executar', 'Execução de script DDL produção', 'Execução com sucesso em homologação; criação de objetos no BD', 'Alteração/remoção de tabelas, índices etc.; qualquer alteração ou remoção em banco'],
  ['Banco de Dados > Script > Executar', 'Execução de script DML produção', 'N/A', 'N/A'],
];

/* ---------- estado ---------- */
let ultimo = null;      // resultado do motor
let override = null;    // tipo forçado manualmente

/* ---------- util UI ---------- */
function toast(t) {
  const el = $('#toast'); el.textContent = t; el.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('on'), 1600);
}
async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); }
  catch {
    const ta = document.createElement('textarea'); ta.value = texto; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy'); ta.remove();
  }
  toast('Copiado!');
}
const classeTipo = t => ({ 'Padrão': 'padrao', 'Normal': 'normal', 'Emergencial': 'emergencial', 'Requisição': 'requisicao' }[t] || 'outro');
const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

/* ---------- abas ---------- */
$$('.aba').forEach(b => b.addEventListener('click', () => {
  $$('.aba').forEach(x => x.classList.toggle('ativa', x === b));
  $$('.painel').forEach(p => p.classList.toggle('ativo', p.id === 'aba-' + b.dataset.aba));
  if (b.dataset.aba === 'historico') renderHistorico();
}));

/* ---------- ANALISAR ---------- */
function rodarAnalise() {
  const texto = $('#inTexto').value;
  if (!texto.trim() && !$('#inScript').value.trim()) { toast('Cole o texto do chamado primeiro'); return; }
  override = null;
  ultimo = analisar({ texto, titulo: $('#inTitulo').value, script: $('#inScript').value });
  renderResultado();
}

/* Torres que devem participar: motor (título/campos) + mesmo host no histórico. Grupos "Mudança" não entram (são coordenação). */
function listarTorres(d, hist) {
  const lista = [];
  const add = (grupo, motivo, nivel) => {
    const e = lista.find(x => x.grupo === grupo);
    if (!e) lista.push({ grupo, motivos: [motivo], nivel });
    else { e.motivos.push(motivo); if (nivel === 'principal') e.nivel = 'principal'; }
  };
  for (const t of d.torres) add(TORRES[t.key].grupo, t.motivo, t.nivel || 'principal');
  if (hist) for (const r of hist.mesmoHost) for (const g of r.obs)
    if (!/mudanca (infra|segur)/.test(norm(g))) add(g, `envolvida na RDM ${r.id} (mesmo host)`, 'principal');
  // RDMs com título parecido (aprende com casos que ainda não têm regra)
  if (hist && hist.parecidos.length >= 2) for (const [g, n] of hist.gruposParecidos) {
    if (/mudanca (infra|segur)|apoio governanca/.test(norm(g))) continue;
    const pct = n / hist.parecidos.length;
    if (pct >= 0.2) add(g, `em ${n} de ${hist.parecidos.length} RDMs com título parecido`, pct >= 0.4 ? 'principal' : 'talvez');
  }
  return lista.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'principal' ? -1 : 1));
}

function montarSaida(d, tipo, hist) {
  const obsPessoas = linhas(cfg.observadores);
  const tms = linhas(cfg.ticketManagers);
  const torreExec = d.torreExec ? TORRES[d.torreExec] : null;
  const titulo = d.info.titulo || '(título da RDM)';
  const num = d.info.numero ? ` (${d.info.numero})` : '';
  const torresPrincipais = listarTorres(d, hist).filter(t => t.nivel === 'principal').map(t => t.grupo);
  const planGrupo = TORRES[d.grupoPlan || 'MUD'];
  const extras = (d.atribuidoExtra || []).map(k => TORRES[k].grupo);
  const s = { tipo, campos: [], passos: [], mensagem: '', mensagemTitulo: '' };

  const campoTipo = ['Tipo da Mudança', tipo === 'Requisição' ? '— (não é mudança)' : tipo];
  const catSug = (!d.categoria || d.categoria.startsWith('—')) && hist && hist.sugestaoCat ? hist.sugestaoCat.categoria : null;
  const campoCat = ['Categoria', catSug ? catSug + '  (sugerida pelo histórico)' : (d.categoria || '—')];

  if (tipo === 'Padrão') {
    s.campos = [campoTipo, campoCat,
      ['Observador', [...obsPessoas, ...(torreExec ? [torreExec.grupo] : [])]],
      ['Atribuído', [cfg.meuNome, cfg.parceiro, cfg.grupoGov]]];
    s.passos = [
      'Marcar <b>Tipo da Mudança = Padrão</b> e conferir a categoria.',
      `Observadores: ${obsPessoas.map(esc).join(', ')}${torreExec ? ' + grupo <code>' + esc(torreExec.grupo) + '</code>' : ''}.`,
      `Atribuído: você, ${esc(cfg.parceiro)} e <code>${esc(cfg.grupoGov)}</code>. Salvar.`,
      `Mandar a mensagem no chat de mudanças marcando ${obsPessoas.map(n => '@' + esc(n.split(' ')[0])).join(' e ')} para abrirem a <b>EXEC</b> direto para <b>${esc(torreExec ? torreExec.curto : 'a torre')}</b>.`,
    ];
    s.mensagemTitulo = 'Mensagem para o chat de mudanças';
    s.mensagem = `${saudacao()}! Por gentileza abram uma Exec diretamente para ${torreExec ? torreExec.curto : '<TORRE>'}, desde já agradeço.\n\n${obsPessoas.map(n => '@' + n).join(' / ')}\n${titulo.replace(/\s*\(\d{10}\)\s*$/, '')}${num}`;
  } else if (tipo === 'Normal') {
    s.campos = [campoTipo, campoCat,
      ['Atribuído', [cfg.meuNome, cfg.parceiro, cfg.grupoGov, ...extras]],
      ['Encaminhar PLAN para', planGrupo.grupo],
      ['Torres envolvidas (observador)', torresPrincipais]];
    s.passos = [
      'Marcar <b>Tipo da Mudança = Normal</b> e conferir a categoria.',
      `Atribuído: você, ${esc(cfg.parceiro)}, <code>${esc(cfg.grupoGov)}</code>${extras.map(g => ', <code>' + esc(g) + '</code>').join('')}.`,
      'Clicar em <b>Responder</b> → <b>Fluxo de mudança</b>.',
      `Abrir o <b>PLAN</b> para <b>${esc(planGrupo.curto)}</b> — eles distribuem para as torres.`,
      torresPrincipais.length ? `Incluir como observador a(s) torre(s): ${torresPrincipais.map(g => '<code>' + esc(g) + '</code>').join(', ')}.` : 'Torre dona do ativo não ficou clara no título — a Mudança Infraestrutura identifica no planejamento.',
    ];
  } else if (tipo === 'Emergencial') {
    s.campos = [campoTipo, campoCat,
      ['Observador', tms],
      ['Atribuído', [cfg.meuNome, cfg.grupoGov, ...extras]],
      ['Torre da EXEC', torreExec ? torreExec.grupo : (torresPrincipais[0] || '— (definir com o ticket manager)')]];
    s.passos = [
      'Marcar <b>Tipo da Mudança = Emergencial</b>.',
      `Observadores: ticket managers (${tms.map(esc).join(', ')}).`,
      `Atribuído: você e <code>${esc(cfg.grupoGov)}</code>.`,
      'Avisar no grupo de mudanças e falar com o ticket manager para abrir a EXEC e contatar o analista.',
    ];
    s.mensagemTitulo = 'Mensagem para o ticket manager / grupo';
    s.mensagem = `${saudacao()}! Segue link da mudança emergencial para abrir EXEC e fazer contato com o analista:\n${$('#inLink').value.trim() || '<LINK DA MUDANÇA>'}\n${titulo.replace(/\s*\(\d{10}\)\s*$/, '')}${num}${torreExec ? '\nTorre: ' + torreExec.curto : ''}`;
  } else {
    s.campos = [campoTipo, ['Ação', 'Devolver para a Central de Serviços (tratar como requisição)']];
    s.passos = [
      `Confirmar que o pedido é para <b>${esc(d.info.ambiente || 'ambiente não produtivo')}</b>.`,
      'Devolver o chamado para a <b>Central de Serviços</b> com a justificativa abaixo.',
    ];
    s.mensagemTitulo = 'Justificativa da devolução';
    s.mensagem = `Prezados, a solicitação refere-se ao ambiente de ${d.info.ambiente || 'homologação/desenvolvimento/capacitação'}, não se enquadrando como Requisição de Mudança (RDM), que é restrita a alterações no ambiente de Produção. Devolvemos à Central de Serviços para tratamento como requisição.`;
  }
  return s;
}

/* ---------- salvar a análise no histórico (aparece no Histórico e no Dashboard) ---------- */
function agoraBR() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function registroDaAnalise(d, tipo) {
  const hist = buscarSemelhantes(d);
  const catSug = hist && hist.sugestaoCat ? hist.sugestaoCat.categoria : '';
  const categoria = d.categoria && !d.categoria.startsWith('—') ? d.categoria : catSug;
  const extras = (d.atribuidoExtra || []).map(k => TORRES[k].grupo);
  let obs = [], atribuido = [cfg.grupoGov, ...extras];
  if (tipo === 'Padrão') obs = d.torreExec ? [TORRES[d.torreExec].grupo] : [];
  else if (tipo === 'Normal' || tipo === 'Emergencial') obs = listarTorres(d, hist).filter(t => t.nivel === 'principal').map(t => t.grupo);
  else atribuido = [];
  const anterior = Historico.locais.find(r => r.id === d.info.numero);
  return {
    id: d.info.numero, titulo: d.info.titulo || `(RDM ${d.info.numero})`,
    status: tipo === 'Requisição' ? 'Devolvido (requisição)' : 'Em análise',
    abertura: anterior ? anterior.abertura : agoraBR(), atualizacao: agoraBR(),
    categoria, atribuido, tarefas: 0, tipo, obs,
    app: d.info.app || appFromTitle(d.info.titulo), ambiente: d.info.ambiente, origem: 'assistente',
  };
}

function destinoDoAtendimento(d, tipo) {
  if (tipo === 'Requisição') return 'Central de Serviços (devolvida)';
  if (tipo === 'Normal') return TORRES[d.grupoPlan || 'MUD'].grupo;
  if (d.torreExec) return TORRES[d.torreExec].grupo;
  const princ = listarTorres(d, buscarSemelhantes(d)).filter(t => t.nivel === 'principal');
  return princ.length ? princ[0].grupo : '';
}

function atendimentoDaAnalise(d, tipo) {
  const reg = registroDaAnalise(d, tipo);
  return {
    id: reg.id, titulo: reg.titulo, tipo, tipoMotor: d.tipo, corrigido: tipo !== d.tipo,
    categoria: reg.categoria, destino: destinoDoAtendimento(d, tipo), app: reg.app, ambiente: d.info.ambiente || '',
    cenario: d.cenario, analista: cfg.meuNome, quando: new Date().toISOString(),
  };
}

const nomePreenchido = () => !!cfg.meuNome && !cfg.meuNome.trim().startsWith('(');

/* bloco abaixo do veredito: registrar o atendimento (vai para o painel "Meus atendimentos") */
function blocoSalvarHist(d, tipo) {
  if (!d.info.numero) return `<div class="salvar-hist"><span class="dica">Para registrar o atendimento, coloque o número da RDM no título — ex.: "… (2026100053)".</span></div>`;
  // sem nome, o atendimento iria para o levantamento como "(seu nome…)" e não daria para saber de quem é
  if (!nomePreenchido()) return `<div class="salvar-hist corrigido"><span class="dica">Para registrar o atendimento, preencha <b>Seu nome</b> em Config — é ele que identifica você no levantamento da equipe.</span>
      <button data-acao="irConfig" class="prim">Ir para Config</button></div>`;
  const reg = Atendimentos.doAnalista(d.info.numero, cfg.meuNome);
  const corrigido = tipo !== d.tipo;
  if (reg) {
    const quando = new Date(reg.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `<div class="salvar-hist"><span class="pill padrao">✓ atendimento registrado</span>
      <span class="dica">em ${quando} como <b>${esc(reg.tipo)}</b>${reg.corrigido ? ' (sua correção também ficou como referência no histórico)' : ''}</span>
      ${reg.tipo === tipo ? '' : `<button data-acao="registrar" class="prim">Atualizar para ${esc(tipo)}</button>`}
      <button data-acao="desregistrar" class="link">desfazer</button></div>`;
  }
  return `<div class="salvar-hist${corrigido ? ' corrigido' : ''}"><button data-acao="registrar" class="prim">✓ Registrar atendimento</button>
    <span class="dica">Entra no painel <b>Meus atendimentos</b> como <b>${esc(tipo)}</b>, com data de hoje${corrigido ? `. Como você corrigiu o assistente (<b>${esc(d.tipo)}</b> → <b>${esc(tipo)}</b>), a correção também fica como referência para RDMs parecidas` : ''}.</span></div>`;
}

function aposMudarHistorico() {
  atualizarBadge(); preencherFiltros(); renderHistorico();
  if (typeof renderDashboard === 'function') renderDashboard();
  renderResultado();
}

function renderValor(v) {
  if (Array.isArray(v)) return v.length ? '<ul>' + v.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>' : '<span class="dica">—</span>';
  return esc(v);
}

function renderResultado() {
  const d = ultimo;
  if (!d) return;
  const tipo = override || d.tipo;
  const hist = buscarSemelhantes(d);
  const s = montarSaida(d, tipo, hist);
  const alertas = [...d.alertas];

  if ((!d.categoria || d.categoria.startsWith('—')) && hist && hist.sugestaoCat)
    alertas.push(`<b>Sem regra para este caso, mas o histórico ajuda:</b> ${hist.sugestaoCat.n} de ${hist.sugestaoCat.de} RDMs com título parecido usaram a categoria <b>${esc(hist.sugestaoCat.categoria)}</b>${hist.stParecidos.dominante ? ` e foram <b>${hist.stParecidos.dominante.tipo}</b> (${hist.stParecidos.dominante.n} de ${hist.stParecidos.totalTipado})` : ''}. Veja a lista em "Histórico parecido".`);

  // divergência com o histórico
  if (hist && hist.st.dominante && hist.st.totalTipado >= 3 && tipo !== 'Requisição') {
    const dom = hist.st.dominante;
    if (dom.tipo !== tipo && dom.pct >= 0.7)
      alertas.unshift(`<b>Histórico diverge:</b> ${dom.n} de ${hist.st.totalTipado} mudanças parecidas (${esc(hist.escopo)}) foram <b>${dom.tipo}</b>. Confira se este caso tem algo diferente (script, deploy assistido, ambiente…).`);
  }

  const confTxt = { alta: 'confiança alta', media: 'confiança média — revise os alertas', baixa: 'confiança baixa — revisar manualmente' }[d.confianca];
  const opcoes = ['Padrão', 'Normal', 'Emergencial', 'Requisição'];

  let html = `
  <div class="card">
    <div class="veredito">
      <span class="tipo-grande t-${classeTipo(tipo)}">${tipo}</span>
      <div class="meta">
        <div><b>${esc(d.cenario)}</b>${d.info.app ? ' · sistema <b>' + esc(d.info.app) + '</b>' : ''}${d.info.ambiente ? ' · ' + esc(d.info.ambiente) : ''}${d.info.numero ? ' · nº ' + esc(d.info.numero) : ''}</div>
        <span class="conf ${d.confianca}">${confTxt}</span>${override ? ' <span class="pill outro">alterado manualmente (motor: ' + d.tipo + ')</span>' : ''}
      </div>
    </div>
    <div class="override">Ajustar tipo:
      ${opcoes.map(o => `<button data-ov="${o}" class="${tipo === o ? 'sel' : ''}">${o}</button>`).join('')}
      ${override ? '<button data-ov="">↺ voltar ao automático</button>' : ''}
    </div>
    ${blocoSalvarHist(d, tipo)}
  </div>`;

  if (alertas.length) html += `<div class="card"><h3>⚠️ Atenção</h3><ul class="alertas">${alertas.map(a => `<li>${a}</li>`).join('')}</ul></div>`;

  html += `<div class="card"><h3>Preencher no GLPI</h3><table class="campos">${s.campos.map(([k, v]) => `
      <tr><th>${esc(k)}</th><td><div class="valor"><div>${renderValor(v)}</div>
      <button class="copiar" data-copy="${esc(Array.isArray(v) ? v.join('\n') : v)}">copiar</button></div></td></tr>`).join('')}
    </table></div>`;

  html += `<div class="card"><h3>Passo a passo <span class="dica">(clique para marcar)</span></h3><ol class="passos">${s.passos.map(p => `<li>${p}</li>`).join('')}</ol></div>`;

  if (tipo === 'Normal' || tipo === 'Emergencial') {
    const lista = listarTorres(d, hist);
    const princ = lista.filter(t => t.nivel === 'principal'), talvez = lista.filter(t => t.nivel !== 'principal');
    const item = (t, marcado) => `<label class="torre-item"><input type="checkbox" ${marcado ? 'checked' : ''} data-torre="${esc(t.grupo)}"> ${esc(t.grupo)} <span class="dica">— ${esc(t.motivos.join('; '))}</span></label>`;
    html += `<div class="card"><h3>Para onde encaminhar</h3>
      ${tipo === 'Normal' ? `<div class="destino">PLAN → <b>${esc(TORRES[d.grupoPlan || 'MUD'].grupo)}</b> <span class="dica">(eles distribuem para as torres)</span></div>` : ''}
      ${(d.atribuidoExtra || []).length ? `<p class="dica" style="margin:6px 0 0">Mudança de segurança: incluir <b>${d.atribuidoExtra.map(k => esc(TORRES[k].grupo)).join(', ')}</b> no Atribuído.</p>` : ''}
      <h4 style="margin:14px 0 4px">Torres que provavelmente participam</h4>
      ${princ.length ? princ.map(t => item(t, true)).join('') : '<p class="dica" style="margin:0">Nenhuma torre clara no título/campos (ex.: o título só traz o host). Quem recebe o PLAN identifica a torre dona do ativo.</p>'}
      ${talvez.length ? `<details style="margin-top:8px"><summary class="dica">Talvez (citadas só na descrição ou por ser produção) — ${talvez.length}</summary>${talvez.map(t => item(t, false)).join('')}</details>` : ''}
      ${hist && hist.mesmoHost.length ? `<p class="dica" style="margin:12px 0 4px">RDMs anteriores com o mesmo host (${esc(hist.hosts.join(', '))}):</p>
        <div class="tabela-wrap"><table class="tabela"><tr><th>ID</th><th>Título</th><th>Tipo</th><th>Observadores (grupo)</th></tr>${hist.mesmoHost.map(r => `<tr><td>${esc(r.id)}</td><td>${esc(r.titulo)}</td><td><span class="pill ${classeTipo(r.tipo)}">${esc(r.tipo || '—')}</span></td><td class="grupos">${r.obs.map(esc).join('<br>') || '—'}</td></tr>`).join('')}</table></div>` : ''}
      ${hist && hist.gruposNormais.length ? `<p class="dica" style="margin:12px 0 4px">Referência — mudanças <b>Normais</b> desta categoria (${hist.nNormaisCat}) tiveram como observador:</p>
        <div class="legenda">${hist.gruposNormais.map(([g, n]) => `<span>${esc(g)} <b>${n}</b></span>`).join('')}</div>` : ''}
      <div class="acoes" style="margin-top:10px"><button id="btnCopiarTorres">Copiar torres marcadas</button></div></div>`;
  }

  if (s.mensagem) html += `<div class="card"><h3>${esc(s.mensagemTitulo)}</h3><pre class="msg" id="msgTexto">${esc(s.mensagem)}</pre>
      <button class="prim" data-copy="${esc(s.mensagem)}">Copiar mensagem</button></div>`;

  html += `<div class="card"><h3>Por que essa recomendação?</h3><ul class="motivos">${d.motivos.map(m => `<li>${m}</li>`).join('')}</ul>`;
  if (!d.sql.vazio && d.usaScript) {
    const dml = Object.entries(d.sql.dml).map(([k, v]) => `${v}× ${k}`).join(', ') || '—';
    html += `<p style="margin-bottom:4px"><b>Análise do script:</b> classe <span class="pill ${d.sql.classe === 'DML' ? 'padrao' : 'normal'}">${d.sql.classe}</span></p>
      <ul class="motivos"><li>DDL: ${d.sql.ddl.length ? d.sql.ddl.map(x => `<code>${esc(x.verb + ' ' + x.obj)}</code>`).join(', ') : '—'}</li><li>DML: ${esc(dml)}</li>
      ${d.sql.dcl ? `<li>GRANT/REVOKE: ${d.sql.dcl}</li>` : ''}${d.sql.proc ? `<li>CALL/EXEC: ${d.sql.proc}</li>` : ''}</ul>`;
  }
  html += `<details style="margin-top:10px"><summary>Dados que eu extraí do texto</summary><dl class="kv">
      ${[['Título', d.info.titulo], ['Sistema', d.info.app], ['Ambiente', d.info.ambiente + (d.info.ambiente ? ' (' + d.ambienteOrigem + ')' : '')], ['Tema', d.info.tema], ['Serviço', d.info.servico],
        ['Tipo de deploy', d.info.tipoDeploy], ['Possui script?', d.info.possuiScript], ['Evidência homologação', d.info.evidHomolog],
        ['Análise vulnerabilidade', d.info.analiseVuln], ['Versão/tag', d.info.versaoTag], ['SGBD', d.info.sgbd]]
        .map(([k, v]) => `<dt>${k}</dt><dd>${v ? esc(v) : '<span class="dica">não encontrado</span>'}</dd>`).join('')}
    </dl></details></div>`;

  html += renderHistCard(hist);
  $('#resultado').innerHTML = html;
}

function barraTipos(porTipo, total) {
  const ordem = ['Padrão', 'Normal', 'Emergencial'];
  const outros = total - ordem.reduce((a, t) => a + (porTipo[t] || 0), 0);
  const seg = [...ordem.map(t => [t, porTipo[t] || 0]), ['Outros', outros]].filter(([, n]) => n > 0);
  return `<div class="barra">${seg.map(([t, n]) => `<span class="c-${classeTipo(t)}" style="width:${(n / total * 100).toFixed(1)}%" title="${t}: ${n}"></span>`).join('')}</div>
    <div class="legenda">${seg.map(([t, n]) => `<span><i class="c-${classeTipo(t)}"></i>${t} <b>${n}</b> (${Math.round(n / total * 100)}%)</span>`).join('')}</div>`;
}

function renderHistCard(h) {
  if (!h) return `<div class="card"><h3>Histórico parecido</h3><p class="dica">Nenhum histórico carregado. Vá na aba <b>Histórico</b> e importe o CSV do GLPI para ver mudanças parecidas e conferir o tipo usado antes.</p></div>`;
  let html = `<div class="card"><h3>Histórico parecido <span class="dica">— ${esc(h.escopo)}</span></h3>`;
  if (!h.st.totalTipado) html += '<p class="dica">Nada parecido no histórico.</p>';
  else html += `<p class="dica" style="margin:0">${h.st.validos} mudanças válidas${h.st.cancelados ? ` · ${h.st.cancelados} canceladas/recusadas` : ''}</p>${barraTipos(h.st.porTipo, h.st.totalTipado)}`;
  if (h.parecidos && h.parecidos.length) html += `<details style="margin-top:10px" ${h.escopo === 'títulos parecidos' ? 'open' : ''}><summary>RDMs com título parecido (${h.parecidos.length})</summary>
    <div class="tabela-wrap"><table class="tabela"><tr><th>ID</th><th>Título</th><th>Tipo</th><th>Observador / Atribuído (grupos)</th></tr>
    ${h.parecidos.slice(0, 12).map(r => `<tr><td>${esc(r.id)}</td><td>${esc(r.titulo)}<div class="grupos">${esc(r.categoria)}</div></td><td><span class="pill ${classeTipo(r.tipo)}">${esc(r.tipo || '—')}</span></td><td class="grupos">${[...new Set([...r.obs, ...r.atribuido])].map(esc).join('<br>') || '—'}</td></tr>`).join('')}</table></div></details>`;
  if (h.recentes.length && h.escopo !== 'títulos parecidos') html += `<div class="tabela-wrap" style="margin-top:12px"><table class="tabela"><tr><th>ID</th><th>Título</th><th>Tipo</th><th>Status</th><th>Observadores (grupo)</th></tr>
    ${h.recentes.map(r => `<tr><td>${esc(r.id)}</td><td>${esc(r.titulo)}<div class="grupos">${esc(r.categoria)}</div></td><td><span class="pill ${classeTipo(r.tipo)}">${esc(r.tipo || '—')}</span></td><td>${esc(r.status)}</td><td class="grupos">${r.obs.map(esc).join('<br>') || '—'}</td></tr>`).join('')}
    </table></div>`;
  return html + '</div>';
}

/* eventos do resultado (delegação) */
$('#resultado').addEventListener('click', e => {
  const c = e.target.closest('[data-copy]');
  if (c) return copiar(c.dataset.copy);
  const ac = e.target.closest('[data-acao]');
  if (ac && ultimo) {
    const tipo = override || ultimo.tipo;
    if (ac.dataset.acao === 'irConfig') {
      document.querySelector('.aba[data-aba="config"]').click();
      return document.querySelector('#cfgMeuNome').focus();
    }
    if (ac.dataset.acao === 'registrar') {
      if (!nomePreenchido()) return toast('Preencha Seu nome em Config antes de registrar');
      const at = atendimentoDaAnalise(ultimo, tipo);
      const ok = Atendimentos.registrar(at);
      // só a CORREÇÃO vai para o histórico de referência; concordar com o assistente não acrescenta nada lá
      if (at.corrigido) Historico.registrarAnalise(registroDaAnalise(ultimo, tipo));
      else Historico.removerAnalise(ultimo.info.numero);
      toast(ok ? `Atendimento ${ultimo.info.numero} registrado` : 'Não consegui salvar neste navegador');
    } else if (ac.dataset.acao === 'desregistrar') {
      Atendimentos.remover(ultimo.info.numero, cfg.meuNome);
      Historico.removerAnalise(ultimo.info.numero);
      toast('Registro desfeito');
    }
    return aposMudarHistorico();
  }
  const ov = e.target.closest('[data-ov]');
  if (ov) { override = ov.dataset.ov || null; if (override === ultimo.tipo) override = null; return renderResultado(); }
  if (e.target.id === 'btnCopiarTorres') return copiar($$('[data-torre]:checked').map(x => x.dataset.torre).join('\n'));
  const li = e.target.closest('.passos li');
  if (li) li.classList.toggle('feito');
});

$('#btnAnalisar').addEventListener('click', rodarAnalise);
document.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 'Enter') rodarAnalise(); });
$('#btnLimpar').addEventListener('click', () => {
  ['#inTitulo', '#inLink', '#inTexto', '#inScript'].forEach(s => $(s).value = '');
  ultimo = null; override = null;
  $('#resultado').innerHTML = '<div class="vazio"><div class="vazio-icone">📋</div><p>Cole o texto do chamado e clique em <b>Analisar</b>.</p></div>';
  $('#inTexto').focus();
});
$('#btnExemplo').addEventListener('click', () => {
  $('#inTitulo').value = '[RDM] - PDI - Executar deploy em Produção (2026100053)';
  $('#inScript').value = '';
  $('#inTexto').value = `Dados do formulário
Informações Básicas
1) Localização : PRF SEDE
2) Área : DTIC - Diretoria de Tecnologia da Informação e Comunicação
3) Complemento : DIAP
4) Telefone para contato : 61900000000
5) Selecione um tema : Executar Deploy de aplicação
6) Tipo de Deploy : Deploy normal
Executar Deploy de aplicação
7) Aplicação : PDI
8) URL da aplicação : https://pdi.prf.gov.br/pdi/
9) Ambiente : Produção
10) Evidencia de Homologação : 2026103055
11) Análise de vulnerabilidade : 2026103316
12) Finalidade do deploy :
Adaptar formulário do RRD gerado diretamente na PDI conforme solicitação negocial no chamado 2026095125
13) Tipo de alteração : Adaptativa
14) Possui solicitação para script de banco de dados? : Não
15) Tipo (linguagem) : PHP
16) Versão da tag : 2026.10.20_PRD
17) Plano (Sequência) de execução: : Deploy da tag https://git.prf.gov.br/sistemas-nacionais/pdi/-/tags/2026.10.20_PRD
18) Plano de Rollback :
Em caso de falha voltar para a versão abaixo e relatar os erros ocorridos:
https://git.prf.gov.br/sistemas-nacionais/pdi/-/tags/2026.10.07_PRD
19) Anexo : Nenhum documento anexado`;
  rodarAnalise();
});

/* ---------- HISTÓRICO ---------- */
function atualizarBadge() {
  const n = Historico.dados.length, b = $('#badgeHist');
  b.querySelector('span').textContent = n ? `${n.toLocaleString('pt-BR')} mudanças na base` : 'Histórico não carregado';
  b.classList.toggle('ok', !!n);
  const base = Historico.base;
  if (base && Historico.baseDesativada()) {
    $('#infoBase').innerHTML = `Base embutida do projeto (${base.registros.length} mudanças) <b>desativada</b> neste navegador — o histórico usa só o que você importar. <button class="link" id="btnRestaurarBase">restaurar base embutida</button>`;
    $('#btnRestaurarBase').onclick = () => { Historico.restaurarBase(); atualizarBadge(); preencherFiltros(); renderHistorico(); if (typeof renderDashboard === 'function') renderDashboard(); if (typeof renderChamados === 'function') renderChamados(); };
    return;
  }
  $('#infoBase').innerHTML = base
    ? `Base embutida no projeto: <b>${base.registros.length}</b> mudanças (gerada em ${new Date(base.geradoEm).toLocaleString('pt-BR')}).`
      + (Historico.locais.length ? ` Importadas neste navegador: <b>${Historico.locais.length}</b>.` : ' Só importe se quiser incluir mudanças mais novas.')
    : 'Sem base embutida — importe o CSV ou rode o ATUALIZAR-BASE.bat.';
}

/* Sinais de exportação incompleta do GLPI (os dois casos já aconteceram):
   - só a página atual (o arquivo tem exatamente o tamanho de uma página);
   - pesquisa filtrada só com encerradas (nenhuma RDM em andamento). */
const TAMANHOS_PAGINA_GLPI = [5, 10, 15, 20, 25, 30, 40, 50, 100, 200];
function avisosDoCSV(nome, regs) {
  const av = [];
  if (TAMANHOS_PAGINA_GLPI.includes(regs.length))
    av.push(`<b>${esc(nome)}</b> veio com exatamente <b>${regs.length}</b> linhas — o tamanho de uma página do GLPI. Provavelmente exportou só a <b>página atual</b>. No GLPI, use a exportação <b>“Todas as páginas”</b> (CSV).`);
  const abertas = regs.filter(r => r.status && !/fechad|cancel|recus|aplicad|encerrad|resolvid/i.test(r.status)).length;
  if (regs.length >= 20 && abertas === 0)
    av.push(`<b>${esc(nome)}</b> só tem RDMs <b>encerradas</b> (Fechado/Cancelado…) — nenhuma Pendente ou em andamento. Se a pesquisa no GLPI estava filtrada por status, as RDMs em aberto ficaram de fora e os números do mês vão sair menores. Exporte com o status em <b>“Todos”</b>.`);
  return av;
}

$('#inCSV').addEventListener('change', async e => {
  const files = [...e.target.files];
  let msgs = [], avisos = [];
  for (const f of files) {
    try {
      const regs = csvParaRegistros(decodificar(await f.arrayBuffer()));
      const r = Historico.mesclar(regs);
      msgs.push(`${f.name}: ${regs.length} linhas (${r.add} novas, ${r.upd} atualizadas)${r.salvo ? '' : ' — ⚠️ não coube no armazenamento do navegador'}`);
      avisos.push(...avisosDoCSV(f.name, regs));
    } catch (err) { msgs.push(`${f.name}: erro — ${err.message}`); }
  }
  e.target.value = '';
  $('#msgHist').textContent = msgs.join(' · ');
  $('#avisosCSV').innerHTML = avisos.map(a => `<li>⚠️ ${a}</li>`).join('');
  $('#avisosCSV').hidden = !avisos.length;
  if (avisos.length) toast('Importado — mas o arquivo parece incompleto (veja o aviso)');
  atualizarBadge(); preencherFiltros(); renderHistorico(); if (typeof renderDashboard === 'function') renderDashboard(); if (typeof renderChamados === 'function') renderChamados();
  if (ultimo) renderResultado();
});
$('#btnExportarHist').addEventListener('click', () => {
  const lista = historicoFiltrado();
  if (!lista.length) { toast('Nada para exportar com esses filtros'); return; }
  const d = new Date(), p = n => String(n).padStart(2, '0');
  baixarArquivo(`mudancas_glpi_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.csv`, registrosParaCSV(lista));
  toast(`${lista.length.toLocaleString('pt-BR')} mudanças exportadas`);
});
$('#btnLimparHist').addEventListener('click', () => {
  const n = Historico.locais.length, base = Historico.base && !Historico.baseDesativada() ? Historico.base.registros.length : 0;
  if (n || base) {
    const total = Historico.dados.length;
    if (!confirm(`Apagar TODO o histórico deste navegador (${total.toLocaleString('pt-BR')} mudanças)?\n\n` +
      (base ? `Inclui a base embutida do projeto (${base.toLocaleString('pt-BR')}) — ela deixa de ser usada aqui; dá para restaurar depois.\n` : '') +
      `Os "Meus atendimentos" NÃO são apagados.\n\nDepois, importe a exportação completa do GLPI.`)) return;
    Historico.apagarTudo(); atualizarBadge(); preencherFiltros(); renderHistorico(); if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof renderChamados === 'function') renderChamados();
    $('#avisosCSV').hidden = true;
    $('#msgHist').textContent = `✓ Histórico zerado (${total.toLocaleString('pt-BR')} mudanças apagadas). Agora importe a exportação completa do GLPI.`;
    toast('Histórico apagado');
    return;
  }
  if (!n) {
    $('#msgHist').textContent = base
      ? `Não há importações neste navegador para apagar — as ${base.toLocaleString('pt-BR')} mudanças que aparecem são da base embutida no projeto (arquivo da sua máquina).`
      : 'Não há importações neste navegador para apagar.';
    return;
  }
  const aviso = base
    ? `Apagar as ${n.toLocaleString('pt-BR')} mudanças importadas neste navegador?\n\nA base embutida do projeto (${base.toLocaleString('pt-BR')} mudanças) continua — ela vem do arquivo da sua máquina, não do navegador.`
    : `Apagar as ${n.toLocaleString('pt-BR')} mudanças importadas neste navegador? O histórico ficará vazio.`;
  if (!confirm(aviso)) return;
  Historico.limpar(); atualizarBadge(); preencherFiltros(); renderHistorico(); if (typeof renderDashboard === 'function') renderDashboard();
  $('#msgHist').textContent = `✓ ${n.toLocaleString('pt-BR')} importações apagadas.` + (base ? ` Ficou só a base embutida (${base.toLocaleString('pt-BR')}).` : ' Histórico vazio.');
  toast('Importações apagadas');
});

function preencherFiltros() {
  const uniq = k => [...new Set(Historico.dados.map(r => r[k]).filter(Boolean))].sort();
  $('#fStatus').innerHTML = '<option value="">Todos os status</option>' + uniq('status').map(s => `<option>${esc(s)}</option>`).join('');
  $('#fCat').innerHTML = '<option value="">Todas as categorias</option>' + uniq('categoria').map(s => `<option>${esc(s)}</option>`).join('');
}
['#fTexto', '#fTipo', '#fStatus', '#fCat'].forEach(s => $(s).addEventListener('input', renderHistorico));

/* lista do Histórico com os filtros da tela aplicados (a mesma que a exportação usa) */
function historicoFiltrado() {
  const q = norm($('#fTexto').value), ft = $('#fTipo').value, fs = $('#fStatus').value, fc = $('#fCat').value;
  return Historico.dados.filter(r => (!ft || r.tipo === ft) && (!fs || r.status === fs) && (!fc || r.categoria === fc)
    && (!q || norm(r.id + ' ' + r.titulo + ' ' + r.app + ' ' + r.obs.join(' ') + ' ' + (r.origem === 'assistente' ? 'via assistente' : '')).includes(q)));
}

function renderHistorico() {
  const H = Historico.dados;
  const filtrando = ['#fTexto', '#fTipo', '#fStatus', '#fCat'].some(s => $(s).value);
  $('#btnExportarHist').disabled = !H.length;
  if (!H.length) { $('#tabHist').innerHTML = ''; $('#resumoHist').innerHTML = 'Nenhuma mudança carregada ainda.'; $('#btnExportarHist').textContent = '⬇ Exportar CSV'; return; }
  const lista = historicoFiltrado();
  $('#btnExportarHist').textContent = filtrando ? `⬇ Exportar CSV (${lista.length.toLocaleString('pt-BR')} filtradas)` : `⬇ Exportar CSV (todas as ${H.length.toLocaleString('pt-BR')})`;
  const st = estatisticas(lista);
  $('#resumoHist').innerHTML = `${lista.length} de ${H.length} mudanças`
    + (st.cancelados ? ` · <b>${st.cancelados}</b> canceladas/recusadas ficam <b>fora</b> da barra (veja com o filtro de status)` : '')
    + (st.totalTipado ? barraTipos(st.porTipo, st.totalTipado) : '');
  const max = 400;
  $('#tabHist').innerHTML = `<tr><th>ID</th><th>Título</th><th>Sistema</th><th>Tipo</th><th>Status</th><th>Abertura</th><th>Tarefas</th><th>Observadores (grupo)</th></tr>` +
    lista.slice(0, max).map(r => `<tr><td>${esc(r.id)}</td><td>${esc(r.titulo)}<div class="grupos">${esc(r.categoria)}</div></td><td>${esc(r.app)}</td>
      <td><span class="pill ${classeTipo(r.tipo)}">${esc(r.tipo || '—')}</span>${r.origem === 'assistente' ? ' <span class="pill assist">via assistente</span>' : ''}</td><td>${esc(r.status)}</td><td>${esc(r.abertura)}</td><td>${r.tarefas}</td>
      <td class="grupos">${r.obs.map(esc).join('<br>') || '—'}</td></tr>`).join('') +
    (lista.length > max ? `<tr><td colspan="8" class="dica">Mostrando ${max} — use os filtros para refinar.</td></tr>` : '');
}

/* ---------- CATÁLOGO ---------- */
$('#tabCatalogo').innerHTML = '<tr><th>Item do Catálogo de Serviços</th><th>Mudança padrão</th><th>Pré-requisito</th><th>Exceção (tratar como Normal/Emergencial)</th></tr>' +
  CATALOGO.map(r => `<tr>${r.map((c, i) => `<td>${i === 0 ? '<b>' + esc(c) + '</b>' : esc(c)}</td>`).join('')}</tr>`).join('');

/* ---------- CONFIG ---------- */
const CFG_CAMPOS = { meuNome: '#cfgMeuNome', parceiro: '#cfgParceiro', grupoGov: '#cfgGrupoGov', observadores: '#cfgObservadores', ticketManagers: '#cfgTicketManagers' };
function carregarCfgUI() { for (const [k, s] of Object.entries(CFG_CAMPOS)) $(s).value = cfg[k]; }
$('#btnSalvarCfg').addEventListener('click', () => {
  for (const [k, s] of Object.entries(CFG_CAMPOS)) cfg[k] = $(s).value.trim();
  try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); $('#msgCfg').textContent = 'Salvo.'; } catch { $('#msgCfg').textContent = 'Não consegui salvar neste navegador.'; }
  if (ultimo) renderResultado();
  if (typeof renderDashboard === 'function') renderDashboard();
});
$('#btnResetCfg').addEventListener('click', () => { cfg = { ...CFG_PADRAO }; carregarCfgUI(); $('#msgCfg').textContent = 'Valores padrão restaurados (clique em Salvar).'; });

/* ---------- início ---------- */
Historico.carregar();
atualizarBadge();
preencherFiltros();
carregarCfgUI();

/* abrir direto numa aba: index.html#analisar, #historico… (#exemplo abre o Analisar com o exemplo carregado) */
(function () {
  const h = location.hash.slice(1);
  const aba = h === 'exemplo' ? 'analisar' : h;
  const btn = document.querySelector(`.aba[data-aba="${aba}"]`);
  if (btn) btn.click();
  if (h === 'exemplo') document.getElementById('btnExemplo').click();
})();
