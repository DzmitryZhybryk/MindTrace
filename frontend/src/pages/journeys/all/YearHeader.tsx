interface YearHeaderProps {
  id: string;
  year: number;
}

/** Заголовок года в ленте; прилипает к верху, пока его поездки на экране. */
export function YearHeader({ id, year }: YearHeaderProps) {
  return (
    <h2 id={id} className="year-header">
      {year}
    </h2>
  );
}
