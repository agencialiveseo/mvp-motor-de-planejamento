/**
 * Retorna todos os dias úteis (segunda a sexta) de um dado mês/ano.
 * Feriados não são considerados no MVP.
 */
export function getWorkdays(year: number, month: number): Date[] {
  const workdays: Date[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dow = date.getDay(); // 0=Dom, 6=Sáb
    if (dow !== 0 && dow !== 6) {
      workdays.push(date);
    }
  }

  return workdays;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function formatDayWeek(date: Date): string {
  return date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' });
}

export const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
