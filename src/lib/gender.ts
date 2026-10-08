// Правильні відмінки залежно від статі учня ("M" — хлопець, "F" — дівчина).
// Якщо стать не вказана — використовуємо чоловічу форму (як було раніше).
export type Gender = "M" | "F" | null | undefined | string;

export function byGender(gender: Gender, male: string, female: string): string {
  return gender === "F" ? female : male;
}

// «Учень» / «Учениця»
export function studentWord(gender: Gender): string {
  return byGender(gender, "Учень", "Учениця");
}

// Рядок у нотатку, коли учень не прийшов, але урок оплачується
export function noShowPaidNote(gender: Gender): string {
  return byGender(gender, "Не з'явився, урок оплачується", "Не з'явилась, урок оплачується");
}
