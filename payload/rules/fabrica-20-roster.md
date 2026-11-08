# O roster: uma software house com papéis e modelos cativos

Cada papel tem modelo fixo, por alias (atualiza sozinho para o mais novo do tier). A fonte da verdade
do modelo é o campo `model:` de cada agente. Para ver ou trocar:

```
node <pasta .claude>/chao-de-fabrica/trocar-modelo.mjs                       (tabela)
node <pasta .claude>/chao-de-fabrica/trocar-modelo.mjs fabrica-qa fable      (um papel)
node <pasta .claude>/chao-de-fabrica/trocar-modelo.mjs --de opus --para sonnet
```

| Papel | Agente | Modelo |
|---|---|---|
| Orquestrador | sessão principal | opus |
| Tech-lead: reparte e integra | fabrica-tech-lead | opus |
| Planning: shaping e specs | fabrica-planning | opus |
| QA adversarial (portão) | fabrica-qa | opus |
| Advisor / red-team (portão) | fabrica-advisor | opus |
| Gestor de projetos | fabrica-projetos | sonnet |
| Backend | fabrica-backend | sonnet |
| Frontend | fabrica-frontend | sonnet |
| Dados e telemetria | fabrica-dados | sonnet |
| Design / UX | fabrica-design-ux | sonnet |
| Documentação | fabrica-docs | sonnet |
| Auditor de simplicidade | fabrica-auditor | sonnet |
| Golden sets e evals | fabrica-golden-sets | haiku |
| Pesquisador de fatos | fabrica-pesquisador | haiku |

**Divisão de tiers.** Opus: planejamento, gestão, portão, integração. Sonnet: o grosso da execução.
Haiku: pesquisa e evals. Texto normativo sobe de tier, mesmo quando o executor é backend: guardrail,
política de bot e regra que um modelo obedece em produção são concepção.

**Sem override.** O orquestrador lança cada agente no modelo do roster. Subir de tier exige o "pode"
do dono para aquele agente e aquela tarefa.

## Disciplina de executor: o brief padrão diz tudo isto

- **Não lança portão nem subagente.** Ao terminar, devolve. Quem aciona o portão é o orquestrador.
- **Diário em `_processos/_logs/<processo>/<label>.md`** desde a primeira linha.
- **Commit a cada ~10 minutos de trabalho,** com o estado REAL na mensagem. No aviso de SALVAR,
  commit imediato e encerra.
- **Colhe síncrono.** Suíte em primeiro plano, com timeout declarado. Relatório "aguardando
  resultado", sem número, não é entrega.
- **Suíte da ÁREA.** A suíte completa roda uma vez, pelo orquestrador. Nove executores rodando a
  suíte inteira ao mesmo tempo viram gargalo de máquina; o defeito é do brief, não do paralelismo.
- **Brief carrega as decisões do dono e os documentos do setor.**
- **Validade de cerca de 2 ciclos de portão.** Depois disso, salva o estado e lança executor novo a
  partir do diário.
- Toda mutação começa gravando "mutação X em curso" no diário e termina com `git status` limpo.
- Delegou, confie. Não refaça o trabalho do subagente.

## Paralelismo

- Agentes paralelos vão numa única mensagem, um worktree por executor.
- Máximo de 3 agentes no modelo mais caro ao mesmo tempo.
- Nenhum agente novo acima de 60% da janela de 5 h.
- Agentes de desenho antes dos de execução: o que já está no disco não se perde.
- Agente interrompido é retomado por `SendMessage`, com o contexto intacto, nunca relançado do zero.
