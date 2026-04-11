'use server';

import { notFound } from 'next/navigation';
import { adminDb as firestore } from '@/lib/firebase-admin';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import ReportClientShell from './ReportClientShell';
import { eachDayOfInterval, isWithinInterval, startOfMonth, endOfMonth, startOfDay, format, isBefore } from 'date-fns';
import { Timestamp } from 'firebase-admin/firestore';

// Define a type for our records to satisfy TypeScript
interface AttendanceRecord {
  id: string;
  checkInTime: Timestamp;
  checkOutTime?: Timestamp;
  manualEntry?: boolean;
}

// Helper to parse the month from searchParams
const getMonthDate = (monthParam: string | undefined): Date => {
    if (monthParam) {
        const [year, month] = monthParam.split('-').map(Number);
        return new Date(Date.UTC(year, month - 1, 15));
    }
    return new Date();
};

// This is a React Server Component (RSC)
export default async function UserReportDetailPage({ params, searchParams }: { 
    params: { userId: string },
    searchParams: { month?: string }
}) {
    const { userId } = params;
    const currentMonth = getMonthDate(searchParams.month);

    try {
        // Step 1: Fetch user, school config, and monthly config data using Admin SDK
        const userRef = firestore.collection('users').doc(userId);
        const schoolConfigRef = firestore.collection('schoolConfig').doc('default');
        const monthlyConfigId = format(currentMonth, 'yyyy-MM');
        const monthlyConfigRef = firestore.collection('monthlyConfigs').doc(monthlyConfigId);

        const [userSnap, schoolConfigSnap, monthlyConfigSnap] = await Promise.all([
            userRef.get(),
            schoolConfigRef.get(),
            monthlyConfigRef.get(),
        ]);

        if (!userSnap.exists) {
            notFound();
        }

        const userData = userSnap.data()!;
        const schoolConfig = schoolConfigSnap.exists ? schoolConfigSnap.data()! : {};
        const monthlyConfig = monthlyConfigSnap.exists ? monthlyConfigSnap.data()! : {};

        // Step 2: Re-implement fetchUserMonthlyReportData logic directly here using Admin SDK
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);

        const attendanceHistoryQuery = firestore
            .collection('users').doc(userId).collection('attendanceRecords')
            .where('checkInTime', '>=', monthStart)
            .where('checkInTime', '<=', monthEnd);
            
        const leaveHistoryQuery = firestore
            .collection('users').doc(userId).collection('leaveRequests')
            .where('status', '==', 'approved')
            .where('startDate', '<=', monthEnd);

        const [attendanceHistorySnap, leaveHistorySnap] = await Promise.all([
            attendanceHistoryQuery.get(),
            leaveHistoryQuery.get(),
        ]);
        // Correctly type the data
        const attendanceHistory: AttendanceRecord[] = attendanceHistorySnap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord));
        const leaveHistory = leaveHistorySnap.docs.map(d => d.data());

        const today = startOfDay(new Date());
        const offDays: number[] = schoolConfig.offDays ?? [0, 6];
        const holidays: string[] = monthlyConfig.holidays ?? [];

        const attendanceMap = new Map(attendanceHistory.map(rec => [format(rec.checkInTime.toDate(), 'yyyy-MM-dd'), rec]));
        const leaveMap = new Map<string, any>();
        leaveHistory.forEach(leave => {
            eachDayOfInterval({ start: leave.startDate.toDate(), end: leave.endDate.toDate() }).forEach(day => {
                if (isWithinInterval(day, { start: monthStart, end: monthEnd })) {
                    leaveMap.set(format(day, 'yyyy-MM-dd'), leave);
                }
            });
        });

        const allDaysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

        const report = allDaysInMonth.map(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            const attendanceRecord = attendanceMap.get(dayStr);

            if (attendanceRecord) {
                const checkInTime = attendanceRecord.checkInTime.toDate();
                const checkOutTime = attendanceRecord.checkOutTime?.toDate();
                let description;

                if (attendanceRecord.manualEntry) {
                    description = 'Absen Terekam';
                } else {
                    if (checkOutTime) {
                        if (schoolConfig.useTimeValidation && schoolConfig.checkInEndTime) {
                            const [endH, endM] = schoolConfig.checkInEndTime.split(':').map(Number);
                            const checkInDeadline = new Date(checkInTime); checkInDeadline.setHours(endH, endM, 0, 0);
                            description = isBefore(checkInTime, checkInDeadline) ? 'Kehadiran Penuh' : 'Terlambat';
                        } else {
                            description = 'Kehadiran Penuh';
                        }
                    } else {
                        const leaveRecord = leaveMap.get(dayStr);
                        if (leaveRecord && leaveRecord.type === 'Pulang Cepat') {
                            description = 'Pulang Cepat (Disetujui)';
                        } else {
                            description = isBefore(day, today) ? 'Tidak Absen Pulang' : 'Belum Absen Pulang';
                        }
                    }
                }
                return { id: attendanceRecord.id, date: day, checkInTime, checkOutTime, status: 'Hadir', description };
            }

            const leaveRecord = leaveMap.get(dayStr);
            const isWorkingDay = !offDays.includes(day.getDay()) && !holidays.includes(dayStr);
            if (leaveRecord && isWorkingDay && leaveRecord.type !== 'Pulang Cepat') {
                return { id: `${leaveRecord.id}-${dayStr}`, date: day, checkInTime: null, checkOutTime: null, status: leaveRecord.type, description: leaveRecord.reason };
            }

            if (isWorkingDay && isBefore(day, today)) {
                return { id: dayStr, date: day, checkInTime: null, checkOutTime: null, status: 'Alpa', description: 'Tidak Ada Keterangan' };
            }

            return null;
        });

        const validReport = report.filter(Boolean) as any[];
        validReport.sort((a, b) => b.date.getTime() - a.date.getTime());

        const reportData = validReport.map(item => ({
            ...item,
            date: item.date.toISOString(),
            checkInTime: item.checkInTime ? item.checkInTime.toISOString() : null,
            checkOutTime: item.checkOutTime ? item.checkOutTime.toISOString() : null,
        }));
        // --- End of re-implemented logic ---

        return (
            <ReportClientShell 
                userId={userId}
                initialUserData={userData}
                initialReportData={reportData}
                initialMonth={currentMonth.toISOString()}
                initialSchoolConfig={schoolConfig}
            />
        );

    } catch (error) {
        console.error("Error rendering server component for user report:", error);
        return (
            <div className="p-4">
                <Alert variant="destructive">
                    <AlertTitle>Gagal Memuat Laporan</AlertTitle>
                    <AlertDescription>
                        Terjadi kesalahan saat mengambil data di server. Silakan coba lagi nanti atau hubungi administrator.
                    </AlertDescription>
                </Alert>
            </div>
        );
    }
}
