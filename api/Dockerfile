FROM golang:1.26-alpine

RUN apk add --no-cache git gcc musl-dev libwebp-dev

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

EXPOSE 8080

CMD ["go", "run", "."]
