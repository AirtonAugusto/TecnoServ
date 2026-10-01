# Informe de Turno — versão Google (sem servidor, sem custo)

Roda inteiramente na sua conta Google:

| Peça | Onde fica |
|---|---|
| Sistema (telas e regras) | **Google Apps Script** (Web App) |
| Dados (equipes, colaboradores, atividades, apontamentos) | **Google Sheets** — uma aba por tabela, você abre e filtra como quiser |
| Fotos do turno | Pasta **PCM-Fotos** no **Google Drive** |

Telas: início (OPERACIONAL ou ADM) · OPERACIONAL (apontamento do turno) · ADM com senha (aderência + relatório por equipe, programação de 3 semanas, cadastros).

## Arquivos

| Arquivo | Tamanho | O que é |
|---|---|---|
| `Code.gs` | ~31 KB | Servidor: regras, indicadores, planilha, fotos no Drive e senha da ADM |
| `Pagina.html` | ~66 KB | Todas as telas (HTML + CSS + JavaScript, com o logo embutido) |
| `appsscript.json` | 1 KB | Configuração do projeto (fuso, permissões, tipo de acesso) |

## Passo a passo

### 1. Criar a planilha e o projeto
1. Acesse https://sheets.google.com e crie uma **planilha em branco** (nome sugerido: *PCM - Dados*).
2. No menu da planilha: **Extensões → Apps Script**. Abre o editor de código já vinculado a essa planilha.

### 2. Colar os arquivos
No GitHub, abra cada arquivo da pasta `apps-script`, clique em **Raw**, `Ctrl + A`, `Ctrl + C`, e cole no editor.

1. **`Code.gs`:** abra o `Código.gs` que já existe, `Ctrl + A`, apague e cole o conteúdo de `Code.gs`.
2. **`Pagina.html`:** clique em **＋ → HTML**, digite o nome **`Pagina`** (sem ".html", sem acento, P maiúsculo), apague o exemplo que o editor cria e cole o conteúdo de `Pagina.html`.
3. **Manifesto:** em **⚙️ Configurações do projeto**, marque **"Mostrar arquivo de manifesto appsscript.json no editor"**; volte, abra `appsscript.json` e substitua pelo conteúdo do arquivo.
4. Clique em 💾 **Salvar**.

Dica de conferência: o `Code.gs` colado tem cerca de 630 linhas e começa com `/**`; o `Pagina.html` começa com `<!DOCTYPE html>`.

> Se o editor não aceitar a colagem do `Pagina.html` (é o maior), use o **clasp**, que envia os arquivos sem copiar e colar: `npm i -g @google/clasp`, `clasp login`, `clasp clone <ID do script>` dentro da pasta `apps-script` e `clasp push`. O ID do script fica em **Configurações do projeto**.

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

## Página hospedada no GitHub (link fácil e rápido)

A página fica em `docs/index.html` e é publicada pelo **GitHub Pages**. O Google continua guardando os dados (planilha) e as fotos (Drive); a página só conversa com ele.

1. **Nome do repositório (define o link):** em *Settings → General → Repository name*, use um nome curto como `informe-de-turno`. O link passa a ser `https://<seu-usuário>.github.io/informe-de-turno/`.
2. **Ativar:** *Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch `main`, pasta `/docs` → Save*. Espere 1–2 minutos.
3. **Novo `Code.gs`:** cole o conteúdo de `apps-script/Code.gs` no Apps Script e republique em *Implantar → Gerenciar implantações → ✏️ → Nova versão → Implantar*.

O endereço do Apps Script usado pela página está na constante `API_URL`, no começo do script de `docs/index.html` (e de `Pagina.html`). Se criar uma **nova implantação** (e não editar a existente), o URL muda e precisa ser atualizado nos dois arquivos. `Pagina.html` e `docs/index.html` são idênticos: depois de editar um, copie para o outro.

## Link fácil de acessar

- **QR code para imprimir:** abra `https://<seu-usuário>.github.io/<repositório>/cartaz.html` e clique em *Imprimir*. A página gera o QR do endereço certo automaticamente; cole no mural ou no vestiário.
- **Aplicativo no celular:** ao abrir o link no celular, use *Adicionar à tela inicial* (Chrome/Android: menu ⋮; iPhone/Safari: botão de compartilhar). O Informe de Turno passa a abrir como aplicativo, em tela cheia, e carrega mais rápido.
- **Link curto (opcional):** use um encurtador (como bit.ly ou tinyurl.com) com o endereço do site e divulgue o link curto.

## Desempenho
- **Menos chamadas ao Google:** abrir a ADM faz 1 chamada (antes eram 4); abrir o OPERACIONAL traz nomes e tarefas numa só.
- **Carregamento antecipado:** enquanto a pessoa lê a tela inicial, o sistema já busca os nomes e as tarefas do último colaborador usado.
- **Cache no servidor:** as tabelas ficam até 6 h no cache do Google e são invalidadas a cada gravação.
- **Gráficos sob demanda** (a biblioteca só baixa quando a ADM abre o painel) e **arrastar na programação sem esperar** a resposta do servidor.
- **Aplicativo instalado:** a página fica guardada no aparelho.
- **Opcional — manter o sistema "acordado":** no Apps Script, abra **Acionadores (⏰) → Adicionar acionador**, função `manterAtivo`, *Baseado em tempo → A cada 5 minutos*. Reduz a demora do primeiro acesso do dia.

> O Apps Script tem uma demora mínima por chamada (em geral 1–2 s). As melhorias acima reduzem a quantidade de chamadas e escondem a espera, mas não eliminam esse piso. Para respostas abaixo de 1 s seria preciso trocar a planilha por um banco de dados em nuvem (Firebase ou Supabase, com plano gratuito).

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
