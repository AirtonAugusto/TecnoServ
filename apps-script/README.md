# Informe de Turno — servidor no Google (Apps Script + Sheets + Drive)

O site (pasta `docs/`, publicado pelo GitHub Pages) conversa com este servidor, que roda na sua conta Google, sem custo:

| Peça | Onde fica |
|---|---|
| Regras e API | **Google Apps Script** (`Code.gs`) |
| Dados (equipes, colaboradores, atividades, apontamentos, envios) | **Google Sheets** — uma aba por tabela |
| Fotos do turno | Pasta **PCM-Fotos** no **Google Drive** |

Arquivos desta pasta: `Code.gs` (todo o servidor) e `appsscript.json` (configuração). **Não existe mais o arquivo `Pagina`**: as telas ficam só no GitHub.

## Instalar ou atualizar (passo a passo)

### 1. Abrir o editor
Na planilha de dados: **Extensões → Apps Script**.

### 2. Colar o código
1. Abra o `Código.gs`, `Ctrl + A`, apague e cole o conteúdo de `apps-script/Code.gs` (em **Raw** no GitHub). Salve com `Ctrl + S`.
2. Em **⚙️ Configurações do projeto**, marque **"Mostrar arquivo de manifesto appsscript.json no editor"**, abra o `appsscript.json` e substitua pelo conteúdo do arquivo.
3. Se existir um arquivo `Pagina` (HTML) de versões antigas, pode excluí-lo.

### 3. Propriedades do script (⚙️ → Propriedades do script)
| Propriedade | Para quê | Obrigatória? |
|---|---|---|
| `GESTAO_SENHA` | Senha do perfil PCM / Gestão (o acesso é só com a senha, sem e-mail) | **Sim** |
| `META_ADERENCIA` | Meta exibida no painel, em % (padrão 85) | Não |
| `SITE_URL` | Endereço do site, para o link da página de status do servidor | Não |

### 4. Preparar
No menu de funções do editor escolha **`preparar`** e clique em **▶ Executar** (autorize na primeira vez: *Avançado → Acessar → Permitir*). Ela **cria as abas que faltam e acrescenta as colunas novas nas abas antigas**, sem apagar dados.

### 5. Publicar
- **Primeira vez:** *Implantar → Nova implantação → ⚙️ → App da Web* — *Executar como: Eu*, *Quem pode acessar: Qualquer pessoa*. Copie o URL (termina em `/exec`) e confira se é o mesmo da constante `API_URL` em `docs/js/core.js`.
- **Atualização:** *Implantar → Gerenciar implantações → ✏️ → Versão: Nova versão → Implantar*. O link continua o mesmo. (Se criar uma implantação nova, o URL muda e precisa ser atualizado em `API_URL`.)

### 6. Site no GitHub Pages
*Settings → Pages → Source: Deploy from a branch → `main` / pasta `/docs`*. Endereço: `https://<usuário>.github.io/<repositório>/`. Para um link mais curto, renomeie o repositório (*Settings → General → Repository name*) e use um encurtador, se quiser.

## Primeiro uso

1. Abra o site → **PCM / Gestão** → digite a senha de `GESTAO_SENHA`.
2. **Cadastros:** crie as **equipes** e os **colaboradores** (nome, equipe e **regime**; não há matrícula por enquanto):
   - **Turno** — roda as letras: escolha a **letra B ou C**.
   - **ADM** — não roda turno, não tem letra e tem folga fixa no sábado e domingo.
   - Dá para **Editar**, **Inativar** (tira do apontamento e mantém o histórico) ou **Excluir** de vez (as OS futuras voltam ao backlog e as folgas marcadas somem; o histórico de apontamentos fica).
3. **Programação:** os colaboradores aparecem **agrupados por letra** (Turno B, Turno C e ADM). Crie as OS (*Nova OS* ou o **+** da célula). OS sem data ficam no **backlog** (coluna da direita); arraste para a grade para programar. Para marcar uma **folga**, arraste o cartão **Folga** (coluna da direita) para o dia de quem vai folgar; para remover, clique no **×** ou arraste de volta. Não dá para marcar folga num dia que já tem OS, nem programar OS num dia de folga.
4. O colaborador abre o site → **Colaborador** → escolhe o **próprio nome** na lista (o turno vem do cadastro; ele pode trocar se estiver cobrindo outro turno) → marca o status de cada OS, registra extras, anexa fotos e envia. Se esquecer de preencher algo, o sistema avisa com as piadas internas (“malha fina”, “o Poderoso está de olho”). O apelido do supervisor e as frases ficam em `docs/js/core.js` (`APP.supervisor` e `FRASES_MALHA`).
5. **Aderência** mostra os indicadores por Dia, Semana ou Mês, com filtros de equipe, **turno (letra)** e colaborador. **Relatórios** mostra o turno enviado por equipe, com fotos.

## Como funciona

- **Entrada do colaborador:** escolhe o nome na lista (e o turno, que por padrão vem do cadastro), sem senha. O envio fica vinculado ao nome e ao turno.
- **Entrada da gestão:** só a senha. Sessão de 12 h; 8 senhas erradas bloqueiam por 15 min.
- **Status da OS:** *Concluída*, *Iniciada / Parcial*, *Pendente* (exige **motivo + justificativa**) e *Extra* (atividade fora da programação, com tipo **BPF** ou **Corretiva**). Quem não foi apontado vira "sem apontamento".
- **Indicadores** (período escolhido):
  - **Aderência geral** = concluídas ÷ programadas até hoje.
  - **Concluídas no prazo** = concluídas no próprio dia programado ÷ programadas.
  - **Extras** = contadas à parte (não somam à aderência), separadas em BPF e Corretiva.
  - **Pendências** = situação final "pendente"; "parciais" e "sem apontamento" aparecem à parte. **Motivos de não execução** vêm dos apontamentos pendentes.
- **Pendências de dias anteriores:** OS não concluídas dos últimos 14 dias aparecem na tela do colaborador para ele atualizar.
- **Fotos** ficam privadas no seu Drive e só aparecem para a gestão.

## Desempenho
- A tela de apontamento entra com **uma chamada** (nome → perfil + tarefas) e a de gestão abre com **uma chamada**.
- Cache de 6 h das tabelas no servidor, invalidado a cada gravação; troca de equipe/colaborador no painel é instantânea.
- **Opcional:** acionador por tempo para `manterAtivo` (⏰ Acionadores → Adicionar → *a cada 5 minutos*) reduz a demora do primeiro acesso.
- O Apps Script tem um piso de cerca de 1–2 s por chamada. Para respostas abaixo de 1 s seria preciso um banco de dados em nuvem (Firebase/Supabase).

## Cuidados
- Não apague a linha 1 das abas nem as colunas `id`; não renomeie as abas.
- Faça uma cópia da planilha de vez em quando (*Arquivo → Fazer uma cópia*).

## Testes
```bash
cd apps-script
node --test test/code.test.js     # regras do servidor (Sheets/Drive simulados), inclui migração de abas
```
`test/ui.mjs` abre o site no Chromium com a API simulada (precisa do Playwright).
