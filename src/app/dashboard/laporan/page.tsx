'use client';

import { useState, useMemo, useEffect } from 'react';
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
import { ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { useUser, useFirestore, useMemoFirebase, useCollection, useDoc } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { format, isSameMonth, startOfMonth, endOfMonth, addMonths, subMonths, isBefore, eachDayOfInterval, startOfDay, endOfDay, isWithinInterval, isSameDay } from 'date-fns';
import { id } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { calculateAttendanceStats } from '@/lib/attendance';
import { cn } from '@/lib/utils';

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
  date: Date;
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
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [stats, setStats] = useState<{ persentase: string } | null>(null);

  const schoolConfigRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'schoolConfig', 'default');
  }, [firestore]);
  const { data: schoolConfig, isLoading: isConfigLoading } = useDoc(user, schoolConfigRef);

  const monthlyConfigId = useMemo(() => format(currentMonth, 'yyyy-MM'), [currentMonth]);
  const monthlyConfigRef = useMemoFirebase(() => {
      if (!firestore) return null;
      return doc(firestore, 'monthlyConfigs', monthlyConfigId);
  }, [firestore, monthlyConfigId]);
  const { data: monthlyConfig, isLoading: isMonthlyConfigLoading } = useDoc(user, monthlyConfigRef);

  const attendanceHistoryQuery = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return query(collection(firestore, 'users', user.uid, 'attendanceRecords'), orderBy('checkInTime', 'desc'));
  }, [user, firestore]);

  const leaveHistoryQuery = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return query(collection(firestore, 'users', user.uid, 'leaveRequests'), orderBy('startDate', 'desc'));
  }, [user, firestore]);

  const { data: attendanceHistory, isLoading: isHistoryLoading } = useCollection(user, attendanceHistoryQuery);
  const { data: leaveHistory, isLoading: isLeaveLoading } = useCollection(user, leaveHistoryQuery);

  const isLoading = isAuthLoading || isHistoryLoading || isLeaveLoading || isConfigLoading || isMonthlyConfigLoading;
  
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

  const monthlyReportData = useMemo(() => {
    if (!attendanceHistory || !leaveHistory || !schoolConfig) {
      return [];
    }

    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const today = startOfDay(new Date());

    const offDays: number[] = schoolConfig.offDays ?? [0, 6];
    const holidays: string[] = monthlyConfig?.holidays ?? [];

    const allDaysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    const report: (ReportItem | null)[] = allDaysInMonth.map(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const isToday = isSameDay(day, today);
        const isWorkingDay = !offDays.includes(day.getDay()) && !holidays.includes(dayStr);

        if (!isWorkingDay) {
            return null;
        }

        const attendanceRecord = attendanceHistory.find(a => {
            const checkInDate = a.checkInTime?.toDate();
            const recordDate = a.date || (checkInDate ? format(checkInDate, 'yyyy-MM-dd') : null);
            return recordDate === dayStr;
        });

        const leaveRecord = leaveHistory.find(l => 
            l.status === 'approved' && isWithinInterval(day, { start: startOfDay(l.startDate.toDate()), end: endOfDay(l.endDate.toDate()) })
        );

        if (leaveRecord) {
            return {
                id: `${leaveRecord.id}-${dayStr}`,
                date: day,
                dateString: format(day, 'eee, dd/MM/yy', { locale: id }),
                checkIn: '-',
                checkOut: '-',
                status: leaveRecord.type,
                description: leaveRecord.reason,
                approvalStatus: leaveRecord.status,
            };
        }

        if (attendanceRecord) {
            const checkInTime = attendanceRecord.checkInTime?.toDate() || null;
            const checkOutTime = attendanceRecord.checkOutTime?.toDate() || null;
            const isManual = attendanceRecord.manualEntry || false;

            if (isManual) {
                 return {
                    id: attendanceRecord.id,
                    date: day,
                    dateString: format(day, 'eee, dd/MM/yy', { locale: id }),
                    checkIn: checkInTime ? format(checkInTime, 'HH:mm') : '-',
                    checkOut: checkOutTime ? format(checkOutTime, 'HH:mm') : '-',
                    status: 'Hadir',
                    description: attendanceRecord.reasonForUpdate || 'Hadir penuh',
                };
            }

            if (checkInTime && checkOutTime) {
                let description = 'Kehadiran Penuh';
                if (schoolConfig.useTimeValidation && schoolConfig.checkInEndTime) {
                    const [endH, endM] = schoolConfig.checkInEndTime.split(':').map(Number);
                    const checkInDeadline = new Date(checkInTime);
                    checkInDeadline.setHours(endH, endM, 0, 0);
                    if (isBefore(checkInTime, checkInDeadline) === false) {
                        description = 'Terlambat';
                    }
                }
                return {
                    id: attendanceRecord.id,
                    date: day,
                    dateString: format(day, 'eee, dd/MM/yy', { locale: id }),
                    checkIn: format(checkInTime, 'HH:mm'),
                    checkOut: format(checkOutTime, 'HH:mm'),
                    status: 'Hadir',
                    description: description,
                };
            } else if (checkInTime) {
                if (isBefore(day, today)) {
                     return {
                        id: attendanceRecord.id,
                        date: day,
                        dateString: format(day, 'eee, dd/MM/yy', { locale: id }),
                        checkIn: format(checkInTime, 'HH:mm'),
                        checkOut: '-',
                        status: 'Alpa',
                        description: 'Tidak Absen Pulang',
                    };
                } else {
                     return {
                        id: attendanceRecord.id,
                        date: day,
                        dateString: format(day, 'eee, dd/MM/yy', { locale: id }),
                        checkIn: format(checkInTime, 'HH:mm'),
                        checkOut: '-',
                        status: 'Hadir',
                        description: 'Belum Absen Pulang',
                    };
                }
            }
        }
        
        if (isToday || (isWorkingDay && isBefore(day, today))) {
             return {
                id: dayStr,
                date: day,
                dateString: format(day, 'eee, dd/MM/yy', { locale: id }),
                checkIn: '-',
                checkOut: '-',
                status: 'Alpa',
                description: isToday ? 'Belum Ada Aktivitas' : 'Tidak Ada Keterangan',
            };
        }

        return null;
    });

    return report.filter((record): record is ReportItem => record !== null).sort((a, b) => b.date.getTime() - a.date.getTime());

  }, [attendanceHistory, leaveHistory, schoolConfig, monthlyConfig, currentMonth]);

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

  const canGoPrev = useMemo(() => {
    const minDate = new Date(2026, 0, 1);
    return currentMonth > minDate;
  }, [currentMonth]);

  return (
    <Card className="overflow-hidden bg-card border border-muted-foreground/10 shadow-none rounded-xl">
      <CardHeader className="p-4 md:p-6 text-primary border-b border-muted-foreground/10">
        <CardTitle className="font-bold text-sm tracking-tight">Riwayat Absensi & Izin</CardTitle>
        <CardDescription className="text-muted-foreground font-medium">Catatan lengkap kehadiran dan pengajuan izin Anda.</CardDescription>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-6 min-h-[400px]">
        <div className="flex flex-col items-center justify-center gap-4 py-2 mb-6">
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
                    <span className="font-bold text-base sm:text-xl text-primary tracking-tight text-center capitalize whitespace-nowrap min-w-[120px]">
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
            <div className="w-full h-px bg-gradient-to-r from-transparent via-border to-transparent mt-2" />
        </div>
        <div className="border rounded-xl overflow-hidden border-muted-foreground/5">
            <Table className="min-w-[720px]">
                <TableHeader className="bg-muted/30">
                    <TableRow className="border-none">
                        <TableHead className="w-[60px] text-center font-bold text-xs text-muted-foreground">No</TableHead>
                        <TableHead className="w-[180px] font-bold text-xs text-muted-foreground">Tanggal</TableHead>
                        <TableHead className="w-[120px] text-center font-bold text-xs text-muted-foreground">Masuk</TableHead>
                        <TableHead className="w-[120px] text-center font-bold text-xs text-muted-foreground">Pulang</TableHead>
                        <TableHead className="w-[140px] text-center font-bold text-xs text-muted-foreground">Status</TableHead>
                        <TableHead className="font-bold text-xs text-muted-foreground">Keterangan</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {isLoading ? (
                        [...Array(8)].map((_, i) => (
                            <TableRow key={i} className="border-muted-foreground/5">
                                <TableCell><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-16 mx-auto" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-16 mx-auto" /></TableCell>
                                <TableCell className="text-center"><Skeleton className="h-5 w-20 mx-auto rounded-full" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                            </TableRow>
                        ))
                    ) : monthlyReportData.length > 0 ? (
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

