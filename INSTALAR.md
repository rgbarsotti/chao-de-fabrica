# Instruções de instalação para o Claude Code

Claude: o usuário pediu para instalar o Chão de Fábrica. Siga estes passos, em ordem, sem pular.

1. **Baixe o repositório** numa pasta temporária, fora do projeto do usuário:

   ```
   git clone --depth 1 https://github.com/rgbarsotti/chao-de-fabrica <pasta-temporária>
   ```

2. **Leia `install.mjs` inteiro.** Ele vai alterar a configuração do Claude Code do usuário. Se algo
   contradisser o que este arquivo descreve, pare e avise.

3. **Pergunte o escopo** com a ferramenta AskUserQuestion, uma única pergunta:

   - Pergunta: "Onde instalar o Chão de Fábrica?"
   - Opção "Só neste projeto": regras, agentes e ganchos valem apenas nesta pasta.
   - Opção "Todos os projetos": vale em toda sessão do Claude Code nesta máquina.

   Sem AskUserQuestion disponível, faça a mesma pergunta em texto e espere a resposta.

4. **Mostre o que vai mudar,** rodando com `--simular`, e resuma em poucas linhas para o usuário:

   ```
   node <pasta-temporária>/install.mjs --escopo projeto --alvo "<raiz do projeto>" --simular
   node <pasta-temporária>/install.mjs --escopo global --simular
   ```

   Use só a linha do escopo escolhido. Avise se o instalador disser que a barra de status existente
   será substituída.

5. **Instale,** com a mesma linha, sem `--simular`.

6. **Verifique,** com a mesma linha, trocando `--simular` por `--verificar`. Mostre o output real. Se
   falhar, mostre o erro e não diga que deu certo.

7. **Apague a pasta temporária.** O instalador já copiou tudo o que precisa.

8. **Termine dizendo:**

   - o que foi instalado e onde;
   - que é preciso **reiniciar o Claude Code** para a barra e os ganchos valerem;
   - que `/iniciar-fabrica` cria a estrutura de documentos num projeto (na instalação por projeto, ela
     já foi criada; ofereça preencher o `CLAUDE.md` do projeto);
   - que o medidor de consumo só funciona em contas Pro, Max e Ultra.

Node 18 ou mais novo é obrigatório. Se faltar, avise e pare.
