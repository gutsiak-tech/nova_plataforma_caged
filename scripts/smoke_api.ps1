#Requires -Version 5.1
<#
.SYNOPSIS
    Smoke test institucional da API CAGED Dashboard.

.EXAMPLE
    .\scripts\smoke_api.ps1 -Ano 2026 -Mes 2

.NOTES
    Requer a API ativa (ex.: uvicorn app.main:app --host 127.0.0.1 --port 8000).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [int]$Ano,

    [Parameter(Mandatory = $true)]
    [int]$Mes,

    [string]$ApiBaseUrl = "http://127.0.0.1:8000"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Base = $ApiBaseUrl.TrimEnd("/")
$Failed = $false
$Passed = 0
$Total = 0
$CompetenciaLabel = "$Ano-$("{0:D2}" -f $Mes)"

function Test-ApiEndpoint {
    param(
        [string]$Name,
        [string]$Path
    )

    $script:Total++
    $uri = "$Base$Path"
    Write-Host "  GET $Path" -NoNewline

    try {
        $response = Invoke-WebRequest -Uri $uri -Method Get -UseBasicParsing -TimeoutSec 60
        $status = [int]$response.StatusCode
        $bodyText = $response.Content

        if ($status -ge 200 -and $status -lt 300) {
            Write-Host " -> $status OK" -ForegroundColor Green
            $script:Passed++

            if ($Path -eq "/ready") {
                try {
                    $json = $bodyText | ConvertFrom-Json
                    if ($json.status -eq "not_ready") {
                        Write-Host "    /ready = not_ready" -ForegroundColor Red
                        if ($json.problems) {
                            foreach ($problem in $json.problems) {
                                Write-Host "    - $problem" -ForegroundColor Red
                            }
                        }
                        $script:Failed = $true
                        $script:Passed--
                    }
                }
                catch {
                    Write-Host "    (nao foi possivel interpretar JSON de /ready)" -ForegroundColor Yellow
                }
            }
            return
        }

        Write-Host " -> $status FALHA" -ForegroundColor Red
        $script:Failed = $true
        Write-Host "    Corpo: $($bodyText.Substring(0, [Math]::Min(500, $bodyText.Length)))" -ForegroundColor DarkGray
    }
    catch {
        $script:Failed = $true
        $status = $null
        $bodyText = ""

        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $bodyText = $reader.ReadToEnd()
                $reader.Close()
            }
            catch {
                $bodyText = ""
            }
        }

        if ($status) {
            Write-Host " -> $status FALHA" -ForegroundColor Red
        }
        else {
            Write-Host " -> ERRO DE CONEXAO" -ForegroundColor Red
        }
        Write-Host "    $($_.Exception.Message)" -ForegroundColor DarkGray
        if ($bodyText) {
            Write-Host "    Corpo: $($bodyText.Substring(0, [Math]::Min(500, $bodyText.Length)))" -ForegroundColor DarkGray
        }
    }
}

Write-Host ""
Write-Host "Smoke test API - competencia $CompetenciaLabel - $Base" -ForegroundColor Cyan
Write-Host ""

Test-ApiEndpoint -Name "health" -Path "/health"
Test-ApiEndpoint -Name "ready" -Path "/ready"
Test-ApiEndpoint -Name "competencias" -Path "/api/gold/v1/competencias"
Test-ApiEndpoint -Name "meta" -Path "/api/gold/v1/meta?ano=$Ano&mes=$Mes"
Test-ApiEndpoint -Name "overview" -Path "/api/gold/v1/overview?scope=br&ano=$Ano&mes=$Mes"
Test-ApiEndpoint -Name "table_resumo" -Path "/api/gold/v1/table/tabela_resumo?scope=br&ano=$Ano&mes=$Mes"
Test-ApiEndpoint -Name "catalog" -Path "/api/gold/v1/catalog?ano=$Ano&mes=$Mes"

Write-Host ""
if ($Failed) {
    Write-Host "Smoke test FALHOU ($Passed/$Total endpoints OK)." -ForegroundColor Red
    Write-Host "Verifique se a API esta rodando e se a competencia existe na Gold." -ForegroundColor Yellow
    exit 1
}

Write-Host "Smoke test OK ($Passed/$Total endpoints)." -ForegroundColor Green
exit 0
