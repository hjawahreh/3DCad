# Public API and Compatibility

The package exports interfaces, immutable value types, factories, and `RuntimeBuilder` only. It does not export internal container records, mutable state, or scheduler queues. Public types follow semantic versioning. Additive optional fields are minor changes; altered lifecycle, command, event, ownership, or determinism semantics are major changes.

All runtime callbacks receive immutable inputs. Cancellation is represented by `AbortSignal`; expected failure is represented by typed `Result` values. Runtime adapters must not throw across a public bus boundary.

**Stability: Experimental** (pre-PC-001). After Platform Certification, certified surfaces move toward **Frozen** per [GOVERNANCE.md](../../docs/engineering/GOVERNANCE.md).
