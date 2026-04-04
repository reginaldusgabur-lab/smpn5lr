'use client';

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, query, where, getDocs, doc, DocumentData, collectionGroup, Timestamp } from "firebase/firestore";
import { startOfMonth, endOfMonth, format, eachDayOfInterval, getDaysInMonth } from 'date-fns';
import { id as indonesianLocale } from 'date-fns/locale';
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// --- Type Definitions ---
interface AttendanceRecord {
    checkInTime: Timestamp;
    checkOutTime?: Timestamp;
    status: string;
    notes?: string;
    userId: string;
}

interface LeaveRequest {
    startDate: Timestamp;
    endDate: Timestamp;
    status: string;
    type: 'Sakit' | 'Izin';
    reason: string;
    duration: number;
    userId: string;
}

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
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();
    
    const [reportFormat, setReportFormat] = useState("pdf");
    const [selectedTeacherId, setSelectedTeacherId] = useState("semua");
    const [selectedMonth, setSelectedMonth] = useState(new Date());
    const [isLoading, setIsLoading] = useState(false);

    const userDocRef = useMemoFirebase(() => {
        if (!user) return null;
        return doc(firestore, 'users', user.uid);
    }, [firestore, user]);
    const { data: userData, isLoading: isUserDataLoading } = useDoc(user, userDocRef);

    const isLoadingPage = isUserLoading || isUserDataLoading;
    const canAccess = !isLoadingPage && userData && ['admin', 'kepala_sekolah'].includes(userData.role);

    useEffect(() => {
        if (!isLoadingPage) {
            if (!user) {
                router.replace('/');
            } else if (!canAccess) {
                router.replace('/dashboard');
            }
        }
    }, [isLoadingPage, canAccess, user, router]);

    const teachersQuery = useMemoFirebase(() =>
        firestore && canAccess ? query(collection(firestore, 'users'), where('role', 'in', ['guru', 'kepala_sekolah', 'pegawai'])) : null
        , [firestore, canAccess]);
    const { data: teachersData, isLoading: isTeachersLoading } = useCollection(user, teachersQuery);

    const monthlyConfigId = useMemo(() => format(selectedMonth, 'yyyy-MM'), [selectedMonth]);
    const monthlyConfigRef = useMemoFirebase(() => firestore && canAccess ? doc(firestore, 'monthlyConfigs', monthlyConfigId) : null, [firestore, monthlyConfigId, canAccess]);
    const { data: monthlyConfigData } = useDoc(user, monthlyConfigRef);

    const schoolConfigRef = useMemoFirebase(() => firestore && canAccess ? doc(firestore, 'schoolConfig', 'default') : null, [firestore, canAccess]);
    const { data: schoolConfigData } = useDoc(user, schoolConfigRef);

    const getEffectiveWorkDays = () => {
        const monthStart = startOfMonth(selectedMonth);
        if (monthlyConfigData?.manualWorkDays) {
            return monthlyConfigData.manualWorkDays;
        }

        const allDays = eachDayOfInterval({ start: monthStart, end: endOfMonth(selectedMonth) });
        const recurringOffDays: number[] = schoolConfigData?.offDays ?? [0, 6];
        const specificHolidays = new Set((monthlyConfigData?.holidays ?? []).map((d: string) => d));

        return allDays.filter(day => {
            const isRecurringOff = recurringOffDays.includes(day.getDay());
            const isSpecificHoliday = specificHolidays.has(format(day, 'yyyy-MM-dd'));
            return !isRecurringOff && !isSpecificHoliday;
        }).length;
    };

    const generatePdf = (summaryData: TeacherReportData[], detailData: TeacherDetailRecord[], teacherInfo: DocumentData | null) => {
        try {
            const docPDF = new jsPDF();
            const period = format(selectedMonth, 'MMMM yyyy', { locale: indonesianLocale });
            const today = format(new Date(), 'd MMMM yyyy', { locale: indonesianLocale });
            let pageNumber = 1;

            const didDrawPage = (data: any) => {
                // HEADER
                docPDF.setFontSize(12);
                docPDF.setFont('helvetica', 'normal');
                docPDF.text(schoolHeaderInfo.government, 105, 15, { align: "center" });
                docPDF.text(schoolHeaderInfo.department, 105, 22, { align: "center" });
                docPDF.setFontSize(14);
                docPDF.setFont("helvetica", "bold");
                docPDF.text(schoolHeaderInfo.name, 105, 29, { align: "center" });
                docPDF.setFontSize(10);
                docPDF.setFont("helvetica", "normal");
                docPDF.text(schoolHeaderInfo.address, 105, 36, { align: "center" });
                docPDF.setDrawColor(0, 0, 0);
                docPDF.line(14, 38, 196, 38);

                // WATERMARK
                docPDF.setFont('helvetica', 'bold');
                docPDF.setFontSize(72);
                docPDF.setTextColor(220, 220, 220);
                docPDF.saveGraphicsState();
                docPDF.setGState(new (docPDF as any).GState({opacity: 0.5}));
                const pageSize = docPDF.internal.pageSize;
                const pageWidth = pageSize.getWidth();
                const pageHeight = pageSize.getHeight();
                docPDF.text("E-SPENLI", pageWidth / 2, pageHeight / 1.8, { angle: -45, align: 'center' });
                docPDF.restoreGraphicsState();
                docPDF.setTextColor(0, 0, 0);

                // FOOTER
                const footerY = pageHeight - 15;
                docPDF.setDrawColor(150, 150, 150);
                docPDF.line(14, footerY, pageWidth - 14, footerY);
                docPDF.setFont('helvetica', 'normal');
                docPDF.setFontSize(8);
                docPDF.setTextColor(100);
                docPDF.text('Dokumen ini adalah laporan absensi resmi yang dihasilkan secara otomatis oleh aplikasi E-SPENLI.', 14, footerY + 5);
                const pageNumText = `Halaman ${pageNumber}`;
                docPDF.text(pageNumText, pageWidth - 14, footerY + 5, { align: 'right' });
                pageNumber++;
            };
            
            if (selectedTeacherId === "semua") {
                docPDF.setFontSize(12);
                docPDF.setFont("helvetica", "bold");
                docPDF.text("LAPORAN KEHADIRAN GURU", 105, 50, { align: "center" });
                docPDF.setFont("helvetica", "normal");
                docPDF.text(`Periode : ${period}`, 105, 57, { align: "center" });

                autoTable(docPDF, {
                    startY: 65,
                    head: [["No", "Nama", "NIP", "Status", "Hadir", "Izin", "Sakit", "Alpa", "Telat", "Presentasi"]],
                    body: summaryData.map(r => [r.no, r.nama, r.nip, r.statusKepegawaian, r.hadir, r.izin, r.sakit, r.alpa, r.terlambat, r.presentasi]),
                    theme: 'grid',
                    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold', halign: 'center' },
                    margin: { top: 45, bottom: 20 },
                    didDrawPage: didDrawPage,
                });
            } else {
                docPDF.setFontSize(12);
                docPDF.setFont("helvetica", "bold");
                docPDF.text("LAPORAN DETAIL KEHADIRAN", 105, 50, { align: "center" });
                docPDF.setFont("helvetica", "normal");
                docPDF.text(`Periode: ${period}`, 105, 57, { align: "center" });

                autoTable(docPDF, {
                    startY: 65,
                    body: [
                        ['Nama', `: ${teacherInfo?.name}`],
                        ['NIP', `: ${teacherInfo?.nip || '-'}`],
                        ['Status Kepegawaian', `: ${teacherInfo?.position || '-'}`],
                    ],
                    theme: 'plain',
                    styles: { cellPadding: 1, fontSize: 10 },
                });

                autoTable(docPDF, {
                    startY: (docPDF as any).lastAutoTable.finalY + 5,
                    head: [["Tanggal", "Masuk", "Pulang", "Status", "Keterangan"]],
                    body: detailData.map(d => [d.tanggal, d.masuk, d.pulang, d.status, d.keterangan]),
                    theme: 'grid',
                    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold', halign: 'center' },
                    margin: { top: 45, bottom: 20 },
                    didDrawPage: didDrawPage,
                });
            }
            
            const finalY = (docPDF as any).lastAutoTable.finalY;
            let signatureY = finalY + 20;
            if (signatureY > docPDF.internal.pageSize.getHeight() - 60) {
                 docPDF.addPage();
                 signatureY = 45;
            }
            
            docPDF.setFontSize(10);
            docPDF.setFont('helvetica', 'normal');
            docPDF.text(`Mando, ${today}`, 196, signatureY, { align: "right" });
            docPDF.text("Mengetahui,", 196, signatureY + 7, { align: "right" });
            docPDF.text("Kepala Sekolah", 196, signatureY + 14, { align: "right" });
            docPDF.text(schoolHeaderInfo.principal, 196, signatureY + 40, { align: "right" });
            docPDF.text(`NIP: ${schoolHeaderInfo.principalNip}`, 196, signatureY + 47, { align: "right" });

            // Final pass to correct page numbers if a new page was added for the signature
            const totalPages = docPDF.internal.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                docPDF.setPage(i);
                docPDF.setFontSize(8);
                docPDF.setTextColor(100);
                const pageNumText = `Halaman ${i} dari ${totalPages}`;
                docPDF.text(pageNumText, docPDF.internal.pageSize.getWidth() - 14, docPDF.internal.pageSize.getHeight() - 10, { align: 'right' });
            }

            const fileName = selectedTeacherId === 'semua' ? `laporan-guru-ringkasan-${format(selectedMonth, 'MMMM-yyyy', { locale: indonesianLocale })}.pdf` : `laporan-guru-${teacherInfo?.name}-${format(selectedMonth, 'MMMM-yyyy', { locale: indonesianLocale })}.pdf`;
            docPDF.save(fileName);

        } catch (error) {
            console.error("PDF Generation Error:", error);
            toast({ variant: "destructive", title: "Gagal Membuat PDF", description: "Terjadi kesalahan saat membuat file PDF." });
        }
    };

    const generateExcel = (summaryData: TeacherReportData[], detailData: TeacherDetailRecord[]) => {
        try {
            const wb = XLSX.utils.book_new();
            const period = format(selectedMonth, 'MMMM yyyy', { locale: indonesianLocale });
            const footer = [['Dokumen ini adalah laporan absensi resmi yang dihasilkan secara otomatis oleh aplikasi E-SPENLI.']];

            if (selectedTeacherId === 'semua') {
                const header = [
                    [schoolHeaderInfo.government],
                    [schoolHeaderInfo.department],
                    [schoolHeaderInfo.name],
                    [],
                    ['LAPORAN RINGKASAN KEHADIRAN GURU & STAF'],
                    [`Periode: ${period}`],
                    [] 
                ];
                const ws = XLSX.utils.aoa_to_sheet(header);
                XLSX.utils.sheet_add_json(ws, summaryData.map(d => ({ 
                    'No': d.no, 'Nama': d.nama, 'NIP': d.nip, 'Status': d.statusKepegawaian, 'Hadir': d.hadir, 'Sakit': d.sakit, 'Izin': d.izin, 'Alpa': d.alpa, 'Terlambat': d.terlambat, 'Presentasi (%)': d.presentasi
                })), { origin: 'A8', skipHeader: false });
                XLSX.utils.sheet_add_aoa(ws, footer, { origin: -1 });
                XLSX.utils.book_append_sheet(wb, ws, `Ringkasan Guru`);
            } else {
                const teacherInfo = teachersData?.find(t => t.id === selectedTeacherId);
                 const header = [
                    [schoolHeaderInfo.government],
                    [schoolHeaderInfo.department],
                    [schoolHeaderInfo.name],
                    [],
                    ['LAPORAN DETAIL KEHADIRAN'],
                    [`Periode: ${period}`],
                    [],
                    ['Nama', `: ${teacherInfo?.name}`],
                    ['NIP', `: ${teacherInfo?.nip || '-'}`],
                    ['Status', `: ${teacherInfo?.position || '-'}`],
                    [] 
                ];
                const ws = XLSX.utils.aoa_to_sheet(header);
                const detailHeader = [["Tanggal", "Waktu Masuk", "Waktu Pulang", "Status Kehadiran", "Keterangan"]];
                XLSX.utils.sheet_add_aoa(ws, detailHeader, {origin: 'A12'})
                XLSX.utils.sheet_add_json(ws, detailData, { origin: 'A13', skipHeader: true });
                XLSX.utils.sheet_add_aoa(ws, footer, { origin: -1 });
                XLSX.utils.book_append_sheet(wb, ws, `Detail - ${teacherInfo?.name?.substring(0, 20)}`);
            }

            const fileName = selectedTeacherId === 'semua' ? `laporan-guru-ringkasan-${format(selectedMonth, 'MMMM-yyyy')}.xlsx` : `laporan-guru-${teachersData?.find(t => t.id === selectedTeacherId)?.name}-${format(selectedMonth, 'MMMM-yyyy')}.xlsx`;
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
            let detailData: TeacherDetailRecord[] = [];

            for (let index = 0; index < targetTeachers.length; index++) {
                const teacher = targetTeachers[index];

                const attendanceQuery = query(collectionGroup(firestore, 'attendanceRecords'), where('userId', '==', teacher.id), where('checkInTime', '>=', startDate), where('checkInTime', '<=', endDate));
                const leaveQuery = query(collectionGroup(firestore, 'leaveRequests'), where('userId', '==', teacher.id), where('status', '==', 'approved'));

                const [attendanceSnap, leaveSnap] = await Promise.all([getDocs(attendanceQuery), getDocs(leaveQuery)]);
                
                const allMonthAttendance = attendanceSnap.docs.map(d => d.data() as AttendanceRecord);
                const allMonthLeaves = leaveSnap.docs.map(d => d.data() as LeaveRequest).filter(l => l.startDate.toDate() <= endDate && l.endDate.toDate() >= startDate);

                if (selectedTeacherId !== 'semua') {
                     detailData = eachDayOfInterval({ start: startDate, end: endDate }).map(day => {
                        const formattedDayStr = format(day, 'yyyy-MM-dd');
                        const att = allMonthAttendance.find(a => format(a.checkInTime.toDate(), 'yyyy-MM-dd') === formattedDayStr);
                        const leave = allMonthLeaves.find(l => formattedDayStr >= format(l.startDate.toDate(), 'yyyy-MM-dd') && formattedDayStr <= format(l.endDate.toDate(), 'yyyy-MM-dd'));
                        
                        let record: TeacherDetailRecord = { tanggal: format(day, 'EEE, dd/MM/yy', {locale: indonesianLocale}), masuk: '-', pulang: '-', status: 'Alpa', keterangan: 'Tidak ada data' };

                        if(att) {
                            record.masuk = format(att.checkInTime.toDate(), 'HH:mm');
                            record.pulang = att.checkOutTime ? format(att.checkOutTime.toDate(), 'HH:mm') : '-';
                            record.status = att.status || 'Hadir';
                            record.keterangan = att.notes || (record.status === 'Hadir' ? 'Absensi Terekam' : 'Terlambat');
                            if (!att.checkOutTime) record.keterangan += '; Belum Absen Pulang';
                        } else if (leave) {
                            record.status = leave.type;
                            record.keterangan = leave.reason;
                        }
                        return record;
                    });
                }

                const hadirCount = allMonthAttendance.filter(a => a.status === 'Hadir').length;
                const terlambatCount = allMonthAttendance.filter(a => a.status === 'Terlambat').length;
                const sakitDays = allMonthLeaves.filter(l => l.type === 'Sakit').reduce((acc, l) => acc + l.duration, 0);
                const izinDays = allMonthLeaves.filter(l => l.type === 'Izin').reduce((acc, l) => acc + l.duration, 0);
                const hadirTotal = hadirCount + terlambatCount;
                const alpaCount = workDays - hadirTotal - sakitDays - izinDays;

                summaryData.push({
                    no: index + 1,
                    userId: teacher.id,
                    nama: teacher.name,
                    nip: teacher.nip || '-',
                    statusKepegawaian: teacher.position || '-',
                    hadir: hadirTotal,
                    sakit: sakitDays,
                    izin: izinDays,
                    alpa: alpaCount < 0 ? 0 : alpaCount,
                    terlambat: terlambatCount,
                    presentasi: workDays > 0 ? `${Math.round((hadirTotal / workDays) * 100)}%` : 'N/A'
                });
            }

            const teacherInfo = selectedTeacherId !== 'semua' ? teachersData.find(t => t.id === selectedTeacherId) : null;

            if (reportFormat === "pdf") {
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

    if (isLoadingPage || !canAccess) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

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
                        <Select value={reportFormat} onValueChange={setReportFormat}>
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
