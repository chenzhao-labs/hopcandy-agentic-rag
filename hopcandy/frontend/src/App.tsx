import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, LoaderCircle, RefreshCw } from 'lucide-react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { GlobalHeader, getHeaderDataScope } from './components/layout/GlobalHeader';
import { ArchitecturePage } from './pages/ArchitecturePage';
import { ExperimentsPage } from './pages/ExperimentsPage';
import { WorkbenchPage } from './pages/WorkbenchPage';
import { loadPublication } from './lib/publication';
import type { LiveHealth, PublicationData } from './types';

const defaultHealth: LiveHealth = { status: 'ok', replay_available: true, live: { enabled: false, ready: false, state: 'on_demand', model: null } };

function LoadingScreen() {
  return <main className="loading-screen" aria-live="polite"><LoaderCircle className="spin" size={28} /><p>正在校验冻结发布数据…</p></main>;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('HopCandy UI error', error, info); }
  render() {
    if (this.state.failed) return <main className="fatal-error"><AlertTriangle size={28} /><h1>界面加载失败</h1><p>冻结数据未被修改。请刷新页面重试。</p><button onClick={() => window.location.reload()}><RefreshCw size={16} />刷新</button></main>;
    return this.props.children;
  }
}

export function App() {
  const [data, setData] = useState<PublicationData | null>(null);
  const [health, setHealth] = useState(defaultHealth);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => { loadPublication().then(setData).catch((error) => setLoadError(error instanceof Error ? error.message : 'Unknown data error')); }, []);
  const headerScope = useMemo(() => getHeaderDataScope(data?.cases ?? []), [data]);
  if (loadError) return <div className="fatal-error"><AlertTriangle size={28} /><h1>发布数据校验失败</h1><p>{loadError}</p></div>;
  return <ErrorBoundary><BrowserRouter><div className="app-shell"><GlobalHeader health={health} scope={headerScope} />{!data ? <LoadingScreen /> : <Routes><Route path="/" element={<WorkbenchPage data={data} health={health} setHealth={setHealth} />} /><Route path="/experiments" element={<ExperimentsPage data={data} />} /><Route path="/architecture" element={<ArchitecturePage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>}</div></BrowserRouter></ErrorBoundary>;
}
