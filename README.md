# Informe de Turno

Informe de turno, aderência e programação semanal da manutenção (AngloGold Ashanti).

| Pasta | O que é |
|---|---|
| `docs/` | O site (publicado pelo GitHub Pages): telas OPERACIONAL e ADM, aplicativo instalável no celular e página com QR code (`cartaz.html`) |
| `apps-script/` | O servidor no Google: `Code.gs` (dados na planilha do Google Sheets, fotos no Drive). **Passo a passo em `apps-script/README.md`** |
| `pcm/` | Versão alternativa em Node.js, para quem quiser hospedar por conta própria (opcional) |

Como funciona: o site em `docs/` conversa com o Apps Script, que grava tudo numa planilha sua. Não há servidor para pagar.
