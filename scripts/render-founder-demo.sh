#!/usr/bin/env bash
# Full founder demo: live UI writes on anvil + keeper agent + ~2–3 min voiceover.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ART=/opt/cursor/artifacts
AGENT_SESSION=nectar-agent-demo
export PATH="$HOME/.foundry/bin:$HOME/.local/bin:$PATH"
mkdir -p "$ART"

echo "== Fresh local deploy =="
cast rpc anvil_reset --rpc-url http://127.0.0.1:8545 >/dev/null 2>&1 || true
(cd "$ROOT/contracts" && forge build >/dev/null)
bash "$ROOT/scripts/deploy.sh" local
node "$ROOT/scripts/gen-abis.mjs"

echo "== Start keeper agent =="
rm -f "$ROOT/backend/data/events-"*.json "$ROOT/backend/data/jobs-"*.json 2>/dev/null || true
tmux -f /exec-daemon/tmux.portal.conf kill-session -t "=$AGENT_SESSION" 2>/dev/null || true
tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$AGENT_SESSION" -c "$ROOT" \
  -- "env NECTAR_NETWORK=local POLL_MS=2500 pnpm agent"
sleep 2

echo "== Start Next.js (demo burner wallet) =="
fuser -k 3000/tcp 2>/dev/null || true
sleep 1
cd "$ROOT"
NEXT_PUBLIC_NECTAR_DEMO=1 pnpm web > /tmp/nectar-web.log 2>&1 &
WEB_PID=$!
cleanup() { kill "$WEB_PID" 2>/dev/null || true; }
trap cleanup EXIT
for i in $(seq 1 90); do
  if curl -sf http://127.0.0.1:3000/ >/dev/null; then
    echo "Next ready after ${i}s"
    break
  fi
  sleep 1
done
curl -sf http://127.0.0.1:3000/ >/dev/null || { tail -30 /tmp/nectar-web.log; exit 1; }

echo "== Playwright record =="
cd "$ROOT/web"
pnpm exec playwright test -c playwright.demo.config.ts demo.full.ts

RAW=$(find test-results -name 'video.webm' 2>/dev/null | head -1)
[[ -n "$RAW" ]] || { echo "No webm captured"; exit 1; }

echo "== Voiceover =="
VO="$ART/nectar_voice.mp3"
"$HOME/.local/bin/edge-tts" --voice en-US-AriaNeural --rate=-5% --file "$ROOT/scripts/founder-voiceover.txt" --write-media "$VO"

VDUR=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$RAW")
ADUR=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$VO")
echo "video=${VDUR}s audio=${ADUR}s"

OUT="$ART/nectar_founder_demo.mp4"
if awk -v a="$ADUR" -v v="$VDUR" 'BEGIN { exit !(a < v - 2) }'; then
  R=$(awk -v v="$VDUR" -v a="$ADUR" 'BEGIN { printf "%.4f", v/a }')
  ffmpeg -y -i "$RAW" -i "$VO" -filter:a "atempo=${R}" -c:v libx264 -pix_fmt yuv420p -c:a aac -map 0:v:0 -map 1:a:0 -shortest "$OUT"
else
  ffmpeg -y -i "$RAW" -i "$VO" -c:v libx264 -pix_fmt yuv420p -c:a aac -map 0:v:0 -map 1:a:0 -shortest "$OUT"
fi

FIN=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT")
HAS_A=$(ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "$OUT")
echo "Wrote $OUT duration=${FIN}s audio=$HAS_A"
