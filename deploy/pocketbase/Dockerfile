# enForma sync server: PocketBase, one Go binary with SQLite inside.
# Pinned; bump deliberately and re-run the migrations against a staging copy.
FROM alpine:3.22

ARG PB_VERSION=0.40.1

RUN apk add --no-cache ca-certificates unzip wget \
  && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" -O /tmp/pb.zip \
  && unzip /tmp/pb.zip -d /pb \
  && rm /tmp/pb.zip \
  && apk del unzip wget

COPY pb_migrations /pb/pb_migrations

EXPOSE 8090

# pb_data lives on a volume (see docker-compose.yml); migrations apply on boot.
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--migrationsDir=/pb/pb_migrations"]
