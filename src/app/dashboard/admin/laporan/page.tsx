'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Download, Search, MoreHorizontal, Loader2, CalendarPlus, Eye, ChevronLeft, ChevronRight, BookUp } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import type { jsPDF } from 'jspdf';
import { useFirestore, useCollection, useMemoFirebase, useUser, useDoc } from '@/firebase';
import { User } from '@/types';
import { doc, getDoc, getDocs, collection, query, where, orderBy, addDoc, Timestamp, type DocumentData, collectionGroup } from 'firebase/firestore';
import { format, isBefore, isAfter, eachDayOfInterval, startOfDay, startOfMonth, lastDayOfMonth, addMonths, subMonths } from 'date-fns';
import { id } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

// --- TYPE DEFINITIONS ---

interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => jsPDF;
}

interface UserReport extends User {
  totalHadir: number;
  totalIzin: number;
  totalSakit: number;
  totalAlpa: number;
  totalTerlambat: number;
  attendancePercentage: string;
  alpaDays: Date[];
}

interface DetailedEntry {
  id: string;
  date: Date;
  dateString: string;
  checkIn: string;
  checkOut: string;
  status: string;
  description: string;
  approvalStatus?: string;
}

// --- CONSTANTS ---

const statusVariant: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
    'Hadir': 'default',
    'Sakit': 'secondary',
    'Izin': 'secondary',
    'Dinas': 'secondary',
    'Terlambat': 'destructive',
    'Alpa': 'destructive',
    'Libur': 'outline',
};

const approvalStatusVariant: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
    'approved': 'default',
    'pending': 'outline',
    'rejected': 'destructive',
};

const approvalStatusIndo: { [key: string]: string } = {
    approved: 'Disetujui',
    rejected: 'Ditolak',
    pending: 'Menunggu',
};

// --- PDF & UI GENERATION UTILITIES ---

const generatePdfHeaderAndTitle = (pdfDoc: jsPDFWithAutoTable, config: any, title: string, subtitle: string) => {
    const governmentAgency = config.governmentAgency || 'PEMERINTAH KABUPATEN MANGGARAI';
    const educationAgency = config.educationAgency || 'DINAS PENDIDIKAN, KEPEMUDAAN DAN OLAHRAGA';
    const schoolName = config.schoolName || 'SMP NEGERI 5 LANGKE REMBONG';
    const address = config.address || 'Mando, Kelurahan compang carep, Kecamatan Langke Rembong';
    
    const pageLeftMargin = 14;
    const pageRightMargin = 14;
    const pageWidth = pdfDoc.internal.pageSize.getWidth();
    const pageCenter = pageWidth / 2;

    let currentY = 15;
    
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.setLineHeightFactor(1.1);

    pdfDoc.setFontSize(11);
    pdfDoc.text(governmentAgency, pageCenter, currentY, { align: 'center' });
    currentY += 5;
    
    pdfDoc.setFontSize(11);
    pdfDoc.text(educationAgency, pageCenter, currentY, { align: 'center' });
    currentY += 6;
    
    pdfDoc.setFontSize(12);
    pdfDoc.text(schoolName.toUpperCase(), pageCenter, currentY, { align: 'center' });
    currentY += 6;

    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.setFontSize(9);
    
    const fullAddressString = `Alamat : ${address}`;
    pdfDoc.text(fullAddressString, pageCenter, currentY, { align: 'center' });
    currentY += 5;
    
    pdfDoc.setLineWidth(1);
    pdfDoc.line(pageLeftMargin, currentY, pageWidth - pageRightMargin, currentY);
    currentY += 1;
    pdfDoc.setLineWidth(0.2);
    pdfDoc.line(pageLeftMargin, currentY, pageWidth - pageRightMargin, currentY);
    currentY += 8;

    pdfDoc.setFontSize(12);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text(title.toUpperCase(), pageCenter, currentY, { align: 'center' });
    currentY += 5;

    pdfDoc.setFontSize(10);
    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.text(subtitle, pageCenter, currentY, { align: 'center' });
    
    (pdfDoc as any).lastHeaderY = currentY + 8;
};


const generatePdfSignatureAndFooter = (pdfDoc: jsPDFWithAutoTable, config: any) => {
    const headmasterName = config.headmasterName || 'Fransiskus Sales, S.Pd';
    const headmasterNip = config.headmasterNip ? `NIP: ${config.headmasterNip}` : 'NIP: 196805121994121004';
    const reportCity = config.reportCity || 'Mando';

    const finalY = (pdfDoc as any).lastAutoTable.finalY || 120;
    const today = new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
    const signatureX = 130;
    let signatureY = finalY + 15;

    if (signatureY > pdfDoc.internal.pageSize.getHeight() - 60) {
        pdfDoc.addPage();
        signatureY = 20;
    }

    pdfDoc.setFontSize(10);
    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.text(`${reportCity}, ${today}`, signatureX, signatureY);
    pdfDoc.text('Mengetahui,', signatureX, signatureY + 7);
    pdfDoc.text('Kepala Sekolah', signatureX, signatureY + 14);
    
    pdfDoc.text('.........................................', signatureX, signatureY + 40);

    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text(headmasterName, signatureX, signatureY + 45);
    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.text(headmasterNip, signatureX, signatureY + 50);
    
    const pageCount = (pdfDoc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdfDoc.setPage(i);
      const pageHeight = pdfDoc.internal.pageSize.getHeight();
      const pageWidth = pdfDoc.internal.pageSize.getWidth();

      pdfDoc.saveGraphicsState();
      try {
          const GState = (pdfDoc as any).GState;
          if (GState) {
            (pdfDoc as any).setGState(new GState({opacity: 0.08}));
          }
      } catch (e) {
          console.warn('PDF GState not supported, watermark will be solid.');
      }
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.setTextColor(100, 100, 100);
      const centerY = pageHeight / 2;
      pdfDoc.setFontSize(40);
      pdfDoc.text('E-SPENLI', pageWidth - 18, centerY, { angle: -90, align: 'center' });
      pdfDoc.setFontSize(10);
      pdfDoc.text('Sistem aplikasi berbasis online', pageWidth - 14, centerY, { angle: -90, align: 'center' });
      pdfDoc.restoreGraphicsState();

      pdfDoc.setFontSize(8);
      pdfDoc.setTextColor(150);
      pdfDoc.text(
        'Dokumen ini adalah bukti absensi resmi SMPN 5 Langke Rembong.',
        14,
        pageHeight - 7,
        { align: 'left' }
      );
      pdfDoc.text(
        `Halaman ${i} dari ${pageCount}`,
        pdfDoc.internal.pageSize.getWidth() - 14,
        pageHeight - 7,
        { align: 'right' }
      );
    }
};

const ReportTableSkeleton = ({ cols }: { cols: number }) => (
    <div className="rounded-md border">
        <Table>
            <TableHeader>
            <TableRow>
                {[...Array(cols)].map((_, i) => (
                <TableHead key={i}>
                    <Skeleton className="h-5 w-full" />
                </TableHead>
                ))}
            </TableRow>
            </TableHeader>
            <TableBody>
            {[...Array(5)].map((_, i) => (
                <TableRow key={i}>
                {[...Array(cols)].map((_, j) => (
                    <TableCell key={j}>
                    <Skeleton className="h-5 w-full" />
                    </TableCell>
                ))}
                </TableRow>
            ))}
            </TableBody>
        </Table>
    </div>
);

// --- REACT COMPONENTS ---

const UserTable = ({
  data,
  userType,
  canDownload,
  onDownloadDetail,
  onEditAttendance,
  onViewDetail,
}: {
  data: UserReport[];
  userType: string;
  canDownload: boolean;
  onDownloadDetail: (user: UserReport, format: 'pdf' | 'excel') => void;
  onEditAttendance: (user: UserReport) => void;
  onViewDetail: (user: UserReport) => void;
}) => {
    const idHeader: { [key: string]: string } = {
        'Kepala Sekolah': 'NIP',
        'Guru': 'NIP',
        'Pegawai': 'Email',
        'Siswa': 'NISN',
    };
    
    const isStaff = ['Kepala Sekolah', 'Guru', 'Pegawai'].includes(userType);

    return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px] text-center">No.</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>{idHeader[userType] || `ID ${userType}`}</TableHead>
              {(userType === 'Guru' || userType === 'Kepala Sekolah' || userType === 'Pegawai') && <TableHead>Status Kepegawaian</TableHead>}
              <TableHead className="text-center">Hadir</TableHead>
              <TableHead className="text-center">Izin</TableHead>
              <TableHead className="text-center">Sakit</TableHead>
              <TableHead className="text-center">Alpa</TableHead>
              {isStaff && <TableHead className="text-center">Terlambat</TableHead>}
              <TableHead className="text-center">Presentasi</TableHead>
              {canDownload && <TableHead className="text-right">Aksi</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length > 0 ? (
              data.map((user, index) => (
                <TableRow key={user.id}>
                  <TableCell className="text-center">{index + 1}</TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{user.name}</TableCell>
                  <TableCell className="font-medium">{user.nip || user.email || user.nisn || '-'}</TableCell>
                  {(userType === 'Guru' || userType === 'Kepala Sekolah' || userType === 'Pegawai') && <TableCell>{user.position || '-'}</TableCell>}
                  <TableCell className="text-center">{user.totalHadir}</TableCell>
                  <TableCell className="text-center">{user.totalIzin}</TableCell>
                  <TableCell className="text-center">{user.totalSakit}</TableCell>
                  <TableCell className="text-center">{user.totalAlpa}</TableCell>
                  {isStaff && <TableCell className="text-center">{user.totalTerlambat}</TableCell>}
                  <TableCell className="text-center font-medium">{user.attendancePercentage}</TableCell>
                  {canDownload && (
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button aria-haspopup="true" size="icon" variant="ghost">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Buka menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Aksi Laporan</DropdownMenuLabel>
                           <DropdownMenuItem onClick={() => onViewDetail(user)}>
                            <Eye className="mr-2 h-4 w-4" />
                            Lihat Detail
                          </DropdownMenuItem>
                           <DropdownMenuItem onClick={() => onEditAttendance(user)}>
                            <CalendarPlus className="mr-2 h-4 w-4" />
                            Edit Kehadiran
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>Unduh Detail</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => onDownloadDetail(user, 'pdf')}>
                            <Download className="mr-2 h-4 w-4" />
                            Unduh PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onDownloadDetail(user, 'excel')}>
                            <Download className="mr-2 h-4 w-4" />
                            Unduh Excel
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={isStaff ? 11 : 9} className="h-24 text-center">
                  Tidak ada data ditemukan untuk periode yang dipilih.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
    );
};

function EditAttendanceDialog({ 
  user,
  isOpen,
  onOpenChange,
  schoolConfig,
  onBulkUpdateSuccess,
  periodDate
}: { 
  user: UserReport | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  schoolConfig: DocumentData;
  onBulkUpdateSuccess: () => void;
  periodDate: Date;
}) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Date[]>([]);
  const firestore = useFirestore();
  const { toast } = useToast();
  
  useEffect(() => {
    if (isOpen) {
      setSelectedDays([]);
    }
  }, [isOpen]);

  if (!user) return null;
  
  const handleSelectionChange = (day: Date, checked: boolean) => {
    setSelectedDays(prev => 
      checked ? [...prev, day] : prev.filter(d => d.getTime() !== day.getTime())
    );
  };

  const handleBulkMarkPresent = async () => {
    if (!user || !firestore || selectedDays.length === 0) return;
    setIsUpdating(true);
    
    const promises = selectedDays.map(date => {
        const getRandomTime = (baseDate: Date, startStr: string, endStr: string) => {
            const [startH, startM] = startStr.split(':').map(Number);
            const [endH, endM] = endStr.split(':').map(Number);
            const startTotalMinutes = startH * 60 + startM;
            const endTotalMinutes = endH * 60 + endM;
            if (startTotalMinutes >= endTotalMinutes) {
                const fallbackDate = new Date(baseDate);
                fallbackDate.setHours(startH, startM, Math.floor(Math.random() * 60), 0);
                return fallbackDate;
            }
            const randomTotalMinutes = Math.floor(startTotalMinutes + Math.random() * (endTotalMinutes - startTotalMinutes));
            const randomH = Math.floor(randomTotalMinutes / 60);
            const randomM = randomTotalMinutes % 60;
            const randomS = Math.floor(Math.random() * 60);
            const newDate = new Date(baseDate);
            newDate.setHours(randomH, randomM, randomS, 0);
            return newDate;
        };

        const finalCheckInTime = getRandomTime(date, '07:00', '07:45');
        const finalCheckOutTime = getRandomTime(date, '12:50', '13:00');

        const newRecord = {
            userId: user.id,
            checkInTime: Timestamp.fromDate(finalCheckInTime),
            checkOutTime: Timestamp.fromDate(finalCheckOutTime),
            checkInLatitude: null, checkInLongitude: null, checkOutLatitude: null, checkOutLongitude: null,
            keterangan: 'Absensi Terekam',
        };
        
        const attendanceCollectionRef = collection(firestore, 'users', user.id, 'attendanceRecords');
        return addDoc(attendanceCollectionRef, newRecord);
    });

    try {
        await Promise.all(promises);
        toast({
            title: 'Berhasil',
            description: `${selectedDays.length} hari kehadiran telah ditambahkan untuk ${user.name}.`
        });
        onOpenChange(false);
        onBulkUpdateSuccess();
    } catch (error) {
        console.error("Failed to mark present in bulk:", error);
        toast({ variant: 'destructive', title: 'Gagal', description: 'Gagal menambahkan data kehadiran.' });
    } finally {
        setIsUpdating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Kehadiran: {user.name}</DialogTitle>
          <DialogDescription>
            Periode: <span className="font-semibold text-foreground">{format(periodDate, 'MMMM yyyy', { locale: id })}</span>. 
            Pilih tanggal alpa untuk ditandai "Hadir".
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          {user.alpaDays && user.alpaDays.length > 0 ? (
            <ScrollArea className="h-72">
              <div className="space-y-2 pr-4">
                {user.alpaDays.map((day: Date) => (
                  <div key={day.toISOString()} className="flex items-center space-x-4 rounded-md border p-3 has-[:checked]:bg-primary/10 has-[:checked]:border-primary transition-colors">
                    <Checkbox
                      id={day.toISOString()}
                      onCheckedChange={(checked) => handleSelectionChange(day, !!checked)}
                      checked={selectedDays.some(d => d.getTime() === day.getTime())}
                    />
                    <Label htmlFor={day.toISOString()} className="font-medium text-sm cursor-pointer flex-1">
                      {format(day, 'eeee, d MMM yyyy', { locale: id })}
                    </Label>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <Alert>
              <AlertTitle>Tidak Ada Hari Alpa</AlertTitle>
              <AlertDescription>
                {user.name} tidak memiliki hari alpa yang telah lewat pada periode yang dipilih.
              </AlertDescription>
            </Alert>
          )}
        </div>
        {user.alpaDays && user.alpaDays.length > 0 && (
            <DialogFooter>
                <Button 
                  onClick={handleBulkMarkPresent}
                  disabled={isUpdating || selectedDays.length === 0}
                  className="w-full"
                >
                  {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-2 h-4 w-4" />}
                  Simpan Perubahan ({selectedDays.length} hari)
                </Button>
            </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailDialog({ 
  user,
  isOpen,
  onOpenChange,
  schoolConfig,
  onAddAttendance,
  dateRange,
}: { 
  user: UserReport | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  schoolConfig: DocumentData;
  onAddAttendance: (date: Date) => void;
  dateRange: { start: Date, end: Date };
}) {
  const [details, setDetails] = useState<DetailedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();

  const handleBackupDetailToSheets = async () => {
    if (!user || !schoolConfig || !schoolConfig.googleSheetsUrl || details.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Gagal',
        description: 'URL Backup tidak dikonfigurasi atau tidak ada data untuk di-backup.',
      });
      return;
    }

    setIsBackingUp(true);

    try {
      const monthName = format(dateRange.start, 'MMMM yyyy', { locale: id });

      const payload = {
        header: {
          governmentAgency: schoolConfig.governmentAgency || 'PEMERINTAH KABUPATEN MANGGARAI',
          educationAgency: schoolConfig.educationAgency || 'DINAS PENDIDIKAN, KEPEMUDAAN DAN OLAHRAGA',
          schoolName: schoolConfig.schoolName || 'SMP NEGERI 5 LANGKE REMBONG',
          address: `Alamat : ${schoolConfig.address || 'Mando, Kelurahan compang carep, Kecamatan Langke Rembong'}`,
        },
        reportTitle: `Laporan Detail Kehadiran`,
        subtitle: `Nama: ${user.name}, NIP: ${user.nip || user.email || '-'}, Periode: ${monthName}`,
        tableHeaders: ["No.", "Tanggal", "Masuk", "Pulang", "Status", "Keterangan"],
        tableBody: details.map((item, index) => {
            const approvalText = item.approvalStatus ? ` (${approvalStatusIndo[item.approvalStatus] || item.approvalStatus})` : '';
            const statusText = item.status + approvalText;
            return [
                index + 1,
                format(item.date, 'eeee, d MMMM yyyy', { locale: id }),
                item.checkIn,
                item.checkOut,
                statusText,
                item.description,
            ];
        }),
        signature: {
          city: schoolConfig.reportCity || 'Mando',
          date: new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }),
          headmasterName: schoolConfig.headmasterName || 'Fransiskus Sales, S.Pd',
          headmasterNip: schoolConfig.headmasterNip ? `NIP: ${schoolConfig.headmasterNip}` : 'NIP: 196805121994121004',
        }
      };

      await fetch(schoolConfig.googleSheetsUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
      });

      toast({ title: 'Backup Terkirim', description: `Laporan detail untuk ${user.name} sedang dikirim ke Google Sheets.` });

    } catch (e) {
      console.error("Google Sheets Detail Backup Error:", e);
      toast({ variant: 'destructive', title: 'Gagal Mengirim Backup', description: 'Periksa koneksi internet atau konfigurasi URL.' });
    } finally {
      setIsBackingUp(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !user || !firestore || !schoolConfig) {
      return;
    }

    const fetchDetails = async () => {
      setIsLoading(true);
      try {
        const attendanceQuery = query(
            collection(firestore, 'users', user.id, 'attendanceRecords'),
            orderBy('checkInTime', 'desc')
        );
        
        const leaveQuery = query(
            collection(firestore, 'users', user.id, 'leaveRequests'),
            orderBy('startDate', 'desc')
        );
        
        const [attendanceSnap, leaveSnap] = await Promise.all([getDocs(attendanceQuery), getDocs(leaveQuery)]);

        const userAttendanceRecords = attendanceSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as DocumentData[];
        const userLeaveRecords = leaveSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as DocumentData[];

        const attendanceRecordsProcessed: DetailedEntry[] = userAttendanceRecords.map(rec => {
            const checkInTime = (rec.checkInTime as Timestamp)?.toDate();
            const checkOutTime = (rec.checkOutTime as Timestamp)?.toDate();
            let description = '';
            if (checkInTime && checkOutTime) { description = 'Absensi Terekam'; }
            else if (checkInTime && !checkOutTime) { description = 'Belum Absen Pulang'; }
            else { description = rec.keterangan || 'Data tidak lengkap'; }

            return {
                id: rec.id,
                date: checkInTime,
                dateString: checkInTime ? format(checkInTime, 'eeee, d MMMM yyyy', { locale: id }) : '-',
                checkIn: checkInTime ? format(checkInTime, 'HH:mm') : '-',
                checkOut: checkOutTime ? format(checkOutTime, 'HH:mm') : '-',
                status: 'Hadir',
                description: description,
            };
        });

        const processLeave = (rec: DocumentData): DetailedEntry[] => {
            try {
                const startDate = (rec.startDate as Timestamp)?.toDate();
                const endDate = (rec.endDate as Timestamp)?.toDate();
                if (!startDate || !endDate || isBefore(endDate, startDate)) return [];

                return eachDayOfInterval({ start: startDate, end: endDate })
                    .map(loopDate => ({
                        id: `${rec.id}-${format(loopDate, 'yyyy-MM-dd')}`,
                        date: loopDate,
                        dateString: format(loopDate, 'eeee, d MMMM yyyy', { locale: id }),
                        checkIn: '-',
                        checkOut: '-',
                        status: rec.type as string,
                        approvalStatus: rec.status as string,
                        description: rec.reason as string,
                    }));
            } catch(e) { console.error("Admin Laporan Detail: Error processing leave record:", rec, e); return []; }
        };

        const approvedLeaveRecords = userLeaveRecords.filter(r => r.status === 'approved').flatMap(processLeave);
        const otherLeaveRecords = userLeaveRecords.filter(r => r.status !== 'approved').flatMap(processLeave);

        const alpaRecords: DetailedEntry[] = (user.alpaDays || []).map(day => ({
            id: `alpa-${format(day, 'yyyy-MM-dd')}`,
            date: day,
            dateString: format(day, 'eeee, d MMMM yyyy', { locale: id }),
            checkIn: '-',
            checkOut: '-',
            status: 'Alpa',
            description: 'Belum Absen Masuk',
            approvalStatus: undefined,
        }));

        const combinedData = [
            ...attendanceRecordsProcessed,
            ...approvedLeaveRecords,
            ...alpaRecords,
            ...otherLeaveRecords
        ];
        
        const uniqueDetails: DetailedEntry[] = [];
        const processedDates = new Set<string>();
        for (const item of combinedData) {
            if (!item.date) continue;
            const dateStr = format(item.date, 'yyyy-MM-dd');
            if (processedDates.has(dateStr)) {
                continue;
            }
            uniqueDetails.push(item);
            processedDates.add(dateStr);
        }

        uniqueDetails.sort((a, b) => b.date.getTime() - a.date.getTime()); // Sort descending for UI

        setDetails(uniqueDetails);
      } catch (error) {
        console.error("Failed to fetch detail dialog data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetails();
  }, [isOpen, user, firestore, schoolConfig]);

  if (!user) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-full flex-col p-0 sm:h-auto sm:max-h-[90vh] sm:max-w-3xl">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle>Detail Kehadiran: {user.name}</DialogTitle>
          <DialogDescription>
            Menampilkan seluruh riwayat kehadiran dan pengajuan izin untuk pengguna ini.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-96 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : details.length > 0 ? (
            <div className="overflow-x-auto p-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Tanggal</TableHead>
                    <TableHead className="text-center whitespace-nowrap">Masuk</TableHead>
                    <TableHead className="text-center whitespace-nowrap">Pulang</TableHead>
                    <TableHead className="text-center whitespace-nowrap">Status</TableHead>
                    <TableHead className="whitespace-nowrap">Keterangan</TableHead>
                    <TableHead className="text-center whitespace-nowrap">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {details.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium whitespace-nowrap">{item.dateString}</TableCell>
                      <TableCell className="text-center whitespace-nowrap">{item.checkIn}</TableCell>
                      <TableCell className="text-center whitespace-nowrap">{item.checkOut}</TableCell>
                      <TableCell className="text-center whitespace-nowrap">
                        <Badge variant={statusVariant[item.status] || 'default'}>{item.status}</Badge>
                        {item.approvalStatus && (
                          <Badge variant={approvalStatusVariant[item.approvalStatus] || 'secondary'} className="ml-1">
                            {approvalStatusIndo[item.approvalStatus] || item.approvalStatus}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell title={item.description} className="max-w-xs truncate">{item.description}</TableCell>
                      <TableCell className="text-center whitespace-nowrap">
                        {item.status === 'Alpa' && (
                          <Button size="sm" variant="outline" onClick={() => onAddAttendance(item.date)}>
                            <CalendarPlus className="mr-2 h-4 w-4" />
                            Isi Absen
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex h-96 items-center justify-center">
                <p className="text-center text-muted-foreground p-8">Tidak ada data untuk ditampilkan.</p>
            </div>
          )}
        </div>
        <DialogFooter className="p-6 pt-4 border-t flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Tutup</Button>
            <Button 
                onClick={handleBackupDetailToSheets}
                disabled={isBackingUp || isLoading || details.length === 0 || !schoolConfig?.googleSheetsUrl}
            >
                {isBackingUp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BookUp className="mr-2 h-4 w-4" />}
                Backup ke Sheets
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const getRandomTimeString = (startStr: string, endStr: string) => {
    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);
    const startTotalMinutes = startH * 60 + startM;
    const endTotalMinutes = endH * 60 + endM;

    if (startTotalMinutes >= endTotalMinutes) {
        return startStr; 
    }

    const randomTotalMinutes = Math.floor(startTotalMinutes + Math.random() * (endTotalMinutes - startTotalMinutes + 1));
    const randomH = Math.floor(randomTotalMinutes / 60);
    const randomM = randomTotalMinutes % 60;
    
    const paddedH = String(randomH).padStart(2, '0');
    const paddedM = String(randomM).padStart(2, '0');

    return `${paddedH}:${paddedM}`;
};

function ManualAttendanceDialog({
  isOpen,
  onOpenChange,
  user,
  date,
  onSuccess,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  user: UserReport;
  date: Date;
  onSuccess: () => void;
}) {
  const [checkIn, setCheckIn] = useState(() => getRandomTimeString('07:00', '07:45'));
  const [checkOut, setCheckOut] = useState(() => getRandomTimeString('12:50', '13:00'));
  const [isSaving, setIsSaving] = useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();

  const handleSave = async () => {
    if (!checkIn || !checkOut) {
      toast({ variant: 'destructive', title: 'Input tidak valid', description: 'Jam masuk dan pulang harus diisi.' });
      return;
    }
    const [inH, inM] = checkIn.split(':').map(Number);
    const [outH, outM] = checkOut.split(':').map(Number);
    if (isNaN(inH) || isNaN(inM) || isNaN(outH) || isNaN(outM) || inH < 0 || inH > 23 || outH < 0 || outH > 23 || inM < 0 || inM > 59 || outM < 0 || outM > 59) {
        toast({ variant: 'destructive', title: 'Format jam tidak valid', description: 'Gunakan format HH:mm.' });
        return;
    }

    setIsSaving(true);
    const checkInTime = new Date(date);
    checkInTime.setHours(inH, inM, 0, 0);
    const checkOutTime = new Date(date);
    checkOutTime.setHours(outH, outM, 0, 0);

    if (checkInTime >= checkOutTime) {
      toast({ variant: 'destructive', title: 'Input tidak valid', description: 'Jam masuk harus sebelum jam pulang.' });
      setIsSaving(false);
      return;
    }

    try {
      const attendanceCollectionRef = collection(firestore, 'users', user.id, 'attendanceRecords');
      await addDoc(attendanceCollectionRef, {
        userId: user.id,
        checkInTime: Timestamp.fromDate(checkInTime),
        checkOutTime: Timestamp.fromDate(checkOutTime),
        keterangan: 'Absensi Terekam',
        checkInLatitude: null, checkInLongitude: null, checkOutLatitude: null, checkOutLongitude: null,
      });
      toast({ title: 'Berhasil', description: `Absensi untuk ${user.name} pada ${format(date, 'd MMM yyyy')} telah disimpan.` });
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save manual attendance:", error);
      toast({ variant: 'destructive', title: 'Gagal', description: 'Terjadi kesalahan saat menyimpan data.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Isi Absensi Manual</DialogTitle>
          <DialogDescription>
            Input kehadiran untuk <span className="font-semibold text-foreground">{user.name}</span> pada hari <span className="font-semibold text-foreground">{format(date, 'eeee, d MMMM yyyy', { locale: id })}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="check-in-time" className="text-right">Jam Masuk</Label>
            <Input id="check-in-time" type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="check-out-time" className="text-right">Jam Pulang</Label>
            <Input id="check-out-time" type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="col-span-3" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- DATA FETCHING HOOK ---

function useReportData(currentDate: Date, isAllowed: boolean, firestore: any, usersData: DocumentData[] | null, schoolConfig: DocumentData | null, toast: any, role: string) {
  const [processedUserData, setProcessedUserData] = useState<UserReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dataVersion, setDataVersion] = useState(0);

  const dateRange = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = lastDayOfMonth(currentDate);
    return { start, end };
  }, [currentDate]);

  const forceRefetch = useCallback(() => {
    setDataVersion(v => v + 1);
  }, []);

  useEffect(() => {
    if (!isAllowed || !firestore || !usersData || !schoolConfig || !role) {
      if (usersData && schoolConfig) {
          setIsLoading(false);
      }
      setProcessedUserData([]);
      return;
    }

    const fetchDataAndProcess = async () => {
      setIsLoading(true);
      
      try {
        const { start: monthStart, end: monthEnd } = dateRange;
        
        const monthlyConfigId = format(monthStart, 'yyyy-MM');
        const monthlyConfigSnap = await getDoc(doc(firestore, 'monthlyConfigs', monthlyConfigId));
        const monthlyConfigData = monthlyConfigSnap.exists() ? monthlyConfigSnap.data() : {};

        const recurringOffDays: number[] = schoolConfig.offDays ?? [0, 6];
        const specificHolidays = new Set(monthlyConfigData?.holidays?.map((h: string) => h) ?? []);
        
        const allPotentialWorkDays = eachDayOfInterval({ start: monthStart, end: monthEnd }).filter(day => {
            return !recurringOffDays.includes(day.getDay()) && !specificHolidays.has(format(day, 'yyyy-MM-dd'));
        });
        
        const workDaysInMonth = monthlyConfigData?.manualWorkDays > 0 ? monthlyConfigData.manualWorkDays : allPotentialWorkDays.length;

        const usersToDisplay = usersData.filter(u => u.role === role);
        const userDataMap = new Map<string, any>();

        usersToDisplay.forEach(u => {
            userDataMap.set(u.id, {
                ...u,
                attendanceDates: new Set<string>(),
                onLeaveDays: new Set<string>(),
                totalIzin: 0,
                totalSakit: 0,
                totalTerlambat: 0,
            });
        });
        
        const attendanceQuery = query(
            collectionGroup(firestore, 'attendanceRecords'),
            where('checkInTime', '>=', monthStart),
            where('checkInTime', '<=', monthEnd)
        );

        const leaveQuery = query(
            collectionGroup(firestore, 'leaveRequests'),
            where('status', '==', 'approved'),
            where('endDate', '>=', monthStart)
        );
        
        const [attendanceSnap, leaveSnap] = await Promise.all([
            getDocs(attendanceQuery),
            getDocs(leaveQuery)
        ]);

        attendanceSnap.forEach(doc => {
            const attData = doc.data();
            const userRecord = userDataMap.get(attData.userId);
            if (!userRecord) return;
        
            const checkInTime = (attData.checkInTime as Timestamp).toDate();
            const dateString = format(checkInTime, 'yyyy-MM-dd');
            if(userRecord.attendanceDates.has(dateString)) return;
            userRecord.attendanceDates.add(dateString);

            if (schoolConfig.useTimeValidation && schoolConfig.checkInEndTime) {
                const [lateH, lateM] = schoolConfig.checkInEndTime.split(':').map(Number);
                const lateTime = new Date(checkInTime);
                lateTime.setHours(lateH, lateM, 0, 0);
                if (checkInTime > lateTime) {
                    userRecord.totalTerlambat++;
                }
            }
        });

        leaveSnap.forEach(doc => {
            const leave = doc.data();
            const startDate = (leave.startDate as Timestamp).toDate();
            if (startDate > monthEnd) return;
            
            const userRecord = userDataMap.get(leave.userId);
            if (!userRecord) return;
            
            const endDate = (leave.endDate as Timestamp).toDate();
            eachDayOfInterval({ start: startDate, end: endDate }).forEach(dayInLeave => {
                if (dayInLeave >= monthStart && dayInLeave <= monthEnd) {
                    const dayStr = format(dayInLeave, 'yyyy-MM-dd');
                    if (!userRecord.onLeaveDays.has(dayStr) && !userRecord.attendanceDates.has(dayStr) && allPotentialWorkDays.some(wd => format(wd, 'yyyy-MM-dd') === dayStr)) {
                        userRecord.onLeaveDays.add(dayStr);
                        if (leave.type === 'Sakit') userRecord.totalSakit++;
                        else userRecord.totalIzin++;
                    }
                }
            });
        });
        
        const lastDayToConsider = new Date() < monthEnd ? startOfDay(new Date()) : monthEnd;

        const finalProcessedUsers: UserReport[] = Array.from(userDataMap.values()).map(userRecord => {
            const totalHadir = userRecord.attendanceDates.size;
            
            const alpaDays: Date[] = allPotentialWorkDays
                .filter(workDay => workDay < lastDayToConsider && !userRecord.attendanceDates.has(format(workDay, 'yyyy-MM-dd')) && !userRecord.onLeaveDays.has(format(workDay, 'yyyy-MM-dd')))

            const totalAlpa = alpaDays.length;

            let rawPercentage = workDaysInMonth > 0 ? (totalHadir / workDaysInMonth) * 100 : 100;
            rawPercentage = Math.min(rawPercentage, 100);
            const attendancePercentage = `${Math.round(rawPercentage)}%`;

            return {
                ...userRecord,
                totalHadir, totalAlpa,
                alpaDays,
                attendancePercentage,
            };
        });

        setProcessedUserData(finalProcessedUsers);

      } catch (error: any) {
        console.error("Failed to process report data:", error);
        if (error.code === 'failed-precondition') {
             toast({ variant: "destructive", title: "Konfigurasi Database Diperlukan", description: "Laporan gagal dimuat karena memerlukan index Firestore. Silakan cek console browser (F12) untuk link pembuatan index baru.", duration: 10000 });
        } else {
            toast({ variant: "destructive", title: "Gagal Memuat Laporan", description: "Terjadi kesalahan saat memproses data. Silakan coba lagi." });
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchDataAndProcess();
  }, [isAllowed, firestore, usersData, schoolConfig, dateRange, toast, dataVersion, role]);

  return { processedUserData, isLoadingData: isLoading, forceRefetch, dateRange };
}

// --- MAIN COMPONENT ---

function LaporanView({ isAllowed, canDownload }: { isAllowed: boolean, canDownload: boolean }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('guru');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [isBackingUp, setIsBackingUp] = useState(false);
  
  const { isPrevMonthNavDisabled } = useMemo(() => {
    const startOfSelectedMonth = startOfMonth(currentDate);
    const projectStartDate = new Date(2026, 0, 1);
    const isPrevMonthNavDisabled = !isAfter(startOfSelectedMonth, projectStartDate);
    return { isPrevMonthNavDisabled };
  }, [currentDate]);

  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  
  const [isEditAttendanceOpen, setIsEditAttendanceOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserReport | null>(null);
  const [isDetailViewOpen, setIsDetailViewOpen] = useState(false);
  const [viewingUser, setViewingUser] = useState<UserReport | null>(null);
  const [isManualAttendanceOpen, setIsManualAttendanceOpen] = useState(false);
  const [manualAttendanceData, setManualAttendanceData] = useState<{ user: UserReport, date: Date } | null>(null);

  const usersQuery = useMemoFirebase(() => (isAllowed && firestore) ? query(collection(firestore, 'users')) : null, [firestore, isAllowed]);
  const { data: usersData, isLoading: isUsersLoading } = useCollection<User>(user, usersQuery);

  const schoolConfigRef = useMemoFirebase(() => (isAllowed && firestore) ? doc(firestore, 'schoolConfig', 'default') : null, [firestore, isAllowed]);
  const { data: schoolConfig, isLoading: isConfigLoading } = useDoc(user, schoolConfigRef);

  const { processedUserData, isLoadingData, forceRefetch, dateRange } = useReportData(currentDate, isAllowed, firestore, usersData, schoolConfig, toast, activeTab);

  const generateAndDownloadFile = useCallback(async (formatType: 'pdf' | 'excel' | 'sheets', title: string, generatorFn: () => Promise<void>) => {
      const { dismiss } = toast({ description: `Menyiapkan ${title}...` });
      await new Promise(resolve => setTimeout(resolve, 100));
      
      try {
        await generatorFn();
        dismiss();
        if (formatType !== 'sheets') {
            toast({ title: 'Unduhan Dimulai', description: `Laporan ${title} sedang diunduh.` });
        }
      } catch (error: any) {
        dismiss();
        console.error(`Gagal memproses laporan ${formatType}:`, error);
        if (error.message && (error.message.includes('Tidak ada data') || error.message.includes('URL tidak valid'))) {
            toast({ variant: "destructive", title: "Proses Dihentikan", description: error.message });
        } else if (error.code === 'failed-precondition') {
             toast({ variant: "destructive", title: "Konfigurasi Database Diperlukan", description: "Laporan gagal diproses karena memerlukan index Firestore. Silakan cek console browser (F12) untuk link pembuatan index.", duration: 10000 });
        } else {
            toast({ variant: "destructive", title: "Gagal Memproses", description: "Terjadi kesalahan saat menyiapkan data." });
        }
      }
  }, [toast]);

   const handleReportAction = useCallback(async (formatType: 'pdf' | 'excel' | 'sheets') => {
    if (!schoolConfig || !processedUserData) {
        toast({ variant: 'destructive', title: 'Gagal', description: 'Data belum siap untuk diproses.' });
        return;
    }

    const downloadHandlers = {
        kepala_sekolah: { data: processedUserData.filter(u => u.role === 'kepala_sekolah'), title: 'Laporan Kehadiran Kepala Sekolah', headers: ["No.", "Nama", "NIP", "Status Kepegawaian", "Hadir", "Izin", "Sakit", "Alpa", "Terlambat", "Presentasi"] },
        guru: { data: processedUserData.filter(u => u.role === 'guru'), title: 'Laporan Kehadiran Guru', headers: ["No.", "Nama", "NIP", "Status Kepegawaian", "Hadir", "Izin", "Sakit", "Alpa", "Terlambat", "Presentasi"] },
        pegawai: { data: processedUserData.filter(u => u.role === 'pegawai'), title: 'Laporan Kehadiran Pegawai', headers: ["No.", "Nama", "Email", "Status Kepegawaian", "Hadir", "Izin", "Sakit", "Alpa", "Terlambat", "Presentasi"] },
        siswa: { data: processedUserData.filter(u => u.role === 'siswa'), title: 'Laporan Kehadiran Siswa', headers: ["No.", "Nama", "NISN", "Hadir", "Izin", "Sakit", "Alpa", "Presentasi"] },
    };

    const handler = downloadHandlers[activeTab as keyof typeof downloadHandlers];
    if (!handler || handler.data.length === 0) {
        toast({ variant: 'destructive', title: 'Tidak Ada Data', description: `Tidak ada data untuk diunduh di tab ${activeTab} pada periode ini.` });
        return;
    }

    const { data, title, headers } = handler;
    const isStaff = ['guru', 'pegawai', 'kepala_sekolah'].includes(activeTab);
    const monthName = format(dateRange.start, 'MMMM yyyy', { locale: id });
    const subtitle = `Periode : Bulan ${monthName}`;
    const safeRole = activeTab.replace('_', '-');
    const fileName = `laporan-kehadiran-${safeRole}-smpn5lr-${format(dateRange.start, 'MM-yyyy')}`;

    const bodyData = data.map((user, index) => {
      const row: (string | number)[] = [ index + 1, user.name ];
      if (activeTab === 'guru' || activeTab === 'kepala_sekolah') row.push(user.nip || '-', user.position || '-');
      else if (activeTab === 'pegawai') row.push(user.email || '-', user.position || '-');
      else if (activeTab === 'siswa') row.push(user.nisn || '-');
      row.push(user.totalHadir, user.totalIzin, user.totalSakit, user.totalAlpa);
      if (isStaff) row.push(user.totalTerlambat);
      row.push(user.attendancePercentage);
      return row;
    });

    const generatorFn = async () => {
      if (formatType === 'pdf') {
        const { jsPDF } = await import('jspdf');
        await import('jspdf-autotable');
        const pdfDoc = new jsPDF() as jsPDFWithAutoTable;
        generatePdfHeaderAndTitle(pdfDoc, schoolConfig, title, subtitle);
        pdfDoc.autoTable({ head: [headers], body: bodyData, startY: (pdfDoc as any).lastHeaderY || 70, theme: 'grid', headStyles: { fillColor: [41, 128, 185], textColor: 255 } });
        generatePdfSignatureAndFooter(pdfDoc, schoolConfig);
        pdfDoc.save(`${fileName}.pdf`);
      } else if (formatType === 'excel') {
        const XLSX = await import('xlsx');
        const numCols = headers.length;
        
        const worksheetData = [
            [schoolConfig.governmentAgency || 'PEMERINTAH KABUPATEN MANGGARAI'],
            [schoolConfig.educationAgency || 'DINAS PENDIDIKAN, KEPEMUDAAN DAN OLAHRAGA'],
            [schoolConfig.schoolName || 'SMP NEGERI 5 LANGKE REMBONG'],
            [`Alamat : ${schoolConfig.address || 'Mando, Kelurahan compang carep, Kecamatan Langke Rembong'}`],
            [], // Empty row
            [title],
            [subtitle],
            [], // Empty row
            headers,
            ...bodyData
        ];

        const signature = [
            [], [],
            [...Array(numCols - 2).fill(null), `${schoolConfig.reportCity || 'Mando'}, ${new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}`],
            [...Array(numCols - 2).fill(null), 'Mengetahui,'],
            [...Array(numCols - 2).fill(null), 'Kepala Sekolah'],
            [], [], [],
            [...Array(numCols - 2).fill(null), '.........................................'],
            [...Array(numCols - 2).fill(null), schoolConfig.headmasterName || 'Fransiskus Sales, S.Pd'],
            [...Array(numCols - 2).fill(null), schoolConfig.headmasterNip ? `NIP: ${schoolConfig.headmasterNip}` : 'NIP: 196805121994121004'],
        ];
        worksheetData.push(...signature);

        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

        // Styles
        const headerCellStyle = { fill: { fgColor: { rgb: "2980B9" } }, font: { color: { rgb: "FFFFFF" }, bold: true }, alignment: { horizontal: "center", vertical: "center" } };
        const centerStyle = { alignment: { horizontal: "center", vertical: "center" } };
        const centerBoldStyle = { ...centerStyle, font: { bold: true } };

        // Apply styles to table header
        const headerRowIndex = 8; // Row 9 in Excel
        headers.forEach((_, colIndex) => {
            const cellAddress = XLSX.utils.encode_cell({ r: headerRowIndex, c: colIndex });
            if (worksheet[cellAddress]) worksheet[cellAddress].s = headerCellStyle;
        });

        // Merge and style main headers
        worksheet['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } }, // Govt
            { s: { r: 1, c: 0 }, e: { r: 1, c: numCols - 1 } }, // Edu
            { s: { r: 2, c: 0 }, e: { r: 2, c: numCols - 1 } }, // School
            { s: { r: 3, c: 0 }, e: { r: 3, c: numCols - 1 } }, // Address
            { s: { r: 5, c: 0 }, e: { r: 5, c: numCols - 1 } }, // Title
            { s: { r: 6, c: 0 }, e: { r: 6, c: numCols - 1 } }, // Subtitle
        ];
        
        worksheet['A1'].s = centerBoldStyle; worksheet['A2'].s = centerBoldStyle; worksheet['A3'].s = centerBoldStyle;
        worksheet['A4'].s = centerStyle; worksheet['A6'].s = centerBoldStyle; worksheet['A7'].s = centerStyle;

        const colWidths = headers.map((h, i) => {
            let maxLen = h.length;
            bodyData.forEach(row => {
                const cell = row[i];
                if (cell && cell.toString().length > maxLen) maxLen = cell.toString().length;
            });
            return { wch: maxLen + 2 };
        });

        if(headers.indexOf('Nama') !== -1) colWidths[headers.indexOf('Nama')] = { wch: 25 };
        if(headers.indexOf('NIP') !== -1) colWidths[headers.indexOf('NIP')] = { wch: 20 };
        worksheet['!cols'] = colWidths;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan');
        XLSX.writeFile(workbook, `${fileName}.xlsx`);
      } else if (formatType === 'sheets') {
          if (!schoolConfig.googleSheetsUrl || !schoolConfig.googleSheetsUrl.startsWith('https://script.google.com/macros/s/')) {
              throw new Error('URL Google Apps Script tidak valid. Harap periksa halaman Konfigurasi.');
          }
          setIsBackingUp(true);
          try {
            const payload = {
                header: {
                    governmentAgency: schoolConfig.governmentAgency || 'PEMERINTAH KABUPATEN MANGGARAI',
                    educationAgency: schoolConfig.educationAgency || 'DINAS PENDIDIKAN, KEPEMUDAAN DAN OLAHRAGA',
                    schoolName: schoolConfig.schoolName || 'SMP NEGERI 5 LANGKE REMBONG',
                    address: `Alamat : ${schoolConfig.address || 'Mando, Kelurahan compang carep, Kecamatan Langke Rembong'}`,
                },
                reportTitle: title,
                subtitle: subtitle,
                tableHeaders: headers,
                tableBody: bodyData,
                signature: {
                    city: schoolConfig.reportCity || 'Mando',
                    date: new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }),
                    headmasterName: schoolConfig.headmasterName || 'Fransiskus Sales, S.Pd',
                    headmasterNip: schoolConfig.headmasterNip ? `NIP: ${schoolConfig.headmasterNip}` : 'NIP: 196805121994121004',
                }
            };

            await fetch(schoolConfig.googleSheetsUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload),
            });
            
            toast({ title: 'Backup Terkirim', description: `Data laporan sedang dikirim ke Google Sheets.` });

          } catch (e) {
              console.error("Google Sheets Backup Error:", e);
              toast({ variant: 'destructive', title: 'Gagal Mengirim Backup', description: 'Periksa koneksi internet Anda atau konfigurasi URL.' });
          } finally {
              setIsBackingUp(false);
          }
      }
    };

    const titleForFormat = formatType === 'sheets' ? `Backup Google Sheets` : `Laporan ${title}`;
    generateAndDownloadFile(formatType, titleForFormat, generatorFn);

  }, [activeTab, schoolConfig, processedUserData, dateRange, generateAndDownloadFile, toast]);
  
  const handleDownloadDetail = useCallback(async (user: UserReport, formatType: 'pdf' | 'excel') => {
    if (!firestore || !schoolConfig) {
        toast({ variant: 'destructive', title: 'Gagal', description: 'Data konfigurasi belum siap.' });
        return;
    }

    const generatorFn = async () => {
        const { start: monthStart, end: monthEnd } = dateRange;

        // Fetch all relevant data first
        const attendanceQuery = query(collection(firestore, 'users', user.id, 'attendanceRecords'), orderBy('checkInTime', 'asc'));
        const leaveQuery = query(collection(firestore, 'users', user.id, 'leaveRequests'), orderBy('startDate', 'asc'));
        const [attendanceSnap, leaveSnap] = await Promise.all([getDocs(attendanceQuery), getDocs(leaveQuery)]);

        const userAttendanceRecords = attendanceSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as DocumentData[];
        const userLeaveRecords = leaveSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as DocumentData[];

        // Process records into a common format
        const attendanceRecordsProcessed: DetailedEntry[] = userAttendanceRecords.map(rec => {
            const checkInTime = (rec.checkInTime as Timestamp)?.toDate();
            const checkOutTime = (rec.checkOutTime as Timestamp)?.toDate();
            let description = rec.keterangan || '';
            if (checkInTime && checkOutTime) description = 'Absensi Terekam';
            else if (checkInTime && !checkOutTime) description = 'Belum Absen Pulang';
            return { id: rec.id, date: checkInTime, dateString: format(checkInTime, 'eeee, d MMMM yyyy', { locale: id }), checkIn: format(checkInTime, 'HH:mm'), checkOut: checkOutTime ? format(checkOutTime, 'HH:mm') : '-', status: 'Hadir', description };
        });

        const processLeave = (rec: DocumentData): DetailedEntry[] => {
            const startDate = (rec.startDate as Timestamp)?.toDate();
            const endDate = (rec.endDate as Timestamp)?.toDate();
            if (!startDate || !endDate || isBefore(endDate, startDate)) return [];
            return eachDayOfInterval({ start: startDate, end: endDate }).map(loopDate => ({ id: `${rec.id}-${format(loopDate, 'yyyy-MM-dd')}`, date: loopDate, dateString: format(loopDate, 'eeee, d MMMM yyyy', { locale: id }), checkIn: '-', checkOut: '-', status: rec.type as string, approvalStatus: rec.status as string, description: rec.reason as string }));
        };
        
        const approvedLeaveRecords = userLeaveRecords.filter(r => r.status === 'approved').flatMap(processLeave);
        const otherLeaveRecords = userLeaveRecords.filter(r => r.status !== 'approved').flatMap(processLeave);

        const alpaRecords: DetailedEntry[] = (user.alpaDays || []).map(day => ({ id: `alpa-${format(day, 'yyyy-MM-dd')}`, date: day, dateString: format(day, 'eeee, d MMMM yyyy', { locale: id }), checkIn: '-', checkOut: '-', status: 'Alpa', description: 'Belum Absen Masuk' }));

        const combinedData = [...attendanceRecordsProcessed, ...approvedLeaveRecords, ...alpaRecords, ...otherLeaveRecords];

        const deDupedDetails: DetailedEntry[] = [];
        const processedDates = new Set<string>();
        for (const item of combinedData) {
            if (!item.date) continue;
            const dateStr = format(item.date, 'yyyy-MM-dd');
            if (processedDates.has(dateStr)) continue;
            deDupedDetails.push(item);
            processedDates.add(dateStr);
        }

        const finalDetails = deDupedDetails
            .filter(item => item.date && !isBefore(item.date, monthStart) && !isAfter(item.date, monthEnd))
            .sort((a, b) => a.date.getTime() - b.date.getTime());

        if (finalDetails.length === 0) throw new Error('Tidak ada data detail untuk diunduh pada periode ini.');

        const monthName = format(dateRange.start, 'MMMM yyyy', { locale: id });
        const title = 'Laporan Detail Kehadiran';
        const subtitle = `Nama: ${user.name}, NIP: ${user.nip || user.email || user.nisn || '-'}, Periode: ${monthName}`;
        const fileName = `laporan-detail-${user.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${format(dateRange.start, 'MM-yyyy')}`;
        
        if (formatType === 'pdf') {
            const { jsPDF } = await import('jspdf');
            await import('jspdf-autotable');
            const pdfDoc = new jsPDF() as jsPDFWithAutoTable;
            const headers = ["No.", "Tanggal", "Masuk", "Pulang", "Status", "Keterangan"];
            const body = finalDetails.map((item, index) => {
                const approvalText = item.approvalStatus ? ` (${approvalStatusIndo[item.approvalStatus] || item.approvalStatus})` : '';
                return [index + 1, item.dateString, item.checkIn, item.checkOut, item.status + approvalText, item.description];
            });

            generatePdfHeaderAndTitle(pdfDoc, schoolConfig, title, subtitle);
            pdfDoc.autoTable({ head: [headers], body, startY: (pdfDoc as any).lastHeaderY || 70, theme: 'grid', headStyles: { fillColor: [41, 128, 185], textColor: 255 } });
            generatePdfSignatureAndFooter(pdfDoc, schoolConfig);
            pdfDoc.save(`${fileName}.pdf`);

        } else if (formatType === 'excel') {
            const XLSX = await import('xlsx');
            const headers = ["No.", "Tanggal", "Masuk", "Pulang", "Status", "Keterangan"];

            const bodyData = finalDetails.map((item, index) => {
                const approvalText = item.approvalStatus ? ` (${approvalStatusIndo[item.approvalStatus] || item.approvalStatus})` : '';
                return [index + 1, item.dateString, item.checkIn, item.checkOut, item.status + approvalText, item.description];
            });
            
            const numCols = headers.length;
            const worksheetData = [
                [schoolConfig.governmentAgency || 'PEMERINTAH KABUPATEN MANGGARAI'],
                [schoolConfig.educationAgency || 'DINAS PENDIDIKAN, KEPEMUDAAN DAN OLAHRAGA'],
                [schoolConfig.schoolName || 'SMP NEGERI 5 LANGKE REMBONG'],
                [`Alamat : ${schoolConfig.address || 'Mando, Kelurahan compang carep, Kecamatan Langke Rembong'}`],
                [], [title], [subtitle], [], headers, ...bodyData
            ];

            const signature = [
                [], [],
                [...Array(numCols - 2).fill(null), `${schoolConfig.reportCity || 'Mando'}, ${new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}`],
                [...Array(numCols - 2).fill(null), 'Mengetahui,'],
                [...Array(numCols - 2).fill(null), 'Kepala Sekolah'],
                [], [], [],
                [...Array(numCols - 2).fill(null), '.........................................'],
                [...Array(numCols - 2).fill(null), schoolConfig.headmasterName || 'Fransiskus Sales, S.Pd'],
                [...Array(numCols - 2).fill(null), schoolConfig.headmasterNip ? `NIP: ${schoolConfig.headmasterNip}` : 'NIP: 196805121994121004'],
            ];
            worksheetData.push(...signature);

            const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

            const headerCellStyle = { fill: { fgColor: { rgb: "2980B9" } }, font: { color: { rgb: "FFFFFF" }, bold: true }, alignment: { horizontal: "center", vertical: "center" } };
            const centerStyle = { alignment: { horizontal: "center", vertical: "center" } };
            const centerBoldStyle = { ...centerStyle, font: { bold: true } };
            
            const headerRowIndex = 8; // Row 9 in Excel
            headers.forEach((_, colIndex) => {
                const cellAddress = XLSX.utils.encode_cell({ r: headerRowIndex, c: colIndex });
                if (worksheet[cellAddress]) worksheet[cellAddress].s = headerCellStyle;
            });

            worksheet['!merges'] = [
                { s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: numCols - 1 } },
                { s: { r: 2, c: 0 }, e: { r: 2, c: numCols - 1 } }, { s: { r: 3, c: 0 }, e: { r: 3, c: numCols - 1 } },
                { s: { r: 5, c: 0 }, e: { r: 5, c: numCols - 1 } }, { s: { r: 6, c: 0 }, e: { r: 6, c: numCols - 1 } },
            ];
            
            worksheet['A1'].s = centerBoldStyle; worksheet['A2'].s = centerBoldStyle; worksheet['A3'].s = centerBoldStyle;
            worksheet['A4'].s = centerStyle; worksheet['A6'].s = centerBoldStyle; worksheet['A7'].s = centerStyle;

            worksheet['!cols'] = [ { wch: 5 }, { wch: 25 }, { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 30 } ];
            
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan Detail');
            XLSX.writeFile(workbook, `${fileName}.xlsx`);
        }
    };

    generateAndDownloadFile(formatType, `Laporan Detail ${user.name}`, generatorFn);
}, [firestore, schoolConfig, dateRange, generateAndDownloadFile, toast]);

  const filteredData = useMemo(() => {
    if (!searchQuery) return processedUserData;
    return processedUserData.filter((user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, processedUserData]);

  const handleOpenEditAttendance = (user: UserReport) => {
    setEditingUser(user);
    setIsEditAttendanceOpen(true);
  };
  
  const handleOpenViewDetail = (user: UserReport) => {
    setViewingUser(user);
    setIsDetailViewOpen(true);
  };
  
  const handleAddAttendance = (date: Date) => {
    if (!viewingUser) return;
    setManualAttendanceData({ user: viewingUser, date });
    setIsManualAttendanceOpen(true);
  };

  if (isUsersLoading || isConfigLoading) {
      return <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  
  const skeletonCols = canDownload ? (activeTab === 'siswa' ? 9 : 11) : (activeTab === 'siswa' ? 8 : 10);
  const currentMonthName = format(currentDate, 'MMMM yyyy', { locale: id });

  return (
    <>
      <Tabs defaultValue="guru" className="w-full" onValueChange={setActiveTab}>
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Laporan Kehadiran</CardTitle>
                <CardDescription>
                  Menampilkan data kehadiran untuk periode yang dipilih.
                </CardDescription>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                 <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))} disabled={isPrevMonthNavDisabled}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="font-semibold text-center w-32">{currentMonthName}</span>
                    <Button variant="outline" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>

                {canDownload && (
                  <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                      <Button className="w-full sm:w-auto" disabled={isBackingUp}>
                          {isBackingUp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                          <span>Opsi Laporan</span>
                      </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel>Unduh Ringkasan</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => handleReportAction('pdf')}>
                            <Download className="mr-2 h-4 w-4" />
                            Unduh sebagai PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleReportAction('excel')}>
                            <Download className="mr-2 h-4 w-4" />
                            Unduh sebagai Excel
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>Integrasi Lainnya</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => handleReportAction('sheets')} disabled={!schoolConfig?.googleSheetsUrl}>
                            <BookUp className="mr-2 h-4 w-4" />
                            Backup ke Google Sheets
                          </DropdownMenuItem>
                      </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
             <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mt-4">
                <div className="overflow-x-auto">
                    <TabsList>
                    <TabsTrigger value="guru">Data Guru</TabsTrigger>
                    <TabsTrigger value="pegawai">Data Pegawai</TabsTrigger>
                    <TabsTrigger value="siswa">Data Siswa</TabsTrigger>
                    <TabsTrigger value="kepala_sekolah">Kepala Sekolah</TabsTrigger>
                    </TabsList>
                </div>
                 <div className="relative self-end sm:self-center">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Cari nama..."
                    className="w-full rounded-lg bg-background pl-8 md:w-[200px] lg:w-[250px]"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingData ? (
               <ReportTableSkeleton cols={skeletonCols} />
            ) : (
              <TabsContent value={activeTab} className="w-full">
                 <UserTable 
                    data={filteredData} 
                    userType={activeTab.charAt(0).toUpperCase() + activeTab.slice(1).replace('_', ' ')}
                    canDownload={canDownload}
                    onDownloadDetail={handleDownloadDetail} 
                    onEditAttendance={handleOpenEditAttendance} 
                    onViewDetail={handleOpenViewDetail} 
                 />
              </TabsContent>
            )}
          </CardContent>
        </Card>
      </Tabs>
      {isEditAttendanceOpen && editingUser && (
        <EditAttendanceDialog
          isOpen={isEditAttendanceOpen}
          onOpenChange={setIsEditAttendanceOpen}
          user={editingUser}
          schoolConfig={schoolConfig!}
          onBulkUpdateSuccess={forceRefetch}
          periodDate={currentDate}
        />
      )}
      {isDetailViewOpen && viewingUser && (
        <DetailDialog
          user={viewingUser}
          isOpen={isDetailViewOpen}
          onOpenChange={setIsDetailViewOpen}
          schoolConfig={schoolConfig!}
          onAddAttendance={handleAddAttendance}
          dateRange={dateRange}
        />
      )}
      {isManualAttendanceOpen && manualAttendanceData && (
        <ManualAttendanceDialog
          isOpen={isManualAttendanceOpen}
          onOpenChange={setIsManualAttendanceOpen}
          user={manualAttendanceData.user}
          date={manualAttendanceData.date}
          onSuccess={() => {
            forceRefetch();
            setIsDetailViewOpen(false);
          }}
        />
      )}
    </>
  );
}


export default function AdminLaporanPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();

  const userDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: userData, isLoading: isUserDataLoading } = useDoc<User>(user, userDocRef);

  const isLoadingPage = isUserLoading || isUserDataLoading;
  const isPrivileged = !isLoadingPage && userData && (userData.role === 'admin' || userData.role === 'kepala_sekolah');
  const isAdmin = !isLoadingPage && userData && (userData.role === 'admin');

  useEffect(() => {
    if (!isLoadingPage) {
        if (!user) {
            router.replace('/');
        } else if (!isPrivileged) {
            router.replace('/dashboard');
        }
    }
  }, [isLoadingPage, isPrivileged, router, user]);

  if (isLoadingPage || !isPrivileged) {
    return (
        <div className="flex items-center justify-center h-48">
            <Loader2 className="h-8 w-8 animate-spin" />
        </div>
    );
  }

  return <LaporanView isAllowed={!!isPrivileged} canDownload={!!isAdmin} />;
}
