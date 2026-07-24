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

`corpus/green/fenrua-521-green-corpus-manifest-bootstrap-v0.2.yaml` binds all
seven supplied Green artifact families by content digest, including the
owner-provided baseline acceptance specification. The local runner remains
strictly deterministic; it does not claim a model-capability baseline.

Run the first protected-slice evidence package privately:

```text
node bin/run-green-baseline.mjs
```

The runner writes `evidence/baselines/fenrua-521-first-deterministic-baseline-v0.1.json`.
It processes fixture metadata through the five KRN stages and records only
bounded case metadata and receipts—never fixture prompt text.

`KRN-FML-001` has a two-step Formula Contract path. Its deterministic,
Amber-local `F521-EVENT-001` reference profile provides an executable test
base with exact encoding, fixed vectors, and bounded receipts. A passing
reference run emits `REFERENCE_VERIFIED`, never a production claim.

Run the reference evidence path privately:

```text
node bin/run-formula-reference.mjs
```

The production lock is separate: `VERIFIED` requires the production source,
reference-evidence, independent-verifier, and owner-approval digests to be
bound into a matching local Formula Contract. The full process is pinned in
`formula/krn-fml-001-promotion-plan-v0.1.yaml`.

`F521-CAP-BASELINE-001` is the first model-in-the-loop profile. It validates
the frozen loopback runtime before execution, applies INT → SCH → SEM → POL
before the model, and re-validates the bounded model disposition before REC.
Terminal cases never reach the engine; only 23 pre-cleared Green cases do.
Prompts, API keys, and raw model output are kept in memory and excluded from
the evidence package.

With a fresh API key held only by the launching process, run it privately:

```text
node bin/run-capability-baseline.mjs
```

It writes `evidence/capability/f521-capability-baseline-001-v0.1.json`. The
run can be `VERIFIED` only with 52 receipts, zero errors, zero weaker results,
and no incomparable safe divergence. This does not activate production
authority.
