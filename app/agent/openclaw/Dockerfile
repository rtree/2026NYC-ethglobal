FROM ghcr.io/openclaw/openclaw:latest

USER root
COPY entrypoint.sh /app/intentos-openclaw-entrypoint.sh
COPY vertex-bridge.mjs /app/intentos-vertex-bridge.mjs
RUN chmod 755 /app/intentos-openclaw-entrypoint.sh
USER node

ENTRYPOINT ["tini", "-s", "--"]
CMD ["sh", "/app/intentos-openclaw-entrypoint.sh"]
