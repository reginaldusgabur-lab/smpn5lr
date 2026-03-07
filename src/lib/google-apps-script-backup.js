function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    const spreadsheet = SpreadsheetApp.create(`${payload.reportTitle} - ${new Date().toLocaleDateString()}`);
    const sheet = spreadsheet.getActiveSheet();
    sheet.setName("Laporan"); 

    let currentRow = 1;

    // Header Section
    sheet.getRange(currentRow, 1).setValue(payload.header.governmentAgency).setFontWeight("bold");
    sheet.getRange(currentRow, 1, 1, 5).merge();
    currentRow++;
    sheet.getRange(currentRow, 1).setValue(payload.header.educationAgency).setFontWeight("bold");
    sheet.getRange(currentRow, 1, 1, 5).merge();
    currentRow++;
    sheet.getRange(currentRow, 1).setValue(payload.header.schoolName).setFontWeight("bold");
    sheet.getRange(currentRow, 1, 1, 5).merge();
    currentRow++;
    sheet.getRange(currentRow, 1).setValue(payload.header.address);
    sheet.getRange(currentRow, 1, 1, 5).merge();
    currentRow += 2;

    // Report Title Section
    sheet.getRange(currentRow, 1).setValue(payload.reportTitle).setFontWeight("bold").setFontSize(14);
    sheet.getRange(currentRow, 1, 1, 5).merge();
    currentRow++;
    sheet.getRange(currentRow, 1).setValue(payload.subtitle);
     sheet.getRange(currentRow, 1, 1, 5).merge();
    currentRow += 2;

    // Table Section
    const tableStartRow = currentRow;
    sheet.getRange(currentRow, 1, 1, payload.tableHeaders.length).setValues([payload.tableHeaders]).setFontWeight("bold").setBackground("#4285F4").setFontColor("#FFFFFF");
    currentRow++;

    if (payload.tableBody.length > 0) {
      sheet.getRange(currentRow, 1, payload.tableBody.length, payload.tableBody[0].length).setValues(payload.tableBody);
      currentRow += payload.tableBody.length;
    }
    
    for (let i = 1; i <= payload.tableHeaders.length; i++) {
        sheet.autoResizeColumn(i);
    }

    currentRow += 2;

    // Signature Section
    const signatureColumn = 4;
    sheet.getRange(currentRow, signatureColumn).setValue(`${payload.signature.city}, ${payload.signature.date}`);
    currentRow++;
    sheet.getRange(currentRow, signatureColumn).setValue("Mengetahui,");
    currentRow++;
    sheet.getRange(currentRow, signatureColumn).setValue("Kepala Sekolah");
    currentRow += 3;
    sheet.getRange(currentRow, signatureColumn).setValue(payload.signature.headmasterName).setFontWeight("bold");
    currentRow++;
    sheet.getRange(currentRow, signatureColumn).setValue(payload.signature.headmasterNip);

    return ContentService.createTextOutput(JSON.stringify({
      "status": "success",
      "spreadsheetId": spreadsheet.getId(),
      "spreadsheetUrl": spreadsheet.getUrl()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log(error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      "status": "error",
      "message": error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}