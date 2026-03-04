'use client';

import { useMemo } from 'react'; // Ensure this import is correctly processed
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { format, parse } from 'date-fns';
import { id } from 'date-fns/locale';

interface ChartData {
    name: string;
    total: number;
}

interface AttendanceChartProps {
    data: ChartData[];
    selectedMonth: string; // Expecting a 'yyyy-MM' string
}

const COLORS = {
    'Hadir': '#22c55e',      // green-500
    'Terlambat': '#f59e0b', // amber-500
    'Izin': '#f97316',       // orange-500
    'Sakit': '#ef4444',      // red-500
    'Dinas': '#3b82f6',      // blue-500
    'Alpa': '#6b7280',       // gray-500
};

export function AttendanceChart({ data, selectedMonth }: AttendanceChartProps) {
  const monthDescription = useMemo(() => {
    // Handles case where selectedMonth might be initially undefined
    const dateToFormat = selectedMonth ? parse(selectedMonth, 'yyyy-MM', new Date()) : new Date();
    return format(dateToFormat, 'MMMM yyyy', { locale: id });
  }, [selectedMonth]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Grafik Kehadiran</CardTitle>
        <CardDescription>Ringkasan kehadiran Anda di bulan {monthDescription}.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis 
              dataKey="name" 
              stroke="#888888"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              stroke="#888888"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={30}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                borderColor: "hsl(var(--border))",
                borderRadius: "var(--radius)",
              }}
              labelStyle={{
                  color: "hsl(var(--foreground))"
              }}
              itemStyle={{
                  color: "hsl(var(--foreground))"
              }}
              formatter={(value, name) => [value, name]}
            />
            <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS] || '#8884d8'} />
                ))}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
