export type BillingInfo = {
    firstPaymentMonth: number;
    firstPaymentYear: number;
    installmentAmount: number;
};

export function calculateFirstPaymentMonth(purchaseDate: Date, cutDay: number, dueDay: number): { month: number; year: number } {
    const day = purchaseDate.getDate();
    const month = purchaseDate.getMonth();
    const year = purchaseDate.getFullYear();

    // Si la compra se hizo DESPUÉS del día de corte, el ciclo de facturación
    // ya cerró para este mes, por lo que el corte que aplica es el del mes siguiente.
    let cutMonth = month;
    let cutYear = year;
    if (day > cutDay) {
        cutMonth = month + 1;
        if (cutMonth > 11) {
            cutMonth = 0;
            cutYear = year + 1;
        }
    }
    const cutDate = new Date(cutYear, cutMonth, cutDay);

    // El primer pago vence el primer dueDay estrictamente DESPUÉS del corte.
    // Si dueDay cae en el mismo mes que cutDate pero ANTES del cutDay,
    // el pago real es el siguiente mes.
    let dueDate = new Date(cutDate.getFullYear(), cutDate.getMonth(), dueDay);
    if (dueDate <= cutDate) {
        dueDate = new Date(cutDate.getFullYear(), cutDate.getMonth() + 1, dueDay);
    }

    return {
        month: dueDate.getMonth(),
        year: dueDate.getFullYear()
    };
}

/**
 * Calcula cuánto se debe pagar en un mes específico por una transacción.
 */
export function getAmountDueForMonth(tx: any, card: { cutDay: number, dueDay: number }, targetMonth: number, targetYear: number): number {
    if (tx.type !== 'expense') return 0;
    
    const match = tx.description?.match(/\[CUOTAS:(\d+)(?::RATE:([\d.]+))?\]/);
    const txDate = new Date(tx.date);
    const { month: startMonth, year: startYear } = calculateFirstPaymentMonth(txDate, card.cutDay, card.dueDay);
    
    const installments = match ? parseInt(match[1], 10) : 1;
    const ea = match ? (parseFloat(match[2] || '0') / 100) : 0;
    
    let monthlyAmt = tx.amount;
    if (installments > 1) {
        if (ea > 0) {
            const mv = Math.pow(1 + ea, 1/12) - 1;
            monthlyAmt = (tx.amount * mv) / (1 - Math.pow(1 + mv, -installments));
        } else {
            monthlyAmt = tx.amount / installments;
        }
    }

    // Calcular cuántos meses han pasado desde el primer pago hasta el mes objetivo
    const monthsDiff = (targetYear - startYear) * 12 + (targetMonth - startMonth);
    
    if (monthsDiff >= 0 && monthsDiff < installments) {
        return monthlyAmt;
    }
    
    return 0;
}

/**
 * Retorna la descripción limpia sin los tags de cuotas
 */
export function getCleanDescription(desc: string): string {
    return desc.replace(/\[CUOTAS:\d+(?::RATE:[\d.]+)?\]\s*/, '');
}

/**
 * Retorna el número de cuota actual en un mes específico
 */
export function getCurrentInstallmentNumber(tx: any, card: { cutDay: number, dueDay: number }, targetMonth: number, targetYear: number): number | null {
    const match = tx.description?.match(/\[CUOTAS:(\d+)/);
    if (!match) return null;
    
    const total = parseInt(match[1], 10);
    const txDate = new Date(tx.date);
    const { month: startMonth, year: startYear } = calculateFirstPaymentMonth(txDate, card.cutDay, card.dueDay);
    
    const monthsDiff = (targetYear - startYear) * 12 + (targetMonth - startMonth);
    
    if (monthsDiff >= 0 && monthsDiff < total) {
        return monthsDiff + 1;
    }
    return null;
}
