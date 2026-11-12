#!/bin/sh
set -eu
: "${DB_PASSWORD:?Missing application database password}"
: "${POSTGRES_PASSWORD:?Missing administrator database password}"
[ "$DB_PASSWORD" != "$POSTGRES_PASSWORD" ] || { echo 'Database passwords must be distinct.' >&2; exit 1; }

# psql reads the secret from its environment, quotes it as data and never receives it as an argument.
psql -X --set=ON_ERROR_STOP=1 --username postgres --dbname sijilmassa <<'SQL' >/dev/null
\getenv app_password DB_PASSWORD
SELECT format('CREATE ROLE clinic_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L',
              :'app_password') \gexec
GRANT CONNECT ON DATABASE sijilmassa TO clinic_app;
GRANT USAGE, CREATE ON SCHEMA public TO clinic_app;
SQL
