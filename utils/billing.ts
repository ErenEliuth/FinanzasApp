export type BillingInfo = {
    firstPaymentMonth: number;
    firstPaymentYear: number;
    installmentAmount: number;
};

/**
 * Calcula en qué mes cae el primer pago de una compra con tarjeta de crédito
 * basándose en el día de corte y el día de pago.
 */
export function calculateFirstPaymentMonth(purchaseDate: Date, cutDay: number): { month: number; year: number } {
    const day = purchaseDate.getDate();
    const month = purchaseDate.getMonth();
    const year = purchaseDate.getFullYear();

    // Si el día de compra es DESPUÉS del corte, entra en el siguiente ciclo de facturación
    // y se paga 2 meses después de la compra (aprox).
    // Si es ANTES o IGUAL al corte, se paga el mes siguiente.
    
    // Ejemplo: Compra 10 Abril, Corte 20 Abril -> Pago 4 Mayo (Mes + 1)
    // Ejemplo: Compra 24 Abril, Corte 20 Abril -> Pago 4 Junio (Mes + 2)
    
    const offset = day > cutDay ? 2 : 1;
    const targetDate = new Date(year, month + offset, 1);
    
    return {
        month: targetDate.getMonth(),
        year: targetDate.getFullYear()
    };
}

/**
 * Calcula cuánto se debe pagar en un mes específico por una transacción.
 */
export function getAmountDueForMonth(tx: any, card: { cutDay: number }, targetMonth: number, targetYear: number): number {
    if (tx.type !== 'expense') return 0;
    
    const match = tx.description?.match(/\[CUOTAS:(\d+)(?::RATE:([\d.]+))?\]/);
    const txDate = new Date(tx.date);
    const { month: startMonth, year: startYear } = calculateFirstPaymentMonth(txDate, card.cutDay);
    
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
export function getCurrentInstallmentNumber(tx: any, card: { cutDay: number }, targetMonth: number, targetYear: number): number | null {
    const match = tx.description?.match(/\[CUOTAS:(\d+)/);
    if (!match) return null;
    
    const total = parseInt(match[1], 10);
    const txDate = new Date(tx.date);
    const { month: startMonth, year: startYear } = calculateFirstPaymentMonth(txDate, card.cutDay);
    
    const monthsDiff = (targetYear - startYear) * 12 + (targetMonth - startMonth);
    
    if (monthsDiff >= 0 && monthsDiff < total) {
        return monthsDiff + 1;
    }
    return null;
}
