#!/bin/sh

set -eu

# Build a deduplicated model list from OLLAMA_MODEL plus optional CSV candidates.
primary_model="${OLLAMA_MODEL:-}"
candidate_models="${OLLAMA_MODEL_CANDIDATES:-}"

models_csv=""
if [ -n "$primary_model" ]; then
  models_csv="$primary_model"
fi
if [ -n "$candidate_models" ]; then
  if [ -n "$models_csv" ]; then
    models_csv="$models_csv,$candidate_models"
  else
    models_csv="$candidate_models"
  fi
fi

if [ -z "$models_csv" ]; then
  echo "No Ollama models configured (OLLAMA_MODEL / OLLAMA_MODEL_CANDIDATES). Skipping bootstrap pull."
  exit 0
fi

until ollama list >/dev/null 2>&1; do
  echo "Waiting for Ollama server..."
  sleep 1
done

# Split CSV and pull missing models.
IFS=','
seen=""
for raw_model in $models_csv; do
  model=$(echo "$raw_model" | xargs)
  [ -z "$model" ] && continue

  case ",$seen," in
    *",$model,"*) continue ;;
    *) seen="$seen,$model" ;;
  esac

  if ! ollama show "$model" >/dev/null 2>&1; then
    echo "Model $model not found, pulling..."
    ollama pull "$model"
  else
    echo "Model $model already exists"
  fi
done
