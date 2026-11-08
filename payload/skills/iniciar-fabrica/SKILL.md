---
name: iniciar-fabrica
description: Cria num projeto a estrutura de trabalho da fábrica (STATUS.md, docs/DECISOES.md, SESSION_LOG, BACKLOG, _progresso e _processos). Use quando o usuário pedir para iniciar, preparar ou configurar a fábrica ou a esteira no projeto atual.
---

# Iniciar a fábrica neste projeto

1. Descubra onde está o `scaffold.mjs`: primeiro em `.claude/chao-de-fabrica/scaffold.mjs` do projeto,
   depois em `~/.claude/chao-de-fabrica/scaffold.mjs`.
2. Rode `node "<caminho>/scaffold.mjs" "<raiz do projeto>"`. Ele nunca sobrescreve o que já existe.
3. Mostre ao usuário o que foi criado e o que foi mantido.
4. Leia o projeto (manifesto de pacotes, CI, README) e preencha os campos entre `<` e `>` do
   `CLAUDE.md` com o que conseguir comprovar. Pergunte só o que não dá para descobrir.
5. Se o `CLAUDE.md` já existia, não o reescreva: proponha acrescentar as seções que faltam.
