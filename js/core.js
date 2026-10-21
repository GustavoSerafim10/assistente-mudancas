/* =========================================================================
   Motor de regras — Assistente de Mudanças (GLPI / PRF)
   100% determinístico: as mesmas entradas sempre geram a mesma saída.
   Cada decisão registra o MOTIVO, para você conferir antes de aplicar.
   ========================================================================= */
'use strict';

/* ---------- utilitários ---------- */
const norm = s => (s == null ? '' : String(s))
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

const esc = s => (s == null ? '' : String(s)).replace(/[&<>"']/g,
  ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/* Procura palavra/expressão inteira no texto normalizado.
   Termo terminado em "*" casa como prefixo (ex.: "vulnerabil*"). */
function hasWord(textNorm, kw) {
  const prefix = kw.endsWith('*');
  const k = norm(prefix ? kw.slice(0, -1) : kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^a-z0-9])' + k + (prefix ? '' : '([^a-z0-9]|$)')).test(textNorm);
}
const anyWord = (textNorm, list) => list.find(k => hasWord(textNorm, k)) || null;

/* ---------- torres (grupos técnicos) ---------- */
const TORRES = {
  APP:   { grupo: 'CIA > DISTI > Infraestrutura de Aplicacoes', curto: 'Infra de Aplicações' },
  BD:    { grupo: 'CIA > DISTI > Banco de dados',               curto: 'Banco de Dados' },
  SO:    { grupo: 'CIA > DISTI > Sistemas Operacionais',        curto: 'Sistemas Operacionais' },
  ORQ:   { grupo: 'CIA > DISTI > Orquestracao de Servidores',   curto: 'Orquestração de Servidores' },
  SEG:   { grupo: 'CIA > DISTI > Seguranca de Infraestrutura',  curto: 'Segurança de Infraestrutura' },
  REDES: { grupo: 'CIA > DISTI > Redes',                        curto: 'Redes' },
  BKP:   { grupo: 'CIA > DISTI > Backup e Armazenamento',       curto: 'Backup e Armazenamento' },
  NOC:   { grupo: 'CIA > DISTI > NOC',                          curto: 'NOC' },
  MUD:   { grupo: 'CIA > DISTI > Mudanca Infraestrutura',       curto: 'Mudança Infraestrutura' },
  MSEG:  { grupo: 'CIA > DISTI > Mudanca Seguranca',            curto: 'Mudança Segurança' },
  CCM:   { grupo: 'Aprovadores CCM',                            curto: 'Aprovadores CCM' },
};

/* palavras-chave que puxam cada torre (usadas principalmente no PLAN da mudança Normal) */
const TORRE_KEYWORDS = {
  BD:    ['banco de dados', 'base de dados', 'script', 'sql', 'mysql', 'postgres*', 'postgresql', 'oracle', 'mongo*', 'dump', 'tabela*', 'indice*', 'sgbd', 'dba', 'restore', 'replica*', 'schema'],
  APP:   ['deploy', 'rancher', 'pod', 'pods', 'container*', 'wildfly', 'jboss', 'tomcat', 'kubernetes', 'configmap', 'variavel de ambiente', 'variaveis de ambiente', 'nexus', 'gitlab', 'git lab', 'jenkins', 'namespace', 'workload', 'esteira', 'docker', 'war', 'wso2', 'keycloak'],
  SO:    ['sistema operacional', 'sistemas operacionais', 'linux', 'windows', 'patch*', 'pacote*', 'atualizar so', 'oracle linux', 'centos', 'rhel', 'kernel'],
  ORQ:   ['criar servidor', 'vm', 'vms', 'maquina virtual', 'virtualiz*', 'powerstore', 'vmware', 'bare metal', 'servidor fisico', 'migracao do servidor'],
  SEG:   ['firewall', 'regra de seguranca', 'dns', 'cname', 'certificado', 'f5', 'waf', 'acesso externo', 'redirecionamento', 'mfa', 'brute force', 'proxy reverso'],
  REDES: ['rede', 'wi-fi', 'wifi', 'switch', 'vlan', 'controladora', 'roteador', 'link de dados'],
  BKP:   ['backup', 'storage', 'nfs', 'armazenamento', 'volume', 'netapp', 'snapshot'],
  NOC:   ['monitoramento', 'zabbix', 'grafana', 'alerta de monitoramento'],
};

/* ---------- aplicações conhecidas (para extrair o sistema do título) ---------- */
const APPS = ['PRF SEGURANCA', 'DPRF SEGURANCA', 'PRF SAUDE', 'MOTOR DE CONSULTAS', 'RENAINF WEB', 'ALERTA BRASIL',
  'PORTAL AUTOSERVICO', 'PORTAL AUTOSSERVICO', 'PORTAL DE SERVICOS', 'PORTAL PRF', 'PRF MOBILE', 'LOGIN UNICO', 'RADIO DIGITAL', 'BR BRASIL',
  'APIGEO', 'PDI', 'BOP', 'SIPAC', 'SICOR', 'MPIR', 'AUTOPRF', 'AUTO PRF', 'FREQUENCIA', 'SGA', 'SICOP', 'SILVER', 'SRH', 'CST',
  'LPST', 'LPAT', 'PETRVS', 'CPAG', 'SIGEST', 'SISCOM2', 'SIAGP', 'LUMEN', 'EAD', 'SPIF', 'PATRULHA', 'GRU', 'SIADI', 'SERVO2',
  'EDAT', 'SIGRH', 'SIGADMIN', 'NEXUS', 'GITLAB', 'GIT LAB', 'JENKINS', 'KEYCLOAK', 'KEYCLOACK', 'PLANOP', 'SISNAR', 'MAPEAR',
  'CARTE94', 'TRINO', 'GLPI', 'SEI', 'SGEB', 'SIAPE', 'LECOM', 'WSO2', 'SONARQUBE', 'SONAR QUBE', 'ZABBIX', 'SIMP', 'INTEGRATASK',
  'MANTIS', 'SGO', 'SIGA', 'SPIA', 'OCS', 'SAMBA AD', 'ATLAS', 'NAUTOBOT', 'DECLARANTE', 'EDITAL', 'SISLOG', 'SERVICO 191'];
const APP_ALIAS = { 'DPRF SEGURANCA': 'PRF SEGURANCA', 'LPAT': 'LPST', 'KEYCLOACK': 'KEYCLOAK', 'PORTAL AUTOSSERVICO': 'PORTAL AUTOSERVICO',
  'GIT LAB': 'GITLAB', 'AUTO PRF': 'AUTOPRF', 'SONAR QUBE': 'SONARQUBE' };
const APPS_SORTED = [...APPS].sort((a, b) => b.length - a.length);

function appKey(s) {
  const n = norm(s);
  if (!n) return '';
  for (const a of APPS_SORTED) if (hasWord(n, a)) return APP_ALIAS[a] || a;
  return '';
}

/* Primeiro segmento do título depois de [RDM] (fallback quando o sistema não está na lista) */
function appFromTitle(title) {
  const t = String(title || '').replace(/^\s*[\[(]?\s*(rdm|gmud|rmd|exec)\s*[\])~]*\s*/i, '').replace(/^[\s\-–]+/, '');
  const known = appKey(t);
  if (known) return known;
  const seg = t.split(/\s+[-–]\s+|\s+[-–]|[-–]\s+/)[0].trim();
  if (!seg || seg.length > 30 || /^outro$/i.test(seg)) return '';
  return norm(seg).toUpperCase();
}

/* ---------- parser do texto do chamado ---------- */
const KNOWN_LABELS = new Set(['localizacao', 'area', 'diretoria', 'complemento', 'complemento da localizacao', 'telefone para contato',
  'selecione um tema', 'tema', 'tipo de deploy', 'aplicacao', 'url da aplicacao', 'ambiente', 'evidencia de homologacao',
  'analise de vulnerabilidade', 'finalidade do deploy', 'tipo de alteracao', 'possui solicitacao para script de banco de dados',
  'qual sequencia a ser executada', 'finalidade do script', 'sgbd', 'base', 'schema', 'tipo (linguagem)', 'versao da tag',
  'plano (sequencia) de execucao', 'plano de rollback', 'anexo', 'anexos', 'sistema corporativo', 'selecione o servico', 'assunto',
  'descricao', 'servidor', 'selecione o equipamento', 'tipo de mudanca', 'tipo da mudanca']);

const cleanLabel = l => norm(l).replace(/[\s:?]+$/, '').replace(/^[^a-z0-9(]+/, '');

function parseChamado(raw) {
  let t = String(raw || '').replace(/\r/g, '').replace(/ /g, ' ');
  t = t.replace(/^[ \t]*\d{1,2}\.[ \t]*\n+/gm, '');                        // "13.\n" (cópia do NotebookLM)
  t = t.replace(/([^\n])[ \t]+(\d{1,2}\)[ \t]*[A-Za-zÀ-ÿ][^\n:]{0,70}?[ \t]*:)/g, '$1\n$2'); // vários campos na mesma linha

  const fields = {}, order = [], pre = [];
  let cur = null;
  const numParen = /^\s*(\d{1,2})\)\s*([^:\n]{1,80}?)\s*:\s*:?\s*(.*)$/;
  const numDot   = /^\s*(\d{1,2})\.\s*([^:\n]{1,80}?)\s*:\s*:?\s*(.*)$/;
  const plain    = /^\s*([A-Za-zÀ-ÿ][^:\n]{0,60}?)\s*:\s*:?\s*(.*)$/;

  for (const line of t.split('\n')) {
    let label = null, val = '', m;
    if ((m = line.match(numParen))) { label = m[2]; val = m[3]; }
    else if ((m = line.match(numDot)) && KNOWN_LABELS.has(cleanLabel(m[2]))) { label = m[2]; val = m[3]; }
    else if ((m = line.match(plain)) && KNOWN_LABELS.has(cleanLabel(m[1]))) { label = m[1]; val = m[2]; }

    if (label !== null) {
      const k = cleanLabel(label);
      if (!(k in fields)) { order.push(k); fields[k] = val.trim(); }
      else fields[k] += (fields[k] ? '\n' : '') + val.trim();
      cur = k;
    } else if (cur) fields[cur] += '\n' + line;
    else pre.push(line);
  }
  for (const k of order) fields[k] = fields[k].replace(/\n{3,}/g, '\n\n').trim();

  const get = (...cands) => {
    for (const c of cands) { const n = norm(c); if (n in fields && fields[n]) return fields[n]; }
    for (const c of cands) { const n = norm(c); const k = order.find(k => k.startsWith(n) && fields[k]); if (k) return fields[k]; }
    return '';
  };

  const allLines = t.split('\n');
  const tituloLinha = allLines.find(l => /\[\s*(rdm|gmud|rmd)\s*\]|^\s*(rdm|gmud)\b/i.test(l)) || '';
  return { raw: t, fields, order, pre: pre.join('\n').trim(), get, tituloDetectado: tituloLinha.trim() };
}

/* ---------- análise de SQL ---------- */
function limparSQL(sql) {
  let out = '', i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i], nx = sql[i + 1];
    if (ch === '-' && nx === '-') { while (i < n && sql[i] !== '\n') i++; continue; }
    if (ch === '#') { while (i < n && sql[i] !== '\n') i++; continue; }
    if (ch === '/' && nx === '*') { i += 2; while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++; i += 2; continue; }
    if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch; i++;
      while (i < n) {
        if (sql[i] === '\\') { i += 2; continue; }
        if (sql[i] === q) { if (sql[i + 1] === q) { i += 2; continue; } break; }
        i++;
      }
      i++; out += q === "'" ? "''" : 'x'; continue;
    }
    out += ch; i++;
  }
  return out;
}

const SQL_DDL = ['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME', 'COMMENT'];
const SQL_DML = ['INSERT', 'UPDATE', 'DELETE', 'MERGE', 'REPLACE', 'SELECT', 'UPSERT'];
const SQL_DCL = ['GRANT', 'REVOKE'];
const SQL_PROC = ['CALL', 'EXEC', 'EXECUTE'];
const DDL_OBJ_RE = /\b(CREATE|ALTER|DROP|TRUNCATE|RENAME)\s+(?:OR\s+REPLACE\s+)?(?:TEMPORARY\s+|UNIQUE\s+|MATERIALIZED\s+)?(TABLE|INDEX|VIEW|PROCEDURE|FUNCTION|TRIGGER|SCHEMA|DATABASE|SEQUENCE|USER|ROLE|TYPE|COLUMN|CONSTRAINT|EVENT|PACKAGE|SYNONYM)\b/gi;

function analisarSQL(sqlRaw) {
  const r = { vazio: true, ddl: [], dml: {}, dcl: 0, proc: 0, alertas: [], classe: 'VAZIO', totalComandos: 0 };
  if (!sqlRaw || !sqlRaw.trim()) return r;
  const s = limparSQL(sqlRaw).replace(/^\s*DELIMITER\s+\S+\s*$/gim, ';');
  const stmts = s.split(/;|\$\$|\/\s*$/m).map(x => x.trim()).filter(Boolean);
  const vistos = new Set();

  for (const st of stmts) {
    const up = st.toUpperCase();
    let verb = (up.match(/^[A-Z]+/) || [''])[0];
    if (verb === 'WITH') verb = (up.match(/\b(INSERT|UPDATE|DELETE|MERGE|SELECT)\b/) || ['SELECT'])[0];
    if (SQL_DDL.includes(verb)) {
      const obj = (st.match(/^\w+\s+(?:OR\s+REPLACE\s+)?(?:TEMPORARY\s+|UNIQUE\s+)?(\w+)/i) || [, ''])[1].toUpperCase();
      const key = verb + ' ' + obj + ' ' + up.slice(0, 80);
      vistos.add(key);
      r.ddl.push({ verb, obj, trecho: st.replace(/\s+/g, ' ').slice(0, 90) });
    } else if (SQL_DML.includes(verb)) {
      r.dml[verb] = (r.dml[verb] || 0) + 1;
      if ((verb === 'UPDATE' || verb === 'DELETE') && !/\bWHERE\b/.test(up))
        r.alertas.push(`${verb} sem WHERE: "${st.replace(/\s+/g, ' ').slice(0, 70)}…" — afeta a tabela inteira, confirme com o solicitante.`);
    } else if (SQL_DCL.includes(verb)) r.dcl++;
    else if (SQL_PROC.includes(verb)) r.proc++;
    else continue;
    r.totalComandos++;
  }
  // DDL escondido dentro de blocos (procedures, BEGIN…END)
  let m;
  while ((m = DDL_OBJ_RE.exec(s))) {
    const verb = m[1].toUpperCase(), obj = m[2].toUpperCase();
    if (!r.ddl.some(d => d.verb === verb && d.obj === obj)) {
      r.ddl.push({ verb, obj, trecho: s.slice(m.index, m.index + 90).replace(/\s+/g, ' ') });
    }
  }
  r.vazio = r.totalComandos === 0 && r.ddl.length === 0;
  const temDML = Object.keys(r.dml).length > 0;
  r.classe = r.ddl.length ? (temDML ? 'MISTO' : 'DDL') : r.dcl ? 'DCL' : r.proc ? 'PROC' : temDML ? 'DML' : 'VAZIO';
  if (r.dml.DELETE) r.alertas.push('Script contém DELETE — confirme que existe backup/rollback antes da execução.');
  return r;
}

/* ---------- helpers do motor ---------- */
function detectarAmbiente(s) {
  const n = norm(s);
  if (!n) return '';
  if (/produc|\bprd\b|\bprod\b/.test(n)) return 'Produção';
  if (/homolog|\bhmg\b/.test(n)) return 'Homologação';
  if (/capacita/.test(n)) return 'Capacitação';
  if (/treinamento/.test(n)) return 'Treinamento';
  if (/desenvolv|\bdsv\b|\bdev\b/.test(n)) return 'Desenvolvimento';
  return '';
}

const valorPreenchido = v => {
  const n = norm(v);
  return !!n && !/^(n\/?a|na|nao|não|xx+|-+|\.+|0+|nenhum.*|sem .*|nao se aplica)$/.test(n);
};

function sugerirTorresPorTexto(textNorm) {
  const out = [];
  for (const [key, kws] of Object.entries(TORRE_KEYWORDS)) {
    const hit = anyWord(textNorm, kws);
    if (hit) out.push({ key, motivo: `palavra-chave "${hit.replace('*', '')}"` });
  }
  return out;
}

/* nivel: 'principal' (vem marcada) ou 'talvez' (desmarcada, só lembrete) */
function addTorre(list, key, motivo, nivel = 'principal') {
  const e = list.find(t => t.key === key);
  if (!e) list.push({ key, motivo, nivel });
  else if (nivel === 'principal' && e.nivel !== 'principal') { e.nivel = 'principal'; e.motivo = motivo; }
}

/* campos "curtos" do formulário que descrevem O QUE muda (o título também entra).
   Descrição longa / relatórios citam muita coisa e só servem como "talvez". */
const CAMPOS_ESTRUTURADOS = ['selecione um tema', 'tema', 'selecione o servico', 'servidor', 'aplicacao', 'sistema corporativo',
  'selecione o equipamento', 'sgbd', 'tipo de deploy', 'assunto', 'base'];

const HOST_RE = /\b(svn\d{3,4}|sr[a-z]{2}\d{3,4}|vs[a-z]{2,4}\d{3}|svs\d{3,4}|(?:prod|hmg|dev)-(?:worker|master)-\d+|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g;
function extrairHosts(textNorm) { return [...new Set(textNorm.match(HOST_RE) || [])]; }

/* ---------- MOTOR DE DECISÃO ---------- */
function analisar({ texto, titulo, script }) {
  const c = parseChamado(texto);
  const tituloFinal = (titulo || '').trim() || c.tituloDetectado;
  const numero = (tituloFinal.match(/\b(20\d{8})\b/) || [])[1] || '';

  // texto "útil" para palavras-chave: título + valores (sem rótulos e sem dados cadastrais)
  const ignorar = new Set(['localizacao', 'area', 'diretoria', 'complemento', 'complemento da localizacao', 'telefone para contato',
    'possui solicitacao para script de banco de dados', 'anexo', 'anexos', 'url da aplicacao']);
  const valores = c.order.filter(k => !ignorar.has(k)).map(k => c.fields[k]).join(' \n ');
  const txt = norm(tituloFinal + ' \n ' + valores + ' \n ' + c.pre);
  const tit = norm(tituloFinal);
  const txtEstrut = norm(tituloFinal + ' \n ' + CAMPOS_ESTRUTURADOS.map(k => c.fields[k] || '').join(' \n '));
  const txtDesc = norm(c.order.filter(k => !ignorar.has(k) && !CAMPOS_ESTRUTURADOS.includes(k)).map(k => c.fields[k]).join(' \n ') + ' \n ' + c.pre);

  const info = {
    titulo: tituloFinal, numero,
    app: appKey(c.get('aplicacao', 'sistema corporativo')) || appFromTitle(tituloFinal) || norm(c.get('aplicacao', 'sistema corporativo')).toUpperCase(),
    ambienteCampo: c.get('ambiente'),
    tema: c.get('selecione um tema', 'tema'),
    servico: c.get('selecione o servico'),
    tipoDeploy: c.get('tipo de deploy'),
    possuiScript: c.get('possui solicitacao para script'),
    evidHomolog: c.get('evidencia de homologacao'),
    analiseVuln: c.get('analise de vulnerabilidade'),
    versaoTag: c.get('versao da tag'),
    rollback: c.get('plano de rollback'),
    tipoAlteracao: c.get('tipo de alteracao'),
    sgbd: c.get('sgbd'),
    tipoInformado: c.get('tipo de mudanca', 'tipo da mudanca'),
  };
  // ambiente: campo do formulário > título > texto
  let ambienteOrigem = 'campo "Ambiente"';
  info.ambiente = detectarAmbiente(info.ambienteCampo);
  if (!info.ambiente) { info.ambiente = detectarAmbiente(tituloFinal.split(/\s[-–]\s/).slice(1).join(' ')); ambienteOrigem = 'título'; }
  if (!info.ambiente) { info.ambiente = detectarAmbiente(c.get('descricao', 'assunto')); ambienteOrigem = 'descrição'; }

  const sql = analisarSQL(script);
  const d = {
    tipo: null, cenario: '', categoria: '', torreExec: null, torres: [], motivos: [], alertas: [],
    confianca: 'alta', info, sql, parse: c, ambienteOrigem, txtEstrut, txtDesc,
    hosts: extrairHosts(txtEstrut), seguranca: false, grupoPlan: null, atribuidoExtra: [], usaScript: false,
  };
  const baixa = () => { d.confianca = 'baixa'; };
  const media = () => { if (d.confianca === 'alta') d.confianca = 'media'; };

  const temaN = norm(info.tema + ' ' + info.servico);
  const possuiScriptSim = /^sim/.test(norm(info.possuiScript));
  const temScriptColado = !sql.vazio;

  /* ---- cenário ---- */
  let cen;
  if (/deploy/.test(temaN) || info.tipoDeploy || /\bdeploy\b|redeploy/.test(tit)) cen = 'DEPLOY';
  else if (/script/.test(temaN) || /executar script|script (de )?banco|script - |executar script banco/.test(tit)) cen = 'SCRIPT';
  else if (/(alterar|criar|excluir) banco de dados|banco de dados - (alterar|criar)|criar view|- (alterar|criar) banco/.test(tit) || /banco de dados/.test(temaN)) cen = 'BANCO';
  else if (anyWord(txt, ['desativar servidor', 'desativar ambiente', 'descomission*', 'excluir recursos', 'desativar servidores']) || /desativar/.test(temaN)) cen = 'DESATIVAR';
  else if (anyWord(txt, ['criar servidor', 'criar vm', 'criacao de servidor', 'criar maquina virtual', 'criacao de vm', 'criar servidores']) || /criar servidor/.test(temaN)) cen = 'CRIAR_SERVIDOR';
  else if (/migra[a-z]* (da )?regional|gestao dos equipamentos de rede|migrar a gestao/.test(tit)) cen = 'MIGRACAO_REDE';
  else if (anyWord(tit, ['vulnerabil*'])) cen = 'VULNERABILIDADE';
  else if (anyWord(tit, ['restabelecer*', 'indisponi*', 'fora do ar', 'lentidao'])) cen = 'INCIDENTE';
  else if (anyWord(txt, ['update mensal', 'atualizacao mensal', 'upgrade mensal', 'variavel de ambiente', 'variaveis de ambiente', 'configmap',
    'restart', 'reiniciar', 'secret*', 'atualizar imagem', 'alteracao de imagem', 'restart pod', 'redeploy', 'namespace', 'rclone*'])
    || anyWord(tit, ['gitlab', 'git lab', 'nexus', 'jenkins'])) cen = 'RECURSOS';
  else if (anyWord(tit, ['firewall', 'regra de seguranca', 'dns', 'cname', 'redirecionamento', 'url'])) cen = 'SEGURANCA';
  else if (anyWord(txt, ['movimentar equipamento', 'movimentar']) && anyWord(txt, ['equipamento', 'servidor fisico'])) cen = 'MOVIMENTAR';
  else if (anyWord(tit, ['alterar servidor', 'atualizar servidor', 'atualizar sistemas operacionais', 'configurar servidor'])) cen = 'SERVIDOR';
  else if (anyWord(tit, ['rede', 'wi-fi', 'wifi', 'controladora*'])) cen = 'REDE';
  else if (temScriptColado) cen = 'SCRIPT';
  else cen = 'OUTRO';

  /* ---- 1) ambiente não-produtivo => requisição (exceto exclusão de ambientes descomissionados, que é padrão) ---- */
  const naoProd = ['Homologação', 'Desenvolvimento', 'Capacitação', 'Treinamento'].includes(info.ambiente);
  if (naoProd && cen !== 'DESATIVAR') {
    d.tipo = 'Requisição';
    d.cenario = 'Ambiente não produtivo';
    d.categoria = '— (devolver para a Central de Serviços)';
    d.motivos.push(`Ambiente identificado: <b>${info.ambiente}</b> (pelo ${ambienteOrigem}). Pelo procedimento, pedidos de Homologação / Desenvolvimento / Capacitação são tratados como <b>requisição</b>, não como mudança.`);
    if (ambienteOrigem !== 'campo "Ambiente"') {
      media();
      d.alertas.push('O ambiente não veio no campo "Ambiente" do formulário — foi deduzido do texto. Confirme antes de devolver.');
    }
    return finalizar(d);
  }
  if (!info.ambiente) { media(); d.alertas.push('Não encontrei o ambiente (Produção/Homologação…). A análise assume Produção — confirme.'); }

  /* ---- 2) regras por cenário ---- */
  switch (cen) {
    case 'DEPLOY': {
      d.cenario = 'Deploy de aplicação';
      d.categoria = 'Infraestrutura de Aplicacoes > Deploy > Executar';
      d.torreExec = 'APP';
      const assistido = /assistid/.test(norm(info.tipoDeploy + ' ' + tit));
      const esteira = /esteira|devops/.test(norm(info.tipoDeploy + ' ' + tit));
      if (possuiScriptSim || temScriptColado) {
        d.tipo = 'Normal';
        d.motivos.push(`Deploy <b>com script de banco de dados</b> (${possuiScriptSim ? 'campo "Possui solicitação para script" = Sim' : 'script colado'}). O catálogo só considera padrão o deploy <b>sem</b> script.`);
        addTorre(d.torres, 'BD', 'deploy com script de banco');
        addTorre(d.torres, 'APP', 'deploy da aplicação');
        if (temScriptColado && sql.ddl.length) d.motivos.push(`O script contém DDL: ${sql.ddl.map(x => x.verb + ' ' + x.obj).join(', ')}.`);
      } else if (assistido) {
        d.tipo = 'Normal';
        d.motivos.push('Tipo de deploy <b>assistido</b> — é exceção no catálogo (tratar como Normal).');
        addTorre(d.torres, 'APP', 'deploy assistido');
      } else {
        d.tipo = 'Padrão';
        d.motivos.push(`Deploy em produção ${esteira ? 'via <b>Esteira DevOps</b>' : '<b>sem script de banco</b>'} — item de mudança padrão no catálogo.`);
        if (/^nao/.test(norm(info.possuiScript))) d.motivos.push('Campo "Possui solicitação para script de banco de dados?" = Não.');
        // pré-requisitos do catálogo
        if (!valorPreenchido(info.evidHomolog)) { media(); d.alertas.push('Pré-requisito do catálogo: <b>evidência de homologação</b> não informada. Peça ao solicitante antes de seguir como Padrão.'); }
        else d.motivos.push(`Evidência de homologação: ${esc(info.evidHomolog.split('\n')[0].slice(0, 80))}.`);
        const vulnOk = valorPreenchido(info.analiseVuln) || (esteira && /qualys/.test(txt));
        if (!vulnOk) { media(); d.alertas.push('Pré-requisito do catálogo: <b>análise de vulnerabilidade</b> não informada (veio vazia ou "N/A").'); }
        else d.motivos.push(`Análise de vulnerabilidade: ${valorPreenchido(info.analiseVuln) ? esc(info.analiseVuln.split('\n')[0].slice(0, 80)) : 'pipeline com Qualys (esteira)'}.`);
      }
      if (!valorPreenchido(info.rollback)) d.alertas.push('Plano de rollback não encontrado no texto.');
      break;
    }
    case 'SCRIPT':
    case 'BANCO': {
      d.cenario = cen === 'SCRIPT' ? 'Script de banco de dados' : 'Alteração de banco de dados';
      d.categoria = cen === 'SCRIPT' ? 'Banco de Dados > Script > Executar'
        : /criar/.test(tit) && !/view/.test(tit) ? 'Banco de Dados > Banco de Dados > Criar' : 'Banco de Dados > Banco de Dados > Alterar';
      d.torreExec = 'BD';
      addTorre(d.torres, 'BD', 'execução em banco de dados');
      if (sql.vazio) {
        d.tipo = 'Padrão'; baixa();
        d.motivos.push('Sem o script não dá para separar DDL de DML. Pelo histórico, a maioria dos "Executar script - Produção" é Padrão (DML).');
        d.alertas.push('<b>Cole o script</b> no campo de script para ter certeza: DDL (CREATE/ALTER/DROP) = Normal; DML (INSERT/UPDATE/DELETE/SELECT) = Padrão.');
        const kw = anyWord(txt, ['create table', 'alter table', 'drop table', 'create index', 'drop index', 'truncate', 'criar tabela', 'criar indice', 'alterar tabela', 'remover tabela', 'excluir tabela', 'trigger', 'procedure', 'view']);
        if (kw) { d.tipo = 'Normal'; d.motivos.push(`Mas a descrição menciona "<b>${kw.replace('*', '')}</b>" (estrutura) → tende a <b>Normal</b>.`); }
      } else if (sql.ddl.length) {
        d.tipo = 'Normal';
        d.motivos.push(`Script com <b>DDL</b> (mudança de estrutura): ${sql.ddl.map(x => x.verb + ' ' + x.obj).join(', ')} → <b>Normal</b>.`);
        const soCreate = sql.ddl.every(x => x.verb === 'CREATE');
        if (soCreate) d.alertas.push('O script só <b>cria</b> objetos. O catálogo permite DDL de criação como Padrão quando já executado com sucesso em homologação — mas o seu procedimento interno trata CREATE como Normal. Mantido Normal; ajuste manualmente se a gestão orientar diferente.');
      } else if (sql.classe === 'DCL') {
        d.tipo = 'Normal';
        d.motivos.push('Script com <b>GRANT/REVOKE</b> (permissões) — não é DML de dados; tratar como Normal.');
        addTorre(d.torres, 'SEG', 'alteração de permissões');
      } else if (sql.classe === 'PROC') {
        d.tipo = 'Normal'; media();
        d.motivos.push('Script chama <b>procedure/EXEC</b> — o conteúdo executado não é visível aqui.');
        d.alertas.push('Peça o corpo da procedure ou confirme com o DBA se ela altera estrutura.');
      } else {
        d.tipo = 'Padrão';
        const resumo = Object.entries(sql.dml).map(([k, v]) => `${v}× ${k}`).join(', ');
        d.motivos.push(`Script somente <b>DML</b> (dados): ${resumo} → <b>Padrão</b> (item "Execução de script DML produção" do catálogo).`);
      }
      break;
    }
    case 'RECURSOS': {
      d.cenario = 'Recursos de aplicação';
      d.categoria = 'Infraestrutura de Aplicacoes > Recursos de Aplicação > Administrar';
      d.torreExec = 'APP';
      addTorre(d.torres, 'APP', 'recurso de aplicação');
      const mensal = anyWord(txt, ['update mensal', 'atualizacao mensal', 'upgrade mensal']) && anyWord(txt, ['gitlab', 'git lab', 'nexus']);
      const variavel = anyWord(txt, ['variavel de ambiente', 'variaveis de ambiente', 'configmap', 'secret*', '.env']);
      const reinicia = anyWord(txt, ['reiniciar*', 'reinicio', 'restart*', 'redeploy']);
      if (mensal) { d.tipo = 'Padrão'; d.motivos.push('Atualização mensal de GitLab/Nexus — item padrão do catálogo.'); }
      else if (variavel && reinicia) {
        d.tipo = 'Normal';
        d.motivos.push(`Alteração de variável de ambiente <b>com reinício da aplicação</b> ("${reinicia.replace('*', '')}") — exceção do catálogo → Normal.`);
        d.alertas.push('O histórico tem "Restart POD" isolado como Padrão (ex.: AUTOPRF 2026100045). Se for só reiniciar o POD, sem alterar variável, pode ser Padrão.');
      } else if (variavel) {
        d.tipo = 'Padrão';
        d.motivos.push('Alterar variável de ambiente em produção — item padrão do catálogo.');
        d.alertas.push('Pré-requisito: execução com sucesso em homologação. Se exigir reiniciar a aplicação, vira Normal.');
      } else if (reinicia) {
        d.tipo = 'Padrão'; media();
        d.motivos.push('Reinício/redeploy de POD sem alteração de configuração — o histórico trata como Padrão.');
      } else {
        d.tipo = 'Normal'; media();
        d.motivos.push('Administração de recurso de aplicação que não está no catálogo padrão (ex.: criação de ambiente, migração, namespace) → Normal.');
      }
      break;
    }
    case 'CRIAR_SERVIDOR': {
      d.cenario = 'Criação de servidor';
      d.categoria = 'Servidores e virtualizacao > Servidor > Criar';
      d.torreExec = 'ORQ';
      addTorre(d.torres, 'ORQ', 'criação de VM');
      const mem = +(txt.match(/memoria[^0-9]{0,25}(\d+)/) || txt.match(/(\d+)\s*gb\s*(de\s*)?(ram|memoria)/) || [])[1] || null;
      const cpu = +(txt.match(/(?:v?cpus?|processador(?:es)?|nucleos|cores?)[^0-9]{0,20}(\d+)/) || txt.match(/(\d+)\s*v?cpus?/) || [])[1] || null;
      const disco = +(txt.match(/disco[^0-9]{0,30}(\d+)/) || [])[1] || null;
      const soOk = /oracle linux 9|ol9|oracle linux 9\.\d/.test(txt);
      const fora = [];
      if (mem != null && mem > 8) fora.push(`memória ${mem} GB (> 8 GB)`);
      if (cpu != null && (cpu < 2 || cpu > 8)) fora.push(`${cpu} CPUs (fora de 2 a 8)`);
      if (disco != null && disco > 100) fora.push(`disco adicional ${disco} GB (> 100 GB)`);
      if (/windows|ubuntu|centos|debian|red hat|rhel/.test(txt) && !soOk) fora.push('sistema operacional diferente de Oracle Linux 9');
      if (fora.length) { d.tipo = 'Normal'; d.motivos.push(`Fora dos valores padrão do catálogo: ${fora.join('; ')} → Normal.`); addTorre(d.torres, 'SO', 'SO/recursos'); }
      else {
        d.tipo = 'Padrão';
        d.motivos.push('Criação de servidor dentro dos valores padrão do catálogo (até 8 GB RAM, 2–8 CPUs, disco adicional ≤ 100 GB, Oracle Linux 9).');
        if (mem == null || cpu == null || !soOk) { media(); d.alertas.push(`Não consegui confirmar todos os recursos no texto (memória: ${mem ?? '?'}, CPU: ${cpu ?? '?'}, disco: ${disco ?? '?'}, Oracle Linux 9: ${soOk ? 'sim' : '?'}). Confira.`); }
      }
      break;
    }
    case 'DESATIVAR': {
      d.cenario = 'Desativar/excluir recursos';
      d.categoria = 'Servidores e virtualizacao > Servidor > Desativar';
      d.torreExec = 'ORQ';
      addTorre(d.torres, 'ORQ', 'desativação de servidor');
      if (info.ambiente === 'Produção' || !info.ambiente) {
        d.tipo = 'Normal';
        d.motivos.push('Desativação em <b>produção</b> — exceção do catálogo → Normal.');
        if (!info.ambiente) { media(); d.alertas.push('Ambiente não informado: se for dev/homologação descomissionado, é Padrão.'); }
      } else {
        d.tipo = 'Padrão';
        d.motivos.push(`Excluir recursos de ambiente descomissionado (${info.ambiente}) — item padrão do catálogo.`);
        d.alertas.push('Pré-requisito: confirmação de que o ambiente não está em uso.');
      }
      break;
    }
    case 'INCIDENTE': {
      d.cenario = 'Possível incidente';
      d.tipo = 'Normal'; baixa();
      d.categoria = '— (verificar)';
      d.motivos.push('Título indica restabelecimento/indisponibilidade. No histórico, quase todos os "Restabelecer Sistema em Produção" foram <b>cancelados</b> (tratados como incidente).');
      d.alertas.push('Avalie devolver como <b>incidente</b>. Se for de fato uma correção urgente com mudança em produção, use <b>Emergencial</b>.');
      break;
    }
    case 'MIGRACAO_REDE':
      d.cenario = 'Migração de regional (gestão de equipamentos de rede)'; d.tipo = 'Normal'; d.seguranca = true;
      d.categoria = 'Ferramentas > Ferramenta de Infraestrutura > Administrar';
      addTorre(d.torres, 'SEG', 'firewalls da regional (projeto de migração)');
      addTorre(d.torres, 'REDES', 'switches / Wi-Fi da regional');
      d.motivos.push('Projeto de migração da gestão dos equipamentos de rede de uma regional. No histórico, as "Migração da Regional X" (AL, GO, TO, AM, SE, SC, MG, ES…) foram <b>Normal</b> nesta categoria, envolvendo Segurança de Infraestrutura, Redes, Mudança Segurança e Projetos.');
      break;
    case 'VULNERABILIDADE':
      d.cenario = 'Correção de vulnerabilidade'; d.tipo = 'Normal'; d.seguranca = true;
      d.categoria = 'Segurança de Infraestrutura > Vulnerabilidade > Corrigir';
      d.motivos.push('Em vulnerabilidade, quem coordena é <b>Mudança Segurança</b> (vai no Atribuído) e o PLAN vai para <b>Mudança Infraestrutura</b>. A torre que executa é a <b>dona do ativo</b> (o que roda no host).');
      d.motivos.push('Correção de vulnerabilidade não está no catálogo de mudança padrão → Normal.');
      break;
    case 'SEGURANCA':
      d.cenario = 'Regra de segurança / DNS / URL'; d.tipo = 'Normal'; d.seguranca = true;
      d.categoria = 'Segurança de Infraestrutura > Regra de Seguranca > Alterar';
      addTorre(d.torres, 'SEG', 'regra de segurança/DNS');
      d.motivos.push('Alteração de regra de segurança/DNS/URL não está no catálogo padrão → Normal.');
      break;
    case 'MOVIMENTAR':
      d.cenario = 'Movimentar equipamento'; d.tipo = 'Normal';
      d.categoria = 'Equipamento de infraestrutura > Movimentar';
      addTorre(d.torres, 'ORQ', 'movimentação/migração de host');
      d.motivos.push('Movimentação/migração de equipamento → Normal.');
      break;
    case 'SERVIDOR':
      d.cenario = 'Alterar/atualizar servidor'; d.tipo = 'Normal';
      d.categoria = 'Servidores e virtualizacao > Servidor > Alterar';
      addTorre(d.torres, 'SO', 'alteração de servidor');
      d.motivos.push('Alteração/atualização de servidor não está no catálogo padrão → Normal.');
      break;
    case 'REDE':
      d.cenario = 'Rede corporativa'; d.tipo = 'Normal';
      d.categoria = 'Rede corporativa > (Wi-Fi / Cabeada) > Alterar';
      addTorre(d.torres, 'REDES', 'rede');
      d.motivos.push('Mudança de rede → Normal.');
      break;
    default:
      d.cenario = 'Não identificado'; d.tipo = 'Normal'; baixa();
      d.categoria = '— (escolher no GLPI)';
      d.motivos.push('Não encontrei um item do catálogo de mudança padrão que se encaixe. Por definição, o que não está no catálogo é <b>Normal</b>.');
      d.alertas.push('Revise manualmente: confira se não é requisição, incidente ou algum item padrão escrito de outra forma.');
  }

  /* ---- script só conta em deploy/banco ---- */
  const temTextoScript = !!(script && script.trim());
  if (['DEPLOY', 'SCRIPT', 'BANCO'].includes(cen)) {
    d.usaScript = true;
    d.alertas.unshift(...sql.alertas);
    if (temTextoScript && sql.vazio) d.alertas.push('O conteúdo do campo "Script SQL" não parece SQL (nenhum comando reconhecido) — confira se colou o arquivo certo.');
  } else if (temTextoScript) {
    d.alertas.push('Ignorei o campo "Script SQL": esta mudança não é de banco/deploy (o conteúdo colado não influencia a análise).');
  }

  /* ---- homologação ainda pendente (execução condicionada a outro chamado) ---- */
  const pend = txt.match(/(condicionad[ao]s?|depende(nte)?|aguardando|apos|após) (a |da |de |o |do )?(conclusao (com sucesso )?(do |da )?)?(homologacao|chamado de hmg|hmg)[^.\n]{0,80}/);
  if (pend) {
    const ref = (pend[0].match(/\b(20\d{8})\b/) || [])[1];
    media();
    d.alertas.unshift(`<b>Homologação pode estar pendente:</b> o texto diz "${esc(pend[0].trim())}". `
      + `Confira se o chamado de HMG${ref ? ' <b>' + ref + '</b>' : ''} já foi concluído com sucesso antes de pedir a EXEC. Se não foi, comente "aguardando conclusão com sucesso do chamado de HMG${ref ? ' ' + ref : ''}" e segure a mudança.`);
  }

  /* ---- 3) emergencial explícito ---- */
  const tipoInf = norm(info.tipoInformado);
  if (/emergencia/.test(tipoInf) || anyWord(txt, ['mudanca emergencial', 'carater emergencial', 'emergencial'])) {
    d.tipoBase = d.tipo;
    d.tipo = 'Emergencial';
    d.motivos.unshift('O chamado declara <b>emergencial</b>. Pela regra técnica seria <b>' + d.tipoBase + '</b> — confirme a urgência com o solicitante/ticket manager.');
  } else if (anyWord(txt, ['urgente', 'urgencia', 'o quanto antes', 'imediato'])) {
    d.alertas.push('O texto fala em urgência. Se houver impacto em produção que não pode esperar o fluxo normal, considere <b>Emergencial</b>.');
  }

  return finalizar(d);
}

function finalizar(d) {
  if (d.tipo === 'Normal' || d.tipo === 'Emergencial') {
    // 1) torres pelo que está no TÍTULO e nos campos curtos do formulário => principais
    for (const t of sugerirTorresPorTexto(d.txtEstrut)) addTorre(d.torres, t.key, t.motivo + ' no título/campos do formulário', 'principal');
    // 2) torres citadas só na descrição longa => "talvez" (vem desmarcada)
    for (const t of sugerirTorresPorTexto(d.txtDesc)) addTorre(d.torres, t.key, t.motivo + ' citada na descrição', 'talvez');
    // 3) produção de maior impacto costuma ter NOC/CCM — fica como lembrete
    if (d.info.ambiente === 'Produção' || !d.info.ambiente) {
      addTorre(d.torres, 'NOC', 'mudança em produção — o NOC costuma acompanhar a janela quando há indisponibilidade', 'talvez');
      addTorre(d.torres, 'CCM', 'mudança de alto impacto em produção pode exigir aprovação do CCM', 'talvez');
    }
    // grupos de coordenação (não são torres executoras)
    d.grupoPlan = 'MUD';
    if (d.seguranca) d.atribuidoExtra = ['MSEG'];
    d.torres.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'principal' ? -1 : 1));
  }
  if (d.info.tipoInformado) d.alertas.push(`O texto já traz "Tipo de mudança: ${esc(d.info.tipoInformado)}". Compare com a recomendação.`);
  return d;
}

/* exporta para testes em Node */
if (typeof module !== 'undefined') module.exports = { extrairHosts, analisar, parseChamado, analisarSQL, appKey, appFromTitle, norm, TORRES };
