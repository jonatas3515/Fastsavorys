@echo off
chcp 65001 > nul
title FastSavory's - Minerador de Ofertas Mercado Livre

echo =============================================================
echo   FASTSAVORY'S - MINERAÇÃO LOCAL DE OFERTAS MERCADO LIVRE
echo =============================================================
echo.

node "%~dp0scripts\minerar-ml-local.js"

echo.
echo Pressione qualquer tecla para fechar esta janela...
pause > nul
