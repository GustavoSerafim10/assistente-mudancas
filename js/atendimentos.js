/* =========================================================================
   Atendimentos — registro das RDMs analisadas no Assistente
   (banco separado do histórico do GLPI: serve para o levantamento do mês)
   ========================================================================= */
'use strict';

const AT_KEY = 'assistMudancas.atendimentos.v1';
const AT_COLUNAS = [
  ['id', 'ID'], ['titulo', 'Título'], ['tipo', 'Tipo'], ['tipoMotor', 'Tipo sugerido pelo assistente'], ['corrigido', 'Corrigido manualmente'],
  ['categoria', 'Categoria'], ['destino', 'Encaminhado para'], ['app', 'Sistema'], ['ambiente', 'Ambiente'], ['cenario', 'Cenário'],
  ['analista', 'Analista'], ['quando', 'Data do atendimento'],
];

const Atendimentos = {
  lista: [],
  chave: r => r.id + '|' + norm(r.analista),
  carregar() {
    try { this.lista = JSON.parse(localStorage.getItem(AT_KEY) || '[]'); } catch { this.lista = []; }
    return this.lista;
  },
  salvar() {
    try { localStorage.setItem(AT_KEY, JSON.stringify(this.lista)); return true; } catch { return false; }
  },
  doAnalista(id, analista) { return this.lista.find(r => r.id === id && norm(r.analista) === norm(analista)); },
  registrar(reg) {
    const i = this.lista.findIndex(r => this.chave(r) === this.chave(reg));
    if (i >= 0) this.lista[i] = { ...reg, quando: this.lista[i].quando, atualizado: new Date().toISOString() };
    else this.lista.push(reg);
    return this.salvar();
  },
  remover(id, analista) {
    this.lista = this.lista.filter(r => !(r.id === id && norm(r.analista) === norm(analista)));
    return this.salvar();
  },

  /* ---------- exportar / importar (relatório do mês e consolidação da equipe) ---------- */
  paraCSV(lista = this.lista) {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const linhas = [AT_COLUNAS.map(c => q(c[1])).join(';')];
    for (const r of [...lista].sort((a, b) => a.quando.localeCompare(b.quando))) {
      linhas.push(AT_COLUNAS.map(([k]) => {
        if (k === 'corrigido') return q(r.corrigido ? 'Sim' : 'Não');
        if (k === 'quando') return q(new Date(r.quando).toLocaleString('pt-BR'));
        return q(r[k]);
      }).join(';'));
    }
    return '﻿' + linhas.join('\r\n');   // BOM: o Excel abre com acentos certos
  },
  importarCSV(texto) {
    const rows = parseCSV(texto.replace(/^﻿/, ''));
    if (rows.length < 2) throw new Error('arquivo vazio');
    const head = rows[0].map(h => norm(h));
    const ix = Object.fromEntries(AT_COLUNAS.map(([k, rot]) => [k, head.indexOf(norm(rot))]));
    if (ix.id < 0 || ix.analista < 0 || ix.quando < 0) throw new Error('não é uma exportação de atendimentos do Assistente');
    let add = 0, upd = 0;
    for (const r of rows.slice(1)) {
      const g = k => (ix[k] >= 0 ? (r[ix[k]] || '').trim() : '');
      if (!g('id')) continue;
      const m = g('quando').match(/(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2})/);
      const reg = {
        id: g('id'), titulo: g('titulo'), tipo: g('tipo'), tipoMotor: g('tipoMotor'), corrigido: /^sim/i.test(g('corrigido')),
        categoria: g('categoria'), destino: g('destino'), app: g('app'), ambiente: g('ambiente'), cenario: g('cenario'),
        analista: g('analista'), quando: m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]).toISOString() : new Date().toISOString(),
      };
      const i = this.lista.findIndex(x => this.chave(x) === this.chave(reg));
      if (i >= 0) { this.lista[i] = reg; upd++; } else { this.lista.push(reg); add++; }
    }
    this.salvar();
    return { add, upd };
  },
};

function baixarArquivo(nome, conteudo, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

Atendimentos.carregar();
