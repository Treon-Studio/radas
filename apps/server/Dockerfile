# Phoenix (Elixir) API server image — replaces the retired Flask server image.
FROM hexpm/elixir:1.18.5-erlang-27.3.4.17-alpine-3.21.7 AS build

RUN apk add --no-cache build-base git postgresql-client

WORKDIR /app

ENV MIX_ENV=prod

COPY mix.exs mix.lock ./
COPY config config
RUN mix deps.get && mix deps.compile

COPY lib lib
COPY priv priv
RUN mix compile

RUN mix release

FROM alpine:3.21

RUN apk add --no-cache libstdc++ openssl ncurses-libs tzdata && \
    addgroup -S app && adduser -S app -G app

WORKDIR /app
COPY --from=build /app/_build/prod/rel/radas ./
COPY --from=build /app/priv/registry ./priv/registry

ENV DATA_DIR=/app/data
RUN mkdir -p /app/data && chown -R app:app /app
USER app

EXPOSE 4000
CMD ["bin/radas", "start"]
