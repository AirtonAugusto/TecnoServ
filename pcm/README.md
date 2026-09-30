# TecnoServ PCM — Apontamento, Aderência e Programação

Aplicação web (Node.js + Express, front-end em HTML/JS puro) que substitui os relatórios de fim de turno por WhatsApp.

| Tela | URL | Acesso |
|---|---|---|
| 1. Apontamento do colaborador | `/` | Livre (celular/PC) |
| 2. Dashboard de aderência + relatório de turno por equipe | `/dashboard.html` | Senha da gestão |
| 3. Programação semanal (3 semanas) | `/calendario.html` | Senha da gestão |
| Cadastro de equipes/colaboradores | `/cadastros.html` | Senha da gestão |

## Como rodar

```bash
cd pcm
npm install
cp .env.example .env        # edite GESTAO_SENHA e SESSION_SECRET
npm run seed                # (opcional) dados de demonstração
npm start                   # http://localhost:3000
npm test                    # testes automatizados
```

Requer Node.js 20+ (testado no 22).

## Armazenamento de dados

* **`STORAGE=json` (padrão):** arquivo `data/db.json` (+ fotos em `data/uploads`). Simples, sem configuração.
* **`STORAGE=sheets`:** Google Sheets. Cada tabela vira uma aba (`equipes`, `colaboradores`, `atividades`, `apontamentos`, `envios`), com cabeçalho na linha 1 — dá para abrir/filtrar/gerar tabelas dinâmicas no próprio Sheets.
  1. Google Cloud Console → crie um projeto → ative a **Google Sheets API**.
  2. Crie uma **Conta de serviço** → gere uma chave JSON.
  3. Crie uma planilha vazia e **compartilhe (Editor)** com o e-mail da conta de serviço.
  4. No `.env`: `STORAGE=sheets`, `GOOGLE_SHEETS_ID=<id da URL>` e `GOOGLE_SERVICE_ACCOUNT_JSON=<caminho do .json ou o conteúdo>`.
  5. `npm install` (instala `googleapis`) e `npm start`. As abas são criadas automaticamente.

  Excel Online (OneDrive) não é suportado diretamente; o Sheets cobre o mesmo caso. As **fotos** ficam sempre no disco do servidor (`DATA_DIR/uploads`) — use disco persistente na hospedagem.

## Implantação

Qualquer host com Node (Render, Railway, Fly.io, VPS…): comando de build `npm install`, start `npm start`; defina as variáveis do `.env.example` no painel e monte um volume persistente em `DATA_DIR` (se usar `json` ou para as fotos). Coloque atrás de HTTPS (cookie da gestão fica `Secure` automaticamente). Rode **uma única instância** (os dados ficam em memória com gravação imediata).

## Regras implementadas

* **Tela 1:** escolhe o nome → vê as OS do dia + pendências de dias anteriores (continuidade, até 14 dias). Caixas 🟢 concluída / 🟡 iniciada / 🔴 pendente. 🔵 Extra é criada por “+ Adicionar atividade extra” com **classificação BPF/Corretiva obrigatória** (validada também no servidor). Observações e fotos (reduzidas no navegador). Pode reenviar no mesmo dia (substitui) e lançar até 2 dias atrás.
* **Equipe:** cada colaborador pertence a uma equipe; o relatório de turno (Tela 2) agrupa os envios da equipe no dia, mostra quem ainda não enviou e permite imprimir.
* **Indicadores** (período e equipe filtráveis):
  * **Aderência** = concluídas ÷ planejadas (planejadas = programadas até hoje; situação = último apontamento).
  * **Sequência** = apontamentos de atividades de dias anteriores ÷ apontamentos de atividades programadas.
  * **Extras** = atividades azuis ÷ total de apontamentos (com divisão BPF/Corretiva).
  * **Não conformidade** = (pendentes + sem apontamento) ÷ planejadas.
* **Calendário:** semanas ISO rotuladas (Semana 40, 41, 42), navegação por semana, linha “Não alocadas” (backlog). Clique para editar/duplicar/excluir, **arraste** para remanejar (Ctrl/Alt+arrastar duplica). Reflete na hora na Tela 1.
* **Segurança:** as rotas `/api/gestao/*` (dados, calendário, fotos) exigem sessão assinada (cookie HttpOnly, SameSite=Strict, 12 h); senha comparada em tempo constante; bloqueio após 8 tentativas erradas por 15 min. A Tela 1 é aberta por design (seleção de nome, sem senha) — se precisar identificar melhor, adicione PIN por colaborador.
