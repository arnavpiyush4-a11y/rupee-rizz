#!/usr/bin/env bash
set -eu
dir=${1:?Usage: bash scripts/ocr/models.sh MODEL_DIRECTORY}
mkdir -p "$dir"
for lang in eng hin ori; do
 curl --fail --location --retry 2 "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/$lang.traineddata" -o "$dir/$lang.traineddata"
done
(cd "$dir" && sha256sum -c - <<'SUM'
7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2  eng.traineddata
4c73ffc59d497c186b19d1e90f5d721d678ea6b2e277b719bee4e2af12271825  hin.traineddata
36f3135e61d501a3acfad41f5fe60b8e791274fff4c5375c969fdcca980cdbac  ori.traineddata
SUM
)
