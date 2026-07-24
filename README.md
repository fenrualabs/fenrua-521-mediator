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

`KRN-ENV-001` validates inter-engine envelopes before they can enter a
mediator boundary. It requires an exact approved sender pair, configured
recipient and output schema, classification-correct local binding approval,
and a non-expired envelope. The six supplied examples are executed with a
fixed test clock and each result receives a bounded SHA-256 receipt.

Run its evidence package privately:

```text
node bin/run-inter-engine-envelope-examples.mjs
```

It writes `evidence/envelopes/fenrua-521-inter-engine-envelope-examples-v0.3.json`.
This is a local mediation-boundary test, not a capability-model or authority
claim.

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

`F521-FML-TEST-PROFILE-001` adds five explicit synthetic Formula test
contracts: event commitment, session-bound nullifier replay, scalar
canonicality, two-leaf Merkle root, and inclusion. Its encoding and vectors
are frozen under `formula/test-profile/`; it emits `REFERENCE_VERIFIED` only
and is not registered as a core or production Formula Contract.

Run its bounded 10-vector evidence package privately:

```text
node bin/run-formula-test-profile.mjs
```

It writes `evidence/formula/f521-fml-001-test-profile-v0.3.json` with
digest-only outcomes and self-verifying receipt bindings.

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

`KRN-DIF-001` compares the deterministic and capability evidence packages
without calling a model or re-running a fixture. It verifies both package
digests, requires matching fixture bindings, and emits bounded differential
receipts. It uses a partial safety order: insufficient and conflicting
evidence are incomparable, as are refused and contained boundary outcomes.

Run it privately:

```text
node bin/run-differential-baseline.mjs
```

It writes `evidence/differential/f521-differential-baseline-001-v0.1.json`.
The current blocked capability package therefore yields 29 `equivalent` and
23 `incomplete` comparisons; circuit-breaker refusals are not counted as
successful conservative model outcomes.

`F521-PREF-001` is the private specialist-preference objective. It packages
only a SHA-256-bound index of the reviewed Green cards, frozen Green fixtures,
and explicitly synthetic Formula test vectors. It is not a training run, it
does not duplicate prompts or Formula inputs, and it cannot activate a model.

Build the private source-admission index:

```text
node bin/build-preference-data-package.mjs
```

Then evaluate the current evidence without making a model call:

```text
node bin/run-specialist-preference-objective.mjs
```

The resulting `evidence/preference/f521-pref-001-preflight-v0.1.json` is
currently `NEEDS_EVIDENCE`: the genuine loopback baseline has zero valid
bounded model responses out of 23 engine-eligible cases. Authority,
cross-tenant, and injection cases were successfully terminated by the
mediator before the engine ran; that is a boundary result, not a claim that
the uncalled model itself refused them. This evidence is private and is not
eligible for public publication.

## Actual local CPU training smoke result

`F521-SMOLLM2-CPU-SFT-001` has completed locally in WSL CPU mode. It uses the
pinned public `HuggingFaceTB/SmolLM2-135M-Instruct` revision
`12fd25f77366fa6b3b4b768ec3050bf629380bac`, never the frozen GLM/Colibri
runtime. The run trained only that model's output head on 20 safe synthetic
Green fixtures and evaluated three deterministic held-out fixtures. It ran
60 optimisation steps; loss fell from `2.941424` to `0.600179`, while held-out
exact-disposition accuracy remained `2/3` before and after. This is execution
evidence, not a quality, safety, or production-readiness claim.

The exact private evidence is
`evidence/training/f521-smollm2-135m-cpu-sft-smoke-v0.1.json`. Its exact-file
SHA-256 is
`439f668017665da712c2f43c1b466f6d221a0ca411467696c817f3d5ebe4eec6` and its
canonical evidence digest is
`2843bb2a446a0e411f518b93896eee3bccb38d267caf9e723da0319037e06682` (canonical
JSON with `evidence_package_digest` blank). The private learned-weight SHA-256
is `314b43730fdebed3222cc45bc6b3bb7770ef8c1eb66989f162accb794ac199f1`; the
weight file is intentionally Git-ignored and is not eligible for publication.

To reproduce the isolated run privately, with the installed local CPU Python
environment only:

```text
.venv-sft/bin/python training/run_cpu_sft_smoke.py
```

It has no mediator connection, listener, action tool, or public release path.
`COMPLETED_SMOKE_ONLY` is deliberately ineligible for the public evidence
repository. A public pass requires a separately verified result with a
sanitized aggregate and exact SHA-256 binding.
