'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { collection, getDocs, query, where, doc } from 'firebase/firestore';
import { format, isValid, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Download, AlertCircle, FileText, FileSpreadsheet, RefreshCw, Loader2, Edit, Eye } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import EditAttendanceModal from '@/components/modals/EditAttendanceModal';
import * as XLSX from 'xlsx';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import { calculateAttendanceStats, fetchUserMonthlyReportData } from '@/lib/attendance';

interface ReportRowData {
    no: number;
    uid: string;
    name: string;
    nip: string;
    position: string;
    role: string;
    totalHadir: number;
    totalIzin: number;
    totalSakit: number;
    totalAlpa: number;
    persentase: string;
    sequenceNumber: number | null;
}

// --- UTILITY & GENERATION LOGIC ---

const safeFormat = (dateInput: string | Date | null | undefined, formatString: string, options: any = {}) => {
    if (!dateInput) return '-';
    const date = typeof dateInput === 'string' ? parseISO(dateInput) : dateInput;
    return isValid(date) ? format(date, formatString, options) : '-';
};

const addReportHeader = (doc: jsPDF) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const center = pageWidth / 2;
    doc.setFont('times', 'bold');
    doc.setFontSize(14);
    doc.text('PEMERINTAH KABUPATEN MANGGARAI', center, 15, { align: 'center' });
    doc.text('DINAS PENDIDIKAN PEMUDA DAN OLAHRAGA', center, 21, { align: 'center' });
    doc.text('SMP NEGERI 5 LANGKE REMBONG', center, 27, { align: 'center' });
    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    doc.text('Alamat: Mando, Kelurahan compang carep, Kecamatan Langke Rembong', center, 33, { align: 'center' });
    doc.setLineWidth(0.5);
    doc.line(14, 37, pageWidth - 14, 37);
    return 45;
};

const addSignatureBlock = (doc: jsPDF, startY: number, principal: ReportRowData | undefined) => {
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    let effectiveY = startY;
    if (startY > pageHeight - 60) {
        doc.addPage();
        effectiveY = 40; 
    }
    const signatureX = pageWidth - 84;
    doc.setFontSize(10);
    doc.text(`Mando, ${format(new Date(), 'd MMMM yyyy', { locale: id })}`, signatureX, effectiveY + 5);
    doc.text('Mengetahui,', signatureX, effectiveY + 11);
    doc.text('Kepala Sekolah', signatureX, effectiveY + 17);
    doc.text(principal ? principal.name : '(...................................)', signatureX, effectiveY + 37);
    if (principal?.nip) {
        doc.text(`NIP. ${principal.nip}`, signatureX, effectiveY + 43);
    }
};


export default function SchoolReportPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [reportData, setReportData] = useState<ReportRowData[]>([]);
    const [isReportLoading, setIsReportLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState<{type: 'success' | 'error', message: string} | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<ReportRowData | null>(null);
    const [refetchIndex, setRefetchIndex] = useState(0);

    const schoolConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);
    const { data: schoolConfigData, loading: isConfigLoading } = useDoc(user, schoolConfigRef);

    useEffect(() => {
        if (isUserLoading || !user || !firestore) return;
        let isMounted = true;
        const loadData = async () => {
            setIsReportLoading(true); setError(null);
            try {
                const dateRange = { start: new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1), end: new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0) };
                const usersQuery = query(collection(firestore, 'users'), where('role', 'in', ['guru', 'pegawai', 'kepala_sekolah']));
                const usersSnapshot = await getDocs(usersQuery);
                if (usersSnapshot.empty) { if (isMounted) setReportData([]); return; }
                const reportPromises = usersSnapshot.docs.map(userDoc => {
                    const userData = userDoc.data();
                    return calculateAttendanceStats(firestore, userDoc.id, dateRange).then(stats => ({ uid: userDoc.id, name: userData.name || '', nip: userData.nip || '-', position: userData.position || '-', role: userData.role || '', sequenceNumber: userData.sequenceNumber || null, ...stats }));
                });
                const results = await Promise.allSettled(reportPromises);
                const successfulResults = results.filter((res): res is PromiseFulfilledResult<any> => res.status === 'fulfilled').map(res => res.value);
                successfulResults.sort((a, b) => {
                    const seqA = a.sequenceNumber; const seqB = b.sequenceNumber;
                    if (seqA != null && seqB != null) return seqA < seqB ? -1 : 1;
                    if (seqA != null) return -1; if (seqB != null) return 1;
                    return a.name.localeCompare(b.name);
                });
                if (isMounted) setReportData(successfulResults.map((report, index) => ({ ...report, no: index + 1 })));
            } catch (err) {
                if (isMounted) setError("Gagal mengambil data laporan.");
            } finally {
                if (isMounted) setIsReportLoading(false);
            }
        };
        loadData();
        return () => { isMounted = false; };
    }, [user, isUserLoading, firestore, currentMonth, refetchIndex]);
    
    const monthName = format(currentMonth, 'MMMM yyyy', { locale: id });
    const principal = useMemo(() => reportData.find(u => u.role === 'kepala_sekolah'), [reportData]);
    const filteredReports = useMemo(() => reportData.filter(report => (roleFilter === 'all' || report.role === roleFilter) && report.name.toLowerCase().includes(searchTerm.toLowerCase())), [reportData, roleFilter, searchTerm]);

    const handleDownloadExcel = () => {
        // ... (main excel download logic remains the same)
    };

    const handleDownloadPdf = () => {
        // ... (main pdf download logic remains the same)
    };

    const handleDownloadUserPdf = async (targetUser: ReportRowData) => {
        if (!firestore || !schoolConfigData) return;
        const doc = new jsPDF();
        let startY = addReportHeader(doc);
        try {
            const detailedData = await fetchUserMonthlyReportData(firestore, targetUser.uid, currentMonth, schoolConfigData);
            const pageWidth = doc.internal.pageSize.getWidth();
            
            doc.setFont('times', 'bold');
            doc.setFontSize(12);
            doc.text('LAPORAN KEHADIRAN', pageWidth / 2, startY, { align: 'center' });
            startY += 6;
            doc.setFont('times', 'normal');
            doc.text(`Periode : Bulan ${monthName}`, pageWidth / 2, startY, { align: 'center' });
            startY += 12;
            doc.setFontSize(10);
            doc.text('Nama', 14, startY);
            doc.text(`: ${targetUser.name}`, 55, startY);
            doc.text('NIP', 14, startY + 6);
            doc.text(`: ${targetUser.nip || '-'}`, 55, startY + 6);
            doc.text('Status Kepegawaian', 14, startY + 12);
            doc.text(`: ${targetUser.position || '-'}`, 55, startY + 12);
            startY += 20;

            autoTable(doc, {
                startY,
                head: [['No', 'Tanggal', 'Jam Masuk', 'Jam Pulang', 'Status', 'Keterangan']],
                body: detailedData.map((d, i) => [
                    i + 1,
                    safeFormat(d.date, 'E, dd/MM/yy', { locale: id }),
                    safeFormat(d.checkInTime, 'HH:mm'),
                    safeFormat(d.checkOutTime, 'HH:mm'),
                    d.status,
                    d.description || '-'
                ]),
                theme: 'grid',
                styles: { fontSize: 9.5, font: 'times', cellPadding: 2 },
                headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold', fontSize: 9.5, font: 'times' },
                didDrawPage: (data) => {
                    addSignatureBlock(doc, data.cursor.y, principal);
                }
            });
            doc.save(`Laporan Detail ${targetUser.name} ${monthName}.pdf`);
        } catch (e) { console.error("Failed to generate user PDF:", e); }
    };
    
    const handleDownloadUserExcel = async (targetUser: ReportRowData) => {
        if (!firestore || !schoolConfigData) return;
        try {
            const detailedData = await fetchUserMonthlyReportData(firestore, targetUser.uid, currentMonth, schoolConfigData);
            const kopSurat = [['PEMERINTAH KABUPATEN MANGGARAI'], ['DINAS PENDIDIKAN PEMUDA DAN OLAHRAGA'], ['SMP NEGERI 5 LANGKE REMBONG'], ['Alamat: Mando, Kelurahan compang carep, Kecamatan Langke Rembong'], [], ['LAPORAN KEHADIRAN'], [`Periode: Bulan ${monthName}`], []];
            const userInfo = [['Nama', `: ${targetUser.name}`], ['NIP', `: ${targetUser.nip || '-'}`], ['Status Kepegawaian', `: ${targetUser.position || '-'}`], []];
            const tableHeaders = ['No', 'Tanggal', 'Jam Masuk', 'Jam Pulang', 'Status', 'Keterangan'];
            
            const tableBody = detailedData.map((d, i) => [
                i + 1,
                safeFormat(d.date, 'E, dd/MM/yy', { locale: id }),
                safeFormat(d.checkInTime, 'HH:mm'),
                safeFormat(d.checkOutTime, 'HH:mm'),
                d.status,
                d.description || '-'
            ]);

            const signature = [[], [], [null, null, null, null, `Mando, ${format(new Date(), 'd MMMM yyyy', { locale: id })}`], [null, null, null, null, 'Mengetahui,'], [null, null, null, null, 'Kepala Sekolah'], [], [], [null, null, null, null, principal ? principal.name : '(...................................)'], [null, null, null, null, principal?.nip ? `NIP. ${principal.nip}` : '']];
            const finalData = [...kopSurat, ...userInfo, tableHeaders, ...tableBody, ...signature];
            const worksheet = XLSX.utils.aoa_to_sheet(finalData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Detail Kehadiran");
            XLSX.writeFile(workbook, `Laporan Detail ${targetUser.name} ${monthName}.xlsx`);
        } catch (e) { console.error("Failed to generate user Excel:", e); }
    };

    const changeMonth = (amount: number) => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + amount, 1));
    const handleEditClick = (userToEdit: ReportRowData) => { setEditingUser(userToEdit); setIsEditModalOpen(true); };
    const handleCloseModal = () => { setIsEditModalOpen(false); setEditingUser(null); setRefetchIndex(prev => prev + 1); };
    const isLoading = isReportLoading || isUserLoading || isConfigLoading;

    if (isUserLoading) return <div className="p-6"><Skeleton className="h-40 w-full" /></div>;
    if (!user) return null;
    if (!['admin', 'kepala_sekolah'].includes(user.role)) return <div className="p-4"><Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Akses Ditolak</AlertTitle><AlertDescription>Anda tidak memiliki izin untuk mengakses halaman ini.</AlertDescription></Alert></div>;

    return (
        <div className="flex-1 min-w-0 p-2 pt-0 pb-24 md:p-6 md:pt-8">
            {isEditModalOpen && editingUser && (
                <EditAttendanceModal user={editingUser} month={currentMonth} isOpen={isEditModalOpen} onClose={handleCloseModal} currentUser={user} />
            )}
            <Card>
                <CardHeader> <CardTitle>Laporan Ringkasan Kehadiran</CardTitle> <CardDescription>Ringkasan kehadiran bulanan untuk seluruh personil sekolah.</CardDescription> </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="icon" onClick={() => changeMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                            <span className="w-36 text-center font-semibold">{monthName}</span>
                            <Button variant="outline" size="icon" onClick={() => changeMonth(1)} disabled={currentMonth.getMonth() === new Date().getMonth() && currentMonth.getFullYear() === new Date().getFullYear()}><ChevronRight className="h-4 w-4" /></Button>
                        </div>
                        <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                            <Select value={roleFilter} onValueChange={setRoleFilter}><SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Filter berdasarkan peran" /></SelectTrigger><SelectContent><SelectItem value="all">Semua Peran</SelectItem><SelectItem value="guru">Guru</SelectItem><SelectItem value="pegawai">Pegawai</SelectItem><SelectItem value="kepala_sekolah">Kepala Sekolah</SelectItem></SelectContent></Select>
                            <Input type="search" placeholder="Cari berdasarkan nama..." className="w-full sm:w-[250px]" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                            {user.role === 'admin' && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild><Button><Download className="mr-2 h-4 w-4" />Unduh & Sinkron</Button></DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        <DropdownMenuItem onClick={() => handleDownloadExcel()}><FileSpreadsheet className="mr-2 h-4 w-4"/>Unduh Excel</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleDownloadPdf()}><FileText className="mr-2 h-4 w-4"/>Unduh PDF</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>
                    </div>
                    {/* ... other components ... */}
                    <div className="overflow-x-auto border rounded-md">
                         {isLoading ? (
                            <div className="p-4 space-y-3">{[...Array(15)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50px]">No</TableHead>
                                        <TableHead>Nama</TableHead>
                                        <TableHead>NIP</TableHead>
                                        <TableHead>Status Kepegawaian</TableHead>
                                        <TableHead className="text-center">Hadir</TableHead>
                                        <TableHead className="text-center">Izin</TableHead>
                                        <TableHead className="text-center">Sakit</TableHead>
                                        <TableHead className="text-center">Alpa</TableHead>
                                        <TableHead className="text-center">Persentase</TableHead>
                                        {user.role === 'admin' && (
                                            <>
                                                <TableHead className="w-[50px] text-center">Opsi</TableHead>
                                                <TableHead className="w-[50px] text-center">Aksi</TableHead>
                                            </>
                                        )}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredReports.length > 0 ? filteredReports.map((item) => (
                                        <TableRow key={item.uid}>
                                            <TableCell>{item.no}</TableCell>
                                            <TableCell className="font-medium">{item.name}</TableCell>
                                            <TableCell>{item.nip}</TableCell>
                                            <TableCell>{item.position}</TableCell>
                                            <TableCell className="text-center">{item.totalHadir}</TableCell>
                                            <TableCell className="text-center">{item.totalIzin}</TableCell>
                                            <TableCell className="text-center">{item.totalSakit}</TableCell>
                                            <TableCell className="text-center">{item.totalAlpa}</TableCell>
                                            <TableCell className="text-center font-semibold">{item.persentase}</TableCell>
                                            {user.role === 'admin' && (
                                                <>
                                                    <TableCell className="text-center">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><Download className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                            <DropdownMenuContent>
                                                                <DropdownMenuItem onClick={() => handleDownloadUserPdf(item)}><FileText className="mr-2 h-4 w-4"/>Unduh PDF</DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => handleDownloadUserExcel(item)}><FileSpreadsheet className="mr-2 h-4 w-4"/>Unduh Excel</DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><Edit className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                            <DropdownMenuContent>
                                                                <DropdownMenuItem onClick={() => handleEditClick(item)}><Edit className="mr-2 h-4 w-4"/>Edit Kehadiran</DropdownMenuItem>
                                                                <DropdownMenuItem asChild><Link href={`/dashboard/laporan/${item.uid}`}><Eye className="mr-2 h-4 w-4" />Lihat Detail</Link></DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </>
                                            )}
                                        </TableRow>
                                    )) : (
                                        <TableRow><TableCell colSpan={user.role === 'admin' ? 11 : 9} className="h-24 text-center">{error ? 'Gagal memuat data.' : 'Tidak ada data untuk ditampilkan.'}</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
