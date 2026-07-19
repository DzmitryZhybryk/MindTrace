/*
 * Классы Styles API для полей auth-форм на тёмном стекле (стили — в `auth-card.css`).
 *
 * Стилизовать инпуты приходится через `classNames`, а НЕ селекторами вида
 * `.mantine-Input-input`: Mantine 9 вешает стабильное статическое имя только на
 * обёртку (`mantine-Input-wrapper`), остальные узлы получают хешированные классы.
 * Свой класс — единственная версионно-устойчивая зацепка за само поле ввода.
 */

export const authInputClassNames = { input: "auth-input", label: "auth-label" };

/** То же для PasswordInput: настоящее поле вложено внутрь обёртки-«инпута». */
export const authPasswordClassNames = {
  ...authInputClassNames,
  innerInput: "auth-input__inner",
  section: "auth-input__section",
};

/** Чекбоксы: коробка (`input` — настоящий `<input>`) и галочка (`icon` — его сосед). */
export const authCheckboxClassNames = {
  input: "auth-checkbox",
  icon: "auth-checkbox__icon",
  label: "auth-label--checkbox",
};
