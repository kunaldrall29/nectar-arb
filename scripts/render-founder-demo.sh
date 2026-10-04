#!/usr/bin/env bash
# Builds /opt/cursor/artifacts/nectar_founder_demo.mp4 (UI capture + founder voiceover).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ART=/opt/cursor/artifacts
mkdir -p "$ART"
export PATH="$HOME/.foundry/bin:$PATH"

# Ensure on-chain demo state (liquidation receipt on anvil)
(cd "$ROOT/backend" && pnpm exec tsx ../scripts/e2e-smoke.ts) >/dev/null

# Next.js
SESSION=nectar-web-demo
tmux -f /exec-daemon/tmux.portal.conf has-session -t "=$SESSION" 2>/dev/null || \
  tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$SESSION" -c "$ROOT" -- "pnpm web"
sleep 8

# Playwright capture
cd "$ROOT/web"
pnpm exec playwright install chromium
pnpm exec playwright test -c playwright.demo.config.ts 2>/dev/null || true
RAW=$(find test-results -name '*.webm' 2>/dev/null | head -1)
if [[ -z "$RAW" ]]; then
  find "$ROOT/web" -name '*.webm' -print
  echo "No webm found"; exit 1
fi

# Voiceover
pip install -q edge-tts
VO="$ART/nectar_voice.mp3"
"$HOME/.local/bin/edge-tts" --voice en-US-AriaNeural --rate "+5%" --file "$ROOT/scripts/founder-voiceover.txt" --write-media "$VO"

ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$VO" >/dev/null

OUT="$ART/nectar_founder_demo.mp4"
ffmpeg -y -i "$RAW" -i "$VO" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$OUT"
ffprobe -v error -show_entries stream=codec_type -of csv=p=0 "$OUT" | grep -q audio
echo "Wrote $OUT"
