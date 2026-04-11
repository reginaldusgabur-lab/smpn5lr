import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval, startOfDay, endOfDay, isAfter } from 'date-fns';

// Fungsi helper untuk mendapatkan informasi hari kerja dalam sebulan
async function getWorkingDaysInfo(firestore, month) {
    const monthDate = new Date(month + '-01T12:00:00'); // Format tanggal yang aman
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const today = startOfDay(new Date());

    const schoolConfigSnap = await getDoc(doc(firestore, 'schoolConfig', 'default'));
    const monthlyConfigSnap = await getDoc(doc(firestore, 'monthlyConfigs', month));

    const schoolConfig = schoolConfigSnap.data() || {};
    const monthlyConfig = monthlyConfigSnap.data() || {};
    const offDays = schoolConfig.offDays || [0, 6]; // Default: Minggu, Sabtu
    const holidays = monthlyConfig.holidays || [];

    const allDaysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    const allWorkingDays = allDaysInMonth.filter(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        return !offDays.includes(day.getDay()) && !holidays.includes(dayStr);
    });
    
    // Pisahkan hari kerja yang sudah berlalu untuk perhitungan akurat
    const pastWorkingDays = allWorkingDays.filter(day => !isAfter(day, today));

    return {
        allWorkingDays: allWorkingDays,       // Semua hari kerja dalam sebulan
        pastWorkingDays: pastWorkingDays,  // Hari kerja yang sudah lewat (termasuk hari ini)
    };
}

// Fungsi utama untuk menghasilkan laporan bulanan
export async function generateMonthlyReport(firestore, month) {
    const usersSnapshot = await getDocs(collection(firestore, 'users'));
    const allUsers = usersSnapshot.docs.map(d => ({ uid: d.id, ...d.data() }));

    const { allWorkingDays, pastWorkingDays } = await getWorkingDaysInfo(firestore, month);
    const totalReportableDays = pastWorkingDays.length;

    const reportPromises = allUsers.map(async (user) => {
        const [attendanceSnapshot, leaveSnapshot] = await Promise.all([
             getDocs(collection(firestore, 'users', user.uid, 'attendanceRecords')),
             getDocs(collection(firestore, 'users', user.uid, 'leaveRequests'))
        ]);
        const userAttendance = attendanceSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        const userLeaves = leaveSnapshot.docs.map(d => d.data());

        let hadirCount = 0;
        let izinCount = 0;
        let sakitCount = 0;
        let alpaCount = 0;

        // --- LOGIKA UTAMA: Hanya proses hari kerja yang telah berlalu ---
        for (const day of pastWorkingDays) {
            const dayStr = format(day, 'yyyy-MM-dd');

            // 1. Cek apakah ada Izin/Sakit/Dinas yang disetujui
            const approvedLeave = userLeaves.find(l => 
                l.status === 'approved' && isWithinInterval(day, { start: startOfDay(l.startDate.toDate()), end: endOfDay(l.endDate.toDate()) })
            );

            if (approvedLeave) {
                if (approvedLeave.type === 'Sakit') {
                    sakitCount++;
                } else { // Semua selain Sakit dianggap Izin (termasuk Dinas)
                    izinCount++;
                }
                continue; // Hari sudah dikategorikan, lanjut ke hari berikutnya
            }

            // 2. Jika tidak ada izin, cek catatan kehadiran
            const attendanceRecord = userAttendance.find(a => a.date === dayStr);
            
            if (attendanceRecord) {
                // Jika ada catatan, cek kelengkapannya
                if (attendanceRecord.checkInTime && attendanceRecord.checkOutTime) {
                    hadirCount++; // Hadir
                } else {
                    alpaCount++; // Tidak absen pulang dianggap Alpa
                }
            } else {
                // Jika tidak ada izin dan tidak ada catatan kehadiran, dianggap Alpa
                alpaCount++;
            }
        }

        // Kalkulasi persentase yang akurat berdasarkan hari yang telah berlalu
        const attendancePercentage = totalReportableDays > 0 ? (hadirCount / totalReportableDays) * 100 : 0;
        
        return {
            uid: user.uid,
            name: user.name,
            nip: user.nip || '-',
            role: user.role,
            employmentStatus: user.employmentStatus || '-',
            hadirCount,
            izinCount,
            sakitCount,
            alpaCount,
            attendancePercentage,
            totalWorkingDays: allWorkingDays.length // Total hari kerja sebulan penuh
        };
    });

    return Promise.all(reportPromises);
}
