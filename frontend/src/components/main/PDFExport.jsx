import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Helper to add header to PDF
const addHeader = (doc, title) => {
  doc.setFillColor(18, 18, 18);
  doc.rect(0, 0, 210, 25, 'F');
  doc.setTextColor(0, 217, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('NETRA', 14, 15);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(title, 196, 15, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  return 30;
};

// Helper to add section title
const addSectionTitle = (doc, title, y) => {
  if (y > 270) {
    doc.addPage();
    y = 20;
  }
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

// Convert lat/lng to tile coordinates for OpenStreetMap
const latLngToTile = (lat, lng, zoom) => {
  const n = Math.pow(2, zoom);
  const x = Math.floor((lng + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
};

// Generate static map tile URL from OpenStreetMap
const getOsmTileUrl = (lat, lng, zoom = 15) => {
  const tile = latLngToTile(lat, lng, zoom);
  // Use OSM tile server directly - more reliable than staticmap service
  return `https://a.tile.openstreetmap.org/${zoom}/${tile.x}/${tile.y}.png`;
};

// Load image and convert to base64
const loadImageAsBase64 = (url) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } catch (e) {
        console.log('Image conversion failed:', e);
        resolve(null);
      }
    };
    img.onerror = () => {
      console.log('Image load failed');
      resolve(null);
    };
    // Timeout after 5 seconds
    setTimeout(() => resolve(null), 5000);
    img.src = url;
  });
};

// Draw location map directly in PDF (no external dependency)
// This uses the TARGET's SPECIFIC coordinates, NOT the live screen view
const drawLocationMap = (doc, lat, lng, phoneNumber, yPos) => {
  const mapWidth = 100;
  const mapHeight = 60;
  const mapX = 14;
  const mapY = yPos;
  
  // Draw map background with gradient-like effect
  doc.setFillColor(25, 35, 45);
  doc.roundedRect(mapX, mapY, mapWidth, mapHeight, 3, 3, 'F');
  
  // Draw border
  doc.setDrawColor(0, 217, 255);
  doc.setLineWidth(1);
  doc.roundedRect(mapX, mapY, mapWidth, mapHeight, 3, 3, 'S');
  
  // Draw grid lines (simulating map grid)
  doc.setDrawColor(45, 55, 65);
  doc.setLineWidth(0.2);
  for (let i = 1; i < 6; i++) {
    doc.line(mapX + (mapWidth/6)*i, mapY, mapX + (mapWidth/6)*i, mapY + mapHeight);
  }
  for (let i = 1; i < 5; i++) {
    doc.line(mapX, mapY + (mapHeight/5)*i, mapX + mapWidth, mapY + (mapHeight/5)*i);
  }
  
  // Draw center marker (target position) - more prominent
  const centerX = mapX + mapWidth/2;
  const centerY = mapY + mapHeight/2;
  
  // Outer glow effect
  doc.setFillColor(255, 59, 92, 0.3);
  doc.circle(centerX, centerY - 3, 10, 'F');
  
  // Marker pin body
  doc.setFillColor(255, 59, 92);
  doc.circle(centerX, centerY - 5, 7, 'F');
  
  // White inner circle
  doc.setFillColor(255, 255, 255);
  doc.circle(centerX, centerY - 5, 3.5, 'F');
  
  // Marker pointer (triangle pointing down)
  doc.setFillColor(255, 59, 92);
  doc.triangle(centerX - 5, centerY - 1, centerX + 5, centerY - 1, centerX, centerY + 7, 'F');
  
  // Title label at top
  doc.setFillColor(0, 217, 255);
  doc.roundedRect(mapX + 3, mapY + 3, 35, 8, 1, 1, 'F');
  doc.setTextColor(18, 18, 18);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.text('LOKASI TARGET', mapX + 5, mapY + 8);
  
  // Coordinates display box at bottom
  doc.setFillColor(18, 18, 18);
  doc.roundedRect(mapX + 3, mapY + mapHeight - 18, 55, 15, 1, 1, 'F');
  doc.setFontSize(7);
  doc.setTextColor(0, 217, 255);
  doc.text(`LAT: ${lat.toFixed(6)}`, mapX + 5, mapY + mapHeight - 11);
  doc.text(`LNG: ${lng.toFixed(6)}`, mapX + 5, mapY + mapHeight - 5);
  
  // Phone number label at top right
  doc.setFillColor(255, 59, 92);
  doc.roundedRect(mapX + mapWidth - 38, mapY + 3, 35, 8, 1, 1, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.text(phoneNumber.slice(-10), mapX + mapWidth - 36, mapY + 8);
  
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  
  return yPos + mapHeight + 8;
};

// Helper to parse DOB for sorting (from explicit DOB field or NIK)
const parseDOBFromMember = (member) => {
  // First try explicit DOB fields
  const dobField = member.dob || member.birth_date || member.tanggal_lahir || member.tgl_lahir;
  if (dobField) {
    const str = String(dobField).trim();
    // Try DD-MM-YYYY or DD/MM/YYYY
    let match = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
    if (match) {
      return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
    }
    // Try YYYY-MM-DD
    match = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
    if (match) {
      return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
    }
    // Fallback: try native Date parse
    const parsed = new Date(str);
    if (!isNaN(parsed)) return parsed;
  }
  
  // Try to extract from Indonesian NIK (16 digits)
  // Format: PPPPPP-DDMMYY-XXXX (PP=province, DD=day, MM=month, YY=year)
  // For females, DD is +40 (e.g., 41 = day 1)
  const nik = member.nik;
  if (nik && nik.length >= 12) {
    const nikStr = String(nik).replace(/\D/g, ''); // Remove non-digits
    if (nikStr.length >= 12) {
      let day = parseInt(nikStr.substring(6, 8));
      const month = parseInt(nikStr.substring(8, 10));
      const year = parseInt(nikStr.substring(10, 12));
      
      // If day > 40, it's a female (subtract 40)
      if (day > 40) day -= 40;
      
      // Determine century: if year > 50, assume 1900s; else 2000s
      const fullYear = year > 50 ? 1900 + year : 2000 + year;
      
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return new Date(fullYear, month - 1, day);
      }
    }
  }
  
  return new Date(9999, 11, 31); // No DOB = put at end
};

// Draw simple family tree in PDF
const drawFamilyTree = (doc, familyData, yPos, targetNik) => {
  if (!familyData?.members || familyData.members.length === 0) {
    return yPos;
  }
  
  const members = familyData.members;
  const head = members.find(m => m.relationship?.includes('KEPALA'));
  const spouse = members.find(m => m.relationship?.includes('ISTRI') || m.relationship?.includes('SUAMI'));
  
  // Sort children by DOB (oldest first)
  const children = members
    .filter(m => m.relationship?.includes('ANAK'))
    .sort((a, b) => {
      const dobA = parseDOBFromMember(a);
      const dobB = parseDOBFromMember(b);
      return dobA - dobB;
    });
  
  const others = members.filter(m => 
    !m.relationship?.includes('KEPALA') && 
    !m.relationship?.includes('ISTRI') && 
    !m.relationship?.includes('SUAMI') && 
    !m.relationship?.includes('ANAK')
  );
  
  const boxWidth = 55;
  const boxHeight = 18;
  const startX = 14;
  let currentY = yPos;
  
  // Draw head and spouse
  if (head) {
    const isTarget = head.nik === targetNik;
    doc.setFillColor(isTarget ? 255 : 0, isTarget ? 59 : 217, isTarget ? 92 : 255);
    doc.roundedRect(startX, currentY, boxWidth, boxHeight, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('KEPALA KELUARGA', startX + 2, currentY + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.text(head.name?.substring(0, 20) || 'N/A', startX + 2, currentY + 10);
    doc.text(head.nik || '', startX + 2, currentY + 15);
  }
  
  if (spouse) {
    const isTarget = spouse.nik === targetNik;
    doc.setFillColor(isTarget ? 255 : 100, isTarget ? 59 : 100, isTarget ? 92 : 100);
    doc.roundedRect(startX + boxWidth + 10, currentY, boxWidth, boxHeight, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(spouse.relationship || 'PASANGAN', startX + boxWidth + 12, currentY + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.text(spouse.name?.substring(0, 20) || 'N/A', startX + boxWidth + 12, currentY + 10);
    doc.text(spouse.nik || '', startX + boxWidth + 12, currentY + 15);
  }
  
  currentY += boxHeight + 5;
  
  // Draw connection line
  if (children.length > 0) {
    doc.setDrawColor(0, 217, 255);
    doc.setLineWidth(0.5);
    doc.line(startX + boxWidth/2, currentY - 5, startX + boxWidth/2, currentY + 3);
    currentY += 5;
  }
  
  // Draw children
  let childX = startX;
  children.forEach((child, idx) => {
    if (childX + boxWidth > 196) {
      childX = startX;
      currentY += boxHeight + 5;
    }
    
    const isTarget = child.nik === targetNik;
    doc.setFillColor(isTarget ? 255 : 50, isTarget ? 59 : 50, isTarget ? 92 : 50);
    doc.roundedRect(childX, currentY, boxWidth - 5, boxHeight - 2, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.text(`ANAK ${idx + 1}`, childX + 2, currentY + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    doc.text(child.name?.substring(0, 18) || 'N/A', childX + 2, currentY + 9);
    doc.text(child.nik || '', childX + 2, currentY + 13);
    
    childX += boxWidth;
  });
  
  currentY += boxHeight + 5;
  
  // Draw others
  if (others.length > 0) {
    let otherX = startX;
    others.forEach((other) => {
      if (otherX + boxWidth > 196) {
        otherX = startX;
        currentY += boxHeight + 5;
      }
      
      const isTarget = other.nik === targetNik;
      doc.setFillColor(isTarget ? 255 : 80, isTarget ? 59 : 80, isTarget ? 92 : 80);
      doc.roundedRect(otherX, currentY, boxWidth - 5, boxHeight - 2, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      doc.text(other.relationship?.substring(0, 15) || 'LAINNYA', otherX + 2, currentY + 4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5);
      doc.text(other.name?.substring(0, 18) || 'N/A', otherX + 2, currentY + 9);
      doc.text(other.nik || '', otherX + 2, currentY + 13);
      
      otherX += boxWidth;
    });
    currentY += boxHeight + 5;
  }
  
  doc.setTextColor(0, 0, 0);
  return currentY;
};

// Generate PDF for a single target
export const generateTargetPDF = async (target, mapScreenshot = null) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new jsPDF();
      let yPos = addHeader(doc, 'TARGET REPORT');
      
      // A. Target Number/Info
      yPos = addSectionTitle(doc, 'A. INFORMASI TARGET', yPos);
      doc.setFontSize(10);
      doc.text(`Phone: ${target.phone_number || 'N/A'}`, 16, yPos + 5);
      doc.text(`Status: ${(target.status || 'N/A').toUpperCase()}`, 16, yPos + 10);
      doc.text(`Case ID: ${target.case_id || 'N/A'}`, 16, yPos + 15);
      const createdAt = target.created_at ? new Date(target.created_at).toLocaleString('id-ID') : 'N/A';
      doc.text(`Created: ${createdAt}`, 16, yPos + 20);
      yPos += 28;
      
      // B. Location with Map - USING TARGET'S OWN COORDINATES
      if (target.data?.latitude && target.data?.longitude) {
        yPos = addSectionTitle(doc, 'B. LOKASI TARGET', yPos);
        doc.setFontSize(9);
        
        const lat = parseFloat(target.data.latitude);
        const lng = parseFloat(target.data.longitude);
        
        doc.text(`Koordinat: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, 16, yPos + 5);
        doc.text(`Alamat: ${target.data.address || 'N/A'}`, 16, yPos + 10);
        const timestamp = target.data.timestamp ? new Date(target.data.timestamp).toLocaleString('id-ID') : 'N/A';
        doc.text(`Waktu Update: ${timestamp}`, 16, yPos + 15);
        yPos += 20;
        
        // Use map screenshot if provided (from webapp), otherwise draw placeholder
        if (mapScreenshot) {
          // Add the webapp map screenshot - full width for better visibility
          const imgWidth = 180;
          const imgHeight = 100;
          doc.addImage(mapScreenshot, 'JPEG', 14, yPos, imgWidth, imgHeight);
          
          // Add coordinate label overlay at bottom of screenshot
          doc.setFillColor(0, 0, 0, 0.7);
          doc.rect(14, yPos + imgHeight - 12, imgWidth, 12, 'F');
          doc.setTextColor(0, 217, 255);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text(`📍 ${target.phone_number} | LAT: ${lat.toFixed(6)}, LNG: ${lng.toFixed(6)}`, 18, yPos + imgHeight - 4);
          doc.setTextColor(0, 0, 0);
          doc.setFont('helvetica', 'normal');
          
          yPos += imgHeight + 8;
        } else {
          // Fallback: Draw location map placeholder with coordinates
          yPos = drawLocationMap(doc, lat, lng, target.phone_number, yPos);
        }
      }
      
      // C. RegHP Data
      if (target.reghp_data?.parsed_data && Object.keys(target.reghp_data.parsed_data).length > 0) {
        if (yPos > 200) {
          doc.addPage();
          yPos = 20;
        }
        yPos = addSectionTitle(doc, 'C. DATA REGHP', yPos);
        const reghpData = Object.entries(target.reghp_data.parsed_data).map(([key, value]) => [key, String(value || '-')]);
        autoTable(doc, {
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
      
      // D. NIK Data - Per NIK with their own family data
      if (target.nik_queries && Object.keys(target.nik_queries).length > 0) {
        let nikIndex = 1;
        for (const [nik, nikData] of Object.entries(target.nik_queries)) {
          if (nikData.data?.parsed_data) {
            if (yPos > 200) {
              doc.addPage();
              yPos = 20;
            }
            
            yPos = addSectionTitle(doc, `D${nikIndex}. DATA NIK: ${nik}`, yPos);
            
            // Add photo if available
            const photoData = nikData.data.photo || nikData.data.photo_path;
            let photoWidth = 0;
            if (photoData) {
              try {
                // Photo dimensions (portrait KTP photo)
                const imgWidth = 35;
                const imgHeight = 45;
                const imgX = 160; // Right side position
                const imgY = yPos;
                
                // Draw photo frame
                doc.setFillColor(40, 40, 40);
                doc.roundedRect(imgX - 2, imgY - 2, imgWidth + 4, imgHeight + 4, 2, 2, 'F');
                doc.setDrawColor(0, 217, 255);
                doc.setLineWidth(0.5);
                doc.roundedRect(imgX - 2, imgY - 2, imgWidth + 4, imgHeight + 4, 2, 2, 'S');
                
                // Add the photo
                doc.addImage(photoData, 'JPEG', imgX, imgY, imgWidth, imgHeight);
                
                // Add label under photo
                doc.setFontSize(6);
                doc.setTextColor(100, 100, 100);
                doc.text('FOTO TARGET', imgX + imgWidth/2, imgY + imgHeight + 5, { align: 'center' });
                doc.setTextColor(0, 0, 0);
                
                photoWidth = imgWidth + 15; // Add margin
              } catch (photoErr) {
                console.log('Failed to add photo to PDF:', photoErr);
              }
            }
            
            // NIK data table - adjust width if photo exists
            const tableWidth = photoData ? 125 : 180;
            const nikTableData = Object.entries(nikData.data.parsed_data).map(([key, value]) => [key, String(value || '-')]);
            autoTable(doc, {
              startY: yPos,
              head: [['Field', 'Value']],
              body: nikTableData,
              theme: 'grid',
              headStyles: { fillColor: [0, 217, 255], textColor: [18, 18, 18], fontStyle: 'bold' },
              styles: { fontSize: 8, cellPadding: 2 },
              columnStyles: { 
                0: { fontStyle: 'bold', cellWidth: 45 }, 
                1: { cellWidth: tableWidth - 59 } 
              },
              margin: { left: 14, right: photoData ? 60 : 14 },
              tableWidth: tableWidth
            });
            yPos = Math.max(doc.lastAutoTable.finalY + 5, photoData ? yPos + 55 : 0);
            
            // E. NKK/Family Data for this specific NIK
            if (nikData.family_data?.members && nikData.family_data.members.length > 0) {
              if (yPos > 180) {
                doc.addPage();
                yPos = 20;
              }
              
              yPos = addSectionTitle(doc, `E${nikIndex}. DATA KELUARGA (NKK) - NIK: ${nik}`, yPos);
              doc.setFontSize(9);
              doc.text(`NKK: ${nikData.family_data.nkk || nikData.family_data.family_id || 'N/A'}`, 16, yPos + 3);
              doc.text(`Jumlah Anggota: ${nikData.family_data.members.length}`, 16, yPos + 8);
              yPos += 13;
              
              const familyTableData = nikData.family_data.members.map((member, idx) => [
                idx + 1,
                member.nik || '-',
                member.name || '-',
                member.relationship || '-',
                member.gender || '-'
              ]);
              
              autoTable(doc, {
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
              yPos = doc.lastAutoTable.finalY + 5;
              
              // F. Family Tree Visual for this NIK
              if (yPos > 200) {
                doc.addPage();
                yPos = 20;
              }
              
              yPos = addSectionTitle(doc, `F${nikIndex}. STRUKTUR KELUARGA (VISUAL) - NIK: ${nik}`, yPos);
              yPos = drawFamilyTree(doc, nikData.family_data, yPos, nik);
            }
            
            nikIndex++;
          }
        }
      }
      
      // Also check target-level family data (backward compatibility)
      if (target.family_data?.members && target.family_data.members.length > 0 && !target.nik_queries) {
        if (yPos > 180) {
          doc.addPage();
          yPos = 20;
        }
        
        yPos = addSectionTitle(doc, 'E. DATA KELUARGA (NKK)', yPos);
        const familyTableData = target.family_data.members.map((member, idx) => [
          idx + 1,
          member.nik || '-',
          member.name || '-',
          member.relationship || '-',
          member.gender || '-'
        ]);
        
        autoTable(doc, {
          startY: yPos,
          head: [['No', 'NIK', 'Nama', 'Hubungan', 'Gender']],
          body: familyTableData,
          theme: 'grid',
          headStyles: { fillColor: [0, 217, 255], textColor: [18, 18, 18], fontStyle: 'bold' },
          styles: { fontSize: 7, cellPadding: 2 },
          margin: { left: 14, right: 14 }
        });
        yPos = doc.lastAutoTable.finalY + 5;
        
        // Family Tree Visual
        if (yPos > 200) {
          doc.addPage();
          yPos = 20;
        }
        yPos = addSectionTitle(doc, 'F. STRUKTUR KELUARGA (VISUAL)', yPos);
        yPos = drawFamilyTree(doc, target.family_data, yPos, null);
      }
      
      // Footer
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.text(`Generated: ${new Date().toLocaleString('id-ID')} | NETRA | Target: ${target.phone_number} | Page ${i}/${pageCount}`, 105, 290, { align: 'center' });
      }
      
      // Save PDF
      const filename = `WASKITA_Target_${target.phone_number}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(filename);
      
      setTimeout(() => resolve(true), 100);
      
    } catch (error) {
      console.error('PDF Generation Error:', error);
      reject(error);
    }
  });
};

// Generate PDF for entire case
export const generateCasePDF = async (caseName, targets, mapScreenshots = {}) => {
  return new Promise(async (resolve, reject) => {
    try {
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
        t.phone_number || 'N/A',
        (t.status || 'N/A').toUpperCase(),
        (t.data?.address || 'N/A').substring(0, 35) + (t.data?.address?.length > 35 ? '...' : ''),
        t.reghp_status === 'completed' ? 'Y' : '-',
        Object.keys(t.nik_queries || {}).length > 0 ? 'Y' : '-'
      ]);
      
      autoTable(doc, {
        startY: yPos,
        head: [['No', 'Phone', 'Status', 'Alamat', 'RegHP', 'NIK']],
        body: targetSummary,
        theme: 'grid',
        headStyles: { fillColor: [0, 217, 255], textColor: [18, 18, 18], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 7, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 35 },
          2: { cellWidth: 20 },
          3: { cellWidth: 80 },
          4: { cellWidth: 15 },
          5: { cellWidth: 15 }
        },
        margin: { left: 14, right: 14 }
      });
      
      // Detail per target - EACH TARGET GETS ITS OWN MAP SCREENSHOT
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
        
        // Location - USE MAP SCREENSHOT IF AVAILABLE
        if (target.data?.latitude && target.data?.longitude) {
          const lat = parseFloat(target.data.latitude);
          const lng = parseFloat(target.data.longitude);
          
          doc.setFontSize(9);
          doc.text(`Lokasi: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, 16, yPos);
          doc.text(`Alamat: ${target.data.address || 'N/A'}`, 16, yPos + 5);
          const timestamp = target.data.timestamp ? new Date(target.data.timestamp).toLocaleString('id-ID') : 'N/A';
          doc.text(`Update: ${timestamp}`, 16, yPos + 10);
          yPos += 18;
          
          // Use map screenshot if available
          const screenshot = mapScreenshots[target.id];
          if (screenshot) {
            const imgWidth = 180;
            const imgHeight = 80;
            doc.addImage(screenshot, 'JPEG', 14, yPos, imgWidth, imgHeight);
            
            // Add coordinate label overlay
            doc.setFillColor(0, 0, 0, 0.7);
            doc.rect(14, yPos + imgHeight - 10, imgWidth, 10, 'F');
            doc.setTextColor(0, 217, 255);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.text(`📍 ${target.phone_number} | LAT: ${lat.toFixed(6)}, LNG: ${lng.toFixed(6)}`, 18, yPos + imgHeight - 3);
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
            
            yPos += imgHeight + 8;
          } else {
            // Fallback to drawn map
            yPos = drawLocationMap(doc, lat, lng, target.phone_number, yPos);
          }
        }
        
        // RegHP
        if (target.reghp_data?.parsed_data) {
          yPos = addSectionTitle(doc, 'DATA REGHP', yPos);
          const reghpData = Object.entries(target.reghp_data.parsed_data).map(([key, value]) => [key, String(value || '-')]);
          autoTable(doc, {
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
        
        // NIK Data with per-NIK family data
        if (target.nik_queries) {
          for (const [nik, nikData] of Object.entries(target.nik_queries)) {
            if (nikData.data?.parsed_data) {
              if (yPos > 200) {
                doc.addPage();
                yPos = 20;
              }
              yPos = addSectionTitle(doc, `DATA NIK: ${nik}`, yPos);
              
              // Add photo if available
              const photoData = nikData.data.photo || nikData.data.photo_path;
              if (photoData) {
                try {
                  // Photo dimensions (portrait KTP photo)
                  const imgWidth = 30;
                  const imgHeight = 40;
                  const imgX = 165;
                  const imgY = yPos;
                  
                  // Draw photo frame
                  doc.setFillColor(40, 40, 40);
                  doc.roundedRect(imgX - 2, imgY - 2, imgWidth + 4, imgHeight + 4, 2, 2, 'F');
                  doc.setDrawColor(0, 217, 255);
                  doc.setLineWidth(0.5);
                  doc.roundedRect(imgX - 2, imgY - 2, imgWidth + 4, imgHeight + 4, 2, 2, 'S');
                  
                  // Add the photo
                  doc.addImage(photoData, 'JPEG', imgX, imgY, imgWidth, imgHeight);
                  
                  // Add label
                  doc.setFontSize(5);
                  doc.setTextColor(100, 100, 100);
                  doc.text('FOTO', imgX + imgWidth/2, imgY + imgHeight + 4, { align: 'center' });
                  doc.setTextColor(0, 0, 0);
                } catch (photoErr) {
                  console.log('Failed to add photo:', photoErr);
                }
              }
              
              // Table with adjusted width if photo exists
              const tableWidth = photoData ? 135 : 180;
              const nikTableData = Object.entries(nikData.data.parsed_data).map(([key, value]) => [key, String(value || '-')]);
              autoTable(doc, {
                startY: yPos,
                head: [['Field', 'Value']],
                body: nikTableData,
                theme: 'grid',
                headStyles: { fillColor: [0, 217, 255], textColor: [18, 18, 18], fontStyle: 'bold' },
                styles: { fontSize: 7, cellPadding: 1.5 },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 }, 1: { cellWidth: tableWidth - 54 } },
                margin: { left: 14, right: photoData ? 55 : 14 },
                tableWidth: tableWidth
              });
              yPos = Math.max(doc.lastAutoTable.finalY + 5, photoData ? yPos + 50 : 0);
              
              // Family data for this specific NIK
              if (nikData.family_data?.members?.length > 0) {
                if (yPos > 180) {
                  doc.addPage();
                  yPos = 20;
                }
                yPos = addSectionTitle(doc, `DATA KELUARGA - NIK: ${nik}`, yPos);
                const familyTableData = nikData.family_data.members.map((member, idx) => [
                  idx + 1,
                  member.nik || '-',
                  member.name || '-',
                  member.relationship || '-',
                  member.gender || '-'
                ]);
                autoTable(doc, {
                  startY: yPos,
                  head: [['No', 'NIK', 'Nama', 'Hubungan', 'Gender']],
                  body: familyTableData,
                  theme: 'grid',
                  headStyles: { fillColor: [0, 217, 255], textColor: [18, 18, 18], fontStyle: 'bold' },
                  styles: { fontSize: 7, cellPadding: 1.5 },
                  margin: { left: 14, right: 14 }
                });
                yPos = doc.lastAutoTable.finalY + 5;
                
                // Family tree visual for THIS NIK
                if (yPos > 200) {
                  doc.addPage();
                  yPos = 20;
                }
                yPos = addSectionTitle(doc, `FAMILY TREE - NIK: ${nik}`, yPos);
                yPos = drawFamilyTree(doc, nikData.family_data, yPos, nik);
              }
            }
          }
        }
      }
      
      // Footer on all pages
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.text(`Generated: ${new Date().toLocaleString('id-ID')} | NETRA | Case: ${caseName} | Page ${i}/${pageCount}`, 105, 290, { align: 'center' });
      }
      
      // Save PDF
      const filename = `WASKITA_Case_${caseName}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(filename);
      
      setTimeout(() => resolve(true), 100);
      
    } catch (error) {
      console.error('PDF Generation Error:', error);
      reject(error);
    }
  });
};
