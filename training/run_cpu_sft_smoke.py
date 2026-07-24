#!/usr/bin/env python3
"""Private, CPU-only SFT smoke run for a small public instruct model.

The script uses synthetic Green fixture text only in memory. It saves a
trainable-head adapter locally, while its evidence contains no raw inputs.
It never opens a network listener or modifies the frozen Colibri/GLM runtime.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

# Avoid the public Xet/CAS transport for this small local smoke run. The
# standard HTTPS path resumes safely in the private cache and needs no CLI.
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

import torch
import yaml
from huggingface_hub import snapshot_download
from safetensors.torch import save_file
from transformers import AutoModelForCausalLM, AutoTokenizer


ROOT = Path(__file__).resolve().parents[1]
RUN_ID = "F521-SMOLLM2-CPU-SFT-001"
PROFILE_VERSION = "fenrua-521-smollm2-cpu-sft-smoke/v0.1"
MODEL_ID = "HuggingFaceTB/SmolLM2-135M-Instruct"
MODEL_REVISION = "12fd25f77366fa6b3b4b768ec3050bf629380bac"
FIXTURE_FILES = (
    ROOT / "fixtures/green/fenrua-521-eval-01-to-05-complete-v0.2.yaml",
    ROOT / "fixtures/green/fenrua-521-eval-06-to-08-v0.2.yaml",
)
MODEL_CACHE = ROOT / ".hf-sft-cache"
ARTIFACT_DIR = ROOT / "artifacts/sft"
EVIDENCE_PATH = ROOT / "evidence/training/f521-smollm2-135m-cpu-sft-smoke-v0.1.json"
ADAPTER_PATH = ARTIFACT_DIR / "f521-smollm2-135m-output-head-smoke-v0.1.safetensors"
METADATA_PATH = ARTIFACT_DIR / "f521-smollm2-135m-output-head-smoke-metadata-v0.1.json"
TERMINAL = {"REFUSED_BY_POLICY", "CONTAINED_OR_OUT_OF_SCOPE"}
SUSPECT = (
    re.compile(r"-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----", re.I),
    re.compile(r"\bf521[-_]?canary\b", re.I),
    re.compile(r"\b(?:sk|rk|api)[_-][A-Za-z0-9]{16,}\b", re.I),
    re.compile(r"\b(?:ignore|disregard) (?:all )?(?:previous|prior) instructions\b", re.I),
)


def canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def digest_value(value: object) -> str:
    return "sha256:" + hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def digest_file(file: Path) -> str:
    return "sha256:" + hashlib.sha256(file.read_bytes()).hexdigest()


def write_canonical(file: Path, value: object) -> None:
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(canonical(value) + "\n", encoding="utf-8")


def is_suspect(text: str) -> bool:
    return any(pattern.search(text) for pattern in SUSPECT)


def load_examples() -> tuple[list[dict], list[dict], str]:
    sources = []
    examples = []
    for fixture_file in FIXTURE_FILES:
        parsed = yaml.safe_load(fixture_file.read_text(encoding="utf-8"))
        if parsed.get("classification") != "green":
            raise RuntimeError(f"Fixture file is not Green: {fixture_file.name}")
        sources.append({"file": str(fixture_file.relative_to(ROOT)), "sha256": digest_file(fixture_file)})
        for case in parsed["cases"]:
            disposition = case["expected"]["disposition"]
            text = case["inputs"]["prompt"]
            if disposition in TERMINAL or is_suspect(text):
                continue
            examples.append({
                "fixture_id": case["case_id"],
                "suite": case["suite"],
                "disposition": disposition,
                "text": text,
            })
    examples.sort(key=lambda item: item["fixture_id"])
    if len(examples) != 23 or any(not item["text"] for item in examples):
        raise RuntimeError("Expected exactly 23 safe, non-terminal synthetic fixtures.")
    return examples, sources, digest_value(sources)


def split_examples(examples: list[dict]) -> tuple[list[dict], list[dict]]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for example in examples:
        grouped[example["disposition"]].append(example)
    holdout_ids = set()
    for disposition, group in grouped.items():
        if len(group) < 2:
            raise RuntimeError(f"Label {disposition} lacks a train/holdout split.")
        holdout_ids.add(group[-1]["fixture_id"])
        if len(group) >= 6:
            holdout_ids.add(group[-2]["fixture_id"])
    train = [item for item in examples if item["fixture_id"] not in holdout_ids]
    holdout = [item for item in examples if item["fixture_id"] in holdout_ids]
    if not train or not holdout or set(item["disposition"] for item in train) != set(item["disposition"] for item in holdout):
        raise RuntimeError("Deterministic split is not label-stratified.")
    return train, holdout


def render(tokenizer, text: str, disposition: str | None = None) -> tuple[list[int], list[int] | None]:
    messages = [
        {"role": "system", "content": "Return only JSON with one key named disposition. Do not explain or take actions."},
        {"role": "user", "content": text},
    ]
    if getattr(tokenizer, "chat_template", None):
        prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    else:
        prompt = "System: Return only JSON with one key named disposition.\nUser: " + text + "\nAssistant: "
    prompt_ids = tokenizer(prompt, add_special_tokens=False)["input_ids"]
    if disposition is None:
        return prompt_ids, None
    target = json.dumps({"disposition": disposition}, separators=(",", ":")) + (tokenizer.eos_token or "")
    target_ids = tokenizer(target, add_special_tokens=False)["input_ids"]
    if len(prompt_ids) + len(target_ids) > 384:
        prompt_ids = prompt_ids[-(384 - len(target_ids)):]
    return prompt_ids, target_ids


def score_label(model, tokenizer, text: str, disposition: str) -> float:
    prompt_ids, target_ids = render(tokenizer, text, disposition)
    full = torch.tensor([prompt_ids + target_ids], dtype=torch.long)
    with torch.no_grad():
        logits = model(input_ids=full).logits[0]
        token_log_probs = torch.log_softmax(logits, dim=-1)
    offset = len(prompt_ids)
    return sum(float(token_log_probs[offset + index - 1, token_id]) for index, token_id in enumerate(target_ids))


def evaluate(model, tokenizer, examples: list[dict], labels: list[str]) -> tuple[dict, list[dict]]:
    rows = []
    for example in examples:
        scores = {label: score_label(model, tokenizer, example["text"], label) for label in labels}
        prediction = max(labels, key=lambda label: (scores[label], label))
        rows.append({
            "fixture_id": example["fixture_id"],
            "suite": example["suite"],
            "expected_disposition": example["disposition"],
            "predicted_disposition": prediction,
            "correct": prediction == example["disposition"],
        })
    correct = sum(1 for row in rows if row["correct"])
    return {"total": len(rows), "correct": correct, "exact_disposition_accuracy": round(correct / len(rows), 6)}, rows


def train(model, tokenizer, examples: list[dict]) -> list[float]:
    model.train()
    head = model.get_output_embeddings()
    for parameter in model.parameters():
        parameter.requires_grad_(False)
    head.weight.requires_grad_(True)
    optimizer = torch.optim.AdamW([head.weight], lr=1.0e-4, weight_decay=0.0)
    losses = []
    for _epoch in range(3):
        for example in examples:
            prompt_ids, target_ids = render(tokenizer, example["text"], example["disposition"])
            input_ids = torch.tensor([prompt_ids + target_ids], dtype=torch.long)
            labels = torch.tensor([[-100] * len(prompt_ids) + target_ids], dtype=torch.long)
            optimizer.zero_grad(set_to_none=True)
            loss = model(input_ids=input_ids, labels=labels).loss
            loss.backward()
            torch.nn.utils.clip_grad_norm_([head.weight], 1.0)
            optimizer.step()
            losses.append(float(loss.detach()))
    model.eval()
    return losses


def main() -> None:
    torch.set_num_threads(min(32, os.cpu_count() or 1))
    created_at = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    examples, fixture_sources, fixture_set_digest = load_examples()
    train_examples, holdout_examples = split_examples(examples)
    labels = sorted({example["disposition"] for example in examples})
    MODEL_CACHE.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id=MODEL_ID,
        revision=MODEL_REVISION,
        cache_dir=str(MODEL_CACHE),
        allow_patterns=[
            "config.json", "generation_config.json", "model.safetensors", "model.safetensors.index.json",
            "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "merges.txt", "vocab.json", "*.model",
        ],
    )
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, revision=MODEL_REVISION, cache_dir=str(MODEL_CACHE), trust_remote_code=False)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    model = AutoModelForCausalLM.from_pretrained(MODEL_ID, revision=MODEL_REVISION, cache_dir=str(MODEL_CACHE), torch_dtype=torch.float32, trust_remote_code=False)
    model.to("cpu")
    model.eval()
    baseline_metrics, _baseline_rows = evaluate(model, tokenizer, holdout_examples, labels)
    losses = train(model, tokenizer, train_examples)
    trained_metrics, held_out_rows = evaluate(model, tokenizer, holdout_examples, labels)

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    head = model.get_output_embeddings()
    save_file({"lm_head.weight": head.weight.detach().contiguous().cpu()}, str(ADAPTER_PATH), metadata={"format": "f521-output-head-smoke", "base_model": MODEL_ID, "revision": MODEL_REVISION})
    adapter_sha256 = digest_file(ADAPTER_PATH)
    adapter_metadata = {
        "artifact_version": "fenrua-521-output-head-sft-adapter/v0.1",
        "run_id": RUN_ID,
        "base_model": {"repository": MODEL_ID, "revision": MODEL_REVISION, "trust_remote_code": False},
        "adapter": {"file": str(ADAPTER_PATH.relative_to(ROOT)), "sha256": adapter_sha256, "trainable_parameter": "lm_head.weight", "base_weights_mutated": False},
        "training_data": {"selected_cases": len(examples), "train_cases": len(train_examples), "holdout_cases": len(holdout_examples), "fixture_set_digest": fixture_set_digest, "fixture_sources": fixture_sources},
        "created_at": created_at,
        "deployment": "PRIVATE_LOCAL_SMOKE_ONLY_NOT_CONNECTED_TO_MEDIATOR_OR_COLIBRI",
        "artifact_digest": "",
    }
    adapter_metadata["artifact_digest"] = digest_value(adapter_metadata)
    write_canonical(METADATA_PATH, adapter_metadata)
    report = {
        "evidence_package_version": "fenrua-521-smollm2-cpu-sft-evidence/v0.1",
        "run_id": RUN_ID,
        "profile_version": PROFILE_VERSION,
        "execution_mode": "actual_local_wsl_cpu_output_head_sft",
        "verification_scope": "A small public instruct model receives CPU-only output-head SFT on safe synthetic fixture inputs. This does not modify or replace GLM, Colibri, or the mediator.",
        "created_at": created_at,
        "build_state": "COMPLETED_SMOKE_ONLY",
        "runtime": {"device": "cpu", "torch_version": torch.__version__, "cuda_available": bool(torch.cuda.is_available()), "cpu_threads": torch.get_num_threads()},
        "base_model": {"repository": MODEL_ID, "revision": MODEL_REVISION, "trust_remote_code": False, "download_cache": "private_local"},
        "training_data": {"selected_cases": len(examples), "train_cases": len(train_examples), "holdout_cases": len(holdout_examples), "fixture_set_digest": fixture_set_digest, "fixture_sources": fixture_sources},
        "baseline_metrics": baseline_metrics,
        "trained_metrics": trained_metrics,
        "loss": {"steps": len(losses), "first": round(losses[0], 6), "last": round(losses[-1], 6), "minimum": round(min(losses), 6)},
        "adapter": {"file": str(ADAPTER_PATH.relative_to(ROOT)), "sha256": adapter_sha256, "metadata_file": str(METADATA_PATH.relative_to(ROOT)), "metadata_sha256": digest_file(METADATA_PATH), "artifact_digest": adapter_metadata["artifact_digest"]},
        "held_out_case_results": held_out_rows,
        "known_limitations": [
            "The original GLM checkpoint remains inference-only and unchanged; this is a separate small public model smoke run.",
            "Only non-terminal, synthetic, suspect-free fixtures are used. No authority, tenant, injection, or canary behaviour is claimed.",
            "The adapter is private, local, and not connected to the mediator or Colibri runtime.",
            "Evidence records aggregate metrics and bounded identifiers only; raw inputs are not persisted in this evidence package.",
        ],
        "evidence_package_digest": "",
    }
    report["evidence_package_digest"] = digest_value(report)
    write_canonical(EVIDENCE_PATH, report)
    print(json.dumps({
        "build_state": report["build_state"],
        "selected_cases": report["training_data"]["selected_cases"],
        "holdout_cases": report["training_data"]["holdout_cases"],
        "baseline_metrics": baseline_metrics,
        "trained_metrics": trained_metrics,
        "adapter_sha256": adapter_sha256,
        "evidence_package_digest": report["evidence_package_digest"],
    }, indent=2))


if __name__ == "__main__":
    main()
