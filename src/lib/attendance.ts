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

export async function getDailyStaffAttendanceStats(firestore: Firestore) {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const cacheKey = `daily_stats_v11_${todayStr}`;
    
    const cachedData = getFromCache(cacheKey);
    if (cachedData) return cachedData;

    try {
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
            const dayOfWeek = today.getDay();
            const offDays: number[] = schoolConfig.offDays ?? [0, 6];
            if (offDays.includes(dayOfWeek)) return true;
            if (monthlyConfig?.holidays?.includes(todayStr)) return true;
            return false;
        })();

        if (isHoliday) {
            return { totalStaff: 0, hadir: 0, izin: 0, sakit: 0, pending: 0, isHoliday: true };
        }

        const startOfToday = startOfDay(today);
        const endOfToday = endOfDay(today);

        const usersQuery = query(
            collection(firestore, 'users'), 
            where('role', 'in', ['guru', 'pegawai', 'kepala_sekolah']),
            where('status', '==', 'Aktif')
        );
        const usersSnap = await getDocs(usersQuery);
        const allStaff = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const attendanceQuery = query(
            collectionGroup(firestore, 'attendanceRecords'),
            where('date', '==', todayStr)
        );
        const attendanceSnap = await getDocs(attendanceQuery);
        const presentUserIds = new Set<string>();
        attendanceSnap.forEach(doc => {
            const data = doc.data();
            const userId = data.userId || doc.ref.parent.parent?.id;
            if (userId) presentUserIds.add(userId);
        });

        const leaveQuery = query(collectionGroup(firestore, 'leaveRequests'), where('status', 'in', ['approved', 'pending']));
        const leaveSnap = await getDocs(leaveQuery);
        
        let izinCount = 0;
        let sakitCount = 0;
        let pendingCount = 0;

        allStaff.forEach((u: any) => {
            if (presentUserIds.has(u.id)) return;

            const userLeaves = leaveSnap.docs.filter(d => (d.data().userId || d.ref.parent.parent?.id) === u.id);
            const activeLeave = userLeaves.find(d => {
                const leave = d.data();
                return isWithinInterval(today, { start: startOfDay(leave.startDate.toDate()), end: endOfDay(leave.endDate.toDate()) });
            });

            if (activeLeave) {
                const leave = activeLeave.data();
                if (leave.status === 'approved') {
                    if (leave.type === 'Sakit') sakitCount++;
                    else if (leave.type !== 'Pulang Cepat') izinCount++;
                } else if (leave.status === 'pending' && leave.type !== 'Pulang Cepat') {
                    pendingCount++;
                }
            }
        });

        const result = {
            totalStaff: allStaff.length,
            hadir: presentUserIds.size,
            izin: izinCount,
            sakit: sakitCount,
            pending: pendingCount,
            isHoliday: false
        };

        setInCache(cacheKey, result);
        return result;
    } catch (e) {
        return { totalStaff: 0, hadir: 0, izin: 0, sakit: 0, pending: 0, isHoliday: false };
    }
}

export async function calculateAttendanceStats(firestore: Firestore, userId: string, dateRange: { start: Date, end: Date }) {
    const { start, end } = dateRange;
    const cacheKey = `stats_v11_${userId}_${format(start, 'yyyyMM')}`;
    
    const cachedStats = getFromCache(cacheKey);
    if (cachedStats) return cachedStats;

    try {
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
        const attendanceData = attendanceSnap.docs.map(d => ({ ...d.data(), id: d.id }));
        const leaveData = leaveSnap.docs.map(d => d.data());

        const offDays: number[] = schoolConfig?.offDays ?? [0, 6];
        const holidays: string[] = monthlyConfig?.holidays ?? [];
        const today = startOfDay(new Date());

        const workingDaysInPeriod = eachDayOfInterval({ start, end }).filter(day => 
            !offDays.includes(day.getDay()) && !holidays.includes(format(day, 'yyyy-MM-dd'))
        );

        const workingDaysSet = new Set(workingDaysInPeriod.map(day => format(day, 'yyyy-MM-dd')));
        const pastWorkingDays = workingDaysInPeriod.filter(day => isBefore(day, today) || isSameDay(day, today));
        
        let hadirScore = 0;
        const attDates = new Set<string>();

        attendanceData.forEach((att: any) => {
            const attDateStr = format(att.checkInTime.toDate(), 'yyyy-MM-dd');
            if (workingDaysSet.has(attDateStr)) {
                hadirScore += 1;
                attDates.add(attDateStr);
            }
        });

        let izinCount = 0;
        let sakitCount = 0;
        const leaveDates = new Set<string>();

        leaveData.forEach(leave => {
            eachDayOfInterval({ start: leave.startDate.toDate(), end: leave.endDate.toDate() }).forEach(day => {
                const dayStr = format(day, 'yyyy-MM-dd');
                if (workingDaysSet.has(dayStr)) {
                    if (leave.type === 'Pulang Cepat' || leave.type === 'Dinas' || leave.type === 'Dinas Pagi') {
                        if (!attDates.has(dayStr)) {
                           hadirScore += 1;
                           attDates.add(dayStr);
                        }
                    } else if (leave.type === 'Sakit') {
                        sakitCount++;
                    } else {
                        izinCount++;
                    }
                    leaveDates.add(dayStr);
                }
            });
        });

        const alpaCount = pastWorkingDays.filter(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            return !attDates.has(dayStr) && !leaveDates.has(dayStr);
        }).length;
        
        const denominator = Math.max(1, pastWorkingDays.length - (izinCount + sakitCount));
        const finalPercentage = Math.min((hadirScore / denominator) * 100, 100);

        const result = {
            totalHadir: hadirScore, 
            totalIzin: izinCount,
            totalSakit: sakitCount,
            totalAlpa: alpaCount,
            persentase: finalPercentage.toFixed(1) + '%',
        };

        setInCache(cacheKey, result);
        return result;
    } catch (e) {
        return { totalHadir: 0, totalIzin: 0, totalSakit: 0, totalAlpa: 0, persentase: '0.0%' };
    }
}

export async function fetchUserMonthlyReportData(firestore: Firestore, userId: string, currentMonth: Date, schoolConfig: any) {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);

    try {
        const monthlyConfigId = format(currentMonth, 'yyyy-MM');
        const monthlyConfigRef = doc(firestore, 'monthlyConfigs', monthlyConfigId);
        const attendanceHistoryQuery = query(
            collection(firestore, 'users', userId, 'attendanceRecords'), 
            where('checkInTime', '>=', monthStart), 
            where('checkInTime', '<=', monthEnd)
        );
        
        // Tambahkan fallback query jika record menggunakan field 'date' string
        const attendanceFallbackQuery = query(
            collection(firestore, 'users', userId, 'attendanceRecords'),
            where('date', '>=', format(monthStart, 'yyyy-MM-dd')),
            where('date', '<=', format(monthEnd, 'yyyy-MM-dd'))
        );

        const leaveHistoryQuery = query(
            collection(firestore, 'users', userId, 'leaveRequests'), 
            where('status', '==', 'approved'),
            where('startDate', '<=', monthEnd)
        );

        const [monthlyConfigSnap, attendanceHistorySnap, attendanceFallbackSnap, leaveHistorySnap] = await Promise.all([
            getDoc(monthlyConfigRef),
            getDocs(attendanceHistoryQuery),
            getDocs(attendanceFallbackQuery),
            getDocs(leaveHistoryQuery),
        ]);

        const monthlyConfig = monthlyConfigSnap.data();
        const attendanceHistory = [...attendanceHistorySnap.docs, ...attendanceFallbackSnap.docs].map(d => ({ ...d.data(), id: d.id }));
        const leaveHistory = leaveHistorySnap.docs.map(d => d.data());

        const now = new Date();
        const todayStart = startOfDay(now);
        const offDays = schoolConfig.offDays ?? [0, 6];
        const holidays = monthlyConfig?.holidays ?? [];

        // Gabungkan records berdasarkan tanggal unik
        const attendanceMap = new Map();
        attendanceHistory.forEach(rec => {
            const d = (rec as any).date || format((rec as any).checkInTime.toDate(), 'yyyy-MM-dd');
            attendanceMap.set(d, rec);
        });

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

            if (!isWorkingDay) return null;

            const attendanceRecord = attendanceMap.get(dayStr) as any;
            const leaveRecord = leaveMap.get(dayStr);

            if (attendanceRecord) {
                const checkInTime = attendanceRecord.checkInTime?.toDate() || null;
                const checkOutTime = attendanceRecord.checkOutTime?.toDate() || null;
                const isDinasPagi = attendanceRecord.isDinasPagi || false;
                let description = attendanceRecord.reasonForUpdate || 'Kehadiran penuh';
                description = cleanDesc(description) || 'Kehadiran penuh';

                if (isDinasPagi) {
                    return { id: attendanceRecord.id, date: day, checkInTime: null, checkOutTime, status: 'Hadir', description: 'Dinas Pagi', manualEntry: true };
                }

                if (!checkOutTime && !isToday && isBefore(day, todayStart)) {
                    // Check if it was intentionally marked as "Pulang Cepat" by admin
                    if (description === 'Pulang Cepat' || description === 'Dinas Siang') {
                        return { id: attendanceRecord.id, date: day, checkInTime, checkOutTime: null, status: 'Hadir', description, manualEntry: true };
                    }
                    return { id: attendanceRecord.id, date: day, checkInTime, checkOutTime: null, status: 'Alpa', description: 'Tidak absen pulang', manualEntry: attendanceRecord.manualEntry || false };
                }
                return { id: attendanceRecord.id, date: day, checkInTime, checkOutTime, status: 'Hadir', description: !checkOutTime && isToday ? 'Belum absen pulang' : description, manualEntry: attendanceRecord.manualEntry || false };
            }

            if (leaveRecord && leaveRecord.type !== 'Pulang Cepat') {
                return { id: `${leaveRecord.id}-${dayStr}`, date: day, checkInTime: null, checkOutTime: null, status: leaveRecord.type, description: cleanDesc(leaveRecord.reason) || leaveRecord.type };
            }

            if (isToday || (isWorkingDay && isBefore(day, todayStart))) {
                return { id: dayStr, date: day, checkInTime: null, checkOutTime: null, status: 'Alpa', description: isToday ? 'Belum ada aktivitas' : 'Tidak ada keterangan' };
            }
            return null;
        });

        return report.filter(Boolean).sort((a: any, b: any) => b.date.getTime() - a.date.getTime()).map((item: any) => ({
            ...item,
            date: item.date.toISOString(),
            checkInTime: item.checkInTime ? item.checkInTime.toISOString() : null,
            checkOutTime: item.checkOutTime ? item.checkOutTime.toISOString() : null,
        }));
    } catch (e) {
        return [];
    }
}