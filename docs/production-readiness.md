# Production-readiness checklist

ApplyFlow is intentionally a single-user local portfolio application. This checklist captures the controls that would be required before adapting it into a shared recruiting or career-tracking service.

## Identity and access

- Add authenticated user identities and server-side tenant isolation.
- Enforce authorization on every application, note, export, and deadline operation.
- Add session expiration, CSRF protection where applicable, and secure cookie settings.

## Data protection

- Encrypt traffic with HTTPS and define encryption-at-rest requirements for stored application data.
- Move secrets and deployment credentials into managed secret storage.
- Define retention, deletion, backup, restore, and disaster-recovery procedures.
- Review exports for personal data and document who is allowed to generate them.

## Reliability

- Add database backup verification and restore testing.
- Add pagination and bounded queries for larger datasets.
- Add request throttling, structured application logs, health checks, and alerting.
- Define migration rollback procedures and verify schema upgrades against representative data.

## Security verification

- Keep prepared statements, origin checks, JSON size limits, optimistic concurrency, and CSV formula escaping covered by tests.
- Add authentication/authorization tests before enabling shared access.
- Add dependency, container, and static-analysis checks to CI.
- Exercise malformed calendar/CSV export inputs and verify no sensitive values enter logs.

## Operational boundaries

The current SQLite and synchronous design is appropriate for the documented local workload. Scaling claims, multi-user support, notification delivery, or production availability should not be made until those behaviors are implemented and measured.
