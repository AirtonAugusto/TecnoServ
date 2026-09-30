# Sistema PCM — versão Google (sem servidor, sem custo)

Roda inteiramente na sua conta Google:

| Peça | Onde fica |
|---|---|
| Sistema (telas e regras) | **Google Apps Script** (Web App) |
| Dados (equipes, colaboradores, atividades, apontamentos) | **Google Sheets** — uma aba por tabela, você abre e filtra como quiser |
| Fotos do turno | Pasta **PCM-Fotos** no **Google Drive** |

Telas: início (OPERACIONAL ou ADM) · OPERACIONAL (apontamento do turno) · ADM com senha (aderência + relatório por equipe, programação de 3 semanas, cadastros).

## Arquivos

| Arquivo | O que é |
|---|---|
| `Code.gs` | Servidor: regras, indicadores, leitura/gravação na planilha, fotos no Drive, senha da ADM |
| `Pagina.html` | Todas as telas (HTML + CSS + JavaScript, com o logo embutido) |
| `appsscript.json` | Configuração do projeto (fuso, permissões, tipo de acesso) |

## Passo a passo

### 1. Criar a planilha e o projeto
1. Acesse https://sheets.google.com e crie uma **planilha em branco** (nome sugerido: *PCM - Dados*).
2. No menu da planilha: **Extensões → Apps Script**. Abre o editor de código já vinculado a essa planilha.

### 2. Colar os arquivos
1. No editor, apague o conteúdo do arquivo `Code.gs` e **cole o conteúdo de `apps-script/Code.gs`**.
2. Clique em **＋ (Arquivo) → HTML**, dê o nome **`Pagina`** (sem ".html") e **cole o conteúdo de `apps-script/Pagina.html`**.
3. Em **⚙️ Configurações do projeto**, marque **"Mostrar arquivo de manifesto appsscript.json no editor"**. Volte ao editor, abra `appsscript.json` e **substitua pelo conteúdo de `apps-script/appsscript.json`**.
4. Clique em 💾 **Salvar**.

> Alternativa para quem usa Node: `npm i -g @google/clasp`, `clasp login`, `clasp clone <ID do script>` dentro da pasta `apps-script` e `clasp push`.

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
