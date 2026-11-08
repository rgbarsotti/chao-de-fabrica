# Edição de arquivos e formato

## Codificação e fim de linha

- Todo `open()` de texto leva `encoding="utf-8"` explícito, na leitura e na escrita.
- Preserve o fim de linha original.
- Antes do commit, `git diff --numstat`: diferença de arquivo inteiro numa edição de 3 linhas é
  corrupção.
- Prefira a ferramenta de edição a reescrever o arquivo. Nunca edição em lote de configuração por
  comando de shell.

## Documentos para o dono

- Listas com rótulo; tabela só estreita, de 2 ou 3 colunas. Tabela larga vira sopa de barras no
  arquivo cru.
- Decisões num documento vivo, com `>> Dono:` para a pergunta e `>> Claude (DD/MM):` para a resposta,
  inline e datado. Um documento por assunto.
- Resposta detalhada vai no arquivo; resumo vai no chat.

## Idioma

Português limpo ou inglês limpo, nunca verbo inglês aportuguesado. Substantivo consagrado (deploy,
commit, merge, backlog) é aceito.
