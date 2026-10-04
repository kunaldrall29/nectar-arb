#!/usr/bin/env bash
set -euo pipefail
export DISPLAY="${DISPLAY:-:1}"
URL="http://127.0.0.1:3000"
google-chrome --no-first-run --disable-infobars --window-size=1280,800 "$URL" &
sleep 4
xdotool search --onlyvisible --class chrome windowactivate 2>/dev/null || true
sleep 2
# Markets
xdotool key ctrl+l; xdotool type "$URL/markets"; xdotool key Return
sleep 3
# Liquidity
xdotool key ctrl+l; xdotool type "$URL/liquidity"; xdotool key Return
sleep 3
# Overview
xdotool key ctrl+l; xdotool type "$URL/"; xdotool key Return
sleep 3
# API health in terminal via zenity? skip - run curl in notification
sleep 2
