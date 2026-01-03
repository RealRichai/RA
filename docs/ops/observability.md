# Observability

> **Last Updated:** 2026-01-03

This document describes the observability infrastructure for the RealRiches API, including Prometheus metrics, logging, and monitoring configuration.

## Prometheus Metrics

The API exposes metrics at the `/metrics` endpoint in Prometheus text format.

### Enabling Metrics

Metrics are enabled by default. The metrics plugin is registered in `apps/api/src/plugins/index.ts`:

```typescript
await app.register(metricsPlugin, {
  enabled: true,
  collectDefaultMetrics: true,
  collectBusinessMetrics: true,
  businessMetricsInterval: 60000, // Refresh business metrics every minute
});
```

### Authentication

The `/metrics` endpoint requires authentication via one of:

1. **JWT with ADMIN role**: Standard bearer token authentication
2. **X-Metrics-Token header**: Static token for Prometheus scraping

#### Setting the Metrics Token

Add `METRICS_TOKEN` to your environment:

```bash
# .env
METRICS_TOKEN=your-secure-metrics-token-here
```

Generate a secure token:

```bash
openssl rand -hex 32
```

### Available Metrics

#### HTTP Request Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `http_requests_total` | Counter | `method`, `route`, `status_code` | Total HTTP requests |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Request latency |
| `http_request_size_bytes` | Histogram | `method`, `route` | Request body size |
| `http_response_size_bytes` | Histogram | `method`, `route`, `status_code` | Response body size |
| `http_active_requests` | Gauge | `method` | Currently active requests |
| `http_errors_total` | Counter | `method`, `route`, `status_code`, `error_code` | HTTP errors |

#### Rate Limiting Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `rate_limit_hits_total` | Counter | `category`, `tier` | Rate limit violations |

#### Authentication Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `auth_attempts_total` | Counter | `type`, `status` | Login/token refresh attempts |

#### Cache Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `cache_hits_total` | Counter | `cache_type` | Cache hits |
| `cache_misses_total` | Counter | `cache_type` | Cache misses |
| `cache_operations_total` | Counter | `operation`, `status` | Cache operations |
| `cache_keys_count` | Gauge | - | Keys in cache |

#### Business Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `business_active_users` | Gauge | `role` | Active users by role |
| `business_listings_total` | Gauge | `status` | Listings by status |
| `business_leases_total` | Gauge | `status` | Leases by status |
| `business_properties_total` | Gauge | - | Total properties |
| `business_pending_payments` | Gauge | - | Pending payments |
| `business_ai_conversations_active` | Gauge | - | Active AI conversations |

#### Background Job Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `jobs_processed_total` | Counter | `job_name`, `status` | Jobs processed |
| `job_duration_seconds` | Histogram | `job_name` | Job execution time |

#### Database Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `db_query_duration_seconds` | Histogram | `operation` | Query latency |
| `db_connection_pool_size` | Gauge | `state` | Connection pool |

#### Redis Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `redis_operations_total` | Counter | `operation`, `status` | Redis operations |

#### Process Metrics (Default Node.js)

The following Node.js process metrics are collected automatically:

- `nodejs_eventloop_lag_seconds`
- `nodejs_eventloop_lag_min_seconds`
- `nodejs_eventloop_lag_max_seconds`
- `nodejs_active_handles_total`
- `nodejs_active_requests_total`
- `nodejs_heap_size_total_bytes`
- `nodejs_heap_size_used_bytes`
- `nodejs_external_memory_bytes`
- `process_cpu_user_seconds_total`
- `process_cpu_system_seconds_total`
- `process_resident_memory_bytes`
- `nodejs_version_info`

### Prometheus Scrape Configuration

Add the following to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'realriches-api'
    scrape_interval: 15s
    scrape_timeout: 10s
    metrics_path: /metrics
    scheme: https
    static_configs:
      - targets: ['api.realriches.com:443']
        labels:
          environment: 'production'
          service: 'api'
    # Option 1: Bearer token authentication (for admin users)
    # authorization:
    #   type: Bearer
    #   credentials: '<admin-jwt-token>'

    # Option 2: Custom header authentication (recommended)
    headers:
      X-Metrics-Token: '${METRICS_TOKEN}'
```

#### Local Development

```yaml
scrape_configs:
  - job_name: 'realriches-api-local'
    scrape_interval: 10s
    metrics_path: /metrics
    static_configs:
      - targets: ['localhost:4000']
    headers:
      X-Metrics-Token: 'your-local-metrics-token'
```

### Testing Metrics Locally

```bash
# With metrics token
curl -H "X-Metrics-Token: your-token" http://localhost:4000/metrics

# With admin JWT
curl -H "Authorization: Bearer <admin-jwt>" http://localhost:4000/metrics

# JSON format (for debugging)
curl -H "X-Metrics-Token: your-token" http://localhost:4000/metrics/json
```

### Example Queries

#### Request Rate

```promql
rate(http_requests_total{app="realriches-api"}[5m])
```

#### Error Rate

```promql
sum(rate(http_errors_total{app="realriches-api"}[5m]))
  / sum(rate(http_requests_total{app="realriches-api"}[5m]))
```

#### P99 Latency

```promql
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket{app="realriches-api"}[5m])) by (le, route)
)
```

#### Active Users by Role

```promql
business_active_users{app="realriches-api"}
```

#### Cache Hit Ratio

```promql
sum(rate(cache_hits_total[5m]))
  / (sum(rate(cache_hits_total[5m])) + sum(rate(cache_misses_total[5m])))
```

### Grafana Dashboard

Import the following dashboard JSON for a pre-built overview:

```json
{
  "dashboard": {
    "title": "RealRiches API",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          { "expr": "sum(rate(http_requests_total[5m])) by (status_code)" }
        ]
      },
      {
        "title": "Latency P50/P95/P99",
        "type": "graph",
        "targets": [
          { "expr": "histogram_quantile(0.50, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))" },
          { "expr": "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))" },
          { "expr": "histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))" }
        ]
      },
      {
        "title": "Memory Usage",
        "type": "graph",
        "targets": [
          { "expr": "process_resident_memory_bytes{app=\"realriches-api\"}" }
        ]
      }
    ]
  }
}
```

### Alerting Rules

Example Prometheus alerting rules:

```yaml
groups:
  - name: realriches-api
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_errors_total{app="realriches-api"}[5m]))
          / sum(rate(http_requests_total{app="realriches-api"}[5m])) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is above 5% for 5 minutes"

      - alert: HighLatency
        expr: |
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket{app="realriches-api"}[5m])) by (le)
          ) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency detected"
          description: "P95 latency is above 1 second"

      - alert: RateLimitExceeded
        expr: sum(rate(rate_limit_hits_total[5m])) > 100
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High rate limit hits"
          description: "More than 100 rate limit hits per 5 minutes"
```

### Performance Considerations

- **Minimal Overhead**: Metrics collection adds ~1-2ms per request
- **Memory**: The registry uses approximately 10-20MB for typical workloads
- **Cardinality**: Routes are normalized to prevent high-cardinality label explosion
  - UUIDs replaced with `:id` placeholder
  - Query strings stripped

### Security Notes

- **Never log the METRICS_TOKEN** - it's treated as a secret
- The metrics endpoint is rate-limited like other endpoints
- Sensitive business data is aggregated (counts only, no PII)
- JWT tokens for metrics access should have short expiry times

## Logging

Structured JSON logging via Pino. See `packages/utils/src/logger.ts`.

## Tracing

The API supports distributed tracing using OpenTelemetry (OTEL) with OTLP export.

### Enabling OpenTelemetry

Tracing is controlled via environment variables:

```bash
# Required to enable tracing
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318

# Optional configuration
OTEL_SERVICE_NAME=realriches-api          # Default: realriches-api
OTEL_TRACES_EXPORTER=otlp                  # Default: otlp (options: otlp, console, none)
OTEL_LOG_LEVEL=info                        # Default: info (options: none, error, warn, info, debug, verbose)
```

In production, tracing auto-enables when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.

### Resource Attributes

The following attributes are added to all spans:

| Attribute | Value | Description |
|-----------|-------|-------------|
| `service.name` | `OTEL_SERVICE_NAME` or `realriches-api` | Service identifier |
| `service.version` | `package.json version` | API version |
| `deployment.environment` | `NODE_ENV` | Environment (production, staging, development) |

### HTTP Span Attributes

Each HTTP request span includes:

| Attribute | Example | Description |
|-----------|---------|-------------|
| `http.method` | `GET` | HTTP method |
| `http.url` | `/api/properties/123` | Full request URL |
| `http.route` | `/api/properties/:id` | Route pattern |
| `http.host` | `api.realriches.com` | Request host |
| `http.user_agent` | `Mozilla/5.0...` | User agent string |
| `http.status_code` | `200` | Response status code |
| `http.response_time_ms` | `45.2` | Response time in milliseconds |
| `http.request_id` | `req-abc123` | Fastify request ID |
| `request.id` | `req-abc123` | Correlation ID for logs |

### Request-ID Correlation

Trace IDs are correlated with request IDs in logs for easy debugging:

```json
{
  "level": "info",
  "requestId": "req-abc123",
  "trace.id": "a1b2c3d4e5f6789012345678901234567",
  "span.id": "abcd1234efgh5678",
  "service.name": "realriches-api",
  "msg": "Request processed"
}
```

### OTLP Collector Configuration

#### Jaeger

```yaml
# docker-compose.yml
services:
  jaeger:
    image: jaegertracing/all-in-one:1.53
    ports:
      - "16686:16686"  # UI
      - "4318:4318"    # OTLP HTTP
    environment:
      - COLLECTOR_OTLP_ENABLED=true
```

```bash
# API environment
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318
```

#### Grafana Tempo

```yaml
# docker-compose.yml
services:
  tempo:
    image: grafana/tempo:2.3.1
    command: ["-config.file=/etc/tempo.yaml"]
    ports:
      - "4318:4318"
    volumes:
      - ./tempo.yaml:/etc/tempo.yaml
```

```yaml
# tempo.yaml
server:
  http_listen_port: 3200

distributor:
  receivers:
    otlp:
      protocols:
        http:

storage:
  trace:
    backend: local
    local:
      path: /tmp/tempo/blocks
```

#### AWS X-Ray (via ADOT Collector)

```yaml
# docker-compose.yml
services:
  adot-collector:
    image: amazon/aws-otel-collector:latest
    command: ["--config=/etc/otel-config.yaml"]
    environment:
      - AWS_REGION=us-east-1
    ports:
      - "4318:4318"
```

### Ignored Paths

The following paths are excluded from tracing to reduce noise:

- `/health`
- `/health/live`
- `/health/ready`
- `/metrics`
- `/favicon.ico`

### Custom Spans

Create custom spans for application-level instrumentation:

```typescript
// In route handler
app.get('/api/complex-operation', async (request, reply) => {
  // Create a child span
  const span = app.otel.createSpan('database-query');

  try {
    // Your code here
    span.setAttributes({ 'db.statement': 'SELECT...' });
  } finally {
    span.end();
  }
});
```

### Legacy Tracing Headers

For backwards compatibility, the API also supports custom trace headers via the tracing plugin:

| Header | Description |
|--------|-------------|
| `X-Trace-ID` | Trace identifier |
| `X-Span-ID` | Span identifier |
| `X-Parent-Span-ID` | Parent span for distributed traces |

See `apps/api/src/plugins/tracing.ts` for the legacy implementation.

### Testing

Run OTEL smoke tests:

```bash
cd apps/api
NODE_ENV=test npx vitest run --config vitest.otel.config.ts
```

### Troubleshooting

**Tracing not working?**
1. Check `OTEL_ENABLED=true` is set
2. Verify `OTEL_EXPORTER_OTLP_ENDPOINT` points to a valid collector
3. Set `OTEL_LOG_LEVEL=debug` for detailed initialization logs

**High cardinality warnings?**
- Routes are normalized (`:id` placeholders) to prevent cardinality explosion
- Query strings are stripped from URLs
- Consider increasing `ignorePaths` in plugin config

**Performance impact?**
- Minimal overhead (~1-2ms per request)
- Spans are batched before export
- Use sampling for high-traffic production environments
