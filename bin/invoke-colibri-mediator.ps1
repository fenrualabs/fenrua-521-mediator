[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$inputText = [Console]::In.ReadToEnd()

function Send-BoundedResult([hashtable]$Result) {
    [Console]::Out.Write(($Result | ConvertTo-Json -Compress -Depth 6))
    exit 0
}

try {
    $request = $inputText | ConvertFrom-Json -ErrorAction Stop
    if ($null -eq $request -or
        $request.PSObject.Properties.Name.Count -ne 3 -or
        [string]::IsNullOrWhiteSpace([string]$request.api_key) -or
        $request.api_key.Length -lt 16 -or $request.api_key.Length -gt 200 -or
        $request.model_id -ne "fenrua-glm52-local" -or
        [string]::IsNullOrWhiteSpace([string]$request.prompt) -or
        $request.prompt.Length -gt 65536) {
        Send-BoundedResult @{ ok = $false; code = "ENGINE_RESPONSE_INVALID" }
    }

    $body = @{
        model = "fenrua-glm52-local"
        temperature = 0
        max_tokens = 32
        stream = $false
        messages = @(
            @{ role = "system"; content = "Return only exact JSON with one key: {`"disposition`":`"EVIDENCE_SUFFICIENT_FOR_REVIEW|INSUFFICIENT_EVIDENCE|CONFLICTING_EVIDENCE|REFUSED_BY_POLICY|CONTAINED_OR_OUT_OF_SCOPE`"}. Do not call tools, take actions, explain, or repeat input." },
            @{ role = "user"; content = [string]$request.prompt }
        )
    } | ConvertTo-Json -Compress -Depth 8

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "http://127.0.0.1:8010/v1/chat/completions" -Headers @{ Authorization = "Bearer $($request.api_key)"; "Content-Type" = "application/json" } -Body $body -TimeoutSec 120 -ErrorAction Stop
    } catch {
        $statusCode = $null
        if ($_.Exception.Response) { $statusCode = [int]$_.Exception.Response.StatusCode }
        if ($statusCode -eq 401) { Send-BoundedResult @{ ok = $false; code = "ENGINE_HTTP_UNAUTHORIZED" } }
        if ($statusCode -eq 429) { Send-BoundedResult @{ ok = $false; code = "ENGINE_HTTP_RATE_LIMITED" } }
        if ($statusCode) { Send-BoundedResult @{ ok = $false; code = "ENGINE_HTTP_FAILURE" } }
        Send-BoundedResult @{ ok = $false; code = "ENGINE_NETWORK_ERROR" }
    }

    try {
        $payload = $response.Content | ConvertFrom-Json -ErrorAction Stop
        $content = [string]$payload.choices[0].message.content
        if ([string]::IsNullOrWhiteSpace($content) -or $content.Length -gt 512) { throw "Response content is not bounded." }
        Send-BoundedResult @{ ok = $true; content = $content }
    } catch {
        Send-BoundedResult @{ ok = $false; code = "ENGINE_RESPONSE_INVALID" }
    }
} catch {
    Send-BoundedResult @{ ok = $false; code = "ENGINE_RESPONSE_INVALID" }
}
