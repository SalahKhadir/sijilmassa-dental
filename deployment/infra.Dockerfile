FROM docker.io/library/postgres:17.11-bookworm AS database
COPY --chmod=755 deployment/postgres-init/01-clinic-user.sh /docker-entrypoint-initdb.d/
CMD ["postgres", "-c", "log_min_error_statement=panic", "-c", "log_error_verbosity=terse"]

FROM docker.io/library/caddy:2.10.2-alpine AS gateway
COPY deployment/Caddyfile /etc/caddy/Caddyfile
