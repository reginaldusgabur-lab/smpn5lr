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
        const margin = 14;

        const config = reportConfig || {};
        const instansi = (config.governmentAgency || 'PEMERINTAH KABUPATEN MANGGARAI').toUpperCase();
        const dinas = (config.educationAgency || 'DINAS PENDIDIKAN, KEPEMUDAAN DAN OLAHRAGA').toUpperCase();
        const sekolah = (config.schoolName || 'SMP NEGERI 5 LANGKE REMBONG').toUpperCase();
        const alamat = config.address || 'Alamat Sekolah';
        const kotaLaporan = config.reportCity || 'Mando';
        const namaKepsek = config.headmasterName || 'Lodovikus Jangkar, S.Pd.Gr';
        const nipKepsek = config.headmasterNip || '198507272011011020';

        // Header
        doc.setFont('times', 'bold').setFontSize(14);
        doc.text(instansi, pageCenter, 15, { align: 'center' });
        doc.text(dinas, pageCenter, 21, { align: 'center' });
        doc.setFontSize(12);
        doc.text(sekolah, pageCenter, 28, { align: 'center' });
        doc.setFont('times', 'normal').setFontSize(9);
        doc.text(`Alamat: ${alamat}`, pageCenter, 34, { align: 'center' });
        doc.setLineWidth(0.8).line(margin, 38, doc.internal.pageSize.getWidth() - margin, 38);
        doc.setLineWidth(0.2).line(margin, 38.8, doc.internal.pageSize.getWidth() - margin, 38.8);

        // Title: Two lines
        doc.setFontSize(14);
        doc.setFont('times', 'bold');
        let currentY = 50;
        doc.text(`LAPORAN KEHADIRAN ${tabName.toUpperCase()} BULAN ${monthName.toUpperCase()}`, pageCenter, currentY, { align: 'center' });
        if (config.academicYear) {
            currentY += 7;
            doc.text(`TAHUN AJARAN ${config.academicYear.toUpperCase()}`, pageCenter, currentY, { align: 'center' });
        }

        // Table
        const tableHead = [
            [
                { content: 'No.', rowSpan: 2, styles: { halign: 'left', valign: 'middle' } },
                { content: 'Nama', rowSpan: 2, styles: { halign: 'left', valign: 'middle' } },
                { content: 'NIP', rowSpan: 2, styles: { halign: 'left', valign: 'middle' } },
                { content: 'Status Kepegawaian', rowSpan: 2, styles: { halign: 'left', valign: 'middle' } },
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
            startY: currentY + 10,
            head: tableHead,
            body: tableRows,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold', halign: 'center', lineWidth: 0 },
            styles: { cellPadding: 2, fontSize: 8, font: 'times' },
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
        let finalTableY = (doc as any).lastAutoTable.finalY;
        if (finalTableY > doc.internal.pageSize.getHeight() - 65) {
            doc.addPage();
            finalTableY = 20;
        }

        const signatureY = finalTableY + 15;
        const signatureX = doc.internal.pageSize.getWidth() - 85;
        const today = format(new Date(), 'd MMMM yyyy', { locale: id });

        doc.setFontSize(10);
        doc.setFont('times', 'normal');
        doc.text(`${kotaLaporan}, ${today}`, signatureX, signatureY);
        doc.text('Mengetahui,', signatureX, signatureY + 6);
        doc.text('Kepala Sekolah', signatureX, signatureY + 12);
        doc.setFont('times', 'bold');
        doc.text(namaKepsek, signatureX, signatureY + 38);
        doc.setFont('times', 'normal');
        doc.text(`NIP. ${nipKepsek}`, signatureX, signatureY + 44);

        // Footer
        const pageCount = (doc as any).internal.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setLineWidth(0.2);
            doc.line(margin, doc.internal.pageSize.getHeight() - 15, doc.internal.pageSize.getWidth() - margin, doc.internal.pageSize.getHeight() - 15);
            doc.setFontSize(8).setFont('times', 'italic');
            doc.text('Dokumen absensi ini adalah dokumen resmi yang dibuat secara otomatis oleh aplikasi.', margin, doc.internal.pageSize.getHeight() - 10);
            doc.setFontSize(9).setFont('times', 'normal');
            doc.text(`Halaman ${i} dari ${pageCount}`, doc.internal.pageSize.getWidth() - margin, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
        }

        doc.save(fileName);

    } catch (error) {
        console.error("Error exporting to PDF:", error);
        alert("Terjadi kesalahan saat mengekspor ke PDF. Silakan coba lagi.");
    }
}
