"use client";

import { useState, useEffect } from "react";

interface RefSummary {
  ref: string;
  total_clicks: number;
  unique_visitors: number;
  clicks_30d: number;
  unique_30d: number;
  first_click: string;
  last_click: string;
}

interface DailyRow {
  ref: string;
  day: string;
  clicks: number;
  unique_ips: number;
}

export default function TrackingPage() {
  const [summary, setSummary] = useState<RefSummary[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clicks")
      .then((r) => r.json())
      .then((data) => {
        setSummary(data.summary || []);
        setDaily(data.daily || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalClicks = summary.reduce((s, r) => s + r.total_clicks, 0);
  const totalUnique = summary.reduce((s, r) => s + r.unique_visitors, 0);
  const total30d = summary.reduce((s, r) => s + r.clicks_30d, 0);

  const filteredDaily = selectedRef
    ? daily.filter((d) => d.ref === selectedRef)
    : daily;

  // Aggregate daily across all refs if no filter
  const dailyAgg: Record<string, { clicks: number; unique_ips: number }> = {};
  filteredDaily.forEach((d) => {
    if (!dailyAgg[d.day]) dailyAgg[d.day] = { clicks: 0, unique_ips: 0 };
    dailyAgg[d.day].clicks += d.clicks;
    dailyAgg[d.day].unique_ips += d.unique_ips;
  });
  const dailyRows = Object.entries(dailyAgg)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 30);

  // Simple bar chart data (last 14 days)
  const chartDays = dailyRows.slice(0, 14).reverse();
  const maxClicks = Math.max(1, ...chartDays.map(([, d]) => d.clicks));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">
          Click Tracking
        </h1>
        <p className="mt-1.5 text-text-secondary">
          Banner &amp; referral link analytics
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "Total Clicks", value: totalClicks, color: "text-accent-blue" },
          { label: "Unique Visitors", value: totalUnique, color: "text-accent-purple" },
          { label: "Clicks (30d)", value: total30d, color: "text-accent-green" },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-border bg-bg-card p-5"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-text-secondary">
              {card.label}
            </p>
            <p className={`mt-2 text-3xl font-bold ${card.color}`}>
              {loading ? "—" : card.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Mini bar chart */}
      {chartDays.length > 0 && (
        <div className="rounded-xl border border-border bg-bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-text-primary">
            Last 14 Days {selectedRef && <span className="text-accent-gold">({selectedRef})</span>}
          </h2>
          <div className="flex items-end gap-1.5" style={{ height: 100 }}>
            {chartDays.map(([day, data]) => {
              const h = Math.max(4, (data.clicks / maxClicks) * 100);
              return (
                <div key={day} className="group relative flex flex-1 flex-col items-center">
                  <div
                    className="w-full rounded-t bg-accent-gold/70 transition-colors hover:bg-accent-gold"
                    style={{ height: `${h}%`, minHeight: 4 }}
                  />
                  <span className="mt-1 text-[9px] text-text-secondary">
                    {day.slice(5)}
                  </span>
                  {/* Tooltip */}
                  <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 rounded bg-bg-secondary px-2 py-1 text-xs text-text-primary opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                    {data.clicks} clicks
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sources table */}
      <div className="rounded-xl border border-border bg-bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-text-primary">Sources</h2>
          <p className="text-xs text-text-secondary mt-1">
            Use link format: <code className="rounded bg-bg-secondary px-1.5 py-0.5 text-accent-gold">augurms.com/api/t/SOURCE_NAME</code>
          </p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-text-secondary">Loading...</div>
        ) : summary.length === 0 ? (
          <div className="p-8 text-center text-text-secondary">
            No clicks tracked yet. Share your tracking links to get started.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-text-secondary">
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3 text-right">Total</th>
                <th className="px-5 py-3 text-right">Unique</th>
                <th className="px-5 py-3 text-right">30d</th>
                <th className="px-5 py-3 text-right">30d Unique</th>
                <th className="px-5 py-3">First Click</th>
                <th className="px-5 py-3">Last Click</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row) => (
                <tr
                  key={row.ref}
                  className="border-b border-border/50 transition-colors hover:bg-bg-secondary/50"
                >
                  <td className="px-5 py-3">
                    <code className="rounded bg-accent-gold/10 px-2 py-0.5 text-accent-gold">
                      {row.ref}
                    </code>
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-text-primary">
                    {row.total_clicks.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right text-text-secondary">
                    {row.unique_visitors.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-accent-green">
                    {row.clicks_30d.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right text-text-secondary">
                    {row.unique_30d.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-xs text-text-secondary">
                    {new Date(row.first_click).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3 text-xs text-text-secondary">
                    {new Date(row.last_click).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() =>
                        setSelectedRef(selectedRef === row.ref ? null : row.ref)
                      }
                      className={`rounded px-2 py-1 text-xs transition-colors ${
                        selectedRef === row.ref
                          ? "bg-accent-gold/20 text-accent-gold"
                          : "bg-bg-secondary text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      {selectedRef === row.ref ? "Clear" : "Filter"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Daily breakdown */}
      {dailyRows.length > 0 && (
        <div className="rounded-xl border border-border bg-bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-text-primary">
              Daily Breakdown {selectedRef && <span className="text-accent-gold">({selectedRef})</span>}
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-text-secondary">
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3 text-right">Clicks</th>
                <th className="px-5 py-3 text-right">Unique IPs</th>
              </tr>
            </thead>
            <tbody>
              {dailyRows.map(([day, data]) => (
                <tr
                  key={day}
                  className="border-b border-border/50 transition-colors hover:bg-bg-secondary/50"
                >
                  <td className="px-5 py-3 text-text-primary">{day}</td>
                  <td className="px-5 py-3 text-right font-medium text-text-primary">
                    {data.clicks.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right text-text-secondary">
                    {data.unique_ips.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
