#!/usr/bin/env bash
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
open_browser=true
if [[ ${1:-} == --no-open ]]; then
    open_browser=false
    shift
fi
fail() { printf '%s\n' "$*" >&2; exit 1; }
[[ $# == 0 ]] || fail 'Utilisation : ./dev.sh [--no-open]'
for command in docker node curl setsid flock; do
    command -v "$command" >/dev/null || fail "Commande manquante : $command"
done
[[ -x ${JAVA_HOME:-/nonexistent}/bin/java ]] || command -v java >/dev/null ||
    fail 'Installez un JDK ou renseignez JAVA_HOME.'
[[ -f "$root/backend/.env" ]] ||
    fail 'Préparez backend/.env à partir de backend/.env.example avec deux mots de passe de développement distincts.'
[[ -x "$root/frontend/node_modules/.bin/next" ]] ||
    fail 'Installez les dépendances avec pnpm --dir frontend install --frozen-lockfile.'

pids=()
engine_pid=
engine_dir=
cleanup() {
    local pid
    for pid in "${pids[@]}"; do kill -TERM -- "-$pid" 2>/dev/null || true; done
    for pid in "${pids[@]}"; do wait "$pid" 2>/dev/null || true; done
    if [[ -n $engine_pid ]]; then
        kill "$engine_pid" 2>/dev/null || true
        wait "$engine_pid" 2>/dev/null || true
    fi
    if [[ -n $engine_dir ]]; then rm -rf -- "$engine_dir"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# The checkout directory is the lock. No extra file is needed.
exec 9<"$root"
flock -n 9 || fail 'Le lanceur est déjà actif pour ce dépôt.'

# Keep development on loopback and tied to the existing development Compose database.
backend_port=$(
    cd "$root/backend"
    # The existing development configuration is a local, shell-compatible file.
    set -a
    source ./.env
    set +a
    [[ ${SPRING_PROFILES_ACTIVE:-} == dev && ${POSTGRES_DB:-} == sijilmassa_dev &&
       ${DB_URL:-} == "jdbc:postgresql://127.0.0.1:${POSTGRES_PORT:-5432}/sijilmassa_dev" &&
       -n ${DB_USERNAME:-} && -n ${DB_PASSWORD:-} && -n ${POSTGRES_ADMIN_PASSWORD:-} &&
       $DB_PASSWORD != "$POSTGRES_ADMIN_PASSWORD" ]] ||
        fail 'Vérifiez backend/.env : profil dev, base locale sijilmassa_dev et mots de passe distincts.'
    printf '%s\n' "${SERVER_PORT:-8080}"
)
frontend_port=${DEV_FRONTEND_PORT:-3000}
for port in "$backend_port" "$frontend_port"; do
    [[ $port =~ ^[1-9][0-9]{0,4}$ ]] && (( port <= 65535 )) || fail "Port de développement invalide : $port"
done
[[ $backend_port != "$frontend_port" ]] || fail 'Choisissez deux ports distincts pour Spring Boot et Next.js.'
for port in "$backend_port" "$frontend_port"; do
    node -e 'const s = require("node:net").createServer(); s.on("error", () => process.exit(1)); s.listen(Number(process.argv[1]), "127.0.0.1", () => s.close());' "$port" ||
        fail "Le port $port est déjà occupé. Arrêtez le serveur existant ou choisissez un autre port."
done

if ! docker info >/dev/null 2>&1; then
    [[ -z ${DOCKER_HOST:-} && -z ${DOCKER_CONTEXT:-} ]] ||
        fail 'Le moteur configuré dans DOCKER_HOST ou DOCKER_CONTEXT est inaccessible.'
    command -v podman >/dev/null || fail 'Démarrez Docker pour lancer PostgreSQL.'
    engine_dir=$(mktemp -d /tmp/sijilmassa-dev.XXXXXX)
    podman system service --time=0 "unix://$engine_dir/podman.sock" >"$engine_dir/service.log" 2>&1 9<&- &
    engine_pid=$!
    export DOCKER_HOST="unix://$engine_dir/podman.sock"
    for (( attempt=0; attempt<100; attempt++ )); do
        [[ ! -S "$engine_dir/podman.sock" ]] || break
        kill -0 "$engine_pid" 2>/dev/null || break
        sleep 0.1
    done
    docker info >/dev/null 2>&1 || fail 'Démarrez Docker ou vérifiez que Podman rootless peut démarrer sur votre PC.'
fi
docker compose version >/dev/null || fail 'Docker Compose est requis.'

printf 'Démarrage de PostgreSQL…\n'
(
    cd "$root/backend"
    set -a
    source ./.env
    set +a
    docker compose --env-file .env up -d --no-recreate --wait --wait-timeout 60 postgres
)

start_backend() {
    cd "$root/backend"
    set -a
    source ./.env
    set +a
    unset POSTGRES_ADMIN_PASSWORD
    export SPRING_PROFILES_ACTIVE=dev SERVER_ADDRESS=127.0.0.1 SERVER_PORT="$backend_port"
    exec setsid ./mvnw -Dmaven.test.skip=true spring-boot:run
}
wait_for_http() {
    local pid=$1 url=$2 status=$3 label=$4 deadline=$((SECONDS + 180))
    while (( SECONDS < deadline )); do
        kill -0 "$pid" 2>/dev/null || fail "$label s’est arrêté. Consultez les messages ci-dessus."
        if [[ $(curl --silent --noproxy '*' --max-time 2 --output /dev/null --write-out '%{http_code}' "$url" || true) == "$status" ]]; then
            return
        fi
        sleep 1
    done
    fail "$label ne répond pas après 180 secondes. Consultez les messages ci-dessus."
}

printf 'Démarrage de Spring Boot…\n'
start_backend 9<&- &
pids+=("$!")
backend_url="http://127.0.0.1:$backend_port"
wait_for_http "${pids[0]}" "$backend_url/actuator/health" 200 'Spring Boot'

printf 'Démarrage de Next.js…\n'
(
    cd "$root/frontend"
    export BACKEND_INTERNAL_URL="$backend_url"
    exec setsid ./node_modules/.bin/next dev --hostname 127.0.0.1 --port "$frontend_port"
) 9<&- &
pids+=("$!")
frontend_url="http://127.0.0.1:$frontend_port"
wait_for_http "${pids[1]}" "$frontend_url/login" 200 'Next.js'
wait_for_http "${pids[1]}" "$frontend_url/api/v1/auth/me" 401 'Le proxy de session'

printf '\nSijilmassa Dental : %s/login\nCtrl+C arrête Spring Boot et Next.js. PostgreSQL reste disponible.\n\n' "$frontend_url"
if $open_browser && command -v xdg-open >/dev/null && [[ -n ${DISPLAY:-}${WAYLAND_DISPLAY:-} ]]; then
    xdg-open "$frontend_url/login" >/dev/null 2>&1 9<&- &
fi

if ! wait -n "${pids[@]}"; then
    fail 'Un serveur de développement s’est arrêté. Consultez les messages ci-dessus.'
fi
