import { useEffect, useRef, useState } from 'react';
import { Activity, ChevronDown, Database, ExternalLink, GitFork, History } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import type { DemoCase, LiveHealth } from '../../types';
import type { HeaderDataScope } from '../../types/ui';

const configuredRepositoryUrl = import.meta.env.VITE_PUBLIC_REPOSITORY_URL?.trim();
const publicRepositoryUrl = configuredRepositoryUrl && /^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(configuredRepositoryUrl)
  ? configuredRepositoryUrl
  : null;

export function getHeaderDataScope(cases: DemoCase[]): HeaderDataScope {
  const scopes = cases.map((item) => item.response.scope);
  const companies = [...new Set(scopes.flatMap((scope) => scope.companies))].sort((left, right) => left.localeCompare(right));
  const years = [...new Set(scopes.flatMap((scope) => scope.years))].sort((left, right) => left - right);
  const corpora = [...new Set(scopes.map((scope) => scope.corpus).filter(Boolean))];
  return { companies, years, corpus: corpora.length === 1 ? corpora[0] : null };
}

function formatScopeYears(years: number[]): string {
  if (years.length === 0) return '';
  return years.length > 1 && years.every((year, index) => index === 0 || year === years[index - 1] + 1)
    ? `${years[0]}–${years[years.length - 1]}`
    : years.join(' · ');
}

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>;
}

function DataScopeControl({ scope }: { scope: HeaderDataScope }) {
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!controlRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className="scope-control" ref={controlRef}>
      <button ref={buttonRef} type="button" className="scope-label" aria-haspopup="dialog" aria-expanded={open} aria-controls="data-scope-popover" onClick={() => setOpen((value) => !value)}>
        <Database size={13} /><span>数据范围</span><ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && <section id="data-scope-popover" className="scope-popover" role="dialog" aria-label="数据范围">
        <strong>数据范围</strong>
        {scope.companies.length > 0 || scope.years.length > 0 || scope.corpus ? <dl>
          {scope.companies.length > 0 && <div><dt>公司</dt><dd>{scope.companies.join(' · ')}</dd></div>}
          {scope.years.length > 0 && <div><dt>年份</dt><dd>{formatScopeYears(scope.years)}</dd></div>}
          {scope.corpus && <div><dt>语料</dt><dd>{scope.corpus}</dd></div>}
        </dl> : <p>正在加载已发布的数据范围。</p>}
      </section>}
    </div>
  );
}

export function GlobalHeader({ health, scope }: { health: LiveHealth; scope: HeaderDataScope }) {
  const liveReady = health.live.enabled && health.live.ready;
  const liveStatus = !health.live.enabled
    ? { className: 'is-idle', symbol: '○', label: '未启动' }
    : liveReady ? { className: 'is-online', symbol: '●', label: '在线' } : { className: 'is-unavailable', symbol: '△', label: '不可用' };
  return (
    <header className="topbar">
      <NavLink className="brand" to="/" aria-label="跳跳糖工作台首页"><BrandMark /><span><strong>跳跳糖</strong><small>HopCandy</small></span></NavLink>
      <nav className="main-nav" aria-label="主导航">
        <NavLink to="/" end>工作台</NavLink><NavLink to="/experiments">实验</NavLink><NavLink to="/architecture">架构</NavLink>
      </nav>
      <div className="runtime-strip">
        <DataScopeControl scope={scope} />
        <span className={`live-indicator ${liveStatus.className}`} title="实时推理状态"><Activity size={13} /> <span className="status-name live-status-name">实时推理</span><b aria-hidden="true">{liveStatus.symbol}</b><span>{liveStatus.label}</span></span>
        <span className="data-source is-available" title="冻结回放状态"><History size={13} /> <span className="status-name replay-status-name">冻结回放</span><b aria-hidden="true">●</b><span>可用</span></span>
        {publicRepositoryUrl && <a className="repository-link" href={publicRepositoryUrl} target="_blank" rel="noopener noreferrer" title="查看公开仓库"><GitFork size={13} /><span>GitHub</span><ExternalLink size={12} /></a>}
      </div>
    </header>
  );
}
