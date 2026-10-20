# Domingo na Paulista

Jogo multiplayer no navegador: uma manifestação na Avenida Paulista com salas privadas para jogar com os amigos.
Escolha seu lado e seu visual, leve bandeira ou cartaz, converse no chat e ande pela avenida até o MASP.

## Como rodar

Precisa do [Node.js](https://nodejs.org) 18 ou mais novo.

```
npm install
npm start
```

Abra http://localhost:3333. Para usar outra porta: `set PORT=8080 && npm start` (Windows).

## Como jogar com os amigos

Quem usa o mesmo **código de sala** entra na mesma avenida. Dentro do jogo, o botão **Copiar convite** gera o link com a sala.

**Mesma rede (Wi-Fi de casa):** ao iniciar, o servidor mostra os endereços "Na rede local", por exemplo
`http://192.168.10.156:3333`. Mande esse endereço para os amigos. Se o Windows perguntar, libere o Node.js no firewall.

**Pela internet, sem configurar roteador:** com o servidor rodando, abra outro terminal e use um túnel:

```
npx cloudflared tunnel --url http://localhost:3333
```

Ele mostra um link `https://...trycloudflare.com`: mande para os amigos. O ngrok também serve: `ngrok http 3333`.

**Endereço fixo (já configurado):** https://manifestacao.mvalabs.com.br — túnel `manifestacao` do Cloudflare,
configurado em `cloudflared.yml`. Dê dois cliques em `iniciar.bat` para subir o servidor e o túnel juntos.

**Deixar no ar 24h:** publique a pasta num serviço que rode Node.js com WebSocket (Render, Railway, Fly.io).
O comando de início é `npm start`, e a porta vem da variável `PORT`.

## Controles

| Ação | PC | Celular |
|---|---|---|
| Andar | WASD ou setas | joystick na esquerda |
| Correr | Shift | empurrar o joystick até o fim |
| Pular | Espaço | botão vermelho |
| Girar a câmera | Q/E ou arrastar | arrastar a tela |
| Aproximar/afastar | rodinha do mouse | arrastar para cima/baixo |
| Conversar | Enter | tocar na caixa de texto |

## Arquivos

- `server.js` — servidor HTTP + WebSocket: salas, posições e chat (até 50 por sala)
- `public/game.js` — cena 3D (Three.js), personagens, controles e rede
- `public/index.html`, `public/style.css` — tela inicial e interface
