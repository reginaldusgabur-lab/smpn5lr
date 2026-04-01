'use client';

import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { eachDayOfInterval, isWithinInterval, startOfMonth, endOfMonth, startOfDay, subDays, format } from 'date-fns';
import type { Firestore } from 'firebase/firestore';

/**
 * A centralized function to calculate attendance statistics for a user within a given date range.
 * This function serves as the Single Source of Truth for all attendance-related calculations.
 * 
 * @param firestore - The Firestore instance.
 * @param userId - The ID of the user to calculate stats for.
 * @param dateRange - An object containing the start and end dates for the calculation period.
 * @returns {Promise<object>} A promise that resolves to an object with detailed attendance stats.
 */
export async function calculateAttendanceStats(firestore: Firestore, userId: string, dateRange: { start: Date, end: Date }) {
    const { start, end } = dateRange;

    // 1. Fetch all necessary data in parallel
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
        where('startDate', '<=', end) // Fetch leaves that might start before but overlap with the period
    );

    const [schoolConfigSnap, monthlyConfigSnap, attendanceSnap, leaveSnap] = await Promise.all([
        getDoc(schoolConfigRef),
        getDoc(monthlyConfigRef),
        getDocs(attendanceQuery),
        getDocs(leaveQuery),
    ]);

    // 2. Extract data and configurations
    const schoolConfig = schoolConfigSnap.data();
    const monthlyConfig = monthlyConfigSnap.data();
    const attendanceData = attendanceSnap.docs.map(d => d.data());
    const leaveData = leaveSnap.docs.map(d => d.data());

    // 3. Determine working days, off days, and holidays
    const offDays: number[] = schoolConfig?.offDays ?? [0, 6]; // Default: Sun, Sat
    const holidays: string[] = monthlyConfig?.holidays ?? [];
    const today = startOfDay(new Date());

    // For past months, the calculation basis is the whole month. For the current month, it's up to today.
    const calculationEndDate = end < today ? end : today;

    const effectiveWorkingDays = eachDayOfInterval({ start, end }).filter(day => 
        !offDays.includes(day.getDay()) && !holidays.includes(format(day, 'yyyy-MM-dd'))
    );

    const pastEffectiveWorkingDays = effectiveWorkingDays.filter(day => day < today);

    // 4. Calculate attendance and leave counts
    const hadirCount = new Set(attendanceData.map(att => format(att.checkInTime.toDate(), 'yyyy-MM-dd'))).size;

    let izinCount = 0;
    let sakitCount = 0;
    let pastIzinCount = 0;
    let pastSakitCount = 0;

    leaveData.forEach(leave => {
        if (leave.status !== 'approved') return;
        eachDayOfInterval({ start: leave.startDate.toDate(), end: leave.endDate.toDate() }).forEach(day => {
            // Check if the day falls within the report's date range and is a working day
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

    // 5. Calculate Alpa (absent) and Percentage
    const alpaCount = Math.max(0, pastEffectiveWorkingDays.length - 
        new Set(attendanceData.filter(att => att.checkInTime.toDate() < today).map(att => format(att.checkInTime.toDate(), 'yyyy-MM-dd'))).size - 
        pastIzinCount - 
        pastSakitCount
    );
    
    const totalWorkingDaysForPercentage = effectiveWorkingDays.length;
    const percentageRaw = totalWorkingDaysForPercentage > 0 ? (hadirCount / totalWorkingDaysForPercentage) * 100 : 0;
    
    // Ensure percentage does not exceed 100%
    const finalPercentage = Math.min(percentageRaw, 100);

    return {
        totalHadir: hadirCount,
        totalIzin: izinCount,
        totalSakit: sakitCount,
        totalAlpa: alpaCount,
        persentase: finalPercentage.toFixed(1) + '%',
    };
}
