# Ambiente

- **No Windows, todo teste, servidor local e simulação roda no WSL.** Falhas que só existem no Windows
  poluem o sinal; no WSL, falha que aparece é falha de verdade. Windows só para o que é do Windows.
- **Paridade com o CI é o alvo.** Suíte local que passa por NÃO ter a ferramenta é falso verde.
  Registre as divergências.
- **Instale só por canal homologado:** gerenciador de pacotes oficial ou dependência já declarada no
  projeto. Nunca binário de URL avulsa, nunca `curl | bash`.
- **Suítes longas em primeiro plano,** com `timeout: 600000`. Esse é o máximo da ferramenta: acima
  dele o comando vai para segundo plano. Se a suíte se aproximar do teto, divida em duas chamadas
  em primeiro plano e reporte a soma com as parcelas.
- **Antes de culpar o ambiente por um gargalo,** confira se o brief não pede ao executor trabalho que
  o método atribui a outro papel.
