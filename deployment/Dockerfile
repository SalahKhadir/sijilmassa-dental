FROM docker.io/library/node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS node-build
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /build/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN npm install --global pnpm@12.6.0 && pnpm install --frozen-lockfile
COPY frontend/ ./
RUN BACKEND_INTERNAL_URL=http://127.0.0.1:9 pnpm exec next build --webpack \
    && pnpm build:prescription-renderer \
    && sha256sum .prescription-renderer/manifest.json | cut -d ' ' -f 1 > worker.sha256

FROM docker.io/library/eclipse-temurin:21-jdk-jammy@sha256:432e54724c3e57d1846aeb886f4d339f3b0522931c4e64119c2797013b7cfc3c AS java-build
WORKDIR /build
COPY backend/ backend/
COPY docs/references/pdf-templates/ docs/references/pdf-templates/
COPY frontend/public/fonts/ frontend/public/fonts/
WORKDIR /build/backend
RUN ./mvnw -B -ntp -Dmaven.test.skip=true package

FROM docker.io/library/eclipse-temurin:21-jre-jammy@sha256:dff6eb46527bd293a3c06bbbe9e64e8c9f91f01905b5abbdad31761c03059d2c AS backend
WORKDIR /app
COPY --from=node-build /usr/local/bin/node /usr/local/bin/node
COPY --from=node-build /build/frontend/node_modules /app/node_modules
COPY --from=node-build /build/frontend/.prescription-renderer /app/.prescription-renderer
COPY --from=node-build /build/frontend/worker.sha256 /app/worker.sha256
COPY --from=java-build /build/backend/target/sijilmassa-backend-0.1.0-SNAPSHOT.jar /app/backend.jar
COPY deployment/backend-start.sh /app/backend-start.sh
ENV JAVA_TOOL_OPTIONS=-Djava.awt.headless=true
USER 10001:10001
ENTRYPOINT ["/bin/sh", "/app/backend-start.sh"]

FROM docker.io/library/node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS frontend
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# Next.js starts directly with Node. Package installation belongs in node-build.
RUN rm -rf /usr/local/lib/node_modules/npm /opt/yarn-v* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
COPY --from=node-build /build/frontend/package.json /build/frontend/next.config.ts ./
COPY --from=node-build /build/frontend/node_modules ./node_modules
COPY --chown=node:node --from=node-build /build/frontend/.next ./.next
COPY --from=node-build /build/frontend/public ./public
USER node
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
