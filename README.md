# Chão de Fábrica

Uma software house de agentes para o Claude Code: papéis com modelos fixos, esteira de produção,
portões de QA e red-team, documentos que qualquer agente consegue retomar, e paradas automáticas no
limite de uso, com volta sozinha quando a janela renova.

## Instalar

Abra o Claude Code na pasta do seu projeto e cole:

```
Instale a fábrica de https://github.com/rgbarsotti/chao-de-fabrica seguindo o INSTALAR.md do repositório.
```

O Claude baixa o repositório, lê o instalador, pergunta se é **só para este projeto** ou para **todos
os projetos**, instala, verifica e avisa quando reiniciar.

Prefere fazer à mão:

```
git clone --depth 1 https://github.com/rgbarsotti/chao-de-fabrica
cd chao-de-fabrica
node install.mjs
```

**Requisitos:** Claude Code, Node 18 ou mais novo e Git. O medidor de consumo (barra, SALVAR e parada)
depende de um número que o Claude Code só fornece em contas Pro, Max e Ultra. Em conta de API, todo o
resto funciona, e os ganchos avisam que estão sem leitura.

## O que vem na caixa

**O roster.** 13 agentes especializados, cada um com modelo cativo: tech-lead, planning, QA
adversarial, advisor (red-team), gestor de projetos, backend, frontend, dados, design/UX, docs,
golden sets, pesquisador e auditor de simplicidade. Veja ou troque o modelo com `trocar-modelo.mjs`.

**A esteira.** Duas pistas. Lane 1 para ajuste pequeno, direto. Lane 2 para feature de verdade:
shaping, desenho aprovado, bancada, executores em paralelo, portão, um ciclo de ajustes, merge e
deploy. A cada 10 ajustes pequenos, uma varredura.

**O caminho do código, sem exceção:**

```
executor no worktree -> suíte da área -> commit no ramo
  -> suíte COMPLETA no ramo (orquestrador)
  -> portão: QA, depois advisor, uma passada
  -> um ciclo de ajustes -> merge na principal
  -> deploy, só com o "pode" do dono
```

**Portões que provam.** Parecer só vale com veredito, reprodução executada de cada bloqueante e brief
de correção pronto. Toda correção vem com o teste que fica vermelho sem ela.

**Paradas automáticas:**

- 90% da janela de 5 h: o orquestrador salva tudo, para os agentes e agenda a volta para 5 minutos
  depois da renovação.
- 93% da janela semanal: o mesmo, com a volta 5 minutos depois da virada da semana.
- 96% em qualquer janela: o gancho nega toda ferramenta, exceto salvar o estado e agendar a volta.

**A barra de status.**

```
[ minha-sessao ]  |  Opus  |  meu-projeto (main)
[####------] [ 38% ] ctx  |  5h [ 23% ] (zera 17:00) falta 2h30  |  sem [ 41% ] (zera ter)
```

**Documentos que sobrevivem à queda.** `STATUS.md` para retomar, `docs/DECISOES.md` só com acréscimo
datado, `SESSION_LOG` em duas batidas, `docs/_progresso` com o que foi produzido e `_processos/_logs`
com o diário de cada agente. Rode `/iniciar-fabrica` em cada projeto novo para criar a estrutura.

**Travas mecânicas.** Bloqueiam comando que despeja credencial e arquivo gravado com pendência
escondida ou segredo no código. Compactação de contexto só passa com o diário em dia, e tem anti-loop.

As regras completas estão em [`payload/rules/`](payload/rules/).

## Comandos do dia a dia

Escritos sozinhos na primeira linha da mensagem:

```
estado das travas
soltar trava 5h                  (prazo opcional: 12h, 2d, "até 22/09 05:00")
soltar trava semana
armar trava 5h
armar trava semana
armar travas
```

## Ajustar

Os limiares e a margem do despertador ficam em `.claude/chao-de-fabrica/config.json`:

```json
{ "salvar5h": 90, "salvar7d": 93, "parar5h": 96, "parar7d": 96, "margemMin": 5 }
```

Sem acesso ao modelo Fable? Nada muda: todos os agentes usam Opus, Sonnet ou Haiku.

Com janela de contexto de 1 milhão de tokens, `/autocompact 333000` faz a compactação acontecer perto
de 30% do visor. Nunca use valores perto de 100 mil: o gatilho fica abaixo do tamanho do contexto
pós-compactação e a sessão entra em loop.

## O que o instalador muda

- **Todos os projetos:** `~/.claude/rules/fabrica-*`, `~/.claude/agents/fabrica-*`,
  `~/.claude/skills/iniciar-fabrica`, `~/.claude/chao-de-fabrica/` e `~/.claude/settings.json`.
- **Só este projeto:** o mesmo dentro de `.claude/`, com a configuração em
  `.claude/settings.local.json`, e cria `STATUS.md`, `docs/` e `_processos/` sem sobrescrever nada.

Seus ganchos e configurações continuam lá. Se você já tem barra de status, ela é substituída, porque
os ganchos dependem da nossa para ler o consumo, e volta ao desinstalar. Instalar de novo é seguro.

## Desinstalar

```
node install.mjs --escopo global --desinstalar
node install.mjs --escopo projeto --alvo <pasta> --desinstalar
```

Na desinstalação de projeto, `STATUS.md`, `docs/` e `_processos/` ficam: são dados seus.

## Limites conhecidos

- O despertador pertence à sessão. Fechou o terminal, reabra com `claude --continue` antes da hora.
- O gancho instrui o modelo a salvar e agendar; quem executa é o modelo.
- As regras foram escritas em português e a linguagem dos agentes segue essa.

## Testes

```
node --test test/fabrica.test.mjs
```

## Licença

MIT. A barra de status deriva de um projeto MIT; veja [THIRD-PARTY.md](THIRD-PARTY.md).
