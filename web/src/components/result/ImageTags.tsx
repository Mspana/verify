// Pill row for the `imageTags` field. Kept visually quiet so it reads
// as a subtitle to the analysis section rather than interactive chips.

type Props = {
  tags: string[];
};

export function ImageTags({ tags }: Props) {
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {tags.map((t) => (
        <li
          key={t}
          className="rounded-btn bg-paper-alt px-2 py-1 text-xs text-ink/55"
        >
          {t}
        </li>
      ))}
    </ul>
  );
}
