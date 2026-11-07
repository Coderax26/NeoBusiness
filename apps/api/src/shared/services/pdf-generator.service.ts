import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Money } from '../utils/money.util.js';

export interface ChallanData {
  challanNo: string;
  challanDate: string;
  tripNo: string;
  tripDate: string;
  vehicleNo: string;
  driverName: string;
  customerName: string;
  customerAddress: string;
  customerGstin: string;
  customerStateCode: string;
  lines: Array<{
    itemName: string;
    hsnCode: string;
    uom: string;
    loadedQty: string;
    batchNo?: string;
    expiryDate?: string;
  }>;
  siteName: string;
  siteAddress: string;
  siteGstin: string;
  siteStateCode: string;
}

@Injectable()
export class PdfGeneratorService {
  /**
   * Generate a delivery challan PDF buffer
   * Returns a Promise that resolves to a Buffer
   */
  async generateChallan(data: ChallanData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 40,
          info: {
            Title: `Delivery Challan - ${data.challanNo}`,
            Subject: `Trip ${data.tripNo}`,
            Author: 'NeoBus ERP',
            Creator: 'NeoBus ERP',
          },
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Generate the PDF content
        this.drawChallan(doc, data);

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  private drawChallan(doc: PDFKit.PDFDocument, data: ChallanData): void {
    const pageWidth = doc.page.width - 80; // 40 margin on each side
    let y = 40;

    // ===== HEADER SECTION =====
    // Company name (site name)
    doc.fontSize(18).font('Helvetica-Bold').text('NeoBus ERP', 40, y);
    y += 25;
    doc.fontSize(10).font('Helvetica').text(data.siteName, 40, y);
    y += 14;
    doc.fontSize(9).text(data.siteAddress, 40, y);
    y += 12;
    doc
      .fontSize(9)
      .text(`GSTIN: ${data.siteGstin}  |  State: ${data.siteStateCode}`, 40, y);
    y += 20;

    // Challan title
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('DELIVERY CHALLAN', 40, y, { align: 'center', width: pageWidth });
    y += 25;

    // Challan info row
    const infoStartX = 40;
    const infoColWidth = pageWidth / 2;

    // Left column - Challan details
    doc.fontSize(9).font('Helvetica-Bold').text('Challan No:', infoStartX, y);
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(data.challanNo, infoStartX + 70, y);
    y += 14;
    doc.fontSize(9).font('Helvetica-Bold').text('Challan Date:', infoStartX, y);
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(data.challanDate, infoStartX + 70, y);
    y += 14;
    doc.fontSize(9).font('Helvetica-Bold').text('Trip No:', infoStartX, y);
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(data.tripNo, infoStartX + 70, y);

    // Right column - Trip details
    let rightX = infoStartX + infoColWidth;
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('Trip Date:', rightX, y - 28);
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(data.tripDate, rightX + 60, y - 28);
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('Vehicle No:', rightX, y - 14);
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(data.vehicleNo, rightX + 60, y - 14);
    doc.fontSize(9).font('Helvetica-Bold').text('Driver:', rightX, y);
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(data.driverName, rightX + 60, y);

    y += 25;

    // ===== CUSTOMER DETAILS =====
    doc.fontSize(10).font('Helvetica-Bold').text('Bill To / Ship To:', 40, y);
    y += 16;
    doc.fontSize(9).font('Helvetica-Bold').text(data.customerName, 40, y);
    y += 12;
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(data.customerAddress, 40, y, { width: pageWidth });
    y += 12;
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('GSTIN: ', 40, y, { continued: true });
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(data.customerGstin || 'N/A', { continued: true });
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('  State: ', { continued: true });
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(data.customerStateCode || 'N/A');
    y += 25;

    // ===== TABLE HEADER =====
    const tableTop = y;
    const colWidths = [30, 180, 50, 50, 70, 70, 60]; // Sr, Item, HSN, UOM, Loaded Qty, Batch, Expiry
    const colStarts = [40];
    for (let i = 1; i < colWidths.length; i++) {
      colStarts.push(colStarts[i - 1] + colWidths[i - 1]);
    }

    // Draw header row background
    doc.rect(40, y, pageWidth, 20).fill('#f0f0f0');
    doc.fillColor('#000000');
    doc.fontSize(8).font('Helvetica-Bold');

    const headers = [
      'Sr.',
      'Item Description',
      'HSN Code',
      'UOM',
      'Loaded Qty',
      'Batch No.',
      'Expiry Date',
    ];
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], colStarts[i] + 2, y + 5, {
        width: colWidths[i] - 4,
        align: i === 0 ? 'center' : 'left',
      });
    }

    y += 22;
    doc.fillColor('#000000');

    // ===== TABLE ROWS =====
    doc.fontSize(8).font('Helvetica');
    const rowHeight = 18;

    data.lines.forEach((line, index) => {
      // Check if we need a new page
      if (y + rowHeight > doc.page.height - 60) {
        doc.addPage();
        y = 40;
        // Redraw header on new page
        doc.rect(40, y, pageWidth, 20).fill('#f0f0f0');
        doc.fillColor('#000000');
        doc.fontSize(8).font('Helvetica-Bold');
        for (let i = 0; i < headers.length; i++) {
          doc.text(headers[i], colStarts[i] + 2, y + 5, {
            width: colWidths[i] - 4,
            align: i === 0 ? 'center' : 'left',
          });
        }
        y += 22;
        doc.fillColor('#000000');
        doc.fontSize(8).font('Helvetica');
      }

      // Alternate row colors
      if (index % 2 === 1) {
        doc.rect(40, y, pageWidth, rowHeight).fill('#fafafa');
      }

      doc.fillColor('#000000');
      const rowData = [
        String(index + 1),
        line.itemName,
        line.hsnCode || 'N/A',
        line.uom,
        line.loadedQty,
        line.batchNo || 'N/A',
        line.expiryDate ? line.expiryDate.slice(0, 10) : 'N/A',
      ];

      for (let i = 0; i < rowData.length; i++) {
        doc.text(rowData[i], colStarts[i] + 2, y + 4, {
          width: colWidths[i] - 4,
          align: i === 0 ? 'center' : 'left',
        });
      }

      y += rowHeight;
    });

    // Table bottom border
    doc
      .moveTo(40, y)
      .lineTo(40 + pageWidth, y)
      .stroke('#cccccc');
    y += 15;

    // ===== FOOTER / DECLARATION =====
    doc.fontSize(9).font('Helvetica-Bold').text('Declaration:', 40, y);
    y += 14;
    doc
      .fontSize(8)
      .font('Helvetica')
      .text(
        'We declare that this challan shows the actual quantity of goods dispatched and the information given above is true and correct.',
        40,
        y,
        { width: pageWidth },
      );
    y += 20;

    // Authorized signatory
    doc.fontSize(9).font('Helvetica').text('Authorized Signatory', 40, y);
    y += 40;
    doc.moveTo(40, y).lineTo(180, y).stroke('#000000');
    doc.fontSize(8).text('Signature & Stamp', 40, y + 4);

    // Receiver signatory (right side)
    const rightSigX = 40 + pageWidth - 140;
    doc
      .fontSize(9)
      .font('Helvetica')
      .text("Receiver's Signature", rightSigX, y - 40);
    doc
      .moveTo(rightSigX, y)
      .lineTo(rightSigX + 140, y)
      .stroke('#000000');
    doc.fontSize(8).text('Signature & Date', rightSigX, y + 4);

    // ===== PAGE FOOTER =====
    doc.fontSize(7).font('Helvetica').fillColor('#888888');
    doc.text(
      `Generated by NeoBus ERP | ${new Date().toLocaleString('en-IN')}`,
      40,
      doc.page.height - 30,
      { width: pageWidth, align: 'center' },
    );
  }
}
