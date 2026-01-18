import jsPDF from 'jspdf';
import 'jspdf-autotable';
import html2canvas from 'html2canvas';

// Helper to add header to PDF
const addHeader = (doc, title) => {
  doc.setFillColor(18, 18, 18);
  doc.rect(0, 0, 210, 25, 'F');
  doc.setTextColor(0, 217, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('WASKITA LBS', 14, 15);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(title, 196, 15, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  return 30;
};

// Helper to add section title
const addSectionTitle = (doc, title, y) => {
  doc.setFillColor(0, 217, 255);
  doc.rect(14, y, 182, 8, 'F');
  doc.setTextColor(18, 18, 18);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 16, y + 5.5);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  return y + 12;
};

// Generate PDF for a single target
export const generateTargetPDF = async (target, mapRef) => {
  const doc = new jsPDF();
  let yPos = addHeader(doc, 'TARGET REPORT');
  
  // A. Target Number/Info
  yPos = addSectionTitle(doc, 'A. INFORMASI TARGET', yPos);
  doc.setFontSize(10);
  doc.text(`Phone: ${target.phone_number}`, 16, yPos + 5);
  doc.text(`Status: ${target.status?.toUpperCase() || 'N/A'}`, 16, yPos + 10);
  doc.text(`Case ID: ${target.case_id || 'N/A'}`, 16, yPos + 15);
  doc.text(`Created: ${new Date(target.created_at).toLocaleString('id-ID')}`, 16, yPos + 20);
  yPos += 28;
  
  // B. Location with Map Screenshot
  if (target.data?.latitude && target.data?.longitude) {
    yPos = addSectionTitle(doc, 'B. LOKASI TARGET', yPos);
    doc.setFontSize(9);
    doc.text(`Koordinat: ${target.data.latitude}, ${target.data.longitude}`, 16, yPos + 5);
    doc.text(`Alamat: ${target.data.address || 'N/A'}`, 16, yPos + 10);
    doc.text(`Waktu Update: ${target.data.timestamp ? new Date(target.data.timestamp).toLocaleString('id-ID') : 'N/A'}`, 16, yPos + 15);
    yPos += 22;
    
    // Try to capture map
    if (mapRef) {
      try {
        const mapCanvas = await html2canvas(mapRef, { useCORS: true, scale: 1 });
        const mapImage = mapCanvas.toDataURL('image/jpeg', 0.7);
        doc.addImage(mapImage, 'JPEG', 14, yPos, 90, 60);
        yPos += 65;
      } catch (e) {
        console.error('Map capture failed:', e);
      }
    }
  }
  
  // Check if we need new page
  if (yPos > 200) {
    doc.addPage();
    yPos = 20;
  }
  
  // C. RegHP Data
  if (target.reghp_data?.parsed_data) {
    yPos = addSectionTitle(doc, 'C. DATA REGHP', yPos);
    const reghpData = Object.entries(target.reghp_data.parsed_data).map(([key, value]) => [key, value || '-']);
    doc.autoTable({
      startY: yPos,
      head: [['Field', 'Value']],
      body: reghpData,
      theme: 'grid',
      headStyles: { fillColor: [0, 217, 255], textColor: [18, 18, 18], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 }, 1: { cellWidth: 130 } },
      margin: { left: 14, right: 14 }
    });
    yPos = doc.lastAutoTable.finalY + 8;
  }
  
  // Check if we need new page
  if (yPos > 200) {
    doc.addPage();
    yPos = 20;
  }
  
  // D. NIK Data
  if (target.nik_queries) {
    const nikEntries = Object.entries(target.nik_queries);
    for (const [nik, nikData] of nikEntries) {
      if (nikData.data?.parsed_data) {
        yPos = addSectionTitle(doc, `D. DATA NIK: ${nik}`, yPos);
        
        // Add photo if available
        if (nikData.data.photo_path) {
          try {
            // Photo will be added as placeholder text since we can't easily fetch it
            doc.setFontSize(8);
            doc.text('[Foto KTP tersedia di sistem]', 16, yPos + 5);
            yPos += 10;
          } catch (e) {
            console.error('Photo add failed:', e);
          }
        }
        
        const nikTableData = Object.entries(nikData.data.parsed_data).map(([key, value]) => [key, value || '-']);
        doc.autoTable({
          startY: yPos,
          head: [['Field', 'Value']],
          body: nikTableData,
          theme: 'grid',
          headStyles: { fillColor: [0, 217, 255], textColor: [18, 18, 18], fontStyle: 'bold' },
          styles: { fontSize: 8, cellPadding: 2 },
          columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 }, 1: { cellWidth: 130 } },
          margin: { left: 14, right: 14 }
        });
        yPos = doc.lastAutoTable.finalY + 8;
        
        // Check for new page
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }
      }
    }
  }
  
  // E. NKK/Family Data
  if (target.family_data?.members && target.family_data.members.length > 0) {
    // Check for new page
    if (yPos > 180) {
      doc.addPage();
      yPos = 20;
    }
    
    yPos = addSectionTitle(doc, 'E. DATA KARTU KELUARGA (NKK)', yPos);
    doc.setFontSize(9);
    doc.text(`NKK: ${target.family_data.nkk || 'N/A'}`, 16, yPos + 5);
    doc.text(`Jumlah Anggota: ${target.family_data.members.length}`, 16, yPos + 10);
    yPos += 15;
    
    const familyTableData = target.family_data.members.map((member, idx) => [
      idx + 1,
      member.nik || '-',
      member.name || '-',
      member.relationship || '-',
      member.gender || '-'
    ]);
    
    doc.autoTable({
      startY: yPos,
      head: [['No', 'NIK', 'Nama', 'Hubungan', 'Gender']],
      body: familyTableData,
      theme: 'grid',
      headStyles: { fillColor: [0, 217, 255], textColor: [18, 18, 18], fontStyle: 'bold' },
      styles: { fontSize: 7, cellPadding: 2 },
      columnStyles: { 
        0: { cellWidth: 10 },
        1: { cellWidth: 40 },
        2: { cellWidth: 50 },
        3: { cellWidth: 45 },
        4: { cellWidth: 25 }
      },
      margin: { left: 14, right: 14 }
    });
    yPos = doc.lastAutoTable.finalY + 8;
    
    // F. Family Tree Visual (simplified)
    if (yPos > 220) {
      doc.addPage();
      yPos = 20;
    }
    
    yPos = addSectionTitle(doc, 'F. STRUKTUR KELUARGA', yPos);
    doc.setFontSize(9);
    
    const head = target.family_data.members.find(m => m.relationship?.includes('KEPALA'));
    const spouse = target.family_data.members.find(m => m.relationship?.includes('ISTRI') || m.relationship?.includes('SUAMI'));
    const children = target.family_data.members.filter(m => m.relationship?.includes('ANAK'));
    
    let treeY = yPos + 5;
    if (head) {
      doc.setFont('helvetica', 'bold');
      doc.text(`👤 ${head.name} (${head.relationship})`, 16, treeY);
      treeY += 6;
    }
    if (spouse) {
      doc.setFont('helvetica', 'normal');
      doc.text(`   └─ 👤 ${spouse.name} (${spouse.relationship})`, 16, treeY);
      treeY += 6;
    }
    children.forEach((child, idx) => {
      doc.text(`      ${idx === children.length - 1 ? '└' : '├'}─ 👤 ${child.name} (${child.relationship})`, 16, treeY);
      treeY += 6;
    });
  }
  
  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(`Generated: ${new Date().toLocaleString('id-ID')} | WASKITA LBS | Page ${i}/${pageCount}`, 105, 290, { align: 'center' });
  }
  
  // Save
  doc.save(`WASKITA_Target_${target.phone_number}_${new Date().toISOString().split('T')[0]}.pdf`);
  return true;
};

// Generate PDF for entire case
export const generateCasePDF = async (caseName, targets, mapRef) => {
  const doc = new jsPDF();
  let yPos = addHeader(doc, 'CASE REPORT');
  
  // Case Summary
  yPos = addSectionTitle(doc, 'RINGKASAN CASE', yPos);
  doc.setFontSize(10);
  doc.text(`Nama Case: ${caseName}`, 16, yPos + 5);
  doc.text(`Total Target: ${targets.length}`, 16, yPos + 10);
  doc.text(`Completed: ${targets.filter(t => t.status === 'completed').length}`, 16, yPos + 15);
  doc.text(`Generated: ${new Date().toLocaleString('id-ID')}`, 16, yPos + 20);
  yPos += 30;
  
  // Target Summary Table
  yPos = addSectionTitle(doc, 'DAFTAR TARGET', yPos);
  const targetSummary = targets.map((t, idx) => [
    idx + 1,
    t.phone_number,
    t.status?.toUpperCase() || 'N/A',
    t.data?.address?.substring(0, 40) + '...' || 'N/A',
    t.reghp_status === 'completed' ? '✓' : '-',
    Object.keys(t.nik_queries || {}).length > 0 ? '✓' : '-'
  ]);
  
  doc.autoTable({
    startY: yPos,
    head: [['No', 'Phone', 'Status', 'Alamat', 'RegHP', 'NIK']],
    body: targetSummary,
    theme: 'grid',
    headStyles: { fillColor: [0, 217, 255], textColor: [18, 18, 18], fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 7, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 35 },
      2: { cellWidth: 25 },
      3: { cellWidth: 75 },
      4: { cellWidth: 15 },
      5: { cellWidth: 15 }
    },
    margin: { left: 14, right: 14 }
  });
  
  // Detail per target
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    doc.addPage();
    yPos = 20;
    
    // Target header
    doc.setFillColor(255, 59, 92);
    doc.rect(14, yPos, 182, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`TARGET ${i + 1}: ${target.phone_number}`, 16, yPos + 7);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    yPos += 15;
    
    // Location
    if (target.data?.latitude) {
      doc.setFontSize(9);
      doc.text(`📍 Lokasi: ${target.data.latitude}, ${target.data.longitude}`, 16, yPos);
      doc.text(`📍 Alamat: ${target.data.address || 'N/A'}`, 16, yPos + 5);
      doc.text(`🕐 Update: ${target.data.timestamp ? new Date(target.data.timestamp).toLocaleString('id-ID') : 'N/A'}`, 16, yPos + 10);
      yPos += 18;
    }
    
    // RegHP
    if (target.reghp_data?.parsed_data) {
      yPos = addSectionTitle(doc, 'DATA REGHP', yPos);
      const reghpData = Object.entries(target.reghp_data.parsed_data).map(([key, value]) => [key, value || '-']);
      doc.autoTable({
        startY: yPos,
        head: [['Field', 'Value']],
        body: reghpData,
        theme: 'grid',
        headStyles: { fillColor: [0, 217, 255], textColor: [18, 18, 18], fontStyle: 'bold' },
        styles: { fontSize: 7, cellPadding: 1.5 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 }, 1: { cellWidth: 135 } },
        margin: { left: 14, right: 14 }
      });
      yPos = doc.lastAutoTable.finalY + 5;
    }
    
    // NIK Data
    if (target.nik_queries) {
      for (const [nik, nikData] of Object.entries(target.nik_queries)) {
        if (nikData.data?.parsed_data) {
          if (yPos > 200) {
            doc.addPage();
            yPos = 20;
          }
          yPos = addSectionTitle(doc, `DATA NIK: ${nik}`, yPos);
          const nikTableData = Object.entries(nikData.data.parsed_data).map(([key, value]) => [key, value || '-']);
          doc.autoTable({
            startY: yPos,
            head: [['Field', 'Value']],
            body: nikTableData,
            theme: 'grid',
            headStyles: { fillColor: [0, 217, 255], textColor: [18, 18, 18], fontStyle: 'bold' },
            styles: { fontSize: 7, cellPadding: 1.5 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 }, 1: { cellWidth: 135 } },
            margin: { left: 14, right: 14 }
          });
          yPos = doc.lastAutoTable.finalY + 5;
        }
      }
    }
    
    // Family Data
    if (target.family_data?.members?.length > 0) {
      if (yPos > 180) {
        doc.addPage();
        yPos = 20;
      }
      yPos = addSectionTitle(doc, 'DATA KELUARGA (NKK)', yPos);
      const familyTableData = target.family_data.members.map((member, idx) => [
        idx + 1,
        member.nik || '-',
        member.name || '-',
        member.relationship || '-',
        member.gender || '-'
      ]);
      doc.autoTable({
        startY: yPos,
        head: [['No', 'NIK', 'Nama', 'Hubungan', 'Gender']],
        body: familyTableData,
        theme: 'grid',
        headStyles: { fillColor: [0, 217, 255], textColor: [18, 18, 18], fontStyle: 'bold' },
        styles: { fontSize: 7, cellPadding: 1.5 },
        margin: { left: 14, right: 14 }
      });
    }
  }
  
  // Footer on all pages
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(`Generated: ${new Date().toLocaleString('id-ID')} | WASKITA LBS | Case: ${caseName} | Page ${i}/${pageCount}`, 105, 290, { align: 'center' });
  }
  
  // Save
  doc.save(`WASKITA_Case_${caseName}_${new Date().toISOString().split('T')[0]}.pdf`);
  return true;
};
