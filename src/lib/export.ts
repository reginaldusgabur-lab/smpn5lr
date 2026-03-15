import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { schoolLogoBase64 } from '@/assets/school-logo';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

// Utility to trigger file download
function triggerDownload(data: any, fileName: string, fileType: string) {
  const blob = new Blob([data], { type: fileType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// --- SUMMARY EXCEL EXPORT --- //
export function exportToExcel(
  summaryData: { [key: string]: any[] },
  currentMonth: Date,
  activeTab: string
) {
  try {
    const monthName = currentMonth.toLocaleString('id-ID', { month: 'long', year: 'numeric' });
    const tabName = activeTab.charAt(0).toUpperCase() + activeTab.slice(1);
    const fileName = `Laporan Kehadiran - ${tabName} - ${monthName}.xlsx`;

    const dataToExport = summaryData[activeTab] || [];

    if (dataToExport.length === 0) {
      alert('Tidak ada data untuk diekspor.');
      return;
    }

    const worksheetData = dataToExport.map((user, index) => ({
      'No.': user.sequenceNumber || index + 1,
      'Nama': user.name,
      'NIP': user.nip || '-',
      'Status Kepegawaian': user.position || '-',
      'Hadir': user.hadir,
      'Izin': user.izin,
      'Sakit': user.sakit,
      'Alpa': user.alpa,
      'Terlambat': user.terlambat,
      'Presentasi': user.presentasi,
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, tabName);

    const colWidths = [
        { wch: 5 }, { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, 
        { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }
    ];
    worksheet['!cols'] = colWidths;

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    triggerDownload(excelBuffer, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  } catch (error) {
    console.error("Error exporting to Excel:", error);
    alert("Terjadi kesalahan saat mengekspor ke Excel. Silakan coba lagi.");
  }
}

// --- SUMMARY PDF EXPORT --- //
export function exportToPdf(
  summaryData: { [key: string]: any[] },
  currentMonth: Date,
  activeTab: string,
  reportConfig: any
) {
    try {
        const monthName = currentMonth.toLocaleString('id-ID', { month: 'long', year: 'numeric' });
        const tabName = activeTab.charAt(0).toUpperCase() + activeTab.slice(1);
        const fileName = `Laporan Kehadiran - ${tabName} - ${monthName}.pdf`;
        
        const dataToExport = summaryData[activeTab] || [];
        if (dataToExport.length === 0) {
            alert('Tidak ada data untuk diekspor.');
            return;
        }

        const doc = new jsPDF();
        const pageCenter = doc.internal.pageSize.getWidth() / 2;

        const config = reportConfig || {};
        const instansi = config.governmentInstance || 'PEMERINTAH KABUPATEN MANGGARAI';
        const dinas = config.educationOffice || 'DINAS PENDIDIKAN PEMUDA DAN OLAHRAGA';
        const sekolah = config.schoolName || 'SMP NEGERI 5 LANGKE REMBONG';
        const alamat = config.schoolAddress || 'Alamat : Mando,Kelurahan compang carep, Kecamatan Langke Rembong';
        const kotaLaporan = config.reportCity || 'Mando';
        const namaKepsek = config.headmasterName || 'Maria Magdalena Dirce,S.Pd';
        const nipKepsek = config.headmasterNip || '197803192006042008';

        // Header
        if (schoolLogoBase64) {
            doc.addImage(schoolLogoBase64, 'PNG', 15, 12, 25, 25);
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(instansi.toUpperCase(), pageCenter, 15, { align: 'center' });
        doc.text(dinas.toUpperCase(), pageCenter, 21, { align: 'center' });
        doc.setFontSize(14);
        doc.text(sekolah.toUpperCase(), pageCenter, 28, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(alamat, pageCenter, 34, { align: 'center' });
        doc.setLineWidth(1);
        doc.line(10, 38, doc.internal.pageSize.getWidth() - 10, 38);

        // Title
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`Laporan Kehadiran ${tabName}`, pageCenter, 48, { align: 'center' });
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text(`Bulan: ${monthName}`, pageCenter, 55, { align: 'center' });

        // Table
        const tableHead = [
            [
                { content: 'No.', rowSpan: 2, styles: { halign: 'left', valign: 'middle' } },
                { content: 'Nama', rowSpan: 2, styles: { halign: 'left', valign: 'middle' } },
                { content: 'NIP', rowSpan: 2, styles: { halign: 'left', valign: 'middle' } },
                { content: 'Status\nKepegawaian', rowSpan: 2, styles: { halign: 'left', valign: 'middle' } },
                { content: 'Rekap Kehadiran', colSpan: 5, styles: { halign: 'center' } },
                { content: 'Presentasi', rowSpan: 2, styles: { halign: 'right', valign: 'middle' } }
            ],
            ['Hadir', 'Izin', 'Sakit', 'Alpa', 'Terlambat']
        ];
        
        const tableRows = dataToExport.map((user, index) => [
            user.sequenceNumber || index + 1,
            user.name,
            user.nip || '-',
            user.position || '-',
            user.hadir, 
            user.izin, 
            user.sakit, 
            user.alpa, 
            user.terlambat, 
            user.presentasi
        ]);

        (doc as any).autoTable({
            startY: 62,
            head: tableHead,
            body: tableRows,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold', halign: 'center' },
            styles: { cellPadding: 2, fontSize: 8 },
            columnStyles: {
                0: { halign: 'left', cellWidth: 7 },
                1: { halign: 'left', cellWidth: 40 },
                2: { halign: 'left', cellWidth: 25 },
                3: { halign: 'left', cellWidth: 25 },
                4: { halign: 'center' },
                5: { halign: 'center' },
                6: { halign: 'center' },
                7: { halign: 'center' },
                8: { halign: 'center' },
                9: { halign: 'right', cellWidth: 20 }
            }
        });

        // Signature
        const signatureY = (doc as any).lastAutoTable.finalY + 10;
        const signatureX = doc.internal.pageSize.getWidth() - 85;
        const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`${kotaLaporan}, ${today}`, signatureX, signatureY);
        doc.text('Mengetahui,', signatureX, signatureY + 6);
        doc.text('Kepala Sekolah', signatureX, signatureY + 12);
        doc.setFont('helvetica', 'bold');
        doc.text(namaKepsek, signatureX, signatureY + 36);
        doc.setFont('helvetica', 'normal');
        doc.text(`NIP: ${nipKepsek}`, signatureX, signatureY + 40);


        // Footer
        const pageCount = (doc as any).internal.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.text(`Halaman ${i} dari ${pageCount}`, doc.internal.pageSize.getWidth() - 15, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
        }

        doc.save(fileName);

    } catch (error) {
        console.error("Error exporting to PDF:", error);
        alert("Terjadi kesalahan saat mengekspor ke PDF. Silakan coba lagi.");
    }
}

// --- DETAILED PDF EXPORT --- //
export function exportDetailedReportToPdf(
    detailedData: any[],
    user: any,
    currentMonth: Date,
    reportConfig: any
) {
    try {
        const monthName = currentMonth.toLocaleString('id-ID', { month: 'long', year: 'numeric' });
        const fileName = `Laporan Rinci - ${user.name} - ${monthName}.pdf`;

        if (detailedData.length === 0) {
            alert('Tidak ada data untuk diekspor.');
            return;
        }

        const doc = new jsPDF();
        const pageCenter = doc.internal.pageSize.getWidth() / 2;

        const config = reportConfig || {};
        const instansi = config.governmentInstance || 'PEMERINTAH KABUPATEN MANGGARAI';
        const dinas = config.educationOffice || 'DINAS PENDIDIKAN PEMUDA DAN OLAHRAGA';
        const sekolah = config.schoolName || 'SMP NEGERI 5 LANGKE REMBONG';
        const alamat = config.schoolAddress || 'Alamat : Mando,Kelurahan compang carep, Kecamatan Langke Rembong';
        
        // Header
        if (schoolLogoBase64) {
            doc.addImage(schoolLogoBase64, 'PNG', 15, 12, 25, 25);
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(instansi.toUpperCase(), pageCenter, 15, { align: 'center' });
        doc.text(dinas.toUpperCase(), pageCenter, 21, { align: 'center' });
        doc.setFontSize(14);
        doc.text(sekolah.toUpperCase(), pageCenter, 28, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(alamat, pageCenter, 34, { align: 'center' });
        doc.setLineWidth(1);
        doc.line(10, 38, doc.internal.pageSize.getWidth() - 10, 38);

        // Title
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('LAPORAN KEHADIRAN', pageCenter, 50, { align: 'center' });
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text(`Periode : ${monthName}`, pageCenter, 56, { align: 'center' });
        
        // User Info
        doc.setFontSize(10);
        doc.text('Nama', 15, 68);
        doc.text(':', 55, 68);
        doc.text(user.name, 60, 68);
        
        doc.text('NIP', 15, 74);
        doc.text(':', 55, 74);
        doc.text(user.nip || '-', 60, 74);

        doc.text('Status Kepegawaian', 15, 80);
        doc.text(':', 55, 80);
        doc.text(user.position || '-', 60, 80);

        // Table
        const tableHead = [['No.', 'Tanggal', 'Jam Masuk', 'Jam Pulang', 'Status', 'Keterangan']];
        const tableRows = detailedData.map((record, index) => [
            index + 1,
            format(record.date, 'eeee, dd/MM/yyyy', { locale: id }),
            record.checkIn,
            record.checkOut,
            record.status,
            record.description,
        ]);

        (doc as any).autoTable({
            startY: 86,
            head: tableHead,
            body: tableRows,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
            styles: { cellPadding: 2, fontSize: 9 },
            columnStyles: {
                0: { halign: 'center', cellWidth: 10 },
                1: { cellWidth: 45 },
                2: { halign: 'center' },
                3: { halign: 'center' },
                4: { halign: 'center' },
            }
        });

        doc.save(fileName);

    } catch (error) {
        console.error("Error exporting detailed PDF:", error);
        alert("Terjadi kesalahan saat mengekspor ke PDF. Silakan coba lagi.");
    }
}

// --- DETAILED EXCEL EXPORT --- //
export function exportDetailedReportToExcel(
    detailedData: any[],
    user: any,
    currentMonth: Date
) {
    try {
        const monthName = currentMonth.toLocaleString('id-ID', { month: 'long', year: 'numeric' });
        const fileName = `Laporan Rinci - ${user.name} - ${monthName}.xlsx`;

        if (detailedData.length === 0) {
            alert('Tidak ada data untuk diekspor.');
            return;
        }

        const worksheetData = detailedData.map((record, index) => ({
            'No.': index + 1,
            'Tanggal': format(record.date, 'eeee, dd/MM/yyyy', { locale: id }),
            'Jam Masuk': record.checkIn,
            'Jam Pulang': record.checkOut,
            'Status': record.status,
            'Keterangan': record.description,
        }));
        
        const userWorksheet = XLSX.utils.json_to_sheet(worksheetData);
        
        const colWidths = [
            { wch: 5 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 30 }
        ];
        userWorksheet['!cols'] = colWidths;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, userWorksheet, "Laporan Rinci");
        
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        triggerDownload(excelBuffer, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    } catch (error) {
        console.error("Error exporting detailed Excel:", error);
        alert("Terjadi kesalahan saat mengekspor ke Excel. Silakan coba lagi.");
    }
}
