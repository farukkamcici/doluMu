// frontend/src/components/ui/CrowdChart.jsx
'use client';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useMemo } from 'react';

export default function CrowdChart({ data }) {
  // Memoize formatted data to prevent re-calculation on re-renders
  const formattedData = useMemo(() => {
    return data.map(item => ({
      ...item,
      // Display only the hour number on the X-axis for clarity
      hourLabel: item.hour.split(':')[0],
    }));
  }, [data]);

  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={formattedData}
          margin={{
            top: 10,
            right: 30,
            left: 0,
            bottom: 0,
          }}
        >
          <defs>
            {/* Gradient for the chart area */}
            <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.3} />
            </linearGradient>
          </defs>
          
          {/* Grid for better readability */}
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />

          {/* X-axis representing the hour of the day */}
          <XAxis 
            dataKey="hourLabel" 
            tick={{ fontSize: 12, fill: '#6b7280' }}
            axisLine={{ stroke: '#d1d5db' }}
            tickLine={{ stroke: '#d1d5db' }}
            interval="preserveStartEnd" // Ensures start and end labels are shown
          />

          {/* Y-axis representing the crowd score */}
          <YAxis 
            domain={[0, 100]}
            tick={{ fontSize: 12, fill: '#6b7280' }}
            axisLine={{ stroke: '#d1d5db' }}
            tickLine={{ stroke: '#d1d5db' }}
          />

          {/* Custom Tooltip for hover details */}
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.8)',
              borderColor: '#d1d5db',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
            }}
            labelFormatter={(label) => `Hour: ${label}:00`}
          />

          {/* The main area of the chart */}
          <Area 
            type="monotone" 
            dataKey="score" 
            stroke="#ef4444" 
            fill="url(#colorScore)" 
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
