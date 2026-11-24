#!/usr/bin/env bash
# Optional stronger English model. This script is never run by the scanner.
set -eu
dir=${1:?Usage: bash scripts/ocr/best-english.sh MODEL_DIRECTORY [EXPECTED_SHA256]}
expected=${2:-8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba}
revision=9ddc24e750eec0994223a9edc3fcb434a2244f3b
source_url="https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/$revision/eng.traineddata"
if [ -n "$expected" ] && ! printf '%s' "$expected" | grep -Eq '^[0-9a-fA-F]{64}$'; then
  printf '%s\n' 'Expected SHA-256 must contain exactly 64 hexadecimal characters.' >&2
  exit 2
fi
mkdir -p "$dir"
dir=$(cd "$dir" && pwd)
if [ -e "$dir/eng.traineddata" ]; then
  printf '%s\n' 'The destination already contains eng.traineddata. Use a separate model directory.' >&2
  exit 2
fi
temporary=$(mktemp "$dir/.eng-best.XXXXXX")
trap 'rm -f "$temporary"' EXIT HUP INT TERM
curl --silent --show-error --fail --location --retry 2 "$source_url" -o "$temporary"
digest=$(sha256sum "$temporary" | cut -d ' ' -f 1)
if [ -n "$expected" ] && [ "$(printf '%s' "$expected" | tr 'A-F' 'a-f')" != "$digest" ]; then
  printf '%s\n' 'Model checksum mismatch. The model was not installed.' >&2
  exit 1
fi
mv "$temporary" "$dir/eng.traineddata"
printf '{"repository":"tesseract-ocr/tessdata_best","revision":"%s","language":"eng","sha256":"%s","license":"Apache-2.0"}\n' "$revision" "$digest" > "$dir/eng.manifest.json"
printf '%s\n' "Installed pinned tessdata_best English model; SHA-256: $digest"
printf '%s\n' 'Evaluate with RR_OCR_TESSDATA_DIR set to this directory before promoting it.'
