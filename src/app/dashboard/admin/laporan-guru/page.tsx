
"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, query, where, getDocs, doc, DocumentData } from "firebase/firestore";
import { startOfMonth, endOfMonth, format, getMonth, getYear, eachDayOfInterval, getDaysInMonth } from 'date-fns';
import { id } from 'date-fns/locale';
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Placeholder for school config
const schoolHeaderInfo = {
    name: "SMP NEGERI 5 LANGKE REMBONG",
    department: "DINAS PENDIDIKAN PEMUDA DAN OLAHRAGA",
    government: "PEMERINTAH KABUPATEN MANGGARAI",
    address: "Alamat : Mando,Kelurahan compang carep, Kecamatan Langke Rembong",
    principal: "Maria Magdalena Dirce,S.Pd",
    principalNip: "197803192006042008"
};

type TeacherReportData = {
    no: number;
    userId: string;
    nama: string;
    nip: string;
    statusKepegawaian: string;
    hadir: number;
    sakit: number;
    izin: number;
    alpa: number;
    terlambat: number;
    presentasi: string;
};

type TeacherDetailRecord = {
    tanggal: string;
    masuk: string;
    pulang: string;
    status: string;
    keterangan: string;
};


const LaporanGuruPage = () => {
    const { user } = useUser();
    const { toast } = useToast();
    const firestore = useFirestore();
    const [format, setFormat] = useState("pdf");
    const [selectedTeacherId, setSelectedTeacherId] = useState("semua");
    const [selectedMonth, setSelectedMonth] = useState(new Date());
    const [isLoading, setIsLoading] = useState(false);

    const teachersQuery = useMemoFirebase(() =>
        firestore ? query(collection(firestore, 'users'), where('role', 'in', ['guru', 'kepala_sekolah', 'pegawai'])) : null
        , [firestore]);
    const { data: teachersData, isLoading: isTeachersLoading } = useCollection(user, teachersQuery);

    const monthlyConfigId = useMemo(() => format(selectedMonth, 'yyyy-MM'), [selectedMonth]);
    const monthlyConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'monthlyConfigs', monthlyConfigId) : null, [firestore, monthlyConfigId]);
    const { data: monthlyConfigData } = useDoc(user, monthlyConfigRef);

    const schoolConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);
    const { data: schoolConfigData } = useDoc(user, schoolConfigRef);

    const getEffectiveWorkDays = () => {
        const monthStart = startOfMonth(selectedMonth);
        const totalDays = getDaysInMonth(selectedMonth);
        if (monthlyConfigData?.manualWorkDays) {
            return monthlyConfigData.manualWorkDays;
        }

        const allDays = eachDayOfInterval({ start: monthStart, end: endOfMonth(selectedMonth) });
        const recurringOffDays: number[] = schoolConfigData?.offDays ?? [0, 6]; // Default Sabtu, Minggu
        const specificHolidays = new Set((monthlyConfigData?.holidays ?? []).map((d: string) => d));

        const workDays = allDays.filter(day => {
            const isRecurringOff = recurringOffDays.includes(day.getDay());
            const isSpecificHoliday = specificHolidays.has(format(day, 'yyyy-MM-dd'));
            return !isRecurringOff && !isSpecificHoliday;
        });

        return workDays.length;
    };

    const generatePdf = (summaryData: TeacherReportData[], detailData: TeacherDetailRecord[], teacherInfo: DocumentData | null) => {
        try {
            const doc = new jsPDF();
            const period = format(selectedMonth, 'MMMM yyyy', { locale: id });
            const today = format(new Date(), 'd MMMM yyyy', { locale: id });

            // --- PDF Header ---
            doc.setFontSize(12);
            doc.text(schoolHeaderInfo.government, 105, 15, { align: "center" });
            doc.text(schoolHeaderInfo.department, 105, 22, { align: "center" });
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text(schoolHeaderInfo.name, 105, 29, { align: "center" });
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text(schoolHeaderInfo.address, 105, 36, { align: "center" });
            autoTable(doc, { startY: 38, head: [[]], body: [[]], theme: 'plain', styles: { lineWidth: 0.5, lineColor: 0 } });
            
            // --- PDF Body ---
            if (selectedTeacherId === "semua") {
                doc.setFontSize(12);
                doc.setFont("helvetica", "bold");
                doc.text("LAPORAN KEHADIRAN GURU", 105, 50, { align: "center" });
                doc.setFont("helvetica", "normal");
                doc.text(`Periode : ${period}`, 105, 57, { align: "center" });

                autoTable(doc, {
                    startY: 65,
                    head: [["No", "Nama", "NIP", "Status", "Hadir", "Izin", "Sakit", "Alpa", "Telat", "Presentasi"]],
                    body: summaryData.map(r => [r.no, r.nama, r.nip, r.statusKepegawaian, r.hadir, r.izin, r.sakit, r.alpa, r.terlambat, r.presentasi]),
                    theme: 'grid',
                    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' }
                });
            } else {
                doc.setFontSize(12);
                doc.setFont("helvetica", "bold");
                doc.text("LAPORAN DETAIL KEHADIRAN", 105, 50, { align: "center" });
                doc.setFont("helvetica", "normal");
                doc.text(`Periode: ${period}`, 105, 57, { align: "center" });

                autoTable(doc, {
                    startY: 65,
                    body: [
                        ['Nama', `: ${teacherInfo?.name}`],
                        ['NIP', `: ${teacherInfo?.nip || '-'}`],
                        ['Status Kepegawaian', `: ${teacherInfo?.employeeStatus || 'PNS'}`],
                    ],
                    theme: 'plain',
                    styles: { cellPadding: 1 },
                });

                autoTable(doc, {
                    startY: (doc as any).lastAutoTable.finalY + 5,
                    head: [["Tanggal", "Masuk", "Pulang", "Status", "Keterangan"]],
                    body: detailData.map(d => [d.tanggal, d.masuk, d.pulang, d.status, d.keterangan]),
                    theme: 'grid',
                    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' }
                });
            }
            
            // --- PDF Footer ---
            const finalY = (doc as any).lastAutoTable.finalY + 10;
            doc.text(`Mando, ${today}`, 196, finalY, { align: "right" });
            doc.text("Mengetahui,", 196, finalY + 7, { align: "right" });
            doc.text("Kepala Sekolah", 196, finalY + 14, { align: "right" });
            doc.text(schoolHeaderInfo.principal, 196, finalY + 40, { align: "right" });
            doc.text(`NIP: ${schoolHeaderInfo.principalNip}`, 196, finalY + 47, { align: "right" });

            const fileName = selectedTeacherId === 'semua' ? `laporan-guru-ringkasan-${format(selectedMonth, 'MMMM-yyyy', { locale: id })}.pdf` : `laporan-guru-${teacherInfo?.name}-${format(selectedMonth, 'MMMM-yyyy', { locale: id })}.pdf`;
            doc.save(fileName);

        } catch (error) {
            console.error("PDF Generation Error:", error);
            toast({ variant: "destructive", title: "Gagal Membuat PDF", description: "Terjadi kesalahan saat membuat file PDF." });
        }
    };

    const generateExcel = (summaryData: TeacherReportData[], detailData: TeacherDetailRecord[]) => {
        try {
            const wb = XLSX.utils.book_new();
            const period = format(selectedMonth, 'MMMM-yyyy');

            if (selectedTeacherId === 'semua') {
                const ws = XLSX.utils.json_to_sheet(summaryData);
                XLSX.utils.book_append_sheet(wb, ws, `Ringkasan Guru - ${period}`);
            } else {
                const teacherInfo = teachersData?.find(t => t.id === selectedTeacherId);
                const header = [
                    [`Laporan Detail Kehadiran Guru`],
                    [`Periode: ${period}`],
                    [],
                    ['Nama', teacherInfo?.name],
                    ['NIP', teacherInfo?.nip || '-'],
                    ['Status', teacherInfo?.employeeStatus || 'PNS'],
                    []
                ];
                const ws = XLSX.utils.json_to_sheet(detailData, { origin: 'A8'});
                XLSX.utils.sheet_add_aoa(ws, header, { origin: 'A1' });
                XLSX.utils.book_append_sheet(wb, ws, `Detail - ${teacherInfo?.name}`);
            }

            const fileName = selectedTeacherId === 'semua' ? `laporan-guru-ringkasan-${period}.xlsx` : `laporan-guru-${teachersData?.find(t => t.id === selectedTeacherId)?.name}-${period}.xlsx`;
            XLSX.writeFile(wb, fileName);

        } catch (error) {
            console.error("Excel Generation Error:", error);
            toast({ variant: "destructive", title: "Gagal Membuat Excel", description: "Terjadi kesalahan saat membuat file Excel." });
        }
    };

    const handleGenerateReport = async () => {
        if (!firestore || !teachersData) return;
        setIsLoading(true);
        try {
            const startDate = startOfMonth(selectedMonth);
            const endDate = endOfMonth(selectedMonth);
            const workDays = getEffectiveWorkDays();

            let targetTeachers = teachersData;
            if (selectedTeacherId !== 'semua') {
                targetTeachers = teachersData.filter(t => t.id === selectedTeacherId);
            }

            const summaryData: TeacherReportData[] = [];
            const detailData: TeacherDetailRecord[] = [];

            for (const [index, teacher] of targetTeachers.entries()) {
                const attendanceQuery = query(collection(firestore, `users/${teacher.id}/attendanceRecords`), where('checkInTime', '>=', startDate), where('checkInTime', '<=', endDate));
                const leaveQuery = query(collection(firestore, `users/${teacher.id}/leaveRequests`), where('status', '==', 'approved'));

                const [attendanceSnap, leaveSnap] = await Promise.all([getDocs(attendanceQuery), getDocs(leaveQuery)]);
                
                const allMonthAttendance = attendanceSnap.docs.map(d => d.data());
                const allMonthLeaves = leaveSnap.docs.map(d => d.data()).filter(l => new Date(l.startDate) >= startDate && new Date(l.endDate) <= endDate);

                if (selectedTeacherId !== 'semua') {
                     eachDayOfInterval({ start: startDate, end: endDate }).forEach(day => {
                        const formattedDay = format(day, 'yyyy-MM-dd');
                        const att = allMonthAttendance.find(a => format(a.checkInTime.toDate(), 'yyyy-MM-dd') === formattedDay);
                        const leave = allMonthLeaves.find(l => formattedDay >= format(new Date(l.startDate), 'yyyy-MM-dd') && formattedDay <= format(new Date(l.endDate), 'yyyy-MM-dd'));
                        
                        let record: TeacherDetailRecord = { tanggal: format(day, 'EEE, dd/MM/yy', {locale: id}), masuk: '-', pulang: '-', status: 'Alpa', keterangan: 'Tidak ada data' };

                        if(att) {
                            record.masuk = format(att.checkInTime.toDate(), 'HH:mm');
                            record.pulang = att.checkOutTime ? format(att.checkOutTime.toDate(), 'HH:mm') : '-';
                            record.status = att.status;
                            record.keterangan = att.checkInMessage || (att.status === 'Hadir' ? 'Absensi Terekam' : 'Terlambat');
                            if (!att.checkOutTime) record.keterangan += '; Belum Absen Pulang';
                        } else if (leave) {
                            record.status = leave.type;
                            record.keterangan = leave.reason;
                        }
                        detailData.push(record);
                    });
                }

                const hadir = allMonthAttendance.filter(a => a.status === 'Hadir').length;
                const terlambat = allMonthAttendance.filter(a => a.status === 'Terlambat').length;
                const sakit = allMonthLeaves.filter(l => l.type === 'Sakit').length;
                const izin = allMonthLeaves.filter(l => l.type === 'Izin').length;
                const alpa = workDays - hadir - terlambat - sakit - izin;

                summaryData.push({
                    no: index + 1,
                    userId: teacher.id,
                    nama: teacher.name,
                    nip: teacher.nip || '-',
                    statusKepegawaian: teacher.employeeStatus || 'PNS',
                    hadir: hadir + terlambat,
                    sakit,
                    izin,
                    alpa: alpa < 0 ? 0 : alpa,
                    terlambat,
                    presentasi: workDays > 0 ? `${Math.round(((hadir + terlambat) / workDays) * 100)}%` : 'N/A'
                });
            }

            const teacherInfo = selectedTeacherId !== 'semua' ? teachersData.find(t => t.id === selectedTeacherId) : null;

            if (format === "pdf") {
                generatePdf(summaryData, detailData, teacherInfo);
            } else {
                generateExcel(summaryData, detailData);
            }
        } catch (error) {
            console.error("Report Generation Failed:", error);
            toast({ variant: "destructive", title: "Gagal Membuat Laporan", description: `Terjadi kesalahan: ${error instanceof Error ? error.message : String(error)}` });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Laporan Kehadiran Guru & Staf</CardTitle>
                <CardDescription>Buat laporan kehadiran semua guru/staf atau per individu dalam format PDF atau Excel.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <Label htmlFor="month">Bulan</Label>
                         <Input
                            id="month"
                            type="month"
                            value={format(selectedMonth, 'yyyy-MM')}
                            onChange={(e) => setSelectedMonth(new Date(e.target.value + '-02T00:00:00'))}
                        />
                    </div>
                    <div>
                        <Label htmlFor="format">Format</Label>
                        <Select value={format} onValueChange={setFormat}>
                            <SelectTrigger id="format"><SelectValue placeholder="Pilih Format" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="pdf">PDF</SelectItem>
                                <SelectItem value="excel">Excel</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label htmlFor="guru">Guru/Staf</Label>
                        <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId} disabled={isTeachersLoading}>
                            <SelectTrigger id="guru"><SelectValue placeholder="Pilih Guru/Staf" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="semua">Semua Guru & Staf</SelectItem>
                                {teachersData?.map(teacher => (
                                    <SelectItem key={teacher.id} value={teacher.id}>{teacher.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-end">
                         <Button onClick={handleGenerateReport} disabled={isLoading || isTeachersLoading} className="w-full">
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Buat Laporan
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default LaporanGuruPage;
