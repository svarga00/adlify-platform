/**
 * ADLIFY - PDF Invoice Generator
 * Generovanie profesionálnych PDF faktúr
 */

const PDFGenerator = {
    
    // Konfigurácia firmy (načíta sa zo settings)
    companyInfo: {
        name: 'Adlify s.r.o.',
        address: 'Príkladná ulica 123',
        city: '851 01 Bratislava',
        country: 'Slovensko',
        ico: '12345678',
        dic: '2012345678',
        ic_dph: 'SK2012345678',
        email: 'info@adlify.eu',
        phone: '+421 900 000 000',
        web: 'www.adlify.eu',
        bank: 'Tatra banka a.s.',
        iban: 'SK12 1100 0000 0012 3456 7890',
        swift: 'TATRSKBX'
    },

    // Generovanie PDF faktúry
    async generateInvoicePDF(invoice, settings = null) {
        // Načítať nastavenia firmy ak existujú
        if (settings) {
            this.companyInfo = { ...this.companyInfo, ...settings };
        }

        // Vytvorenie HTML pre PDF
        const html = this.createInvoiceHTML(invoice);
        
        // Otvoriť v novom okne pre tlač/PDF
        const printWindow = window.open('', '_blank');
        printWindow.document.write(html);
        printWindow.document.close();
        
        // Auto-print
        printWindow.onload = () => {
            printWindow.print();
        };

        return true;
    },

    createInvoiceHTML(invoice) {
        const items = invoice.items || [];
        const client = invoice.client || {};
        
        // Výpočty
        const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
        const vatRate = invoice.vat_rate || 20;
        const vatAmount = subtotal * (vatRate / 100);
        const total = subtotal + vatAmount;
        
        // Formátovanie dátumov
        const issueDate = this.formatDate(invoice.issue_date || invoice.created_at);
        const dueDate = this.formatDate(invoice.due_date);
        const deliveryDate = this.formatDate(invoice.delivery_date || invoice.issue_date);

        return `
<!DOCTYPE html>
<html lang="sk">
<head>
    <meta charset="UTF-8">
    <title>Faktúra ${invoice.invoice_number}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 10pt;
            color: #333;
            background: white;
            line-height: 1.4;
        }
        
        .invoice {
            max-width: 800px;
            margin: 0 auto;
            padding: 40px;
        }
        
        /* Header */
        .invoice-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 40px;
            padding-bottom: 20px;
            border-bottom: 3px solid #f97316;
        }
        
        .company-logo {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .logo-icon {
            width: 50px;
            height: 50px;
            background: linear-gradient(135deg, #f97316, #ec4899);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 24px;
        }
        
        .company-name {
            font-size: 24px;
            font-weight: 700;
            color: #1e293b;
        }
        
        .invoice-title {
            text-align: right;
        }
        
        .invoice-title h1 {
            font-size: 28px;
            font-weight: 700;
            color: #f97316;
            margin-bottom: 8px;
        }
        
        .invoice-number {
            font-size: 14px;
            color: #64748b;
        }
        
        /* Parties */
        .parties {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
        }
        
        .party {
            width: 45%;
        }
        
        .party-label {
            font-size: 9pt;
            color: #94a3b8;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
        }
        
        .party-name {
            font-size: 14pt;
            font-weight: 600;
            color: #1e293b;
            margin-bottom: 6px;
        }
        
        .party-details {
            font-size: 10pt;
            color: #475569;
            line-height: 1.6;
        }
        
        /* Invoice Info */
        .invoice-info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
            background: #f8fafc;
            padding: 15px 20px;
            border-radius: 8px;
        }
        
        .info-item {
            text-align: center;
        }
        
        .info-label {
            font-size: 9pt;
            color: #94a3b8;
            display: block;
            margin-bottom: 4px;
        }
        
        .info-value {
            font-size: 11pt;
            font-weight: 600;
            color: #1e293b;
        }
        
        /* Items Table */
        .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
        }
        
        .items-table th {
            background: #1e293b;
            color: white;
            padding: 12px 10px;
            text-align: left;
            font-size: 9pt;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .items-table th:first-child {
            border-radius: 6px 0 0 0;
        }
        
        .items-table th:last-child {
            border-radius: 0 6px 0 0;
            text-align: right;
        }
        
        .items-table th.text-right {
            text-align: right;
        }
        
        .items-table td {
            padding: 12px 10px;
            border-bottom: 1px solid #e2e8f0;
            font-size: 10pt;
        }
        
        .items-table td.text-right {
            text-align: right;
        }
        
        .items-table tr:last-child td {
            border-bottom: 2px solid #e2e8f0;
        }
        
        .item-name {
            font-weight: 500;
        }
        
        .item-desc {
            font-size: 9pt;
            color: #64748b;
            margin-top: 2px;
        }
        
        /* Totals */
        .totals {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 30px;
        }
        
        .totals-table {
            width: 280px;
        }
        
        .totals-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e2e8f0;
        }
        
        .totals-row.total {
            background: linear-gradient(135deg, #f97316, #ec4899);
            color: white;
            padding: 12px 15px;
            border-radius: 6px;
            border: none;
            margin-top: 10px;
            font-size: 14pt;
            font-weight: 700;
        }
        
        .totals-label {
            color: #64748b;
        }
        
        .totals-value {
            font-weight: 600;
        }
        
        .totals-row.total .totals-label,
        .totals-row.total .totals-value {
            color: white;
        }
        
        /* Payment Info */
        .payment-info {
            background: #f8fafc;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 30px;
        }
        
        .payment-title {
            font-size: 11pt;
            font-weight: 600;
            margin-bottom: 10px;
            color: #1e293b;
        }
        
        .payment-details {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }
        
        .payment-item {
            display: flex;
            gap: 8px;
        }
        
        .payment-label {
            color: #64748b;
            min-width: 60px;
        }
        
        .payment-value {
            font-weight: 500;
        }
        
        /* QR Code placeholder */
        .qr-section {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-bottom: 30px;
        }
        
        .qr-code {
            width: 100px;
            height: 100px;
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #94a3b8;
            font-size: 9pt;
        }
        
        /* Notes */
        .notes {
            font-size: 9pt;
            color: #64748b;
            padding: 15px;
            background: #fffbeb;
            border-radius: 6px;
            border-left: 3px solid #f59e0b;
            margin-bottom: 20px;
        }
        
        /* Footer */
        .invoice-footer {
            text-align: center;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            font-size: 9pt;
            color: #94a3b8;
        }
        
        /* Print styles */
        @media print {
            body {
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
            }
            
            .invoice {
                padding: 20px;
            }
            
            .no-print {
                display: none;
            }
        }
        
        /* Print button */
        .print-controls {
            position: fixed;
            top: 20px;
            right: 20px;
            display: flex;
            gap: 10px;
        }
        
        .btn-print {
            padding: 10px 20px;
            background: linear-gradient(135deg, #f97316, #ec4899);
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
        }
        
        .btn-download {
            padding: 10px 20px;
            background: #1e293b;
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div class="print-controls no-print">
        <button class="btn-print" onclick="window.print()">🖨️ Tlačiť</button>
        <button class="btn-download" onclick="window.close()">✕ Zavrieť</button>
    </div>
    
    <div class="invoice">
        <!-- Header -->
        <div class="invoice-header">
            <div class="company-logo">
                <div class="logo-icon">A</div>
                <span class="company-name">${this.companyInfo.name}</span>
            </div>
            <div class="invoice-title">
                <h1>FAKTÚRA</h1>
                <div class="invoice-number">č. ${invoice.invoice_number || 'DRAFT'}</div>
            </div>
        </div>
        
        <!-- Parties -->
        <div class="parties">
            <div class="party">
                <div class="party-label">Dodávateľ</div>
                <div class="party-name">${this.companyInfo.name}</div>
                <div class="party-details">
                    ${this.companyInfo.address}<br>
                    ${this.companyInfo.city}<br>
                    ${this.companyInfo.country}<br><br>
                    IČO: ${this.companyInfo.ico}<br>
                    DIČ: ${this.companyInfo.dic}<br>
                    ${this.companyInfo.ic_dph ? `IČ DPH: ${this.companyInfo.ic_dph}` : ''}
                </div>
            </div>
            <div class="party">
                <div class="party-label">Odberateľ</div>
                <div class="party-name">${client.company_name || invoice.client_name || 'Klient'}</div>
                <div class="party-details">
                    ${client.address || invoice.client_address || ''}<br>
                    ${client.city || ''} ${client.postal_code || ''}<br>
                    ${client.country || 'Slovensko'}<br><br>
                    ${client.ico ? `IČO: ${client.ico}<br>` : ''}
                    ${client.dic ? `DIČ: ${client.dic}<br>` : ''}
                    ${client.ic_dph ? `IČ DPH: ${client.ic_dph}` : ''}
                </div>
            </div>
        </div>
        
        <!-- Invoice Info -->
        <div class="invoice-info">
            <div class="info-item">
                <span class="info-label">Dátum vystavenia</span>
                <span class="info-value">${issueDate}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Dátum dodania</span>
                <span class="info-value">${deliveryDate}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Dátum splatnosti</span>
                <span class="info-value">${dueDate}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Variabilný symbol</span>
                <span class="info-value">${invoice.variable_symbol || invoice.invoice_number?.replace(/\D/g, '') || '-'}</span>
            </div>
        </div>
        
        <!-- Items -->
        <table class="items-table">
            <thead>
                <tr>
                    <th style="width: 40%">Položka</th>
                    <th class="text-right" style="width: 15%">Množstvo</th>
                    <th class="text-right" style="width: 15%">Jedn. cena</th>
                    <th class="text-right" style="width: 15%">DPH</th>
                    <th class="text-right" style="width: 15%">Spolu</th>
                </tr>
            </thead>
            <tbody>
                ${items.length > 0 ? items.map(item => `
                    <tr>
                        <td>
                            <div class="item-name">${item.name || item.description || 'Služba'}</div>
                            ${item.description && item.name ? `<div class="item-desc">${item.description}</div>` : ''}
                        </td>
                        <td class="text-right">${item.quantity || 1} ${item.unit || 'ks'}</td>
                        <td class="text-right">${this.formatCurrency(item.unit_price || 0)}</td>
                        <td class="text-right">${vatRate}%</td>
                        <td class="text-right">${this.formatCurrency((item.quantity || 1) * (item.unit_price || 0))}</td>
                    </tr>
                `).join('') : `
                    <tr>
                        <td>
                            <div class="item-name">${invoice.description || 'Služby'}</div>
                        </td>
                        <td class="text-right">1 ks</td>
                        <td class="text-right">${this.formatCurrency(invoice.subtotal || invoice.total || 0)}</td>
                        <td class="text-right">${vatRate}%</td>
                        <td class="text-right">${this.formatCurrency(invoice.subtotal || invoice.total || 0)}</td>
                    </tr>
                `}
            </tbody>
        </table>
        
        <!-- Totals -->
        <div class="totals">
            <div class="totals-table">
                <div class="totals-row">
                    <span class="totals-label">Základ dane</span>
                    <span class="totals-value">${this.formatCurrency(invoice.subtotal || subtotal)}</span>
                </div>
                <div class="totals-row">
                    <span class="totals-label">DPH ${vatRate}%</span>
                    <span class="totals-value">${this.formatCurrency(invoice.vat_amount || vatAmount)}</span>
                </div>
                <div class="totals-row total">
                    <span class="totals-label">Celkom k úhrade</span>
                    <span class="totals-value">${this.formatCurrency(invoice.total || total)}</span>
                </div>
            </div>
        </div>
        
        <!-- Payment Info -->
        <div class="payment-info">
            <div class="payment-title">💳 Platobné údaje</div>
            <div class="payment-details">
                <div class="payment-item">
                    <span class="payment-label">Banka:</span>
                    <span class="payment-value">${this.companyInfo.bank}</span>
                </div>
                <div class="payment-item">
                    <span class="payment-label">IBAN:</span>
                    <span class="payment-value">${this.companyInfo.iban}</span>
                </div>
                <div class="payment-item">
                    <span class="payment-label">SWIFT:</span>
                    <span class="payment-value">${this.companyInfo.swift}</span>
                </div>
                <div class="payment-item">
                    <span class="payment-label">VS:</span>
                    <span class="payment-value">${invoice.variable_symbol || invoice.invoice_number?.replace(/\D/g, '') || '-'}</span>
                </div>
            </div>
        </div>
        
        ${invoice.notes ? `
            <div class="notes">
                <strong>Poznámka:</strong> ${invoice.notes}
            </div>
        ` : ''}
        
        <!-- Footer -->
        <div class="invoice-footer">
            <p>${this.companyInfo.name} | ${this.companyInfo.email} | ${this.companyInfo.phone} | ${this.companyInfo.web}</p>
            <p style="margin-top: 5px;">Ďakujeme za vašu dôveru!</p>
        </div>
    </div>
</body>
</html>
        `;
    },

    formatDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('sk-SK');
    },

    formatCurrency(amount) {
        return new Intl.NumberFormat('sk-SK', {
            style: 'currency',
            currency: 'EUR'
        }).format(amount || 0);
    },

    // Integrácia s BillingModule
    async printInvoice(invoiceId) {
        try {
            // Načítať faktúru
            const { data: invoice, error } = await Database.client
                .from('invoices')
                .select('*, client:clients(*)')
                .eq('id', invoiceId)
                .single();

            if (error) throw error;

            // Načítať položky
            const { data: items } = await Database.client
                .from('invoice_items')
                .select('*')
                .eq('invoice_id', invoiceId);

            invoice.items = items || [];

            // Načítať nastavenia firmy
            const { data: settings } = await Database.client
                .from('settings')
                .select('*')
                .eq('key', 'company_info')
                .single();

            // Generovať PDF
            await this.generateInvoicePDF(invoice, settings?.value);

            return true;

        } catch (error) {
            console.error('Print invoice error:', error);
            Utils.showNotification('Chyba pri generovaní PDF', 'error');
            return false;
        }
    }
};

// Export
window.PDFGenerator = PDFGenerator;

// Pridať do BillingModule
if (typeof BillingModule !== 'undefined') {
    BillingModule.printInvoice = async function(invoiceId) {
        return PDFGenerator.printInvoice(invoiceId);
    };
}
