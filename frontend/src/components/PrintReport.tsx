import { useMemo } from 'react'
import { usePlan } from '../state/PlanContext'
import { useI18n } from '../i18n/I18nContext'
import { evaluateCompliance, summarise } from '../data/compliance'

/**
 * Print-only compliance report. Hidden on screen (`hidden print:block`); the
 * "Export report" button just calls window.print(). Plain document styling —
 * the brief: browser print CSS is enough, no PDF library.
 */
export default function PrintReport() {
  const { result, constraints, proposed } = usePlan()
  const { t, lang } = useI18n()
  const rows = useMemo(
    () => evaluateCompliance(constraints, proposed, lang),
    [constraints, proposed, lang],
  )
  const summary = useMemo(() => summarise(rows), [rows])

  if (!result) return null

  const today = new Date().toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const labelByKey: Record<string, string> = {}
  constraints.forEach((c) => (labelByKey[c.key] = `${c.labelDe} — ${c.labelEn}`))
  const unitByKey: Record<string, string> = {}
  constraints.forEach((c) => (unitByKey[c.key] = c.unit ?? ''))

  return (
    <div className="hidden print:block" id="print-report">
      <header style={{ borderBottom: '2px solid #1A1D1A', paddingBottom: 10 }}>
        <div
          style={{
            fontFamily: 'Archivo, sans-serif',
            fontSize: 9,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: '#555',
          }}
        >
          {t('print.header')}
        </div>
        <h1
          style={{
            fontFamily: 'Archivo, sans-serif',
            fontSize: 20,
            fontWeight: 800,
            margin: '6px 0 0',
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          {result.plan.name}
        </h1>
        <div
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 11,
            marginTop: 4,
            color: '#333',
          }}
        >
          {result.plan.planNumber ? `${result.plan.planNumber} · ` : ''}
          {result.plan.municipality} · {result.plan.crs} · {t('print.asOf')} {today}
        </div>
      </header>

      {/* Overall verdict */}
      <div
        style={{
          margin: '14px 0',
          padding: '8px 12px',
          border: `2px double ${stampColor(summary.overall)}`,
          color: stampColor(summary.overall),
          display: 'inline-block',
        }}
      >
        <span
          style={{
            fontFamily: 'Archivo, sans-serif',
            fontWeight: 800,
            fontSize: 14,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          {summary.overall === 'PASS'
            ? t('print.overallPass')
            : summary.overall === 'FAIL'
              ? t('print.overallFail', {
                  fail: summary.fail,
                  total: summary.total,
                })
              : t('print.overallReview', { n: summary.review })}
        </span>
      </div>

      {/* Table */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 11,
        }}
      >
        <thead>
          <tr>
            {[
              t('print.colParameter'),
              t('print.colAllowed'),
              t('print.colProposed'),
              t('print.colVerdict'),
              t('print.colNote'),
            ].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  borderBottom: '1.5px solid #1A1D1A',
                  padding: '6px 8px',
                  fontFamily: 'Archivo, sans-serif',
                  fontSize: 9,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const unit = unitByKey[r.key] ? ` ${unitByKey[r.key]}` : ''
            return (
              <tr key={r.key} style={{ borderBottom: '0.5px solid #C9C4B6' }}>
                <td style={{ padding: '6px 8px', fontFamily: 'Inter, sans-serif' }}>
                  {labelByKey[r.key]}
                </td>
                <td style={{ padding: '6px 8px' }}>
                  {r.allowed}
                  {unit}
                </td>
                <td style={{ padding: '6px 8px' }}>
                  {r.proposed}
                  {unit}
                </td>
                <td
                  style={{
                    padding: '6px 8px',
                    fontWeight: 700,
                    color: stampColor(r.verdict),
                  }}
                >
                  {r.verdict}
                </td>
                <td style={{ padding: '6px 8px', color: '#444' }}>{r.note}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <footer
        style={{
          marginTop: 18,
          paddingTop: 8,
          borderTop: '0.5px solid #C9C4B6',
          fontFamily: 'Inter, sans-serif',
          fontSize: 9,
          color: '#777',
        }}
      >
        {t('print.footer')}
      </footer>
    </div>
  )
}

function stampColor(v: string): string {
  return v === 'PASS' ? '#0E5E5B' : v === 'FAIL' ? '#C2362B' : '#B98A1F'
}
