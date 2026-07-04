'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, TrendingUp, RefreshCw } from 'lucide-react';
import { useUser, useFirestore, useMemoFirebase, useDoc } from '@/firebase';
import { doc } from 'firebase/firestore';
import { format, isSameMonth, addMonths, subMonths, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { id } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { calculateAttendanceStats, fetchUserMonthlyReportData } from '@/lib/attendance';
import { getFromCache, setInCache, invalidateCache } from '@/lib/cache';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface ReportItem {
  id: string;
  date: string;
  dateString: string;
  checkIn: string;
  checkOut: string;
  status: string;
  description: string;
  approvalStatus?: 'approved' | 'pending' | 'rejected';
}

export default function LaporanPage() {
  const { user, isUserLoading: isAuthLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [monthlyReportData, setMonthlyReportData] = useState<ReportItem[]>([]);
  const [stats, setStats] = useState<{ persentase: string } | null>(null);
  const [isReportLoading, setIsReportLoading] = useState(true);

  const schoolConfigRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'schoolConfig', 'default');
  }, [firestore]);
  const { data: schoolConfig, isLoading: isConfigLoading } = useDoc(user, schoolConfigRef);

  const cacheKey = useMemo(() => user ? `user_report_v2_${user.uid}_${format(currentMonth, 'yyyyMM')}` : null, [user, currentMonth]);

  const fetchReport = useCallback(async (forceRefresh = false) => {
    if (!user || !firestore || !schoolConfig || !cacheKey) return;
    
    setIsReportLoading(true);

    if (!forceRefresh) {
        const cachedData = getFromCache(cacheKey);
        if (cachedData) {
            setMonthlyReportData(cachedData);
            setIsReportLoading(false);
            return;
        }
    }

    try {
        const rawReport = await fetchUserMonthlyReportData(firestore, user.uid, currentMonth, schoolConfig);
        
        const formattedReport: ReportItem[] = rawReport.map((record: any) => ({
            id: record.id,
            date: record.date, 
            dateString: format(parseISO(record.date), 'eee, dd/MM/yy', { locale: id }),
            checkIn: record.checkInTime ? format(parseISO(record.checkInTime), 'HH:mm') : '-',
            checkOut: record.checkOutTime ? format(parseISO(record.checkOutTime), 'HH:mm') : '-',
            status: record.status,
            description: record.description,
            approvalStatus: record.approvalStatus
        }));

        setMonthlyReportData(formattedReport);
        setInCache(cacheKey, formattedReport);
    } catch (error) {
        console.error("Failed to fetch monthly report:", error);
        toast({ title: "Gagal Memuat Laporan", description: "Terjadi kesalahan saat mengambil data.", variant: "destructive" });
    } finally {
        setIsReportLoading(false);
    }
  }, [user, firestore, currentMonth, schoolConfig, cacheKey, toast]);

  useEffect(() => {
    if (!isConfigLoading && schoolConfig) {
        fetchReport();
    }
  }, [fetchReport, isConfigLoading, schoolConfig]);

  useEffect(() => {
    if (user?.uid && firestore && !isConfigLoading) {
        const fetchStats = async () => {
            const start = startOfMonth(currentMonth);
            const end = endOfMonth(currentMonth);
            const res = await calculateAttendanceStats(firestore, user.uid, { start, end });
            setStats(res);
        };
        fetchStats();
    }
  }, [user?.uid, firestore, currentMonth, isConfigLoading]);

  const handleRefresh = () => {
      if (cacheKey) invalidateCache(cacheKey);
      toast({ title: 'Sinkronisasi Data', description: 'Memaksa pembaruan data dari server.' });
      fetchReport(true);
  };

  const handlePrevMonth = () => {
    const minDate = new Date(2026, 0, 1);
    setCurrentMonth(prev => {
        const next = subMonths(prev, 1);
        return next < minDate ? prev : next;
    });
  };

  const handleNextMonth = () => {
      setCurrentMonth(prev => addMonths(prev, 1));
  };

  const isLoading = isAuthLoading || isConfigLoading || isReportLoading;
  const canGoPrev = currentMonth > new Date(2026, 0, 1);

  const getStatusBadgeStyle = (status: string) => {
      const s = status.toLowerCase();
      if (s === 'alpa') return 'bg-red-600 text-white border-none shadow-sm';
      if (s === 'sakit') return 'bg-orange-500 text-white border-none shadow-sm';
      if (s === 'izin' || s.includes('pribadi')) return 'bg-blue-800 text-white border-none shadow-sm';
      if (s === 'hadir') return 'bg-green-600 text-white border-none shadow-sm';
      return 'bg-primary text-white border-none shadow-sm';
  };

  if (isLoading && monthlyReportData.length === 0) {
    return (
        <div className="flex-1 pt-2 pb-24 md:p-8">
            <div className="max-w-7xl mx-auto space-y-4">
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-64 w-full rounded-xl" />
            </div>
        </div>
    );
  }

  return (
    <div className="flex-1 pt-2 pb-24 md:p-8">
        <div className="max-w-7xl mx-auto space-y-4">
            <Card className="overflow-hidden bg-card border border-muted-foreground/10 shadow-none rounded-xl">
              <CardHeader className="p-3 sm:p-4 text-primary border-b border-muted-foreground/10">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="font-bold text-[10px] tracking-widest uppercase opacity-70">Riwayat Absensi & Izin</CardTitle>
                        <CardDescription className="text-muted-foreground font-bold text-[9px] mt-0.5">Catatan lengkap kehadiran individu.</CardDescription>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-primary/5 shadow-none" onClick={handleRefresh} disabled={isLoading}>
                        <RefreshCw className={cn("h-3.5 w-3.5 text-muted-foreground", isLoading && "animate-spin")} />
                    </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0 min-h-[400px]">
                <div className="p-4 flex flex-col items-center justify-center gap-4">
                    <div className="flex items-center bg-muted/40 rounded-2xl border border-muted-foreground/5 p-1 shrink-0">
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-10 w-10 rounded-xl hover:bg-background/50 shadow-none shrink-0" 
                            onClick={handlePrevMonth} 
                            disabled={isLoading || !canGoPrev}
                        >
                            <ChevronLeft className="h-5 w-5 text-primary" />
                        </Button>
                        
                        <div className="flex items-center gap-3 px-4">
                            {stats && (
                                <div className="flex items-center gap-1.5 pr-3 border-r border-muted-foreground/20">
                                    <TrendingUp className="h-4 w-4 text-primary" />
                                    <span className="text-sm font-bold text-primary">{stats.persentase}</span>
                                </div>
                            )}
                            <span className="font-bold text-xl text-primary tracking-tight text-center capitalize whitespace-nowrap min-w-[120px]">
                                {format(currentMonth, 'MMMM yyyy', { locale: id })}
                            </span>
                        </div>

                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-10 w-10 rounded-xl hover:bg-background/50 shadow-none shrink-0" 
                            onClick={handleNextMonth} 
                            disabled={isSameMonth(currentMonth, new Date())}
                        >
                            <ChevronRight className="h-5 w-5 text-primary" />
                        </Button>
                    </div>
                </div>

                <div className="border-t border-muted-foreground/5 overflow-x-auto">
                    <Table className="min-w-[720px]">
                        <TableHeader className="bg-muted/30">
                            <TableRow className="border-none">
                                <TableHead className="w-[50px] text-center font-bold text-[10px] uppercase tracking-widest text-muted-foreground">No</TableHead>
                                <TableHead className="w-[180px] font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Tanggal</TableHead>
                                <TableHead className="w-[100px] text-center font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Masuk</TableHead>
                                <TableHead className="w-[100px] text-center font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Pulang</TableHead>
                                <TableHead className="w-[140px] text-center font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Status</TableHead>
                                <TableHead className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Keterangan</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {monthlyReportData.length > 0 ? (
                                monthlyReportData.map((record, index) => (
                                    <TableRow key={record.id} className="hover:bg-primary/5 transition-colors border-muted-foreground/5">
                                        <TableCell className="text-center font-bold text-muted-foreground text-xs">{index + 1}</TableCell>
                                        <TableCell className="font-bold text-sm text-foreground whitespace-nowrap">{record.dateString}</TableCell>
                                        <TableCell className="text-center font-mono text-xs font-bold text-foreground">{record.checkIn}</TableCell>
                                        <TableCell className="text-center font-mono text-xs font-bold text-foreground">{record.checkOut}</TableCell>
                                        <TableCell className="text-center whitespace-nowrap">
                                            <Badge variant="outline" className={cn("text-[9px] font-bold uppercase px-3 py-1 rounded-full", getStatusBadgeStyle(record.status))}>
                                                {record.status}
                                            </Badge>
                                            {record.approvalStatus && (
                                                <Badge variant="outline" className="capitalize ml-1 text-[8px] font-bold">
                                                    {record.approvalStatus}
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-[11px] font-medium text-muted-foreground italic truncate max-w-[200px]" title={record.description}>{record.description}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-48 text-center text-muted-foreground font-bold uppercase text-[10px] tracking-widest">Tidak ada riwayat kehadiran.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
              </CardContent>
            </Card>
        </div>
    </div>
  );
}