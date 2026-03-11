FROM golang:1.22-alpine AS builder
RUN apk add --no-cache git
WORKDIR /app
ENV GOPROXY=direct
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o lb .

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /app/lb .
EXPOSE 8080
CMD ["./lb"]
