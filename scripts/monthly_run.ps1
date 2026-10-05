#Requires -Version 5.1
<#
.SYNOPSIS
    Rotina operacional mensal do CAGED Dashboard (Bronze -> Silver -> Gold -> catalogo -> smoke API).

.EXAMPLE
    .\scripts\monthly_run.ps1 -Ano 2026 -Mes 3

.EXAMPLE
    .\scripts\monthly_run.ps1 -Ano 2026 -Mes 2 -SkipSmokeTest
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [int]$Ano,

    [Parameter(Mandatory = $true)]
    [int]$Mes,

    [string]$ApiBaseUrl = "http://127.0.0.1:8000",

    [switch]$SkipSmokeTest,

    [switch]$SkipCatalogValidation
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$Python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $Python)) {
    $Python = "python"
}

$Competencia = "{0}-{1:D2}" -f $Ano, $Mes
$StepResults = [ordered]@{
    Bronze   = "pendente"
    Silver   = "pendente"
    Pipeline = "pendente"
    Gold     = "pendente"
    Catalogo = "pendente"
    API      = if ($SkipSmokeTest) { "ignorado" } else { "pendente" }
}

function Write-Banner {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host " CAGED Dashboard - rotina mensal | competencia $Competencia" -ForegroundColor Cyan
    Write-Host " Projeto: $ProjectRoot" -ForegroundColor DarkGray
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Invoke-PipelineStep {
    param(
        [string]$Label,
        [string[]]$Arguments
    )

    Write-Host ">> $Label" -ForegroundColor Yellow
    $displayArgs = $Arguments -join " "
    Write-Host "   $Python -m pipelines.jobs.run_monthly_pipeline $displayArgs" -ForegroundColor DarkGray

    & $Python -m pipelines.jobs.run_monthly_pipeline @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Etapa falhou: $Label (exit code $LASTEXITCODE)"
    }
    Write-Host "   OK: $Label" -ForegroundColor Green
    Write-Host ""
}

Write-Banner

try {
    Invoke-PipelineStep -Label "1/5 Validar Bronze" -Arguments @(
        "--ano", $Ano, "--mes", $Mes, "--validate-bronze-only"
    )
    $StepResults.Bronze = "OK"

    Invoke-PipelineStep -Label "2/5 Validar Silver (Bronze + Silver)" -Arguments @(
        "--ano", $Ano, "--mes", $Mes, "--validate-silver-only"
    )
    $StepResults.Silver = "OK"

    $pipelineArgs = @("--ano", $Ano, "--mes", $Mes, "--build-catalog")
    if (-not $SkipCatalogValidation) {
        $pipelineArgs += "--validate-catalog"
    }
    Invoke-PipelineStep -Label "3/5 Pipeline completo (Bronze + Silver + Gold + catalogo)" -Arguments $pipelineArgs
    $StepResults.Pipeline = "OK"
    $StepResults.Catalogo = if ($SkipCatalogValidation) { "OK (sem validacao)" } else { "OK" }

    Invoke-PipelineStep -Label "4/5 Validar Gold" -Arguments @(
        "--ano", $Ano, "--mes", $Mes, "--validate-gold-only"
    )
    $StepResults.Gold = "OK"

    if (-not $SkipSmokeTest) {
        Write-Host ">> 5/5 Smoke test da API" -ForegroundColor Yellow
        & (Join-Path $PSScriptRoot "smoke_api.ps1") -Ano $Ano -Mes $Mes -ApiBaseUrl $ApiBaseUrl
        if ($LASTEXITCODE -ne 0) {
            throw "Smoke test da API falhou (exit code $LASTEXITCODE). Verifique se a API esta rodando."
        }
        $StepResults.API = "OK"
        Write-Host ""
    }

    Write-Host "============================================================" -ForegroundColor Green
    Write-Host " RESUMO - competencia $Competencia" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green
    foreach ($key in $StepResults.Keys) {
        $value = $StepResults[$key]
        $color = if ($value -eq "OK" -or $value -like "OK*") { "Green" } elseif ($value -eq "ignorado") { "DarkGray" } else { "Yellow" }
        Write-Host ("  {0,-10} {1}" -f "${key}:", $value) -ForegroundColor $color
    }
    Write-Host ""
    Write-Host "Proximo passo:" -ForegroundColor Cyan
    Write-Host "  1. Se a API ja estava rodando durante o pipeline, reinicie o uvicorn para limpar o cache LRU da Gold em memoria"
    Write-Host "     (ou use clear_gold_read_cache() no processo da API — ver app/services/gold_service.py)"
    Write-Host "  2. Subir a API (se ainda nao estiver ativa): uvicorn app.main:app --host 127.0.0.1 --port 8000"
    Write-Host "  3. Subir o dashboard: cd dashboard; npm run dev"
    Write-Host "  4. Abrir o dashboard e conferir se '$Competencia' aparece no seletor de competencia"
    Write-Host ""
    exit 0
}
catch {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Red
    Write-Host " FALHA na rotina mensal - competencia $Competencia" -ForegroundColor Red
    Write-Host "============================================================" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Estado parcial:" -ForegroundColor Yellow
    foreach ($key in $StepResults.Keys) {
        Write-Host ("  {0,-10} {1}" -f "${key}:", $StepResults[$key])
    }
    Write-Host ""
    Write-Host "Consulte docs/runbook_operacional.md para diagnostico." -ForegroundColor Yellow
    exit 1
}
