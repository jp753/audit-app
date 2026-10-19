import { useEffect, useState } from 'preact/hooks';
import { allAudits } from '../lib/db';
import { formatDate } from '../lib/audit';
import { go, Icon } from './common';
import { useApp } from './app-state';

const BACKUP_REMINDER_DAYS = 14;

export function Home() {
  const { brand, lastBackup } = useApp();
  const [drafts, setDrafts] = useState(0);
  const [finished, setFinished] = useState(0);

  useEffect(() => {
    allAudits().then((list) => {
      setDrafts(list.filter((a) => a.status === 'draft').length);
      setFinished(list.filter((a) => a.status === 'finished').length);
    });
  }, []);

  const daysSince = lastBackup ? Math.floor((Date.now() - new Date(lastBackup).getTime()) / 86400000) : null;
  const needsBackup = (drafts + finished > 0) && (daysSince === null || daysSince > BACKUP_REMINDER_DAYS);

  return (
    <>
      <header class="topbar">
        <span style={{ width: 8 }} />
        <h1>Training System Audit</h1>
        <button class="iconbtn" aria-label="Settings" onClick={() => go('/settings')}><Icon.gear /></button>
      </header>
      <main class="page">
        <div class="brandhead">
          <div class="monogram">{brand.logo ? <img src={brand.logo} alt="" /> : brand.monogram}</div>
          <div><div class="name">{brand.name}</div><div class="tag">{brand.tagline}</div></div>
        </div>

        <button class="bigbtn" onClick={() => go('/new')}>
          <span class="ico" style={{ background: 'var(--teal)' }}><Icon.plus /></span>
          <span><b>New audit</b><span class="s">Start a fresh audit</span></span>
        </button>
        <button class="bigbtn" onClick={() => go('/continue')} disabled={drafts === 0}>
          <span class="ico" style={{ background: 'var(--amber)' }}><Icon.play /></span>
          <span><b>Continue audit</b><span class="s">{drafts === 0 ? 'No audits in progress' : `${drafts} in progress`}</span></span>
        </button>
        <button class="bigbtn" onClick={() => go('/records')}>
          <span class="ico" style={{ background: 'var(--navy)' }}><Icon.archive /></span>
          <span><b>Records</b><span class="s">{finished === 0 ? 'No finished audits yet' : `${finished} finished audit${finished === 1 ? '' : 's'}`}</span></span>
        </button>

        {needsBackup ? (
          <div class="notice warn">
            {lastBackup ? `Last backup: ${formatDate(lastBackup)} (${daysSince} days ago).` : 'No backup made yet.'}{' '}
            It's a good idea to back up now. <a href="#/settings">Go to Settings</a>
          </div>
        ) : (
          <p class="muted small" style={{ textAlign: 'center' }}>
            Last backup: {lastBackup ? formatDate(lastBackup) : 'never'}
          </p>
        )}
      </main>
    </>
  );
}
