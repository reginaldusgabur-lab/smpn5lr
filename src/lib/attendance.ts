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
    const cacheKey = `daily_stats_v21_${todayStr}`;
    
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

        const isManualOff = schoolConfig?.isAttendanceActive === false;
        const isCalendarHoliday = monthlyConfig?.holidays?.includes(todayStr);
        const dayOfWeek = today.getDay();
        const offDays: number[] = schoolConfig?.offDays ?? [0, 6];
        const isRecurringOff = offDays.includes(dayOfWeek);

        const isHoliday = !isManualOff && (isCalendarHoliday || isRecurringOff);

        if (isManualOff || isHoliday) {
            return { 
                totalStaff: 0, hadir: 0, izin: 0, sakit: 0, pending: 0, alpa: 0, 
                isHoliday: isHoliday, 
                isCalendarHoliday: isCalendarHoliday,
                isManualDisabled: isManualOff 
            };
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
        let alpaCount = 0;

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
                } else {
                    alpaCount++;
                }
            } else {
                alpaCount++;
            }
        });

        const result = {
            totalStaff: allStaff.length,
            hadir: presentUserIds.size,
            izin: izinCount,
            sakit: sakitCount,
            pending: pendingCount,
            alpa: alpaCount,
            isHoliday: false,
            isManualDisabled: false
        };

        setInCache(cacheKey, result);
        return result;
    } catch (e) {
        return { totalStaff: 0, hadir: 0, izin: 0, sakit: 0, pending: 0, alpa: 0, isHoliday: false, isManualDisabled: false };
    }
}

export async function calculateAttendanceStats(firestore: Firestore, userId: string, dateRange: { start: Date, end: Date }) {
    const { start, end } = dateRange;
    const cacheKey = `stats_v21_${userId}_${format(start, 'yyyyMM')}`;
    
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
        
        const attendanceFallbackQuery = query(
            collection(firestore, 'users', userId, 'attendanceRecords'),
            where('date', '>=', format(start, 'yyyy-MM-dd')),
            where('date', '<=', format(end, 'yyyy-MM-dd'))
        );

        const leaveQuery = query(
            collection(firestore, 'users', userId, 'leaveRequests'),
            where('status', '==', 'approved'),
            where('startDate', '<=', end)
        );

        const [schoolConfigSnap, monthlyConfigSnap, attendanceSnap, attendanceFallbackSnap, leaveSnap] = await Promise.all([
            getDoc(schoolConfigRef),
            getDoc(monthlyConfigRef),
            getDocs(attendanceQuery),
            getDocs(attendanceFallbackQuery),
            getDocs(leaveQuery),
        ]);

        const schoolConfig = schoolConfigSnap.data();
        const monthlyConfig = monthlyConfigSnap.data();
        const attendanceData = [...attendanceSnap.docs, ...attendanceFallbackSnap.docs].map(d => ({ ...d.data(), id: d.id }));
        const leaveData = leaveSnap.docs.map(d => d.data());

        const offDays: number[] = schoolConfig?.offDays ?? [0, 6];
        const holidays: string[] = monthlyConfig?.holidays ?? [];

        const workingDaysInMonth = eachDayOfInterval({ start, end }).filter(day => 
            !offDays.includes(day.getDay()) && !holidays.includes(format(day, 'yyyy-MM-dd'))
        );

        const workingDaysSet = new Set(workingDaysInMonth.map(day => format(day, 'yyyy-MM-dd')));
        
        let totalPoints = 0;
        const processedDates = new Set<string>();

        attendanceData.forEach((att: any) => {
            const attDateStr = att.date || (att.checkInTime ? format(att.checkInTime.toDate(), 'yyyy-MM-dd') : null);
            if (attDateStr && workingDaysSet.has(attDateStr) && !processedDates.has(attDateStr)) {
                let point = 0;
                const desc = (att.reasonForUpdate || '').toLowerCase();
                
                if (desc.includes('dinas')) {
                    point = 1.0;
                } else if (desc.includes('pulang cepat')) {
                    point = 0.95;
                } else if (att.checkInTime && att.checkOutTime) {
                    let isLate = false;
                    if (schoolConfig?.useTimeValidation && schoolConfig?.checkInEndTime) {
                        const [h, m] = schoolConfig.checkInEndTime.split(':').map(Number);
                        const deadline = setMinutes(setHours(startOfDay(att.checkInTime), h), m);
                        if (att.checkInTime > deadline) isLate = true;
                    }
                    point = isLate ? 0.95 : 1.0;
                } else if (att.checkInTime || att.checkOutTime) {
                    point = 0.5;
                }
                
                totalPoints += point;
                processedDates.add(attDateStr);
            }
        });

        leaveData.forEach(leave => {
            eachDayOfInterval({ start: leave.startDate.toDate(), end: leave.endDate.toDate() }).forEach(day => {
                const dayStr = format(day, 'yyyy-MM-dd');
                if (workingDaysSet.has(dayStr) && !processedDates.has(dayStr)) {
                    let point = 0;
                    if (leave.type === 'Sakit') {
                        point = 0.9;
                    } else if (leave.type === 'Izin' || leave.type === 'Izin Pribadi') {
                        point = 0.7;
                    } else if (leave.type === 'Dinas' || leave.type === 'Dinas Pagi' || leave.type === 'Dinas Siang') {
                        point = 1.0;
                    } else if (leave.type === 'Pulang Cepat') {
                        point = 0.95;
                    }
                    totalPoints += point;
                    processedDates.add(dayStr);
                }
            });
        });

        const denominator = Math.max(1, workingDaysInMonth.length);
        const finalPercentage = (totalPoints / denominator) * 100;

        const result = {
            totalHadir: totalPoints, 
            totalIzin: 0,
            totalSakit: 0,
            totalAlpa: 0,
            persentase: Math.min(finalPercentage, 100).toFixed(1) + '%',
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

        const monthlyConfig = monthlyConfigSnap.exists() ? monthlyConfigSnap.data() : {};
        const attendanceHistory = [...attendanceHistorySnap.docs, ...attendanceFallbackSnap.docs].map(d => ({ ...d.data(), id: d.id }));
        const leaveHistory = leaveHistorySnap.docs.map(d => d.data());

        const now = new Date();
        const todayStart = startOfDay(now);
        const offDays = schoolConfig?.offDays ?? [0, 6];
        const holidays = monthlyConfig?.holidays ?? [];

        const attendanceMap = new Map();
        attendanceHistory.forEach((rec: any) => {
            const dateStr = rec.date || (rec.checkInTime ? format(rec.checkInTime.toDate(), 'yyyy-MM-dd') : null);
            if (dateStr) {
                attendanceMap.set(dateStr, rec);
            }
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
                const isManual = attendanceRecord.manualEntry || false;
                let description = attendanceRecord.reasonForUpdate || 'Kehadiran penuh';
                description = cleanDesc(description) || 'Kehadiran penuh';

                const terminalDescriptions = ['dinas pagi', 'dinas siang', 'pulang cepat'];
                if (isManual && terminalDescriptions.includes(description.toLowerCase())) {
                    const isCheckOutHiddenStatus = ['dinas siang', 'pulang cepat'].includes(description.toLowerCase());
                    const displayCheckOutTime = isCheckOutHiddenStatus ? null : checkOutTime;
                    
                    return { id: attendanceRecord.id, date: day, checkInTime, checkOutTime: displayCheckOutTime, status: description, description, manualEntry: true };
                }

                if (!checkOutTime) {
                    return { id: attendanceRecord.id, date: day, checkInTime, checkOutTime: null, status: 'Hadir', description: 'Belum absen pulang', manualEntry: isManual };
                }
                return { id: attendanceRecord.id, date: day, checkInTime, checkOutTime, status: 'Hadir', description, manualEntry: isManual };
            }

            if (leaveRecord && leaveRecord.type !== 'Pulang Cepat') {
                return { id: `${leaveRecord.id}-${dayStr}`, date: day, checkInTime: null, checkOutTime: null, status: leaveRecord.type, description: cleanDesc(leaveRecord.reason) || leaveRecord.type };
            }

            if (isToday || (isWorkingDay && isBefore(day, todayStart))) {
                return { id: dayStr, date: day, checkInTime: null, checkOutTime: null, status: 'Alpa', description: 'Belum absen masuk' };
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
        console.error("Error fetching report data:", e);
        return [];
    }
}