@echo off
rem Sobe o jogo e o tunel do Cloudflare (https://manifestacao.mvalabs.com.br)
cd /d "%~dp0"
start "Domingo na Paulista - servidor" cmd /k npm start
start "Domingo na Paulista - tunel" cmd /k cloudflared tunnel --config "%~dp0cloudflared.yml" run manifestacao
echo Jogo no ar em https://manifestacao.mvalabs.com.br
