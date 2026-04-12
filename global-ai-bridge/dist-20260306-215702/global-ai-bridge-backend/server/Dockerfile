FROM golang:1.26 AS build

WORKDIR /app
COPY go.mod ./
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/aibridge ./cmd/server

FROM gcr.io/distroless/base-debian12

WORKDIR /app
COPY --from=build /out/aibridge /app/aibridge
EXPOSE 8080
ENTRYPOINT ["/app/aibridge"]
