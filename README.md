# Assistente de Mudanças (GLPI · PRF)

Site local que lê o texto de uma RDM e diz **o tipo de mudança**, **categoria**, **observadores**, **atribuídos**, **torres** e já gera a **mensagem para o chat**.

## Como usar
1. Abra `index.html` no Chrome/Edge (duplo clique). Não precisa de internet nem instalação.
2. Aba **Configurações**: coloque o seu nome (cada colega coloca o dele).
3. O histórico já vem embutido (`js/historico-base.js`). Para atualizar a base de todos: salve a nova exportação do GLPI na pasta `dados/` e dê dois cliques em `ATUALIZAR-BASE.bat`. (Também dá para importar um CSV só no seu navegador, pela aba **Histórico**.)
4. Aba **Dashboard** (abre primeiro): KPIs, RDMs por mês, top sistemas/torres, mix de tipo por categoria — filtros de período no topo.
5. Aba **Analisar**: cole o texto do chamado (e o script SQL, se houver) → **Analisar** (ou `Ctrl+Enter`).

## Por que não "alucina"
Não usa IA. São regras fixas (`js/core.js`), tiradas do Catálogo de Mudança Padrão 2025 e do procedimento interno:

| Situação | Resultado |
|---|---|
| Ambiente Homologação / Desenvolvimento / Capacitação | Requisição → devolver à Central |
| Deploy em produção sem script (normal ou esteira) | Padrão (confere evidência de homologação e análise de vulnerabilidade) |
| Deploy com script de banco ou deploy assistido | Normal |
| Script só DML (INSERT/UPDATE/DELETE/SELECT) | Padrão |
| Script com DDL (CREATE/ALTER/DROP/TRUNCATE) | Normal |
| Variável de ambiente / GitLab / Nexus mensal | Padrão (variável + reinício = Normal) |
| Criar servidor dentro do padrão (≤8 GB, 2–8 CPU, disco ≤100 GB, Oracle Linux 9) | Padrão |
| Desativar ambiente dev/hmg descomissionado | Padrão (produção = Normal) |
| Qualquer coisa fora do catálogo | Normal |
| Texto declara "emergencial" | Emergencial |

Toda recomendação mostra o **motivo**, os **alertas** e uma comparação com o **histórico** (avisa quando o histórico de mudanças parecidas usou outro tipo). Se discordar, use "Ajustar tipo".

## Ajustar regras
- Torres e palavras-chave: `TORRE_KEYWORDS` em `js/core.js`.
- Sistemas reconhecidos no título: `APPS` em `js/core.js`.
- Textos das mensagens e passos: `montarSaida()` em `js/app.js`.

Dicas: `index.html#analisar` abre direto na aba Analisar; `index.html?estatico` desliga as animações (bom para print/apresentação).
