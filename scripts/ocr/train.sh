#!/usr/bin/env bash
# Supply curated, licensed single-line image/.gt.txt pairs from training folds only.
set -eu
: "${TESTRAIN_DIR:?Set path to upstream tesseract-ocr/tesstrain checkout}"
: "${GROUND_TRUTH_DIR:?Set path to line images paired with .gt.txt transcriptions}"
: "${TESSDATA_BEST:?Set path to floating-point tessdata_best starting weights}"
lang=${1:-eng}
case "$lang" in
  eng|hin|ori) ;;
  *) printf '%s\n' 'Use eng, hin or ori as the starting language.' >&2; exit 2 ;;
esac
[ -d "$TESTRAIN_DIR" ] || { printf '%s\n' 'TESTRAIN_DIR must be an existing upstream tesstrain checkout.' >&2; exit 2; }
[ -d "$GROUND_TRUTH_DIR" ] || { printf '%s\n' 'GROUND_TRUTH_DIR must be an existing directory of checked line pairs.' >&2; exit 2; }
[ -f "$TESSDATA_BEST/$lang.traineddata" ] || { printf '%s\n' 'The requested floating-point starting model is missing.' >&2; exit 2; }
printf '%s\n' "Training rr_$lang. Training completion does not install or approve this candidate."
make -C "$TESTRAIN_DIR" training MODEL_NAME="rr_$lang" START_MODEL="$lang" TESSDATA="$TESSDATA_BEST" GROUND_TRUTH_DIR="$GROUND_TRUTH_DIR" MAX_ITERATIONS="${MAX_ITERATIONS:-2000}"
printf '%s\n' "Evaluate rr_$lang.traineddata on untouched receipts before selecting it with RR_OCR_LANG_EN, RR_OCR_LANG_HI or RR_OCR_LANG_OR."
