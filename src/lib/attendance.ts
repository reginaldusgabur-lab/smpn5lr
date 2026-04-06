'use client';

import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { eachDayOfInterval, isWithinInterval, startOfMonth, endOfMonth, startOfDay, subDays, format, isBefore, endOfDay, parseISO, isValid } from 'date-fns';
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

    const pastEffectiveWorkingDays = effectiveWorkingDays.filter(day => isBefore(day, today));
    
    const presentDates = new Set(attendanceData.map(att => format(att.checkInTime.toDate(), 'yyyy-MM-dd')));
    const hadirCount = presentDates.size;

    let izinCount = 0;
    let sakitCount = 0;
    const leaveDates = new Set<string>();

    leaveData.forEach(leave => {
        if (leave.status !== 'approved') return;
        eachDayOfInterval({ start: leave.startDate.toDate(), end: leave.endDate.toDate() }).forEach(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            if (isWithinInterval(day, { start, end }) && effectiveWorkingDays.some(wd => format(wd, 'yyyy-MM-dd') === dayStr)) {
                if (leave.type === 'Izin') izinCount++;
                else if (leave.type === 'Sakit') sakitCount++;
                leaveDates.add(dayStr);
            }
        });
    });

    const alpaCount = pastEffectiveWorkingDays.filter(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        return !presentDates.has(dayStr) && !leaveDates.has(dayStr);
    }).length;
    
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

// --- FINAL, SIMPLIFIED, AND CORRECTED FUNCTION ---
export async function fetchUserMonthlyReportData(firestore: Firestore, userId: string, currentMonth: Date, schoolConfig: any) {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);

    const monthlyConfigId = format(currentMonth, 'yyyy-MM');
    const monthlyConfigRef = doc(firestore, 'monthlyConfigs', monthlyConfigId);
    const attendanceHistoryQuery = query(
        collection(firestore, 'users', userId, 'attendanceRecords'), 
        where('checkInTime', '>=', monthStart), 
        where('checkInTime', '<=', monthEnd)
    );
    const leaveHistoryQuery = query(
        collection(firestore, 'users', userId, 'leaveRequests'), 
        where('status', '==', 'approved'),
        where('startDate', '<=', monthEnd)
    );

    const [monthlyConfigSnap, attendanceHistorySnap, leaveHistorySnap] = await Promise.all([
        getDoc(monthlyConfigRef),
        getDocs(attendanceHistoryQuery),
        getDocs(leaveHistoryQuery),
    ]);

    const monthlyConfig = monthlyConfigSnap.data();
    const attendanceHistory = attendanceHistorySnap.docs.map(d => ({ ...d.data(), id: d.id }));
    const leaveHistory = leaveHistorySnap.docs.map(d => d.data());

    const today = startOfDay(new Date());
    const offDays = schoolConfig.offDays ?? [0, 6];
    const holidays = monthlyConfig?.holidays ?? [];

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

            // If it is a manual entry by admin, the description is always "Absen Terekam"
            if (attendanceRecord.manualEntry) {
                description = 'Absen Terekam';
            } else { 
                if (checkOutTime) {
                    if (schoolConfig.useTimeValidation && schoolConfig.checkInEndTime) {
                        const [endH, endM] = schoolConfig.checkInEndTime.split(':').map(Number);
                        const checkInDeadline = new Date(checkInTime); checkInDeadline.setHours(endH, endM, 0, 0);
                        // SIMPLIFIED LOGIC: "Tepat Waktu" is now "Absen Terekam"
                        description = isBefore(checkInTime, checkInDeadline) ? 'Absen Terekam' : 'Terlambat';
                    } else {
                        description = 'Absen Terekam'; // Default if no time validation
                    }
                } else {
                    description = isBefore(day, today) ? 'Tidak Absen Pulang' : 'Belum Absen Pulang';
                }
            }

            return {
                id: attendanceRecord.id,
                date: day,
                checkInTime: checkInTime,
                checkOutTime: checkOutTime || null,
                status: 'Hadir',
                description: description,
            };
        }

        const leaveRecord = leaveMap.get(dayStr);
        const isWorkingDay = !offDays.includes(day.getDay()) && !holidays.includes(dayStr);
        if (leaveRecord && isWorkingDay) {
            return {
                id: `${leaveRecord.id}-${dayStr}`,
                date: day,
                checkInTime: null,
                checkOutTime: null,
                status: leaveRecord.type, 
                description: leaveRecord.reason,
            };
        }

        if (isWorkingDay && isBefore(day, today)) {
            return {
                id: dayStr,
                date: day,
                checkInTime: null,
                checkOutTime: null,
                status: 'Alpa',
                description: 'Tidak Ada Keterangan',
            };
        }

        return null;
    });

    const validReport = report.filter(Boolean);
    validReport.sort((a, b) => b.date.getTime() - a.date.getTime());

    return validReport.map(item => {
        return {
            ...item,
            date: item.date.toISOString(),
            checkInTime: item.checkInTime ? item.checkInTime.toISOString() : null,
            checkOutTime: item.checkOutTime ? item.checkOutTime.toISOString() : null,
        };
    });
}
