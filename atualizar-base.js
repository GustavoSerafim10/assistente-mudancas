/* Gera js/historico-base.js a partir de todos os CSVs da pasta "dados".
   Uso: coloque a nova exportação do GLPI em dados/ e dê dois cliques em ATUALIZAR-BASE.bat
   (ou rode: node atualizar-base.js). */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const raiz = __dirname;
const ctx = { TextDecoder, console, localStorage: { getItem: () => null, setItem() { }, removeItem() { } } };
vm.createContext(ctx);
const src = ['core.js', 'history.js'].map(f => fs.readFileSync(path.join(raiz, 'js', f), 'utf8')).join('\n')
  .replace(/if \(typeof module[^\n]*/g, '') + '\n;this.R = { csvParaRegistros, decodificar };';
vm.runInContext(src, ctx);

const pasta = path.join(raiz, 'dados');
const arquivos = fs.readdirSync(pasta).filter(f => f.toLowerCase().endsWith('.csv')).sort(); // mais novo por último sobrescreve
if (!arquivos.length) { console.error('Nenhum .csv em ' + pasta); process.exit(1); }

const mapa = new Map();
for (const f of arquivos) {
  const regs = ctx.R.csvParaRegistros(ctx.R.decodificar(fs.readFileSync(path.join(pasta, f))));
  for (const r of regs) mapa.set(r.id, r);
  console.log(`${f}: ${regs.length} mudanças`);
  if ([5, 10, 15, 20, 25, 30, 40, 50, 100, 200].includes(regs.length))
    console.log(`  ⚠ exatamente ${regs.length} linhas = uma página do GLPI. Exporte "Todas as páginas".`);
  if (regs.length >= 20 && !regs.some(r => r.status && !/fechad|cancel|recus|aplicad|encerrad|resolvid/i.test(r.status)))
    console.log('  ⚠ só RDMs encerradas (nenhuma Pendente/em andamento). Exporte com Status = Todos.');
}
const lista = [...mapa.values()].sort((a, b) => b.id.localeCompare(a.id));
const saida = `/* GERADO AUTOMATICAMENTE por atualizar-base.js em ${new Date().toLocaleString('pt-BR')} — não edite à mão */\n`
  + `window.HISTORICO_BASE = ${JSON.stringify({ geradoEm: new Date().toISOString(), arquivos, registros: lista })};\n`;
fs.writeFileSync(path.join(raiz, 'js', 'historico-base.js'), saida, 'utf8');
console.log(`\nOK: ${lista.length} mudanças gravadas em js/historico-base.js`);
