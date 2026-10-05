import { useEffect, useState } from 'react'
import { fetchCompetencias } from '../api/gold'
import type { Competencia } from '../api/types'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionTitle } from '../components/ui/SectionTitle'
import { LoadingState } from '../components/ui/LoadingState'
import { ErrorState } from '../components/ui/ErrorState'
import { theme } from '../lib/theme'
import { scheduleAsyncState } from '../lib/scheduleAsyncState'

export function AboutDataPage() {
  const [competencias, setCompetencias] = useState<Competencia[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const isCancelled = () => cancelled
    scheduleAsyncState(isCancelled, () => {
      setLoading(true)
      setErr(null)
    })
    fetchCompetencias()
      .then((res) => {
        if (!cancelled) setCompetencias(res.items)
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Falha ao carregar competências')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [retryKey])

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Documentação"
        title="Sobre os dados"
        subtitle="Contexto institucional sobre fonte, processamento e limitações do painel CAGED."
      />

      <section className="grid gap-6 lg:grid-cols-2">
        <Card hover={false}>
          <SectionTitle title="Fonte oficial" />
          <p className={theme.doc.bodyClass}>
            Os indicadores exibidos derivam do{' '}
            <strong className={theme.doc.emphasisClass}>Novo CAGED</strong> (Cadastro Geral de
            Empregados e Desempregados), com periodicidade{' '}
            <strong className={theme.doc.emphasisClass}>mensal</strong>. Cada competência corresponde
            a um ano/mês de movimentação de emprego formal.
          </p>
        </Card>

        <Card hover={false}>
          <SectionTitle title="Camadas do projeto" />
          <ul className={`mt-3 list-inside list-disc space-y-2 ${theme.doc.bodyClass}`}>
            <li>
              <span className={theme.doc.layerClass}>Bronze</span> — microdados brutos (
              <code className={theme.doc.codeClass}>microdados.txt</code>)
            </li>
            <li>
              <span className={theme.doc.layerClass}>Silver</span> — limpeza e padronização
            </li>
            <li>
              <span className={theme.doc.layerClass}>Gold</span> — indicadores analíticos consumidos
              pela API e pelo painel
            </li>
          </ul>
        </Card>

        <Card hover={false}>
          <SectionTitle title="Processamento local" />
          <p className={theme.doc.bodyClass}>
            Os dados são processados localmente pela universidade (pipeline Python + arquivos em{' '}
            <code className={theme.doc.codeClass}>data-lake/</code>). O dashboard lê a camada Gold via
            API FastAPI; a leitura prioriza arquivos Parquet, com fallback CSV quando necessário.
            Não há dependência de Databricks nesta versão.
          </p>
        </Card>

        <Card hover={false}>
          <SectionTitle title="Catálogo Gold" />
          <p className={theme.doc.bodyClass}>
            Tabelas, colunas e metadados da Gold estão documentados no catálogo formal, acessível pela
            API em <code className={theme.doc.codeClass}>/api/gold/v1/catalog</code>.
          </p>
        </Card>
      </section>

      <section className="space-y-6">
        <Card hover={false}>
          <SectionTitle
            title="Competências disponíveis"
            subtitle="Lista retornada pela API para o seletor do painel."
          />
          {loading ? (
            <LoadingState rows={1} label="Carregando competências..." className="mt-2" fillHeight={false} />
          ) : err ? (
            <div className="mt-2">
              <ErrorState message={err} onRetry={() => setRetryKey((k) => k + 1)} />
            </div>
          ) : competencias.length ? (
            <ul className="mt-2 flex flex-wrap gap-2" aria-label="Competências disponíveis">
              {competencias.map((c) => (
                <li key={c.competencia} className={theme.doc.badgeClass}>
                  {c.label}
                </li>
              ))}
            </ul>
          ) : (
            <p className={theme.typography.smallMuted}>Nenhuma competência listada pela API.</p>
          )}
        </Card>

        <Card hover={false}>
          <SectionTitle title="Limitações conhecidas" />
          <ul className={`mt-3 list-inside list-disc space-y-2 ${theme.doc.bodyClass}`}>
            <li>Dependência do microdados oficial e da atualização mensal do pipeline.</li>
            <li>Possíveis mudanças de layout ou campos no arquivo fonte do CAGED.</li>
            <li>Recortes territoriais e tabelas dependem do processamento Gold da competência.</li>
            <li>Mapas/PostGIS podem estar em estágio separado, fora deste painel analítico.</li>
          </ul>
        </Card>

        <Card hover={false}>
          <SectionTitle
            title="Endpoints úteis (API)"
            subtitle="Referências para verificação operacional do ambiente local."
          />
          <dl className="mt-2 space-y-3 text-sm">
            {[
              ['GET /ready', 'Verifica se Gold, catálogo e metadados estão prontos'],
              ['GET /api/gold/v1/competencias', 'Lista competências disponíveis'],
              ['GET /api/gold/v1/catalog', 'Catálogo formal da camada Gold'],
              ['GET /health', 'Verifica se a API está viva'],
            ].map(([endpoint, desc]) => (
              <div key={endpoint} className="flex flex-col gap-1 sm:flex-row sm:gap-4">
                <dt className={theme.doc.endpointClass}>{endpoint}</dt>
                <dd className="text-slate-400">{desc}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </section>
    </div>
  )
}
