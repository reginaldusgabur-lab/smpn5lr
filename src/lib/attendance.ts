'use client';

import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { eachDayOfInterval, isWithinInterval, startOfMonth, endOfMonth, startOfDay, subDays, format, isBefore, endOfDay } from 'date-fns';
import type { Firestore } from 'firebase/firestore';
import { id } from 'date-fns/locale';

// --- EXISTING FUNCTION ---
export async function calculateAttendanceStats(firestore: Firestore, userId: string, dateRange: { start: Date, end: Date }) {
    const { start, end } = dateRange;
    const schoolConfigRef = doc(firestore, 'schoolConfig', 'default');
    const monthlyConfigId = format(start, 'yyyy-MM');
    const monthlyConfigRef = doc(firestore, 'monthlyConfigs', monthlyConfigId);
    const attendanceQuery = query(
        collection(firestore, 'users', userId, 'attendanceRecords'),
        where('checkInTime', '>=', start),
        where('checkInTime', '<=', end)
    );
    const leaveQuery = query(
        collection(firestore, 'users', userId, 'leaveRequests'),
        where('status', '==', 'approved'),
        where('startDate', '<=', end)
    );

    const [schoolConfigSnap, monthlyConfigSnap, attendanceSnap, leaveSnap] = await Promise.all([
        getDoc(schoolConfigRef),
        getDoc(monthlyConfigRef),
        getDocs(attendanceQuery),
        getDocs(leaveQuery),
    ]);

    const schoolConfig = schoolConfigSnap.data();
    const monthlyConfig = monthlyConfigSnap.data();
    const attendanceData = attendanceSnap.docs.map(d => d.data());
    const leaveData = leaveSnap.docs.map(d => d.data());

    const offDays: number[] = schoolConfig?.offDays ?? [0, 6];
    const holidays: string[] = monthlyConfig?.holidays ?? [];
    const today = startOfDay(new Date());

    const effectiveWorkingDays = eachDayOfInterval({ start, end }).filter(day => 
        !offDays.includes(day.getDay()) && !holidays.includes(format(day, 'yyyy-MM-dd'))
    );

    const pastEffectiveWorkingDays = effectiveWorkingDays.filter(day => day < today);
    const hadirCount = new Set(attendanceData.map(att => format(att.checkInTime.toDate(), 'yyyy-MM-dd'))).size;

    let izinCount = 0;
    let sakitCount = 0;
    let pastIzinCount = 0;
    let pastSakitCount = 0;

    leaveData.forEach(leave => {
        if (leave.status !== 'approved') return;
        eachDayOfInterval({ start: leave.startDate.toDate(), end: leave.endDate.toDate() }).forEach(day => {
            if (isWithinInterval(day, { start, end }) && effectiveWorkingDays.some(wd => format(wd, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd'))) {
                if (leave.type === 'Izin') {
                    izinCount++;
                    if (day < today) pastIzinCount++;
                }
                else if (leave.type === 'Sakit') {
                    sakitCount++;
                    if (day < today) pastSakitCount++;
                }
            }
        });
    });

    const alpaCount = Math.max(0, pastEffectiveWorkingDays.length - 
        new Set(attendanceData.filter(att => att.checkInTime.toDate() < today).map(att => format(att.checkInTime.toDate(), 'yyyy-MM-dd'))).size - 
        pastIzinCount - 
        pastSakitCount
    );
    
    const totalWorkingDaysForPercentage = effectiveWorkingDays.length;
    const percentageRaw = totalWorkingDaysForPercentage > 0 ? (hadirCount / totalWorkingDaysForPercentage) * 100 : 0;
    const finalPercentage = Math.min(percentageRaw, 100);

    return {
        totalHadir: hadirCount,
        totalIzin: izinCount,
        totalSakit: sakitCount,
        totalAlpa: alpaCount,
        persentase: finalPercentage.toFixed(1) + '%',
    };
}

// --- NEWLY ADDED FUNCTION ---
export async function fetchUserMonthlyReportData(firestore, userId, currentMonth, schoolConfig) {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);

    const monthlyConfigId = format(currentMonth, 'yyyy-MM');
    const monthlyConfigRef = doc(firestore, 'monthlyConfigs', monthlyConfigId);
    const attendanceHistoryQuery = query(collection(firestore, 'users', userId, 'attendanceRecords'), where('checkInTime', '>=', monthStart), where('checkInTime', '<=', monthEnd));
    const leaveHistoryQuery = query(collection(firestore, 'users', userId, 'leaveRequests'), where('startDate', '<=', monthEnd));

    const [monthlyConfigSnap, attendanceHistorySnap, leaveHistorySnap] = await Promise.all([
        getDoc(monthlyConfigRef),
        getDocs(attendanceHistoryQuery),
        getDocs(leaveHistoryQuery),
    ]);

    const monthlyConfig = monthlyConfigSnap.data();
    const attendanceHistory = attendanceHistorySnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const leaveHistory = leaveHistorySnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const today = startOfDay(new Date());
    const offDays = schoolConfig.offDays ?? [0, 6];
    const holidays = monthlyConfig?.holidays ?? [];
    const allDaysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    const report = allDaysInMonth.map(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const isWorkingDay = !offDays.includes(day.getDay()) && !holidays.includes(dayStr);

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
            };
        }

        const attendanceRecord = attendanceHistory.find(a => format(a.checkInTime.toDate(), 'yyyy-MM-dd') === dayStr);

        if (attendanceRecord) {
            const checkInTime = attendanceRecord.checkInTime.toDate();
            const checkOutTime = attendanceRecord.checkOutTime?.toDate();

            let description = 'Absen Terekam';
            if (checkOutTime) {
                 if (schoolConfig.useTimeValidation && schoolConfig.checkInEndTime) {
                    const [endH, endM] = schoolConfig.checkInEndTime.split(':').map(Number);
                    const checkInDeadline = new Date(checkInTime); checkInDeadline.setHours(endH, endM, 0, 0);
                    if (!isBefore(checkInTime, checkInDeadline)) description = 'Terlambat';
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
            } else {
                if (isBefore(day, today)) {
                     return {
                        id: attendanceRecord.id, date: day, dateString: format(day, 'eee, dd/MM/yy', { locale: id }),
                        checkIn: format(checkInTime, 'HH:mm'), checkOut: '-', status: 'Alpa', description: 'Tidak Absen Pulang',
                    };
                } else {
                     return {
                        id: attendanceRecord.id, date: day, dateString: format(day, 'eee, dd/MM/yy', { locale: id }),
                        checkIn: format(checkInTime, 'HH:mm'), checkOut: '-', status: 'Hadir', description: 'Belum Absen Pulang',
                    };
                }
            }
        }
        
        if (isWorkingDay && isBefore(day, today)) {
             return {
                id: dayStr, date: day, dateString: format(day, 'eee, dd/MM/yy', { locale: id }),
                checkIn: '-', checkOut: '-', status: 'Alpa', description: 'Tidak Ada Keterangan',
            };
        }

        return null;
    });

    return report.filter(Boolean).sort((a, b) => b.date.getTime() - a.date.getTime());
}
