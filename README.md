# Fenrua-521 protected evidence pipeline

This local-only module implements the first deterministic path:

```text
KRN-INT-001 -> KRN-SCH-001 -> KRN-SEM-001 -> KRN-POL-001 -> KRN-REC-001
```

The module has no network client, model client, persistence adapter, generic
tool executor, or authority action. It accepts a typed Green request, evaluates
an evidence-disposition record, and returns a bounded receipt. The caller is
responsible for retaining receipts in an approved local store; this module
never retains a raw request body.

Run its focused tests from this private workspace:

```text
node --test test/*.test.mjs
```

The imported schemas, 52-case Green EVAL-01 through EVAL-08 fixture set, first twelve reviewed Green
behavioural cards, normalized KRN-POL-001 policy profile, KRN-INT-001 intake
profile, and KRN-REC-001 receipt profile are pinned in
`module-manifest.json`. The fixture set is ready for local freeze; it has not
been executed against a model endpoint, which this module deliberately does
not provide.

`corpus/green/fenrua-521-green-corpus-manifest-bootstrap-v0.2.yaml` binds the
six supplied Green artifact families by content digest. It intentionally leaves
the separately declared baseline acceptance specification unbound until its
actual source artifact is supplied; it never infers a completed baseline from
guidance material alone.
