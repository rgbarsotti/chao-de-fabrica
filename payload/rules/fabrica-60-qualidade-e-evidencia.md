# Qualidade e evidência

## Os Combinados

- **C1. Nada órfão.** Trabalho tem três estados: ENTREGUE, MORTO ou no STATUS.md com dono e próximo
  passo.
- **C2. Prova por execução, não por leitura.** Achado que bloqueia e aprovação de código vermelho
  exigem reprodução executada. Todo portão ou toggle nasce com o teste da polaridade fechada.
  Migração e configuração só estão prontas depois de rodar contra instância real descartável.
- **C2-bis. Correção de portão vem com o teste.** O mesmo commit entrega o teste que fica VERMELHO
  sem a correção, com o output da mutação na mensagem: correção desligada falha, religada passa.
- **C3. Toda leva termina com o placar de funções vivas** (antes e depois). A fila é: ligar o que
  existe, consertar o que impede de ligar, só então construir.
- **C4. Afirmação negativa também é afirmação.** "Não existe" só sai com o comando de busca que
  provou a ausência.
- **C5. A sujeira morre com a leva.** Worktrees, ramos mergeados, containers e bancos de ensaio.

## Prova de comportamento, não de representação

Pedir prova de representação (arquivo, configuração, leitura de código) só devolve prova de
representação. O que importa é o serviço vivo respondendo.

1. **A prova atravessa a fronteira do processo.** Sobe o serviço, chama a rota, observa a resposta.
2. **Teste negativo prova ausência de efeito, não ausência de configuração.**
3. **Quem escreve o roteiro executa o roteiro, no mesmo lote.** Roteiro nunca rodado não é entrega.

## Texto público descreve o produto especificado

Site, preços e contratos descrevem o produto como está especificado, não o que já foi implantado.
Não enfraqueça frase pública por item de backlog: trabalhe para entregar o que está escrito. Continua
proibida a alegação falsa em sentido forte, como certificação inexistente.

## Sincronizar instâncias e rastreadores

Mudança aprovada vai para todas as instâncias (local, git, servidor) e atualiza SESSION_LOG, BACKLOG
e STATUS.md. Git é a fonte da verdade; commits pequenos e frequentes.
