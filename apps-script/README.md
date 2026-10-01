# Sistema PCM — versão Google (sem servidor, sem custo)

Roda inteiramente na sua conta Google:

| Peça | Onde fica |
|---|---|
| Sistema (telas e regras) | **Google Apps Script** (Web App) |
| Dados (equipes, colaboradores, atividades, apontamentos) | **Google Sheets** — uma aba por tabela, você abre e filtra como quiser |
| Fotos do turno | Pasta **PCM-Fotos** no **Google Drive** |

Telas: início (OPERACIONAL ou ADM) · OPERACIONAL (apontamento do turno) · ADM com senha (aderência + relatório por equipe, programação de 3 semanas, cadastros).

## Arquivos (14 arquivos pequenos, para colar um de cada vez)

**Script (.gs)** — os nomes são livres:

| Arquivo | O que é |
|---|---|
| `Principal.gs` | Entrada do app, roteador das chamadas e datas |
| `Dados.gs` | Leitura/gravação na planilha e senha da ADM |
| `Operacional.gs` | Tela do colaborador (tarefas, envio do turno, fotos) |
| `Adm.gs` | Cadastros, calendário, relatórios |
| `Indicadores.gs` | Cálculo da aderência |

**HTML** — os nomes **precisam ser exatamente estes** (sem ".html" no editor):

| Arquivo | O que é |
|---|---|
| `Pagina` | Estrutura da página (liga todas as partes abaixo) |
| `Estilos` | Cores e layout |
| `JsLogo` | Logo embutido |
| `JsNucleo` | Funções básicas |
| `JsOperacional` | Tela OPERACIONAL |
| `JsAderencia` | Dashboard |
| `JsProgramacao` | Calendário |
| `JsCadastros` | Cadastros |
| `JsTelas` | Tela inicial, login e navegação |

**Configuração:** `appsscript.json`.

## Passo a passo

### 1. Criar a planilha e o projeto
1. Acesse https://sheets.google.com e crie uma **planilha em branco** (nome sugerido: *PCM - Dados*).
2. No menu da planilha: **Extensões → Apps Script**. Abre o editor de código já vinculado a essa planilha.

### 2. Colar os arquivos (um por vez)
No GitHub, abra cada arquivo da pasta `apps-script`, clique em **Raw**, `Ctrl + A`, `Ctrl + C`, e cole no editor.

1. **Scripts:** use o `Código.gs` que já existe para o conteúdo de `Principal.gs` (apague tudo antes de colar). Para os outros quatro, clique em **＋ → Script**, digite o nome (`Dados`, `Operacional`, `Adm`, `Indicadores`) e cole o conteúdo.
2. **HTML:** para cada um dos nove, clique em **＋ → HTML**, digite o nome exato da tabela acima (`Pagina`, `Estilos`, `JsLogo`…) e cole o conteúdo. O editor cria um arquivo com algumas linhas de exemplo: apague tudo antes de colar.
3. **Manifesto:** em **⚙️ Configurações do projeto**, marque **"Mostrar arquivo de manifesto appsscript.json no editor"**; volte, abra `appsscript.json` e substitua pelo conteúdo do arquivo.
4. Clique em 💾 **Salvar** (`Ctrl + S` em cada arquivo).

Dica de conferência: a primeira linha de cada `.gs` deve começar com `/**`, e a de cada HTML com `<style>`, `<script>` ou `<!DOCTYPE html>`.

> Alternativa sem copiar e colar: `npm i -g @google/clasp`, `clasp login`, `clasp clone <ID do script>` dentro da pasta `apps-script` e `clasp push`. O ID do script fica em **Configurações do projeto**.

### 3. Definir a senha da ADM
1. **⚙️ Configurações do projeto → Propriedades do script → Adicionar propriedade**.
2. Nome: `GESTAO_SENHA` · Valor: a senha que você quiser · **Salvar**.

### 4. Autorizar e criar as abas
1. No editor, escolha a função **`preparar`** na lista acima do código e clique em **▶ Executar**.
2. Aparece um pedido de autorização: **Revisar permissões → escolha sua conta → Avançado → Acessar (não seguro) → Permitir**. (O aviso "não seguro" é normal em scripts que você mesmo criou.)
3. Ao terminar, a planilha passa a ter as abas `equipes`, `colaboradores`, `atividades`, `apontamentos` e `envios`, e o Drive ganha a pasta `PCM-Fotos`.

### 5. Publicar
1. **Implantar → Nova implantação → ⚙️ → App da Web**.
2. Preencha:
   - **Executar como:** *Eu*
   - **Quem pode acessar:** *Qualquer pessoa*
3. **Implantar** e copie o **URL do app da Web** (termina em `/exec`). **Esse é o link do sistema.**

> Se a opção "Qualquer pessoa" não aparecer, a administração do seu Google Workspace restringiu o compartilhamento externo. Nesse caso só quem for da organização consegue abrir; fale com o TI.

### 6. Começar a usar
1. Abra o link → **ADM** → digite a senha.
2. **Cadastros:** crie as equipes e os colaboradores.
3. **Programação:** lance as atividades (clique no **+** da célula; arraste para remanejar).
4. Envie o link aos colaboradores: eles escolhem **OPERACIONAL**, selecionam o nome e preenchem o turno.

## Atualizar o sistema depois
Colou código novo? **Implantar → Gerenciar implantações → ✏️ editar → Versão: Nova versão → Implantar.** O link continua o mesmo.

## Como funciona e limites
- **Aderência**: concluídas ÷ planejadas até hoje. **Sequência**: apontamentos de atividades de dias anteriores ÷ apontamentos de atividades programadas. **Extras**: extras ÷ total de apontamentos. **Não conformidade**: (pendentes + sem apontamento) ÷ planejadas.
- **Segurança**: a tela OPERACIONAL é aberta a quem tem o link (escolhe o nome, sem senha). Toda a área ADM — dados, calendário e fotos — exige a senha; a sessão vale 12 h e há bloqueio de 15 min após 8 tentativas erradas. As fotos ficam privadas no seu Drive e só são exibidas na ADM.
- **Desempenho**: cada ação lê/grava na planilha e leva ~1–3 s. Atende bem dezenas de usuários; para milhares de registros por dia, o ideal seria um banco de dados.
- **Cotas do Google**: contas gratuitas têm limites diários de execução (suficientes para uso de equipe).
- **Backup**: a planilha guarda todo o histórico; use *Arquivo → Fazer uma cópia* de vez em quando. Não apague a linha 1 (cabeçalho) das abas.
- Edite a planilha com cuidado: as colunas `id` ligam as tabelas entre si.

## Testes (opcional, para quem for mexer no código)
```bash
cd apps-script
node --test test/code.test.js          # regras do servidor (Sheets/Drive simulados)
```
