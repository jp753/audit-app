import type { Audit, PreviousSummary } from '../types';
import type { AuditResult } from '../lib/scoring';
import { formatPct } from '../lib/scoring';
import { changeText } from '../lib/compare';
import { formatDate } from '../lib/audit';
import { criticalLine, summaryLines, TO_BE_AGREED } from '../lib/summary';
import { followUpCounts, followUpRows } from '../lib/followup';

/** Score tiles, summary, critical line, gaps and area table. Used on Review and Records. */
export function ResultView(props: { audit: Audit; result: AuditResult; prev?: PreviousSummary | null; onGapClick?: (areaCode: string) => void }) {
  const { result: r, prev } = props;
  const o = r.overall;
  const crit = criticalLine(r);
  const fu = followUpRows(props.audit, prev);
  const fc = followUpCounts(fu);

  return (
    <>
      <div class="tiles">
        <div class="tile main">
          <div class="big">{formatPct(o.pct)}</div>
          <div>{o.maturity ? `Level ${o.maturity.level} · ${o.maturity.name}` : 'No maturity level'}</div>
        </div>
        {prev && (
          <div class="tile">
            <div class="big">{formatPct(prev.pct)}</div>
            <div>Previous ({formatDate(prev.date)})</div>
            <div class="chg">Change {changeText(o.pct, prev.pct)}</div>
          </div>
        )}
      </div>

      <div class="card small">
        {summaryLines(r, prev).map((l) => <p style={{ margin: '0 0 6px' }}>{l}</p>)}
      </div>

      <div class={`notice ${crit.ok ? 'info' : 'bad'}`}>
        <b>{crit.ok ? '✓ ' : '⚠ '}</b>{crit.text}
      </div>

      <h3>Priority gaps and actions ({r.gaps.length})</h3>
      {r.gaps.length === 0 && <p class="muted">No gaps.</p>}
      {r.gaps.map((g) => (
        <button class="listitem gap" onClick={() => props.onGapClick?.(g.criterion.area)} disabled={!props.onGapClick}>
          <div class="top">
            <span class="cid">{g.criterion.id}</span>
            <span class={`badge p-${g.priority}`}>{g.priority}</span>
            <span class="badge">{g.rating}</span>
          </div>
          <div class="small">{g.criterion.text}</div>
          <div class="small" style={{ marginTop: 4 }}>
            <b>Action:</b>{' '}
            {g.response.action?.trim() ? g.response.action : <span class="tba">{TO_BE_AGREED}</span>}
            {g.response.owner?.trim() && <> · <b>Owner:</b> {g.response.owner}</>}
            {g.response.due && <> · <b>Due:</b> {formatDate(g.response.due)}</>}
          </div>
        </button>
      ))}

      {fu.length > 0 && (
        <>
          <h3>Follow-up of previous actions ({fu.length})</h3>
          <p class="small">{fc.Closed} closed · {fc.Improved} improved · {fc.Open} still open{fc['Not assessed'] ? ` · ${fc['Not assessed']} not assessed` : ''}{fc['No longer applicable'] ? ` · ${fc['No longer applicable']} no longer applicable` : ''}</p>
          {fu.map((f) => (
            <div class="listitem" style={{ cursor: 'default' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span class="cid" style={{ fontWeight: 'bold', color: 'var(--navy)' }}>{f.prev.id}</span>
                <span class={`badge fu-${f.status.replace(/\s/g, '')}`}>{f.status}</span>
                <span class="small muted">was {f.prev.rating} → now {f.now ?? 'not assessed'}</span>
              </div>
              <div class="small" style={{ marginTop: 4 }}><b>Previous action:</b> {f.prev.action || <span class="tba">{TO_BE_AGREED}</span>}</div>
            </div>
          ))}
        </>
      )}

      <h3>Results by area</h3>
      <table class="areatable">
        <thead>
          <tr><th>Area</th><th>Score</th>{prev && <th>Prev</th>}{prev && <th>Change</th>}</tr>
        </thead>
        <tbody>
          {r.areas.map((a) => {
            const p = prev?.areaPct[a.code];
            return (
              <tr>
                <td>{a.code}. {a.name}</td>
                <td>{a.result.pct !== null ? `${a.result.pct}%` : <span class="muted">not scored</span>}</td>
                {prev && <td>{p === undefined || p === null ? '–' : `${p}%`}</td>}
                {prev && <td>{a.hasScope ? changeText(a.result.pct, p) : '–'}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>

      {r.unrated.length > 0 && (
        <>
          <h3>Not assessed ({r.unrated.length})</h3>
          <p class="small muted">Not included in the score. Listed in the report as "not assessed".</p>
          {r.unrated.map((c) => (
            <button class="listitem" onClick={() => props.onGapClick?.(c.area)} disabled={!props.onGapClick}>
              <b style={{ fontSize: 16, display: 'inline' }}>{c.id}</b> <span class="small">{c.text}</span>
            </button>
          ))}
        </>
      )}

    </>
  );
}
