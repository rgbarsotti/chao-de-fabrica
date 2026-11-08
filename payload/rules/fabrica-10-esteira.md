# A esteira de produtos

Paralelismo é a política de vazão. QA e advisor operam no nível do lote e numa varredura periódica,
não em cada entrega. Mudança pequena fica rápida; proteção pesada fica onde rende.

**Vermelho** é o que toca dinheiro, dado de cliente, autenticação ou segurança, ou ação irreversível.

## Lane 1: ajuste pequeno (solo, direto)

Tarefa que o orquestrador resolve em poucas chamadas, mesmo tocando 2 ou 3 arquivos.

1. Roda a suíte da área afetada e guarda a evidência. Se a área não tem suíte, faz smoke manual e
   anota a lacuna.
2. **Gate vermelho imediato:** tocou vermelho, o advisor revisa na hora. Nunca espera lote.
3. **Duas batidas no SESSION_LOG:** ao começar, a intenção (o quê e por quê); ao terminar, evidência,
   commit e modelo. Sessão que cai deixa a intenção no disco.

## Varredura: a cada 10 ajustes de Lane 1

Uma passada de QA (suíte completa) e de advisor sobre o acumulado. Achado vira Lane 1 ou abre lote.
Registra o marco no SESSION_LOG e os achados no BACKLOG. O contador zera.

## Lane 2: setor (fábrica completa)

Feature nova ou frente de porte real (vários módulos, duas ou mais competências, frentes paralelas).

1. **Shaping** (planning e tech-lead): spec com critério de aceite e orçamento operacional: custo
   mensal, peças móveis novas justificadas uma a uma (o padrão é reusar a stack), modo de falha e
   rollback, manutenção que passa a existir.
2. **Desenho e aprovação do dono antes de codar.** O desenho aprovado fica em `docs/` antes do
   desenvolvimento. Setor vermelho: o advisor revisa desenho e orçamento já aqui.
3. **Lote 0, a bancada.** Provas baratas, em mock e sem credencial, antes do código de produto: o que
   custaria duas levas para descobrir depois. Cada prova com aceite executável e mutação. O resultado
   entra no desenho como emenda datada.
4. **Desenvolvimento.** Executores em paralelo, na mesma mensagem, um worktree por executor, um ou
   dois itens por agente, nunca sete ou nove.
5. **Portão.** O QA tenta quebrar o conjunto e reproduz as mutações. O advisor ataca o código
   acumulado. Se o QA reprova, o fluxo acaba ali e o advisor não roda.
6. **Um ciclo de ajustes.** Tudo o que o portão apontou vai junto ao executor, numa mensagem.
7. **Merge e deploy,** na ordem abaixo.
8. **Registro da leva.** SESSION_LOG, BACKLOG, documentação de operação e STATUS.md com o placar.

## A ordem, sem exceção

1. **Executor** desenvolve no worktree, roda a suíte da ÁREA e faz commit no ramo.
2. **Orquestrador** roda a suíte COMPLETA no ramo, antes do portão. Vermelho volta ao executor sem
   gastar portão. Portão só olha ramo verde.
3. **Portão,** uma passada, com todos os ajustes num ciclo só.
4. **Merge na principal** só com ramo verde e portão aprovado. Marcadores de falha esperada que o
   merge passa a satisfazer saem no mesmo commit. Worktrees e ramos mergeados são apagados.
5. **Deploy** só depois do portão e com o "pode" do dono para aquele deploy: backup do banco, avanço
   linear (`--ff-only`), build, migração no head esperado, saúde 200, exatamente 1 container por
   serviço. A evidência é o output da instância viva.

"Mergeado", "no ar" e "visível para o cliente" são três estados diferentes.

## O que é parecer

Parecer só é parecer com três partes: **veredito** (APROVA, APROVA_COM_AJUSTES ou REPROVA),
**reprodução executada** de cada bloqueante e a seção **"Brief de correção"** pronta para o executor.
Sem as três, o orquestrador devolve.

**Reprova é ciclo, não trava.** Quem reprova entrega a solução e o brief. O orquestrador lança o
executor. Portão nunca lança executor e executor nunca lança portão.

**Aceite é teste ao vivo.** O entregável só é aprovado depois de rodar no serviço de verdade, em
ambiente descartável: o agente faz o papel do cliente e lê o backend enquanto testa. Instância de
teste é destruída ao fim, com prova.

## Uso comedido do modelo mais caro

- Fable só em dois lugares: desenho de setor vermelho e portão final de lote vermelho, uma passada
  cada. Lote que não é vermelho tem portão em Opus.
- Sem acesso ao Fable, use Opus nesses dois lugares.
- Reconferência de item não volta ao modelo caro. O orquestrador roda a mutação do parecer (vermelho
  sem a correção, verde com ela) ou lança um Sonnet só com o trecho alterado.

## Orçamento e brief

- **Antes do lote, uma linha ao dono:** escopo e número de agentes.
- **No fim do lote:** a barra semanal antes e depois. Consumo se mede pela barra, nunca por palpite.
- Passou de 1,5 vez o orçado: pare, grave o estado e repense antes de outro ciclo.
- **O brief cita as linhas exatas** (`arquivo:linha`) das decisões do dono que o lote não pode ferir.
  Premissa sem linha citada não vira código.
- **Fonte inteira, não resumo.** Brief carrega `docs/DECISOES.md` e o desenho do setor para leitura
  integral. BACKLOG e STATUS servem para achar a fonte, nunca como fonte.

## Disciplina do orquestrador

- **Um lote por sessão.** Fechou: "lote fechado, estado salvo", e o dono abre sessão nova.
- **Silêncio até o resultado.** Fale só para pedir decisão, entregar o resultado ou responder
  pergunta. Andamento vai para o diário, na mesma chamada da próxima ação.
- **Todo número e horário com o comando que o mediu.**
- **Jornada como cliente antes** de abrir lote que toca o cliente: o lote nasce da lista do que
  quebrou, não da suposição.

## Corte é do procedimento inteiro

Ou se corta a função com todo o seu operacional, estudando o que a repõe, ou não se corta o que tem
de ser desenvolvido. Cortar só o desenvolvimento e deixar o processo esperando mão humana é o pior
dos dois mundos. Toda proposta de corte declara o que morre, o que repõe e a prova de que o produto
fica de pé sem aquilo.

## Toggle

Toggle só nasce com duas condições juntas: a função é de cliente E tem dois modos de operação que
fazem sentido. Função de um modo só sobe ligada.

## Mecanismos que dão certo

- **Perguntas ao dono agrupadas, cada uma com o padrão declarado.** Sem resposta, vale o padrão,
  registrado.
- **Pesquisador para fato externo** (versão, preço, cota, CVE): fonte, data e confiança antes de
  decidir. Nunca "acho que".
- **Despertador único** para toda espera, em vez de ficar consultando.
- **Emenda datada** em vez de reescrita em documento vivo.
