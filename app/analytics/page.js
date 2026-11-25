'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  Users,
  Eye,
  Activity,
  MousePointerClick,
  ArrowLeft,
  RefreshCw,
  Download,
  Globe,
  Monitor,
  Clock,
  TrendingUp,
} from 'lucide-react';
import './analytics.css';

const RANGES = [
  { key: 1, label: '24 hours' },
  { key: 7, label: '7 days' },
  { key: 30, label: '30 days' },
  { key: 90, label: '90 days' },
];

const PIE_COLORS = ['#1d4ed8', '#0ea5e9', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b', '#22c55e'];

function KpiCard({ icon: Icon, label, value, sub, tone = '' }) {
  return (
    <div className="an-kpi">
      <div>
        <p className="an-kpi-label">{label}</p>
        <p className="an-kpi-value">{value}</p>
        {sub ? <p className="an-kpi-sub">{sub}</p> : null}
      </div>
      <span className={`an-kpi-icon ${tone}`}>
        <Icon size={18} />
      </span>
    </div>
  );
}

function Panel({ title, subtitle, children, action }) {
  return (
    <section className="an-panel">
      <div className="an-panel-head">
        <div>
          <h3 className="an-panel-title">{title}</h3>
          {subtitle ? <p className="an-panel-sub">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ShareBar({ items, emptyLabel = 'No data yet' }) {
  const max = items?.[0]?.count || 1;
  if (!items?.length) return <p className="an-empty">{emptyLabel}</p>;
  return (
    <ul className="an-share-list">
      {items.map((item) => (
        <li key={item.name}>
          <div className="an-share-row">
            <span className="an-share-name">{item.name}</span>
            <span className="an-share-val">
              {item.count.toLocaleString()} · {item.share}%
            </span>
          </div>
          <div className="an-share-track">
            <div className="an-share-fill" style={{ width: `${Math.max(2, (item.count / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function AnalyticsPage() {
  const [range, setRange] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setLoading(true);
      try {
        const res = await fetch(`/api/analytics/stats?range=${range}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const json = await res.json();
        setData(json);
        setError(null);
        setLastUpdated(new Date());
      } catch (err) {
        setError(err.message || 'Unable to load analytics');
      } finally {
        setLoading(false);
      }
    },
    [range]
  );

  useEffect(() => {
    load(true);
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => load(false), 30000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  const exportCsv = () => {
    if (!data) return;

    const esc = (value) => {
      const s = value === null || value === undefined ? '' : String(value);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const line = (cells) => cells.map(esc).join(',');
    const block = (title, headers, rows) => {
      const out = [line([title]), line(headers)];
      rows.forEach((r) => out.push(line(r)));
      out.push('');
      return out;
    };

    const t = data.totals || {};
    const rows = [];

    rows.push(
      ...block(
        'SUMMARY',
        ['metric', 'value'],
        [
          ['range_days', data.range],
          ['generated_at', data.generatedAt],
          ['storage', data.storage || 'unknown'],
          ['pageviews', t.pageviews ?? 0],
          ['unique_visitors', t.visitors ?? 0],
          ['sessions', t.sessions ?? 0],
          ['pages_per_session', t.pagesPerSession ?? 0],
          ['bounce_rate_pct', t.bounceRate ?? 0],
          ['today_pageviews', t.todayViews ?? 0],
          ['today_visitors', t.todayVisitors ?? 0],
          ['live_visitors_5min', t.liveVisitors ?? 0],
          ['all_time_pageviews', t.allTimeViews ?? 0],
        ]
      )
    );

    rows.push(
      ...block(
        'DAILY_TRAFFIC',
        ['date', 'pageviews', 'visitors'],
        (data.dailySeries || []).map((d) => [d.date, d.pageviews, d.visitors])
      )
    );

    rows.push(
      ...block(
        'HOURLY_TRAFFIC_UTC',
        ['hour', 'pageviews'],
        (data.hourly || []).map((h) => [h.hour, h.pageviews])
      )
    );

    const shareBlock = (title, label, items) =>
      block(title, [label, 'pageviews', 'share_pct'], (items || []).map((i) => [i.name, i.count, i.share]));

    rows.push(...shareBlock('TOP_PAGES', 'path', data.topPages));
    rows.push(...shareBlock('REFERRERS', 'referrer', data.topReferrers));
    rows.push(...shareBlock('DEVICES', 'device', data.devices));
    rows.push(...shareBlock('BROWSERS', 'browser', data.browsers));
    rows.push(...shareBlock('OPERATING_SYSTEMS', 'os', data.os));
    rows.push(...shareBlock('COUNTRIES', 'country', data.countries));

    rows.push(
      ...block(
        'RECENT_VISITS',
        ['timestamp_utc', 'path', 'device', 'browser', 'os', 'country', 'referrer', 'session'],
        (data.recent || []).map((v) => [v.t, v.path, v.device, v.browser, v.os, v.country, v.referrer, v.sid])
      )
    );

    const csv = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nphi-analytics-${range}d-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totals = data?.totals;
  const deviceData = useMemo(
    () => (data?.devices || []).map((d) => ({ name: d.name, value: d.count })),
    [data]
  );

  return (
    <div className="an-page">
      <header className="an-header">
        <div className="an-header-inner">
          <div className="an-brand">
            <a href="/" className="an-back">
              <ArrowLeft size={14} /> Dashboard
            </a>
            <div>
              <h1 className="an-title">Visitor Analytics</h1>
              <p className="an-subtitle">Traffic, engagement and audience insights for the NTD-WASH dashboard</p>
            </div>
          </div>

          <div className="an-controls">
            <div className="an-range">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={range === r.key ? 'is-active' : ''}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setAutoRefresh((v) => !v)}
              className={`an-btn ${autoRefresh ? 'is-live' : ''}`}
            >
              <Activity size={14} />
              {autoRefresh ? 'Live · 30s' : 'Paused'}
            </button>
            <button onClick={() => load(true)} className="an-btn">
              <RefreshCw size={14} className={loading ? 'an-spin' : ''} /> Refresh
            </button>
            <button onClick={exportCsv} className="an-btn is-dark">
              <Download size={14} /> CSV
            </button>
            <a
              href={`/api/analytics/export?range=${range}`}
              className="an-btn is-dark"
              download
              title="Every raw event for the selected range"
            >
              <Download size={14} /> Raw CSV
            </a>
          </div>
        </div>
      </header>

      <main className="an-main">
        {error ? <div className="an-error">{error}</div> : null}

        <div className="an-kpis">
          <KpiCard
            icon={Eye}
            label="Pageviews"
            value={(totals?.pageviews ?? 0).toLocaleString()}
            sub={range === 1 ? 'Last 24 hours' : `Last ${range} days`}
          />
          <KpiCard
            icon={Users}
            label="Unique visitors"
            value={(totals?.visitors ?? 0).toLocaleString()}
            sub={`${(totals?.pagesPerSession ?? 0).toFixed(2)} pages / visitor`}
            tone="teal"
          />
          <KpiCard
            icon={MousePointerClick}
            label="Bounce rate"
            value={`${totals?.bounceRate ?? 0}%`}
            sub="Single-page sessions"
            tone="amber"
          />
          <KpiCard
            icon={TrendingUp}
            label="Today"
            value={(totals?.todayViews ?? 0).toLocaleString()}
            sub={`${totals?.todayVisitors ?? 0} visitors · ${totals?.liveVisitors ?? 0} live now`}
            tone="violet"
          />
        </div>

        <Panel
          title="Traffic over time"
          subtitle="Pageviews and unique visitors per day"
          action={
            <span className="an-updated">
              {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : ''}
            </span>
          }
        >
          <div className="an-chart-lg">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.dailySeries || []} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="pv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="uv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} padding={{ left: 8, right: 16 }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} allowDecimals={false} domain={[0, (max) => Math.max(4, Math.ceil(max * 1.2))]} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="pageviews" name="Pageviews" fill="#1d4ed8" radius={[3, 3, 0, 0]} maxBarSize={22} />
                <Bar dataKey="visitors" name="Visitors" fill="#14b8a6" radius={[3, 3, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <div className="an-grid-3">
          <Panel title="Visits by hour" subtitle="UTC hour of day across the selected range">
            <div className="an-chart-sm">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.hourly || []} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#64748b' }} interval={3} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="pageviews" name="Pageviews" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Devices" subtitle="Share of pageviews by device type">
            <div className="an-chart-sm">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={deviceData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={72} paddingAngle={2}>
                    {deviceData.map((entry, i) => (
                      <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Top pages" subtitle="Most viewed routes">
            <ShareBar items={data?.topPages} />
          </Panel>
        </div>

        <div className="an-grid-3">
          <Panel title="Referrers" subtitle="Where visitors come from">
            <ShareBar items={data?.topReferrers} />
          </Panel>
          <Panel title="Browsers" subtitle="Browser share">
            <ShareBar items={data?.browsers} />
          </Panel>
          <Panel title="Operating systems" subtitle="OS share">
            <ShareBar items={data?.os} />
          </Panel>
        </div>

        <div className="an-grid-3">
          <Panel title="Countries" subtitle="Coarse geo from request headers">
            <ShareBar items={data?.countries} />
          </Panel>

          <Panel
            title="Recent visits"
            subtitle="Latest 25 pageviews"
            action={<Clock size={16} color="#94a3b8" />}
          >
            <div className="an-table-wrap">
              <table className="an-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Page</th>
                    <th>Device</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recent || []).map((v, i) => (
                    <tr key={`${v.t}-${i}`}>
                      <td>{new Date(v.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="an-cell-path">{v.path}</td>
                      <td>{v.device}</td>
                      <td className="an-cell-src">{v.referrer}</td>
                    </tr>
                  ))}
                  {!data?.recent?.length ? (
                    <tr>
                      <td colSpan={4} className="an-empty">
                        No visits recorded yet
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Audience summary" subtitle="Aggregated engagement for the range">
            <dl className="an-summary">
              {[
                ['Sessions', (totals?.sessions ?? 0).toLocaleString()],
                ['Pages per session', (totals?.pagesPerSession ?? 0).toFixed(2)],
                ['Bounce rate', `${totals?.bounceRate ?? 0}%`],
                ['Live visitors (5 min)', (totals?.liveVisitors ?? 0).toLocaleString()],
                ['All-time pageviews', (totals?.allTimeViews ?? 0).toLocaleString()],
              ].map(([k, v]) => (
                <div className="an-summary-row" key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="an-note">
              <Globe size={12} style={{ marginTop: 2, flexShrink: 0 }} />
              Visits are stored in PostgreSQL ({data?.storage === 'postgres' ? 'connected' : 'fallback to local file'}).
              No cookies, no third-party trackers.
            </p>
          </Panel>
        </div>

        <p className="an-foot">
          <Monitor size={14} /> NTD-WASH dashboard analytics · first-party, privacy-friendly
        </p>
      </main>
    </div>
  );
}
