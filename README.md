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

The imported schemas, Green fixture suite, first twelve reviewed Green
behavioural cards, and normalized KRN-POL-001 policy profile are pinned in
`module-manifest.json`. EVAL-07 and EVAL-08
references in the cards remain deferred until their dedicated fixture suites
are added; they are not counted as part of the current EVAL-01 through EVAL-05
baseline.
