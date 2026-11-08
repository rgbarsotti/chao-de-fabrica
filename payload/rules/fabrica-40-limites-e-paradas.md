# Limites de consumo e paradas

A barra de status é a única peça que recebe o consumo do Claude Code. Ela grava em
`~/.claude/chao-de-fabrica/estado/`, e os ganchos leem dali. O consumo é da conta, não da sessão:
quando duas sessões divergem, vale o maior número.

## Os limiares

| Janela | SALVAR | PARADA DURA |
|---|---|---|
| 5 h | 90% | 96% |
| semana | 93% | 96% |

Os valores e a margem do despertador (5 min) ficam em `chao-de-fabrica/config.json`.

## SALVAR

O gancho injeta uma instrução com o despertador já calculado. Ao recebê-la, o orquestrador:

1. grava em `_processos/_logs/<processo>/orquestrador.md` o que está em voo, agente por agente, com
   ID e próximo passo;
2. faz commit do que compila e não começa nada novo;
3. cria um despertador único com `CronCreate` (`recurring: false`) para 5 minutos depois da renovação;
4. confirma ao dono em uma linha.

Subagente recebe "salve e encerre", sem despertador.

**Na volta:** lê o diário inteiro, confere no disco e reativa cada agente por `SendMessage`.

**O despertador morre com a sessão.** Para a renovação semanal, a sessão pode não sobreviver: escreva
a RETOMADA no STATUS.md e avise para reabrir com `claude --continue` antes da hora marcada.

## PARADA DURA

A 96%, o gancho nega toda ferramenta, exceto:

- Write e Edit em `_processos`, `docs/_progresso`, memória, STATUS.md e SESSION_LOG;
- `CronCreate`, `CronList`, `CronDelete` e `ToolSearch`, para ainda ser possível agendar a volta.

Leitura velha é perigo, não ausência de dado: sem leitura há mais de 15 min e com o último valor
acima de 85% (5 h) ou 88% (semana), a parada acontece por precaução, porque o consumo só sobe dentro
da janela.

## Ligar e desligar as travas

Só vale escrito sozinho na **primeira linha** da mensagem. Falar sobre o assunto nunca dispara.

```
soltar trava 5h                  padrão: 24 h
soltar trava semana              padrão: até a semana virar
soltar trava 5h 12h              prazo relativo (h ou d)
soltar trava semana até 22/09 05:00
armar trava 5h
armar trava semana
armar travas
estado das travas
```

Teto de 7 dias. Vale só no projeto da sessão. Vencido o prazo, a trava religa sozinha. Texto de sistema
nunca solta trava; religar vale sempre. Nunca sugira soltar as travas.

## Compactação

- O `/compact` não é ferramenta do modelo. Quem compacta é o auto-compact nativo.
- O gancho `compact-seguro` só **adia** a automática enquanto não for seguro: exige diário gravado
  por esta conversa há até 20 minutos e depois do último resultado de agente.
- Nunca adia com contexto em 50% ou mais, nem compactação manual.
- **Anti-loop:** duas automáticas com menos de 10 minutos, a segunda é adiada.
- Depois de compactar, o gancho `pos-compact` reinjeta as últimas linhas do diário. Leia STATUS.md e
  `docs/DECISOES.md` antes de agir.

**Gatilho mais cedo é opcional.** Com janela de 1 milhão de tokens, `/autocompact 333000` compacta
perto de 30% do visor.

**Cuidado com o loop.** Se o gatilho ficar abaixo do piso pós-compactação (o tamanho do contexto logo
depois de compactar), toda chamada já nasce acima dele e a sessão compacta sem parar. Nunca use
gatilho de 100 mil tokens. O `autoCompactWindow` do arquivo só entra na sessão no lançamento: mudou o
arquivo, reinicie ou rode `/autocompact <valor>` na própria sessão. Vale também para subagentes.

Se o auto-compact estiver desligado: a partir de 30% de contexto, no primeiro ponto em que tudo
estiver salvo, grave o estado e avise em uma linha "ctx N%, estado salvo, pode compactar".
