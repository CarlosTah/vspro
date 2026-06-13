'use client';

import { useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { FinancialDashboard } from '@/components/dashboard/financial-dashboard';
import { PerformanceCharts } from '@/components/dashboard/performance-charts';

type Tab = 'financial' | 'performance';

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('financial');
  const [period, setPeriod] = useState('month');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Reportes</h1>
          <p className="text-sm text-gray-400">Análisis financiero y de rendimiento</p>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white"
        >
          <option value="today">Hoy</option>
          <option value="week">Última semana</option>
          <option value="month">Este mes</option>
          <option value="quarter">Trimestre</option>
          <option value="year">Este año</option>
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-800 p-1">
        <button
          onClick={() => setTab('financial')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'financial' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          💰 Financiero
        </button>
        <button
          onClick={() => setTab('performance')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'performance' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          📈 Rendimiento
        </button>
      </div>

      {/* Content */}
      {tab === 'financial' && <FinancialDashboard period={period} />}
      {tab === 'performance' && <PerformanceCharts period={period} />}
    </div>
  );
}
