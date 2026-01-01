# SOC2 Controls & Evidence System

This document describes the SOC2 Trust Services Criteria controls implemented in the RealRiches platform and how evidence is captured for audit purposes.

## Overview

The evidence system captures auditable artifacts across SOC2 Trust Services Criteria categories:

- **Security** - Logical access controls, credential management, privileged access
- **Availability** - System uptime and reliability monitoring
- **Processing Integrity** - Compliance enforcement and data validation
- **Confidentiality** - Data access controls and encryption
- **Privacy** - Data subject access and export capabilities

## Evidence Record Structure

Each evidence record contains:

| Field | Description |
|-------|-------------|
| `id` | Unique identifier |
| `controlId` | SOC2 control reference (e.g., CC6.1) |
| `category` | Trust Services Criteria category |
| `eventType` | Specific event (e.g., auth.login_success) |
| `eventOutcome` | Result: success, failure, allowed, blocked |
| `summary` | Human-readable description |
| `details` | Structured event data (JSON) |
| `contentHash` | SHA-256 hash for integrity verification |
| `previousHash` | Hash chain link to prior record |
| `actorId` | User or system that performed action |
| `organizationId` | Organization scope |
| `occurredAt` | Timestamp of event |

## SOC2 Control Mappings

### CC6 - Logical and Physical Access Controls

#### CC6.1 - Logical Access Security

The entity implements logical access security over protected information assets.

**Evidence Events:**
- `auth.login_success` - Successful authentication
- `auth.login_failed` - Failed authentication attempt
- `auth.logout` - User session termination
- `auth.token_refresh` - Session token rotation
- `auth.email_verified` - Email verification completed
- `auth.account_locked` - Account locked due to failed attempts
- `auth.account_unlocked` - Account unlocked

#### CC6.2 - Access Provisioning

Prior to issuing system credentials, the entity registers and authorizes users.

**Evidence Events:**
- `auth.token_revoked` - Access tokens revoked
- `auth.logout_all` - All sessions terminated

#### CC6.3 - Credential Management

The entity authorizes, modifies, or removes access to credentials.

**Evidence Events:**
- `auth.password_changed` - Password updated
- `auth.password_reset_requested` - Password reset initiated
- `auth.password_reset_completed` - Password reset finished

#### CC6.6 - Third-Party Access

Logical access security for external/programmatic access.

**Evidence Events:**
- `admin.api_key_created` - API key generated
- `admin.api_key_updated` - API key modified
- `admin.api_key_disabled` - API key disabled
- `admin.api_key_enabled` - API key re-enabled
- `admin.api_key_revoked` - API key permanently revoked
- `admin.api_key_rotated` - API key rotated

#### CC6.7 - Privileged Access

Privileged access activities are monitored.

**Evidence Events:**
- `admin.impersonation_started` - Admin began impersonating user
- `admin.impersonation_ended` - Admin ended impersonation
- `admin.impersonation_force_ended` - Impersonation forcibly terminated
- `admin.bulk_operation_initiated` - Bulk admin operation started
- `admin.system_setting_changed` - System configuration modified
- `admin.role_assigned` - Role granted to user
- `admin.role_revoked` - Role removed from user

#### CC6.8 - Security Event Detection

Detection and action on unauthorized or malicious software.

**Evidence Events:**
- `auth.token_reuse_detected` - Refresh token reuse (potential compromise)
- `auth.suspicious_activity` - Suspicious activity detected

### CC7 - System Operations

#### CC7.2 - System Monitoring

The entity monitors system components for compliance and security.

**Evidence Events:**
- `compliance.gate_passed` - Compliance check passed, operation allowed
- `compliance.gate_blocked` - Compliance violation, operation blocked

### P6 - Privacy Disclosure and Notification

#### P6.1 - Data Subject Access

The entity provides data subjects access to their personal information.

**Evidence Events:**
- `data.export_requested` - Data export initiated
- `data.export_completed` - Data export finished
- `data.export_downloaded` - Data export downloaded by user
- `data.export_failed` - Data export failed

### C1 - Confidentiality

#### C1.1 - Confidential Information Protection

The entity identifies and maintains confidential information.

**Evidence Events:**
- `data.access_granted` - Access to confidential data granted
- `data.access_denied` - Access to confidential data denied

## Integrity Verification

Evidence records include cryptographic integrity features:

### Content Hash

Each record's `details` field is hashed using SHA-256:
```
contentHash = SHA256(canonicalJSON(details))
```

The canonical JSON ensures deterministic hashing regardless of key order.

### Chain Linking

Records are linked via `previousHash`, creating an append-only chain:
```
record[n].previousHash = record[n-1].contentHash
```

This allows detection of any tampering or deletion.

## API Endpoints

### Query Evidence

```http
GET /api/v1/admin/evidence
```

Query parameters:
- `organizationId` - Filter by organization
- `tenantId` - Filter by tenant
- `controlId` - Filter by SOC2 control
- `category` - Filter by Trust Services category
- `eventType` - Filter by event type prefix
- `startDate` / `endDate` - Date range
- `page` / `limit` - Pagination

### Verify Record Integrity

```http
GET /api/v1/admin/evidence/:id/verify
```

Returns integrity verification result with hash comparison.

### Generate Audit Report

```http
GET /api/v1/admin/evidence/audit-report?startDate=...&endDate=...
```

Returns summary statistics by category, control, and outcome.

### Verify Chain Integrity

```http
GET /api/v1/admin/evidence/chain-verify?startDate=...&endDate=...
```

Verifies chain integrity for the specified time range.

### List Controls

```http
GET /api/v1/admin/evidence/controls
```

Returns all SOC2 controls with evidence counts.

## Usage Examples

### Query Security Events for Audit

```bash
curl -X GET "https://api.realriches.com/api/v1/admin/evidence?category=Security&startDate=2024-01-01&endDate=2024-01-31" \
  -H "Authorization: Bearer $TOKEN"
```

### Verify Specific Record

```bash
curl -X GET "https://api.realriches.com/api/v1/admin/evidence/evd_abc123/verify" \
  -H "Authorization: Bearer $TOKEN"
```

### Generate Monthly Audit Report

```bash
curl -X GET "https://api.realriches.com/api/v1/admin/evidence/audit-report?startDate=2024-01-01&endDate=2024-01-31" \
  -H "Authorization: Bearer $TOKEN"
```

## Retention Policy

Evidence records are retained according to SOC2 requirements:

- **Minimum retention:** 7 years
- **Storage:** Append-only, immutable records
- **Deletion:** Not supported (compliance requirement)

## Auditor Access

For SOC2 audits, auditors can:

1. Query evidence by date range and control ID
2. Verify integrity of any record
3. Verify chain integrity for audit periods
4. Export evidence reports in JSON format
5. Review control-to-evidence mappings

## Related Documentation

- [FCHA Workflow Documentation](../compliance-engine/README.md)
- [FARE Act Compliance](../compliance-engine/README.md#fare-act)
- [Audit Log System](./audit-logs.md)
