# Disco e continuidade

O contexto do agente é volátil; o disco é o único lugar que existe. Valor produzido e não escrito já
está perdido, você só não sabe ainda. Uma interrupção pode acontecer no meio de uma frase.

## A estrutura de pastas

```
<projeto>/
  CLAUDE.md                   as INSTÂNCIAS: caminhos, suítes, regras do produto
  STATUS.md                   retomada: em voo, o que espera o dono, placar
  docs/
    DECISOES.md               decisões do dono, só acréscimo datado
    SESSION_LOG.md            como foi feito, duas batidas por leva
    BACKLOG.md                a fila, toda entrada com nome de função
    DESENHO_<setor>.md        desenho aprovado, com emendas datadas
    _progresso/<label>.md     o que o trabalho produziu (versionado, permanente)
  _processos/                 fora do git
    _logs/<processo>/<label>.md   como foi feito: tentativa, beco, comando exato
```

As regras da fábrica são o MÉTODO. O `CLAUDE.md` do projeto guarda só instâncias e não contradiz o
método. Rode `/iniciar-fabrica` para criar essa estrutura num projeto novo.

## Trabalho interrompível

1. **Declare o plano antes de executar** em `docs/_progresso/<label>.md`, passos numerados e
   marcados PENDENTE, e faça commit.
2. **Escreva o achado no momento em que o tem,** com evidência (`arquivo:linha` ou output).
   Relatório final é ponto de falha único.
3. **Commit quando compila, não quando está perfeito.** A mensagem declara o estado real: "construído,
   NÃO validado; falta portão". Commit que mente sobre o estado é pior que nenhum.
4. **Todo passo seguro para rodar de novo.** Antes de criar, veja se já existe.
5. **Todo bloco termina com "para quem me suceder": FEITO, PRÓXIMO e CUIDADO.** CUIDADO é o campo
   mais valioso: é onde mora o que você aprendeu apanhando.

## Diário de bordo

Em `_processos/_logs/<processo>/<label>.md`:

1. **Escreva enquanto trabalha:** plano, cada achado, o que funcionou, o que não funcionou e por quê,
   o comando exato que provou cada coisa.
2. **Ao retomar: leia a pasta inteira antes de tocar em qualquer coisa.** Confirme no disco (`git
   log`, `git status`). O disco manda mais que o texto. Não recomece por desconfiança.
3. **Passo "em andamento" sem confirmação no disco não aconteceu.** Refaça.
4. **Apague a pasta do processo quando ele terminar.**

## O que não pode depender do modelo

- **Varra `docs/` antes de afirmar qualquer coisa sobre uma função.** Se um comentário de código cita
  um documento, abra o documento. Busca com acento falha: busque o trecho sem acento.
- **Comentário de código não é evidência de estado.** Estado se confere rodando.
- **Portão classifica antes de rotular.** Contradiz decisão registrada do dono? Não é achado, é
  pergunta. É novo? O parecer diz qual decisão viola; se nenhuma, escreve "robustez, não política".
- **Correção de portão guarda a invariante, não o caso.** O teste vermelho sem a correção prova a
  regra, não a instância. Recomendação preventiva é executada no lote ou entra no BACKLOG com dono.
- **Documento vivo do dono só recebe acréscimo datado** (`>> Claude (DD/MM):` ou seção nova).
  Afirmação refutada ganha nota datada ao lado. Mudança no corpo só com o "pode" dele.
- **Todo achado chega ao dono no mesmo formato:** estado atual, o que pode acarretar, opções com
  custo, recomendação amarrada a uma decisão dele, com data. Achado solto não é entregue.
- **Vale a decisão mais nova.** Confira a data antes de escrever.

## STATUS.md

Tem só três partes, sem narrativa:

1. **RETOMADA:** o que está em voo, agente por agente, próximo passo e onde está o diário.
2. **O QUE ESPERA O DONO:** decisões, cada uma com o padrão declarado.
3. **PLACAR:** funções vivas (antes e depois), estado de produção.

O SESSION_LOG tem teto de 12 linhas por leva.

## Pendências: nada órfão

Todo trabalho tem exatamente três estados: ENTREGUE (com evidência), MORTO (ramo apagado e uma linha
de registro) ou no STATUS.md com dono e próximo passo. No início e no fim de cada sessão confira:

```
git worktree list
git branch --no-merged
```

Também confira cada `>> Dono:` em `docs/` contra o código e o BACKLOG: decisão que não está
construída nem na fila é órfã, e órfã é a primeira tarefa do dia.

## Desfazer

`git reset --hard`, `git checkout -- .` e `git clean -fd` jogam fora o que não foi commitado, inclusive
o que o dono acabou de escrever num arquivo aberto. Desfazer commit é `git reset --soft HEAD~1` ou
`git revert`. Os comandos destrutivos só com `git status` limpo, a não ser pelo que você criou.
