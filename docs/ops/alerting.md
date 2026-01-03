# External Alerting System

The `@realriches/alerting` package provides a unified alerting system with support for Slack, PagerDuty, and OpsGenie providers.

## Overview

The alerting system routes alerts based on severity to appropriate external services:

| Severity | Default Providers |
|----------|-------------------|
| `info` | Slack only |
| `warning` | Slack + OpsGenie |
| `critical` | Slack + PagerDuty + OpsGenie |

## Quick Start

```typescript
import { createAlertRouterFromEnv, getAlertRouter } from '@realriches/alerting';

// Initialize from environment variables
const router = createAlertRouterFromEnv();

// Route an alert
const result = await router.route({
  id: 'alert-123',
  source: 'kill_switch',
  severity: 'critical',
  title: 'Kill Switch Activated',
  message: 'Emergency kill switch activated for all agents',
  context: {
    market: 'NYC',
    agentType: 'lease_assistant',
  },
  timestamp: new Date(),
});

if (result.ok) {
  console.log(`Alert sent to ${result.value.responses.length} providers`);
}
```

## Environment Variables

### Global Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `ALERTING_COOLDOWN_SECONDS` | Deduplication cooldown window | `300` |
| `ALERTING_RETRY_ATTEMPTS` | Number of retry attempts | `3` |
| `ALERTING_TIMEOUT_MS` | Request timeout in milliseconds | `10000` |

### Slack Provider

| Variable | Description | Required |
|----------|-------------|----------|
| `ALERTING_SLACK_ENABLED` | Enable Slack alerts | No (default: `false`) |
| `ALERTING_SLACK_WEBHOOK_URL` | Slack incoming webhook URL | Yes (if enabled) |
| `ALERTING_SLACK_CHANNEL` | Override channel (optional) | No |
| `ALERTING_SLACK_USERNAME` | Bot username | No |
| `ALERTING_SLACK_ICON_EMOJI` | Bot icon emoji | No |

### PagerDuty Provider

| Variable | Description | Required |
|----------|-------------|----------|
| `ALERTING_PAGERDUTY_ENABLED` | Enable PagerDuty alerts | No (default: `false`) |
| `ALERTING_PAGERDUTY_ROUTING_KEY` | PagerDuty Events API v2 routing key | Yes (if enabled) |
| `ALERTING_PAGERDUTY_API_URL` | Custom API URL (optional) | No |

### OpsGenie Provider

| Variable | Description | Required |
|----------|-------------|----------|
| `ALERTING_OPSGENIE_ENABLED` | Enable OpsGenie alerts | No (default: `false`) |
| `ALERTING_OPSGENIE_API_KEY` | OpsGenie API key | Yes (if enabled) |
| `ALERTING_OPSGENIE_API_URL` | Custom API URL (optional) | No |

## Alert Sources

The system supports the following alert sources:

| Source | Description |
|--------|-------------|
| `kill_switch` | Agent governance kill switch activation |
| `policy_violation` | Policy violation detection |
| `dlq_growth` | Dead letter queue growth threshold exceeded |
| `compliance_failure` | Compliance enforcement failure |
| `queue_health` | Job queue health issues |
| `cost_threshold` | Cost threshold exceeded |

## Deduplication

Alerts with the same deduplication key are suppressed within the cooldown window (default: 5 minutes). This prevents alert flooding during incident storms.

```typescript
// These two alerts will be deduplicated
await router.route({
  id: 'alert-1',
  deduplicationKey: 'kill-switch-lease-assistant',
  // ...
});

await router.route({
  id: 'alert-2',
  deduplicationKey: 'kill-switch-lease-assistant', // Same key
  // ...
}); // This will be deduplicated
```

## Severity Mapping

### Slack Colors

| Severity | Color |
|----------|-------|
| `critical` | `#ff0000` (Red) |
| `warning` | `#ff9900` (Orange) |
| `info` | `#0099ff` (Blue) |

### PagerDuty Severity

| Internal | PagerDuty |
|----------|-----------|
| `critical` | `critical` |
| `warning` | `warning` |
| `info` | `info` |

### OpsGenie Priority

| Internal | OpsGenie |
|----------|----------|
| `critical` | `P1` |
| `warning` | `P3` |
| `info` | `P4` |

## Evidence Logging

Every alert dispatch is logged for SOC2 compliance (Control CC7.4):

```json
{
  "msg": "alert_evidence",
  "controlId": "CC7.4",
  "category": "Security",
  "eventType": "alert.dispatched",
  "eventOutcome": "success",
  "summary": "Alert alert-123 dispatched to slack, pagerduty, opsgenie",
  "details": {
    "alertId": "alert-123",
    "source": "kill_switch",
    "severity": "critical",
    "providers": ["slack", "pagerduty", "opsgenie"],
    "successCount": 3,
    "failureCount": 0,
    "deduplicated": false
  }
}
```

## Test Mode

For development and testing, you can disable providers or use test credentials:

```bash
# Disable all external alerts
ALERTING_SLACK_ENABLED=false
ALERTING_PAGERDUTY_ENABLED=false
ALERTING_OPSGENIE_ENABLED=false
```

The router will continue to validate and deduplicate alerts, but won't send them externally.

## Provider Setup

### Slack

1. Create a Slack App at https://api.slack.com/apps
2. Enable Incoming Webhooks
3. Add a webhook to your workspace
4. Copy the webhook URL to `ALERTING_SLACK_WEBHOOK_URL`

### PagerDuty

1. Create a service in PagerDuty
2. Add an Events API v2 integration
3. Copy the routing key to `ALERTING_PAGERDUTY_ROUTING_KEY`

### OpsGenie

1. Create an API key in OpsGenie (Settings > API key management)
2. Copy the key to `ALERTING_OPSGENIE_API_KEY`

## API Reference

### AlertRouter

```typescript
class AlertRouter {
  // Route an alert to appropriate providers
  route(alert: AlertRequest): Promise<Result<AlertRouterResult, Error>>;

  // Get router statistics
  getStats(): { cachedAlerts: number; providerCount: number };

  // Shutdown router (clears dedup cache)
  shutdown(): void;
}
```

### AlertRequest

```typescript
interface AlertRequest {
  id: string;                         // Unique alert ID
  source: AlertSource;                // Alert source
  severity: 'info' | 'warning' | 'critical';
  title: string;                      // Short title
  message: string;                    // Detailed message
  context?: {
    market?: string;
    tenantId?: string;
    agentType?: string;
    entityType?: string;
    entityId?: string;
  };
  targetProviders?: AlertProviderType[];  // Override routing
  deduplicationKey?: string;              // Custom dedup key
  timestamp: Date;
}
```

### AlertRouterResult

```typescript
interface AlertRouterResult {
  alertId: string;
  responses: AlertResponse[];
  allSuccessful: boolean;
  deduplicated: boolean;
  evidenceRecorded: boolean;
}
```
