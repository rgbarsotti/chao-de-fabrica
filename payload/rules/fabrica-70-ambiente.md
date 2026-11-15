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

## WSL ocioso se desliga sozinho (gancho `wsl-ocioso`)

A VM do WSL sobe a cada `wsl.exe` e continua segurando 1 GB ou mais de RAM depois que o comando acaba.
O gancho `wsl-ocioso` (PostToolUse, assíncrono, só no Windows) desliga a VM quando ninguém mais a usa:
sem `wsl.exe` rodando no Windows, sem processo de usuário nem container dentro da VM, conferido duas
vezes. Dúvida ou erro = não desliga.

- Provado em uso real: em uma semana de trabalho com várias sessões em paralelo, 295 decisões
  registradas, 96 desligamentos, 155 manutenções por uso de outra sessão, zero erro e zero trabalho
  perdido.
- **Consequência para quem usa o WSL:** passos que dependem de a VM continuar ligada vão numa ÚNICA
  chamada `wsl.exe` (um script), não em comandos soltos. Serviço que precisa ficar de pé fica de pé
  por conta própria (container ou processo vivo seguram a VM).
- Não chame `wsl.exe` só para olhar processo: isso liga a VM.
- Registro: `chao-de-fabrica/estado/wsl_ocioso.log`. Desligar o gancho: criar
  `chao-de-fabrica/estado/wsl_ocioso_desligado.json`.

## Armadilhas que já custaram caro

- **`wsl.exe -- bash -lc "..."` expande `$VAR` no lado do Windows antes de o bash ver.** Uma variável
  vazia transformou `rm -rf "$DIR/x"` em `rm -rf /x` e apagou uma home inteira. Comando com variável
  vai num script em arquivo, rodado com `wsl.exe -e bash /caminho/script.sh`. Nunca `rm -rf` com
  variável numa linha passada pelo `wsl.exe`.
- **No Git Bash do Windows, o caractere de porcentagem quebra comandos e o heredoc pode comer barra
  invertida.** Texto com esses caracteres vai por arquivo escrito pela ferramenta de escrita.
- **Máquina sem RAM para a suíte:** rode a suíte num servidor descartável na nuvem (cria, roda no ramo
  commitado, colhe o número, destrói com prova). Prova melhor que a local, porque é ambiente limpo.
- **Container descartável a partir da imagem do serviço:** passe `--entrypoint` explícito (por exemplo
  `--entrypoint python`). Sem isso, o comando padrão da imagem sobe uma segunda cópia do serviço vivo.
- **Script remoto não vai por stdin.** `ssh host bash < script.sh` quebra quando um comando do script
  (como `docker compose exec -T`) consome o resto da entrada. Copie o script (`scp`) e rode do arquivo
  com `< /dev/null`.
- **Operação longa no servidor roda destacada** (`docker exec -d ...` ou `nohup`), com saída num log
  que você lê depois. A sessão SSH local cai por falta de memória ou rede; a operação não pode cair
  junto.
