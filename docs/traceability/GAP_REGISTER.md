# Gap Register

> **Version:** 1.0.0
> **Last Updated:** 2026-01-01
> **Audit Commit:** 0e8e8637b2138317c4793fb8a7b641d202f8847b

This document tracks all features marked as **Partial** or **Missing** in the Master Implementation Ledger, along with remediation plans and acceptance criteria.

---

## Gap Summary

| ID | Category | Feature | Status | Priority | Owner |
|----|----------|---------|--------|----------|-------|
| GAP-001 | Mobile | React Native App | Missing | P2 | Mobile Team |
| GAP-002 | Mobile | Offline Mode | Missing | P3 | Mobile Team |
| GAP-003 | Mobile | Biometric Auth | Missing | P2 | Mobile Team |
| GAP-004 | Multi-Market | Full i18n System | Missing | P3 | Frontend Team |
| GAP-005 | Observability | Prometheus Metrics | Missing | P2 | Platform Team |
| GAP-006 | Observability | Distributed Tracing | Missing | P2 | Platform Team |
| GAP-007 | Observability | External Alerting | Partial | P2 | Platform Team |

---

## Detailed Gap Analysis

### GAP-001: React Native Mobile Application

**Category:** Mobile
**Status:** Missing
**Priority:** P2 - High
**Owner:** Mobile Team

#### Description
No native mobile application exists. The web application is responsive but lacks native mobile capabilities.

#### Business Impact
- Limited mobile user experience
- No access to native device features (camera for 3D capture, push notifications)
- Competitive disadvantage in mobile-first market

#### Remediation Plan
1. **Phase 1: Foundation**
   - Set up React Native project with Expo
   - Configure shared packages (@realriches/types, @realriches/utils)
   - Implement authentication flow with JWT
   - Create navigation structure

2. **Phase 2: Core Features**
   - Property browsing and search
   - Listing details with 3D tour viewer (WebView)
   - User dashboard and profile
   - Push notification integration

3. **Phase 3: Advanced Features**
   - Native 3D capture workflow
   - Offline document viewing
   - Biometric authentication

#### Acceptance Criteria
- [ ] iOS and Android apps published to respective stores
- [ ] Authentication working with existing API
- [ ] Push notifications delivered successfully
- [ ] 3D tour viewing functional on mobile
- [ ] App performance metrics: <3s cold start, 60fps scrolling

#### Dependencies
- `GAP-003` (Biometric Auth) can be implemented as part of this
- Push notification infrastructure already exists (`DeviceRegistration` model)

---

### GAP-002: Offline Mode

**Category:** Mobile
**Status:** Missing
**Priority:** P3 - Medium
**Owner:** Mobile Team

#### Description
No offline data synchronization capability exists for mobile or web applications.

#### Business Impact
- Poor user experience in low-connectivity areas
- Cannot view critical documents offline
- Agents cannot access property info during showings without connectivity

#### Remediation Plan
1. **Phase 1: Offline Storage**
   - Implement AsyncStorage/MMKV for React Native
   - Define offline data schema (properties, leases, documents metadata)
   - Create sync queue for offline mutations

2. **Phase 2: Sync Engine**
   - Implement conflict resolution strategy (last-write-wins with merge)
   - Background sync with retry logic
   - Delta sync to minimize data transfer

3. **Phase 3: Document Caching**
   - PDF/document caching with encryption at rest
   - Cache invalidation strategy
   - Storage quota management

#### Acceptance Criteria
- [ ] Core data (properties, leases) viewable offline
- [ ] Mutations queued and synced when online
- [ ] Conflict resolution working correctly
- [ ] Documents cached for offline viewing
- [ ] Cache cleared on logout
- [ ] Storage usage <100MB for typical user

#### Dependencies
- `GAP-001` (React Native App) must be completed first

---

### GAP-003: Biometric Authentication

**Category:** Mobile
**Status:** Missing
**Priority:** P2 - High
**Owner:** Mobile Team

#### Description
No Face ID / Touch ID authentication support for mobile applications.

#### Business Impact
- Increased friction for repeat logins
- Lower security posture (users may choose weak PINs)
- Missing expected mobile feature

#### Remediation Plan
1. **Implementation Steps**
   - Integrate `expo-local-authentication` or `react-native-biometrics`
   - Store encrypted refresh token in secure enclave
   - Add biometric enrollment flow post-login
   - Implement fallback to PIN/password

2. **Security Considerations**
   - Never store passwords, only refresh tokens
   - Require re-authentication for sensitive operations
   - Timeout biometric auth after inactivity

#### Acceptance Criteria
- [ ] Face ID / Touch ID working on iOS
- [ ] Fingerprint working on Android
- [ ] Fallback to password available
- [ ] Tokens stored in secure enclave/keystore
- [ ] Biometric can be disabled in settings
- [ ] Re-authentication required for payment/signature operations

#### Dependencies
- `GAP-001` (React Native App) must be completed first

---

### GAP-004: Full Internationalization (i18n) System

**Category:** Multi-Market / i18n
**Status:** Missing
**Priority:** P3 - Medium
**Owner:** Frontend Team

#### Description
While currency and date formatting exists, there is no comprehensive translation system for UI strings. UK market (UK_GDPR) exists but UI is English-only.

#### Business Impact
- Cannot expand to non-English markets
- Limited accessibility for non-English speakers
- UK market functional but not fully localized

#### Remediation Plan
1. **Phase 1: Infrastructure**
   - Add `react-i18next` to web app
   - Create translation file structure (`/locales/{lang}/{namespace}.json`)
   - Extract all hardcoded strings to translation keys
   - Implement locale detection and switching

2. **Phase 2: Content Translation**
   - English (en-US) as base language
   - British English (en-GB) for UK market
   - Spanish (es) for US Hispanic market
   - Define translation workflow with external service

3. **Phase 3: Advanced Features**
   - RTL support for future markets
   - Pluralization rules
   - Date/number formatting per locale
   - Legal document translations

#### Acceptance Criteria
- [ ] All UI strings extracted to translation files
- [ ] Language switcher in user settings
- [ ] Browser locale detection working
- [ ] en-US, en-GB, es translations complete
- [ ] Compliance disclosures translated correctly
- [ ] No hardcoded strings in codebase

#### Dependencies
- None - can be implemented independently

---

### GAP-005: Prometheus Metrics Endpoint

**Category:** Observability
**Status:** Missing
**Priority:** P2 - High
**Owner:** Platform Team

#### Description
No `/metrics` endpoint exposing Prometheus-compatible metrics for infrastructure monitoring.

#### Business Impact
- Limited visibility into system health
- Cannot integrate with standard monitoring stacks
- Manual debugging required for performance issues

#### Remediation Plan
1. **Implementation Steps**
   - Add `fastify-metrics` plugin with Prometheus registry
   - Define custom metrics:
     - `http_request_duration_seconds` (histogram)
     - `http_requests_total` (counter by status, method, route)
     - `active_connections` (gauge)
     - `database_query_duration_seconds` (histogram)
     - `redis_operations_total` (counter)
     - `email_queue_depth` (gauge)
     - `tour_conversion_queue_depth` (gauge)
   - Secure endpoint (internal network only or auth required)

2. **Integration**
   - Configure Prometheus scrape config
   - Create Grafana dashboards
   - Set up alerting rules in Alertmanager

#### Acceptance Criteria
- [ ] `/metrics` endpoint returns Prometheus format
- [ ] HTTP request metrics captured
- [ ] Database query metrics captured
- [ ] Queue depth metrics available
- [ ] Grafana dashboards created
- [ ] SLO alerts configured (p99 latency, error rate)

#### Dependencies
- None - can be implemented independently

---

### GAP-006: Distributed Tracing (OpenTelemetry)

**Category:** Observability
**Status:** Missing
**Priority:** P2 - High
**Owner:** Platform Team

#### Description
No distributed tracing capability to track requests across services and identify bottlenecks.

#### Business Impact
- Difficult to debug cross-service issues
- Cannot identify slow dependencies
- Limited root cause analysis capability

#### Remediation Plan
1. **Phase 1: Instrumentation**
   - Add `@opentelemetry/sdk-node` and auto-instrumentation packages
   - Configure OTLP exporter (Jaeger, Zipkin, or cloud provider)
   - Add trace context propagation to HTTP clients
   - Instrument Prisma queries

2. **Phase 2: Custom Spans**
   - Add spans for workflow executions
   - Add spans for partner API calls
   - Add spans for AI provider calls
   - Tag spans with user/tenant context

3. **Phase 3: Integration**
   - Deploy Jaeger or use cloud tracing (AWS X-Ray, GCP Cloud Trace)
   - Create trace-based alerts
   - Link traces to logs

#### Acceptance Criteria
- [ ] All HTTP requests have trace IDs
- [ ] Database queries appear in traces
- [ ] Partner API calls instrumented
- [ ] Trace IDs in log output
- [ ] Jaeger/tracing UI accessible
- [ ] Can trace request from web to database

#### Dependencies
- None - can be implemented independently

---

### GAP-007: External Alerting Integration

**Category:** Observability
**Status:** Partial
**Priority:** P2 - High
**Owner:** Platform Team

#### Description
Slack notifications exist in deploy workflow, but no comprehensive alerting integration (PagerDuty, OpsGenie, etc.) for production incidents.

#### Current State
- Slack notifications in `deploy.yml` for deployment status
- Agent alerts in `@realriches/agent-governance` (internal queue)
- DLQ alerts in `@realriches/email-service` (callback-based)

#### Missing Components
- PagerDuty/OpsGenie integration for on-call escalation
- Structured incident management
- Alert routing rules
- Runbook links

#### Remediation Plan
1. **Phase 1: PagerDuty Integration**
   - Create PagerDuty service
   - Configure escalation policies
   - Create integration key for API alerts
   - Add webhook for deployment notifications

2. **Phase 2: Alert Routing**
   - Define severity levels (P1-P4)
   - Route alerts by category:
     - Infrastructure → Platform on-call
     - Compliance violations → Compliance team
     - Payment failures → Finance team
     - Agent incidents → AI team
   - Configure alert deduplication

3. **Phase 3: Runbooks**
   - Create runbook for each alert type
   - Link runbooks in alert metadata
   - Document escalation procedures

#### Acceptance Criteria
- [ ] PagerDuty/OpsGenie account configured
- [ ] Critical alerts (P1/P2) page on-call
- [ ] Non-critical alerts (P3/P4) create tickets
- [ ] Alert routing by category working
- [ ] Runbooks linked to alerts
- [ ] Test alerts working end-to-end

#### Dependencies
- `GAP-005` (Prometheus Metrics) recommended but not required

---

## Remediation Timeline

| Gap ID | Target Completion | Status |
|--------|-------------------|--------|
| GAP-005 | Q1 2026 | Not Started |
| GAP-006 | Q1 2026 | Not Started |
| GAP-007 | Q1 2026 | In Progress (Slack exists) |
| GAP-004 | Q2 2026 | Not Started |
| GAP-001 | Q2-Q3 2026 | Not Started |
| GAP-002 | Q3 2026 | Not Started |
| GAP-003 | Q3 2026 | Not Started |

---

## Risk Assessment

### High Risk Gaps
- **GAP-005/006 (Observability)**: Limited visibility into production issues; should be prioritized

### Medium Risk Gaps
- **GAP-007 (Alerting)**: Partial mitigation exists; complete solution needed for SOC2
- **GAP-001 (Mobile)**: Business requirement but not blocking current operations

### Low Risk Gaps
- **GAP-002/003 (Mobile features)**: Nice-to-have after mobile app exists
- **GAP-004 (i18n)**: Only needed for international expansion

---

## Acceptance Sign-Off

| Gap ID | Implemented By | Reviewed By | Sign-Off Date |
|--------|---------------|-------------|---------------|
| GAP-001 | | | |
| GAP-002 | | | |
| GAP-003 | | | |
| GAP-004 | | | |
| GAP-005 | | | |
| GAP-006 | | | |
| GAP-007 | | | |

---

*This document is maintained alongside the Master Implementation Ledger and should be updated when gaps are resolved.*
