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
import { useUser, useFirestore, useMemoFirebase, useCollection, useDoc } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { format, isSameMonth, startOfMonth, endOfMonth, addMonths, subMonths, isBefore, eachDayOfInterval, startOfDay, endOfDay, isWithinInterval, isSameDay, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { calculateAttendanceStats, fetchUserMonthlyReportData } from '@/lib/attendance';
import { getFromCache, setInCache, invalidateCache } from '@/lib/cache';
import { useToast } from '@/hooks/use-toast';

const statusVariant: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
    'Hadir': 'default',
    'Sakit': 'destructive',
    'Izin': 'secondary',
    'Dinas': 'secondary',
    'Terlambat': 'outline',
    'Alpa': 'destructive',
    'Hari Libur': 'secondary',
};

const approvalStatusVariant: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
    'approved': 'default',
    'pending': 'outline',
    'rejected': 'destructive',
};

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

  const cacheKey = useMemo(() => user ? `user_report_${user.uid}_${format(currentMonth, 'yyyyMM')}` : null, [user, currentMonth]);

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
        const newDate = subMonths(prev, 1);
        return newDate < minDate ? prev : newDate;
    });
  };

  const handleNextMonth = () => {
      setCurrentMonth(prev => addMonths(prev, 1));
  };

  const isLoading = isAuthLoading || isConfigLoading || isReportLoading;
  const canGoPrev = currentMonth > new Date(2026, 0, 1);

  if (isLoading && monthlyReportData.length === 0) {
    return (
        <Card className="rounded-xl shadow-none border-muted-foreground/10 overflow-hidden">
            <CardHeader className="p-4 border-b border-muted-foreground/5 bg-muted/20">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-3 w-48" />
            </CardHeader>
            <CardContent className="p-6 space-y-4">
                <div className="flex justify-center py-4"><Skeleton className="h-12 w-64 rounded-2xl" /></div>
                <div className="space-y-2">
                    {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
                </div>
            </CardContent>
        </Card>
    );
  }

  return (
    <Card className="overflow-hidden bg-card border border-muted-foreground/10 shadow-none rounded-xl">
      <CardHeader className="p-4 text-primary border-b border-muted-foreground/10">
        <div className="flex items-center justify-between">
            <div>
                <CardTitle className="font-bold text-xs tracking-tight uppercase">Riwayat Absensi & Izin</CardTitle>
                <CardDescription className="text-muted-foreground font-medium text-[10px]">Catatan lengkap kehadiran Anda.</CardDescription>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={handleRefresh} disabled={isLoading}>
                <RefreshCw className={cn("h-4 w-4 text-muted-foreground", isLoading && "animate-spin")} />
            </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-6 min-h-[400px]">
        <div className="flex flex-col items-center justify-center gap-4 py-2 mb-4">
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
                            <span className="text-sm font-black text-primary">{stats.persentase}</span>
                        </div>
                    )}
                    <span className="font-black text-xl text-primary tracking-tight text-center capitalize whitespace-nowrap min-w-[140px]">
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
        <div className="border rounded-xl overflow-hidden border-muted-foreground/5">
            <Table className="min-w-[720px]">
                <TableHeader className="bg-muted/30">
                    <TableRow className="border-none">
                        <TableHead className="w-[60px] text-center font-bold text-[10px] uppercase tracking-widest text-muted-foreground">No</TableHead>
                        <TableHead className="w-[180px] font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Tanggal</TableHead>
                        <TableHead className="w-[120px] text-center font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Masuk</TableHead>
                        <TableHead className="w-[120px] text-center font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Pulang</TableHead>
                        <TableHead className="w-[140px] text-center font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Status</TableHead>
                        <TableHead className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Keterangan</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {monthlyReportData.length > 0 ? (
                        monthlyReportData.map((record, index) => (
                            <TableRow key={record.id} className="hover:bg-primary/5 transition-colors border-muted-foreground/5">
                                <TableCell className="text-center font-bold text-muted-foreground">{index + 1}</TableCell>
                                <TableCell className="font-bold text-sm text-foreground whitespace-nowrap">{record.dateString}</TableCell>
                                <TableCell className="text-center font-mono text-xs font-bold text-foreground">{record.checkIn}</TableCell>
                                <TableCell className="text-center font-mono text-xs font-bold text-foreground">{record.checkOut}</TableCell>
                                <TableCell className="text-center whitespace-nowrap">
                                    <Badge variant={statusVariant[record.status] || 'default'} className="text-[9px] font-bold uppercase px-2 py-0.5">
                                        {record.status}
                                    </Badge>
                                    {record.approvalStatus && (
                                        <Badge variant={approvalStatusVariant[record.approvalStatus] || 'secondary'} className="capitalize ml-1 text-[8px] font-bold">
                                            {record.approvalStatus}
                                        </Badge>
                                    )}
                                </TableCell>
                                <TableCell className="text-[11px] font-medium text-muted-foreground italic truncate max-w-[200px]" title={record.description}>{record.description}</TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={6} className="h-48 text-center text-muted-foreground font-medium">Tidak ada riwayat kehadiran.</TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
      </CardContent>
    </Card>
  );
}

