#!/bin/sh
set -eu
: "${DB_PASSWORD:?Missing database application password}"
: "${CLINIC_RELEASE:?Missing application release}"
export PRESCRIPTION_RENDERING_MANIFEST_SHA256
PRESCRIPTION_RENDERING_MANIFEST_SHA256=$(cat /app/worker.sha256)
exec java -jar /app/backend.jar "$@"
