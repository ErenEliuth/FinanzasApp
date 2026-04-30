export type BillingInfo = {
    firstPaymentMonth: number;
    firstPaymentYear: number;
    installmentAmount: number;
};

export function calculateFirstPaymentMonth(purchaseDate: Date, cutDay: number, dueDay: number): { month: number; year: number } {
    const day = purchaseDate.getDate();
    const month = purchaseDate.getMonth();
    const year = purchaseDate.getFullYear();

    // Determinar la fecha de corte exacta de esta compra
    let cutDate = new Date(year, month, cutDay);
    if (day > cutDay) {
        cutDate = new Date(year, month + 1, cutDay);
    }

    // Determinar la fecha de pago exacta (el primer dueDay después del cutDate)
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
