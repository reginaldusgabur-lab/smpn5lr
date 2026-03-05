'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const statusVariant: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
    'Hadir': 'default', 'Sakit': 'destructive', 'Izin': 'secondary', 'Terlambat': 'outline',
}

interface RecentActivityTableProps {
  activity: {
    id: string;
    sequence: number;
    name: string;
    role: string;
    checkInTimeFormatted: string;
    checkOutTimeFormatted: string;
    status: string;
  }[];
}

export const RecentActivityTable = ({ activity }: RecentActivityTableProps) => (
  <Card className="lg:col-span-2">
    <CardHeader>
      <CardTitle>Aktivitas Pengguna Terbaru</CardTitle>
      <CardDescription>Aktivitas kehadiran semua pengguna yang tercatat hari ini.</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px] text-center">No.</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>Peran</TableHead>
              <TableHead className="text-center">Waktu Masuk</TableHead>
              <TableHead className="text-center">Waktu Pulang</TableHead>
              <TableHead className="text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activity.length > 0 ? activity.map((item: any) => (
              <TableRow key={item.id}>
                <TableCell className="text-center font-medium">{item.sequence}</TableCell>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="capitalize">{item.role}</TableCell>
                <TableCell className="text-center">{item.checkInTimeFormatted}</TableCell>
                <TableCell className="text-center">{item.checkOutTimeFormatted}</TableCell>
                <TableCell className="text-center"><Badge variant={statusVariant[item.status] || 'default'}>{item.status}</Badge></TableCell>
              </TableRow>
            )) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">Belum ada aktivitas kehadiran hari ini.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </CardContent>
  </Card>
);
