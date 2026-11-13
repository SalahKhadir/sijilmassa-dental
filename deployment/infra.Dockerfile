FROM docker.io/library/postgres:17.12-bookworm@sha256:40865bc877a289da75963d97d72b59633f639fc5af7a4e856bfa3714cae5b536 AS database
RUN rm -f /etc/ssl/private/ssl-cert-snakeoil.key /etc/ssl/certs/ssl-cert-snakeoil.pem
COPY --chmod=755 deployment/postgres-init/01-clinic-user.sh /docker-entrypoint-initdb.d/
CMD ["postgres", "-c", "ssl=off", "-c", "log_min_error_statement=panic", "-c", "log_error_verbosity=terse"]

FROM docker.io/library/caddy:2.11.9-alpine@sha256:0bbb055bda6793c999bde78b1b5ce3e89f829fb031af2cf50056ea1246559fee AS gateway
COPY deployment/Caddyfile /etc/caddy/Caddyfile
