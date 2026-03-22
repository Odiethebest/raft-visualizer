FROM node:22-alpine AS frontend-build
WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM golang:1.26-alpine AS backend-build
WORKDIR /src/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/raft-visualizer ./main.go

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=backend-build /out/raft-visualizer /app/raft-visualizer
COPY --from=frontend-build /src/frontend/dist /app/static
ENV PORT=8080
ENV STATIC_DIR=/app/static
EXPOSE 8080
ENTRYPOINT ["/app/raft-visualizer"]
