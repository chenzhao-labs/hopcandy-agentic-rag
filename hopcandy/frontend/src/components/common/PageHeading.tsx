export function PageHeading({ eyebrow, title, description }: { eyebrow?: string; title: string; description: string }) {
  return (
    <header className="page-heading">
      {eyebrow && <span>{eyebrow}</span>}
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}
