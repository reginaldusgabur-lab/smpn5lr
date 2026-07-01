

'use client';

import { useState, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { format, startOfMonth, parseISO, isValid, endOfMonth, endOfDay, startOfDay } from 'date-fns';
import { id } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { doc, writeBatch, collection, query, where, getDocs, Timestamp, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import { Download, ChevronLeft, ChevronRight, CheckCircle2, XCircle, FileWarning, CalendarClock, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

// --- Type Definitions ---
interface ReportDetail {
  id: string;
  date: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  status: string;
  description: string;
}

interface UserData { name?: string; }
interface ClientShellProps {
  userId: string;
  initialUserData: UserData;
  initialReportData: ReportDetail[];
  initialMonth: string;
  initialSchoolConfig: any;
}

// --- Main Component ---
export default function ReportClientShell({ 
    userId, 
    initialUserData,
    initialReportData,
    initialMonth,
}: ClientShellProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const firestore = useFirestore();
    const { user: authUser } = useUser();
    const { toast } = useToast();

    const [userData] = useState<UserData>(initialUserData);
    const [reportDetails, setReportDetails] = useState<ReportDetail[]>(initialReportData || []);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const parsedInitialMonth = parseISO(initialMonth);
    const [currentMonth, setCurrentMonth] = useState(isValid(parsedInitialMonth) ? parsedInitialMonth : new Date());

    const summaryStats = useMemo(() => {
        const hadir = reportDetails.filter(d => d.status === 'Hadir' || d.status === 'Terlambat').length;
        const sakit = reportDetails.filter(d => d.status === 'Sakit').length;
        const izin = reportDetails.filter(d => d.status === 'Izin' || d.status === 'Dinas').length;
        const alpa = reportDetails.filter(d => d.status === 'Alpa').length;
        return { hadir, sakit, izin, alpa };
    }, [reportDetails]);

    const chartData = [
        { name: 'Hadir', Jumlah: summaryStats.hadir, fill: '#22c55e' },
        { name: 'Sakit', Jumlah: summaryStats.sakit, fill: '#f97316' },
        { name: 'Izin', Jumlah: summaryStats.izin, fill: '#3b82f6' },
        { name: 'Alpa', Jumlah: summaryStats.alpa, fill: '#ef4444' },
    ];

    const handleMonthChange = (amount: number) => {
        const newMonthDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + amount, 15);
        router.push(`${pathname}?month=${format(newMonthDate, 'yyyy-MM')}`);
    };
    
    const safeFormat = (date: string | Date | null, formatString: string): string => {
        if (!date) return '-';
        const dateObj = typeof date === 'string' ? parseISO(date) : date;
        return isValid(dateObj) ? format(dateObj, formatString, { locale: id }) : '-';
    }

    const handleStatusChange = async (date: string, newStatus: 'Sakit' | 'Izin' | 'Dinas', reason: string) => {
        if (!authUser || !firestore) return;
        setIsSubmitting(true);
        try {
            const targetDate = parseISO(date);
            const batch = writeBatch(firestore);
            
            const leaveRef = collection(firestore, 'users', userId, 'leaveRequests');
            const newLeaveDoc = doc(leaveRef);
            batch.set(newLeaveDoc, {
                userId,
                type: newStatus,
                status: 'approved',
                reason,
                startDate: Timestamp.fromDate(startOfDay(targetDate)),
                endDate: Timestamp.fromDate(endOfDay(targetDate)),
                createdAt: serverTimestamp(),
                approvedBy: authUser.uid,
                approvedAt: serverTimestamp(),
                createdBy: authUser.uid,
            });

            await batch.commit();
            
            // Optimistic UI update
            setReportDetails(prevDetails => 
                prevDetails.map(item => 
                    item.date === date ? { ...item, id: newLeaveDoc.id, status: newStatus, description: reason } : item
                )
            );

            toast({ title: 'Sukses', description: `Status berhasil diubah menjadi ${reason}.` });
        } catch (error) {
            console.error("Error changing status:", error);
            toast({ variant: 'destructive', title: 'Gagal', description: 'Terjadi kesalahan saat mengubah status.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleNavigateToManualEntry = (date: string) => {
        const formattedDate = format(parseISO(date), 'yyyy-MM-dd');
        router.push(`/dashboard/admin/kehadiran/${userId}/manual?date=${formattedDate}`);
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'Hadir': return <Badge variant="default" className="bg-green-100 text-green-800">Hadir</Badge>;
            case 'Terlambat': return <Badge variant="default" className="bg-yellow-100 text-yellow-800">Terlambat</Badge>;
            case 'Tidak Absen Pulang': return <Badge variant="secondary">Tidak Absen Pulang</Badge>;
            case 'Belum Absen Pulang': return <Badge variant="outline">Belum Absen</Badge>;
            case 'Sakit': return <Badge variant="default" className="bg-orange-100 text-orange-800">Sakit</Badge>;
            case 'Izin': return <Badge variant="default" className="bg-blue-100 text-blue-800">Izin</Badge>;
            case 'Dinas': return <Badge variant="default" className="bg-purple-100 text-purple-800">Dinas</Badge>;
            case 'Alpa': 
                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Badge variant="destructive" className="cursor-pointer hover:bg-destructive/80">
                                Alpa <MoreVertical className="h-3 w-3 ml-1" />
                            </Badge>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem onClick={() => handleStatusChange(reportDetails.find(d => d.status === 'Alpa')!.date, 'Sakit', 'Sakit')}>Ubah ke Sakit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(reportDetails.find(d => d.status === 'Alpa')!.date, 'Izin', 'Izin Pribadi')}>Ubah ke Izin</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(reportDetails.find(d => d.status === 'Alpa')!.date, 'Dinas', 'Dinas Pagi')}>Ubah ke Dinas Pagi</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(reportDetails.find(d => d.status === 'Alpa')!.date, 'Dinas', 'Dinas Siang')}>Ubah ke Dinas Siang</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                );
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    const canGoPrev = currentMonth > new Date(2026, 0, 1);

    return (
        <div className="p-2 sm:p-6 space-y-4">
            {/* --- Header Cards --- */}
             <Card className="rounded-xl border shadow-none overflow-hidden">
                <CardHeader className="p-4 border-b border-muted-foreground/10">
                    <CardTitle className="text-xs uppercase font-bold tracking-tight text-primary">Ringkasan Bulan {format(currentMonth, 'MMMM yyyy', { locale: id })}</CardTitle>
                    <CardDescription className="text-[10px] font-bold">Grafik ringkasan kehadiran untuk {userData?.name || 'Pengguna'}.</CardDescription>
                </CardHeader>
                <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                                    <YAxis hide />
                                    <Tooltip cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
                                    <Bar dataKey="Jumlah" radius={[4, 4, 0, 0]} barSize={40} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Card className="flex flex-col justify-center items-center text-center p-3 rounded-xl bg-muted/20 border-none">
                                <span className="text-2xl font-black text-green-600">{summaryStats.hadir}</span>
                                <p className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 uppercase tracking-wider mt-1"><CheckCircle2 className="h-3 w-3 text-green-500"/> Hadir</p>
                            </Card>
                             <Card className="flex flex-col justify-center items-center text-center p-3 rounded-xl bg-muted/20 border-none">
                                <span className="text-2xl font-black text-red-600">{summaryStats.alpa}</span>
                                <p className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 uppercase tracking-wider mt-1"><XCircle className="h-3 w-3 text-red-500"/> Alpa</p>
                            </Card>
                             <Card className="flex flex-col justify-center items-center text-center p-3 rounded-xl bg-muted/20 border-none">
                                <span className="text-2xl font-black text-blue-600">{summaryStats.izin}</span>
                                <p className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 uppercase tracking-wider mt-1"><FileWarning className="h-3 w-3 text-blue-500"/> Izin</p>
                            </Card>
                             <Card className="flex flex-col justify-center items-center text-center p-3 rounded-xl bg-muted/20 border-none">
                                <span className="text-2xl font-black text-orange-600">{summaryStats.sakit}</span>
                                <p className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 uppercase tracking-wider mt-1"><CalendarClock className="h-3 w-3 text-orange-500"/> Sakit</p>
                            </Card>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* --- Details Table --- */}
            <Card className="rounded-xl border shadow-none overflow-hidden">
                <CardHeader className="p-4 border-b border-muted-foreground/10">
                    <CardTitle className="text-xs uppercase font-bold tracking-tight text-primary">Detail Laporan Harian</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="p-4 space-y-4">
                        <div className="flex flex-col items-center justify-center gap-4 py-2">
                            <div className="flex items-center bg-muted/40 rounded-2xl border border-muted-foreground/5 p-1 shrink-0">
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-10 w-10 rounded-xl hover:bg-background/50 shadow-none shrink-0" 
                                    onClick={() => handleMonthChange(-1)} 
                                    disabled={!canGoPrev}
                                >
                                    <ChevronLeft className="h-5 w-5 text-primary" />
                                </Button>
                                <span className="w-40 text-center font-black text-xl text-primary tracking-tight capitalize whitespace-nowrap">{format(currentMonth, 'MMMM yyyy', { locale: id })}</span>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-10 w-10 rounded-xl hover:bg-background/50 shadow-none shrink-0" 
                                    onClick={() => handleMonthChange(1)} 
                                    disabled={currentMonth >= endOfMonth(new Date())}
                                >
                                    <ChevronRight className="h-5 w-5 text-primary" />
                                </Button>
                            </div>
                        </div>
                    </div>
                    
                    <div className="overflow-x-auto border-t border-muted-foreground/5">
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow className="border-none">
                                    <TableHead className="w-[50px] text-center font-bold text-[10px] uppercase">No</TableHead>
                                    <TableHead className="font-bold text-[10px] uppercase">Tanggal</TableHead>
                                    <TableHead className="text-center font-bold text-[10px] uppercase">Masuk</TableHead>
                                    <TableHead className="text-center font-bold text-[10px] uppercase">Pulang</TableHead>
                                    <TableHead className="text-center font-bold text-[10px] uppercase">Status</TableHead>
                                    <TableHead className="font-bold text-[10px] uppercase">Keterangan</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {reportDetails.length > 0 ? (
                                    reportDetails.map((item, index) => (
                                        <TableRow key={item.id} className="hover:bg-muted/50 border-muted-foreground/5">
                                            <TableCell className="text-center font-bold text-xs text-muted-foreground">{index + 1}</TableCell>
                                            <TableCell className="font-bold text-sm whitespace-nowrap">{safeFormat(item.date, 'eeee, dd MMM yyyy')}</TableCell>
                                            <TableCell className="text-center font-mono text-xs font-bold">{safeFormat(item.checkInTime, 'HH:mm')}</TableCell>
                                            <TableCell className="text-center font-mono text-xs font-bold">{safeFormat(item.checkOutTime, 'HH:mm')}</TableCell>
                                            <TableCell className="text-center">
                                                {getStatusBadge(item.status)}
                                            </TableCell>
                                            <TableCell>
                                                {item.status === 'Tidak Absen Pulang' ? (
                                                    <Button variant="link" size="sm" className="h-auto p-0 text-[10px] font-bold uppercase tracking-tight" onClick={() => handleNavigateToManualEntry(item.date)}>
                                                        Perbaiki
                                                    </Button>
                                                ) : <span className="text-[10px] font-medium italic opacity-70">{item.description}</span>}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-48 text-center font-bold text-muted-foreground">
                                            Tidak ada data untuk periode ini.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

