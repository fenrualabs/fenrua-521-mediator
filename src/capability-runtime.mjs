import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { sha256Binding } from './common.mjs';

const REQUIRED_LAUNCH_TOKENS = [
  'set "KVSAVE=0"',
  'set "COLI_DEBUG=0"',
  'set "COLI_TOOL_SALVAGE=0"',
  'set "DIRECT=1"',
  'set "PIPE_WORKERS=8"',
  'set "DRAFT=0"',
  'set "PIN_GB=16"',
  'serve --host 127.0.0.1 --port 8010',
];

function sha256File(file) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;
}

function defaultRuntimeRoot() {
  const windowsPath = 'F:\\Fenrua-521-Local-Workspace';
  if (fs.existsSync(windowsPath)) return windowsPath;
  return '/mnt/f/Fenrua-521-Local-Workspace';
}

function nativePath(windowsPath) {
  if (fs.existsSync(windowsPath)) return windowsPath;
  const match = windowsPath.match(/^([A-Za-z]):\\(.*)$/);
  if (!match) return windowsPath;
  return path.posix.join(`/mnt/${match[1].toLowerCase()}`, ...match[2].split('\\'));
}

function assert(condition, message) {
  if (!condition) throw new TypeError(`Frozen capability runtime check failed: ${message}`);
}

function modelInventory(modelPath, declaredShards) {
  const shards = fs.readdirSync(modelPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^out-(?:mtp-)?[0-9]{5}\.safetensors$/i.test(entry.name))
    .map((entry) => ({ name: entry.name, bytes: fs.statSync(path.join(modelPath, entry.name)).size }))
    .sort((left, right) => left.name.localeCompare(right.name));
  assert(shards.length === declaredShards, `model shard count is ${shards.length}, expected ${declaredShards}`);
  return Object.freeze({
    shard_count: shards.length,
    total_bytes: shards.reduce((total, shard) => total + shard.bytes, 0),
    inventory_digest: sha256Binding(shards),
    digest_kind: 'ordered_shard_name_and_size_inventory_not_full_weight_content_hash',
  });
}

/**
 * Reads only the owner-controlled frozen runtime manifests and artifact hashes.
 * It never starts the engine and it never reads model weight contents.
 */
export function attestFrozenCapabilityRuntime({ runtimeRoot = defaultRuntimeRoot() } = {}) {
  const runtimeConfigPath = path.join(runtimeRoot, 'config', 'runtime.local.json');
  const candidateManifestPath = path.join(runtimeRoot, 'config', 'candidate-manifest.local.json');
  const runtime = JSON.parse(fs.readFileSync(runtimeConfigPath, 'utf8'));
  const candidate = JSON.parse(fs.readFileSync(candidateManifestPath, 'utf8'));
  const startScriptPath = path.join(runtimeRoot, 'bin', 'start-colibri-local.cmd');
  const startScript = fs.readFileSync(startScriptPath, 'utf8');

  assert(runtime.profile_version === 'fenrua-521-local-runtime/v1', 'runtime profile version is not pinned');
  assert(runtime.engine?.service_entrypoint === 'F:\\Fenrua-521-Local-Workspace\\bin\\start-colibri-local.cmd', 'service entrypoint changed');
  assert(runtime.engine?.model_id === 'fenrua-glm52-local', 'model identifier changed');
  assert(runtime.endpoint?.host === '127.0.0.1' && runtime.endpoint?.port === 8010 && runtime.endpoint?.path === '/v1/chat/completions', 'endpoint is not the pinned loopback endpoint');
  assert(runtime.endpoint?.authentication === 'required-via-FENRUA_COLIBRI_API_KEY', 'ephemeral API-key control changed');
  assert(runtime.safety?.kv_persistence === false && runtime.safety?.debug_transcript === false && runtime.safety?.tool_salvage === false, 'privacy or tool controls changed');
  assert(runtime.safety?.network_binding === 'loopback-only', 'network binding changed');
  assert(runtime.performance?.pipeline_workers === 8 && runtime.performance?.draft_tokens === 0 && runtime.performance?.direct_io === true, 'frozen I/O profile changed');
  assert(runtime.cuda?.ram_pin_gb === 16, 'frozen RAM pin profile changed');
  assert(candidate.status === 'READY_FOR_LOCAL_VERIFICATION' && candidate.model?.shards === 144, 'candidate manifest is not the declared local candidate');

  for (const token of REQUIRED_LAUNCH_TOKENS) assert(startScript.includes(token), `launcher control missing: ${token}`);

  const artifacts = [
    ['colibri_exe_sha256', nativePath('F:\\colibri-native\\colibri.exe')],
    ['coli_cuda_dll_sha256', nativePath('F:\\colibri-native\\coli_cuda.dll')],
    ['gpu_launcher_sha256', nativePath('F:\\colibri-native\\colibri-gpu-sm86.cmd')],
    ['service_entrypoint_sha256', startScriptPath],
  ].map(([manifestKey, file]) => {
    const digest = sha256File(file);
    assert(digest === `sha256:${candidate.runtime[manifestKey]}`, `${manifestKey} digest mismatch`);
    return { manifest_key: manifestKey, digest };
  });
  const runtimeProfileDigest = sha256File(runtimeConfigPath);
  assert(runtimeProfileDigest === `sha256:${candidate.runtime.runtime_profile_sha256}`, 'runtime profile digest mismatch');
  const inventory = modelInventory(nativePath(candidate.model.path), candidate.model.shards);
  const candidateManifestDigest = sha256File(candidateManifestPath);
  const runtimeDigest = sha256Binding({ runtime_profile_digest: runtimeProfileDigest, candidate_manifest_digest: candidateManifestDigest, artifacts });
  const modelDigest = sha256Binding({ candidate_id: candidate.candidate_id, format: candidate.model.format, inventory });

  return Object.freeze({
    status: 'ATTESTED',
    candidate_id: candidate.candidate_id,
    endpoint: Object.freeze({ host: runtime.endpoint.host, port: runtime.endpoint.port, path: runtime.endpoint.path, model_id: runtime.engine.model_id }),
    runtime_digest: runtimeDigest,
    model_digest: modelDigest,
    model_digest_kind: inventory.digest_kind,
    model_inventory: inventory,
    runtime_profile_digest: runtimeProfileDigest,
    candidate_manifest_digest: candidateManifestDigest,
    artifact_digests: artifacts,
  });
}
