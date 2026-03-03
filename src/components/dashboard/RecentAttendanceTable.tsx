'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

// Dummy data, replace with actual data from your backend
const attendanceHistory = [
  { name: "Budi Santoso", status: "Hadir", time: "07:01:12" },
  { name: "Ani Yudhoyono", status: "Hadir", time: "07:03:45" },
  { name: "Citra Lestari", status: "Terlambat", time: "07:16:21" },
  { name: "Doni Firmansyah", status: "Hadir", time: "07:05:55" },
  { name: "Eka Putri", status: "Sakit", time: "-" },
];

export default function RecentAttendanceTable() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Riwayat Kehadiran Terbaru</CardTitle>
        <CardDescription>Daftar guru & pegawai yang melakukan absensi hari ini.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Jam Masuk</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {attendanceHistory.map((item) => (
              <TableRow key={item.name}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>
                  <Badge 
                    variant={item.status === "Hadir" ? "default" : item.status === "Terlambat" ? "destructive" : "secondary"}
                  >
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{item.time}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
