'use client';

import { doc, getDoc, collection, getDocs, query, where, collectionGroup } from 'firebase/firestore';
import { eachDayOfInterval, isWithinInterval, startOfMonth, endOfMonth, startOfDay, endOfDay, format, isBefore, isSameDay, setHours, setMinutes } from 'date-fns';
import type { Firestore } from 'firebase/firestore';
import { getFromCache, setInCache } from './cache';

export interface MonthlyReportData {
    id: string;
    date: string;
    checkInTime: string | null;
    checkOutTime: string | null;
    status: string;
    description: string;
    manualEntry: boolean;
}

const cleanDesc = (desc: string) => desc ? desc.replace(/\s?\(diubah oleh Admin\)/g, '').replace(/\(✓\)/g, '').trim() : '';

/**
 * Mengambil statistik kehadiran harian dengan dukungan caching hybrid.
 */
export async function getDailyStaffAttendanceStats(firestore: Firestore) {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const cacheKey = `daily_stats_${todayStr}`;
    
    const cachedData = getFromCache(cacheKey);
    if (cachedData) return cachedData;

    const startOfToday = startOfDay(today);
    const endOfToday = endOfDay(today);

    const schoolConfigRef = doc(firestore, 'schoolConfig', 'default');
    const monthlyConfigId = format(today, 'yyyy-MM');
    const monthlyConfigRef = doc(firestore, 'monthlyConfigs', monthlyConfigId);

    const [schoolConfigSnap, monthlyConfigSnap] = await Promise.all([
        getDoc(schoolConfigRef),
        getDoc(monthlyConfigRef)
    ]);

    const schoolConfig = schoolConfigSnap.data();
    const monthlyConfig = monthlyConfigSnap.data();

    const isHoliday = (() => {
        if (!schoolConfig) return false;
        if (schoolConfig.isAttendanceActive === false) return true;
        if (monthlyConfig?.holidays?.includes(todayStr)) return true;
        const offDays: number[] = schoolConfig.offDays ?? [0, 6];
        return offDays.includes(today.getDay());
    })();

    const usersQuery = query(
        collection(firestore, 'users'), 
        where('role', 'in', ['guru', 'pegawai', 'kepala_sekolah']),
        where('status', '==', 'Aktif')
    );
    const usersSnap = await getDocs(usersQuery);
    const allStaff = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const attendanceQuery = query(
        collectionGroup(firestore, 'attendanceRecords'),
        where('checkInTime', '>=', startOfToday),
        where('checkInTime', '<=', endOfToday)
    );
    const attendanceSnap = await getDocs(attendanceQuery);
    const presentUserIds = new Set<string>();
    attendanceSnap.forEach(doc => {
        const userId = doc.data().userId || doc.ref.parent.parent?.id;
        if (userId) presentUserIds.add(userId);
    });

    const leaveQuery = query(collectionGroup(firestore, 'leaveRequests'));
    const leaveSnap = await getDocs(leaveQuery);
    const leaveStatusByUserId = new Map<string, { status: string, type: string }>();
    leaveSnap.forEach(doc => {
        const leave = doc.data();
        const startDate = leave.startDate?.toDate();
        const endDate = leave.endDate?.toDate();

        if (startDate && endDate && isWithinInterval(today, { start: startDate, end: endDate })) {
            const userId = leave.userId || doc.ref.parent.parent?.id;
            if (userId) {
                if (!leaveStatusByUserId.has(userId) || leave.status === 'approved') {
                    leaveStatusByUserId.set(userId, { status: leave.status, type: leave.type || 'Izin' });
                }
            }
        }
    });

    let izinCount = 0;
    let sakitCount = 0;
    let alpaCount = 0;
    let pendingCount = 0;

    const notPresentStaff = allStaff.filter(user => !presentUserIds.has(user.id));

    notPresentStaff.forEach(user => {
        const leaveInfo = leaveStatusByUserId.get(user.id);
        if (leaveInfo) {
            if (leaveInfo.status === 'approved') {
                if (leaveInfo.type === 'Pulang Cepat') return;
                if (leaveInfo.type === 'Sakit') sakitCount++;
                else izinCount++;
            } else if (leaveInfo.status === 'pending') {
                 if (leaveInfo.type !== 'Pulang Cepat') pendingCount++;
            }
        } else {
            if (!isHoliday) alpaCount++;
        }
    });

    const result = {
        totalStaff: allStaff.length,
        hadir: presentUserIds.size,
        izin: izinCount,
        sakit: sakitCount,
        alpa: alpaCount,
        pending: pendingCount,
        isHoliday: isHoliday
    };

    setInCache(cacheKey, result);
    return result;
}

export async function calculateAttendanceStats(firestore: Firestore, userId: string, dateRange: { start: Date, end: Date }) {
    const { start, end } = dateRange;
    const cacheKey = `stats_${userId}_${format(start, 'yyyyMM')}`;
    
    const cachedStats = getFromCache(cacheKey);
    if (cachedStats) return cachedStats;

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

    const workingDaysSet = new Set(effectiveWorkingDays.map(day => format(day, 'yyyy-MM-dd')));
    const pastEffectiveWorkingDays = effectiveWorkingDays.filter(day => isBefore(day, today) || isSameDay(day, today));
    
    const approvedEarlyLeaveDates = new Set<string>();
    leaveData.forEach(leave => {
        if (leave.type === 'Pulang Cepat' && leave.status === 'approved') {
            approvedEarlyLeaveDates.add(format(leave.startDate.toDate(), 'yyyy-MM-dd'));
        }
    });

    const hadirScore = attendanceData.reduce((total, att) => {
        const attDateStr = format(att.checkInTime.toDate(), 'yyyy-MM-dd');
        if (!workingDaysSet.has(attDateStr)) return total;

        if (att.checkInTime && att.checkOutTime) {
            return total + 1;
        } else if (att.checkInTime) {
            if (approvedEarlyLeaveDates.has(attDateStr)) return total + 1;
            return total + 0.5;
        }
        return total;
    }, 0);

    const anyAttendanceDates = new Set(
        attendanceData
            .filter(att => workingDaysSet.has(format(att.checkInTime.toDate(), 'yyyy-MM-dd')))
            .map(att => format(att.checkInTime.toDate(), 'yyyy-MM-dd'))
    );

    let izinCount = 0;
    let sakitCount = 0;
    const leaveDates = new Set<string>();

    leaveData.forEach(leave => {
        if (leave.status !== 'approved') return;
        if (leave.type === 'Pulang Cepat') return; 

        eachDayOfInterval({ start: leave.startDate.toDate(), end: leave.endDate.toDate() }).forEach(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            if (workingDaysSet.has(dayStr)) {
                if (leave.type === 'Izin' || leave.type === 'Dinas') izinCount++;
                else if (leave.type === 'Sakit') sakitCount++;
                leaveDates.add(dayStr);
            }
        });
    });

    const alpaCount = pastEffectiveWorkingDays.filter(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        return !anyAttendanceDates.has(dayStr) && !leaveDates.has(dayStr);
    }).length;
    
    const totalWorkingDays = effectiveWorkingDays.length;
    const adjustedWorkingDays = totalWorkingDays > 0 ? (totalWorkingDays - (izinCount + sakitCount)) : 0;

    const percentageRaw = adjustedWorkingDays > 0 ? (hadirScore / adjustedWorkingDays) * 100 : 0;
    const finalPercentage = Math.min(percentageRaw, 100);

    const result = {
        totalHadir: hadirScore, 
        totalIzin: izinCount,
        totalSakit: sakitCount,
        totalAlpa: alpaCount,
        persentase: finalPercentage.toFixed(1) + '%',
    };

    setInCache(cacheKey, result);
    return result;
}

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

    const now = new Date();
    const todayStart = startOfDay(now);
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
        const isToday = isSameDay(day, todayStart);
        const isWorkingDay = !offDays.includes(day.getDay()) && !holidays.includes(dayStr);

        if (!isWorkingDay) {
            return null;
        }

        const attendanceRecord = attendanceMap.get(dayStr);
        const leaveRecord = leaveMap.get(dayStr);

        if (attendanceRecord) {
            let checkInTime = attendanceRecord.checkInTime.toDate();
            let checkOutTime = attendanceRecord.checkOutTime?.toDate() || null;
            let rawDescription = attendanceRecord.reasonForUpdate || 'Kehadiran penuh';
            
            let description = cleanDesc(rawDescription);
            if (!description) description = 'Kehadiran penuh';

            if (description === 'Terlambat') {
                checkInTime = null; 
            }

            if (description === 'Pulang cepat') {
                checkOutTime = null;
            }

            if (!checkOutTime && !isToday && isBefore(day, todayStart)) {
                return {
                    id: attendanceRecord.id,
                    date: day,
                    checkInTime: checkInTime,
                    checkOutTime: null,
                    status: 'Alpa',
                    description: 'Tidak absen pulang',
                    manualEntry: attendanceRecord.manualEntry || false,
                };
            }

            return {
                id: attendanceRecord.id,
                date: day,
                checkInTime: checkInTime,
                checkOutTime: checkOutTime,
                status: 'Hadir',
                description: !checkOutTime && isToday ? 'Belum absen pulang' : description,
                manualEntry: attendanceRecord.manualEntry || false,
            };
        }

        if (leaveRecord && leaveRecord.type !== 'Pulang Cepat') {
            return {
                id: `${leaveRecord.id}-${dayStr}`,
                date: day,
                checkInTime: null,
                checkOutTime: null,
                status: leaveRecord.type, 
                description: cleanDesc(leaveRecord.reason) || leaveRecord.type,
            };
        }

        if (isToday || (isWorkingDay && isBefore(day, todayStart))) {
            return {
                id: dayStr,
                date: day,
                checkInTime: null,
                checkOutTime: null,
                status: 'Alpa',
                description: isToday ? 'Belum ada aktivitas' : 'Tidak ada keterangan',
            };
        }

        return null;
    });

    const validReport = report.filter(Boolean) as any[];
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