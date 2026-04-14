import ExcelJS from 'exceljs';
import { PRODUCTION_LABELS } from '../constants/productions';
import type { AllocationItem } from '../types';

interface PilotDayItem extends AllocationItem {
    date: Date;
}

export async function generatePilotWorkbook(
    pilotName: string,
    items: PilotDayItem[],
    totalWorkdays: number
): Promise<ArrayBuffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Motor de Planejamento';
    wb.created = new Date();

    // Sort items by date
    const sortedItems = [...items].sort((a, b) => a.date.getTime() - b.date.getTime());
    const totalItems = sortedItems.length;
    // Prevent zero rows in formulas
    const lr = Math.max(2, totalItems + 1);

    // ── Aba 1: Visão do Mês ──────────────────────────────────────────────
    const ws1 = wb.addWorksheet('Visão do Mês');
    ws1.columns = [
        { header: 'Data', key: 'data', width: 14 },
        { header: 'Cliente', key: 'cliente', width: 25 },
        { header: 'Tipo', key: 'tipo', width: 35 },
        { header: 'UP', key: 'up', width: 10 },
        { header: 'Status', key: 'status', width: 15 }
    ];

    ws1.getRow(1).font = { bold: true };
    ws1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };

    sortedItems.forEach(item => {
        const row = ws1.addRow({
            data: item.date,
            cliente: item.client,
            tipo: PRODUCTION_LABELS[item.type] || item.type,
            up: item.up,
            status: 'Pendente'
        });

        row.getCell('data').numFmt = 'dd/mm/yyyy';

        // Data Validation
        row.getCell('status').dataValidation = {
            type: 'list',
            allowBlank: false,
            formulae: ['"Pendente,Feito,Atrasado"'],
            showErrorMessage: true,
            errorStyle: 'error',
            errorTitle: 'Status Inválido',
            error: 'Escolha: Pendente, Feito ou Atrasado'
        };
    });

    // Conditional Formatting rule (needs ExcelJS formula context)
    // @ts-ignore - Priority missing from type definitions
    ws1.addConditionalFormatting({
        ref: `A2:E${lr}`,
        rules: [
            {
                type: 'expression',
                priority: 1,
                formulae: ['=$E2="Feito"'],
                style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFE2EFDA' } } }
            },
            {
                type: 'expression',
                priority: 2,
                formulae: ['=$E2="Atrasado"'],
                style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } } }
            }
        ]
    });

    // ── Aba 2: Painel do Pilot ───────────────────────────────────────────
    const ws2 = wb.addWorksheet('Painel do Pilot');
    ws2.columns = [
        { header: '', width: 3 }, // Spacer
        { header: 'Métrica', width: 32 },
        { header: 'Valor', width: 15 }
    ];

    ws2.getCell('B2').value = `Painel: ${pilotName}`;
    ws2.getCell('B2').font = { bold: true };

    ws2.getCell('B4').value = 'UPs planejadas por dia';
    ws2.getCell('C4').value = {
        formula: `IF(${totalWorkdays}=0, 0, SUM('Visão do Mês'!D2:D${lr})/${totalWorkdays})`,
        result: 0, date1904: false
    };
    ws2.getCell('C4').numFmt = '0.00';

    ws2.getCell('B5').value = 'UPs entregues por dia';
    ws2.getCell('C5').value = {
        formula: `IF(${totalWorkdays}=0, 0, SUMIF('Visão do Mês'!E2:E${lr}, "Feito", 'Visão do Mês'!D2:D${lr})/${totalWorkdays})`,
        result: 0, date1904: false
    };
    ws2.getCell('C5').numFmt = '0.00';

    // Write and return
    const buffer = await wb.xlsx.writeBuffer();
    return buffer;
}
