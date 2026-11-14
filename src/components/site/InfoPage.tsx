import type { ReactNode } from "react";

export function InfoPage({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <p className="text-xs tracking-brand text-silver">{eyebrow}</p>
      <h1 className="mt-3 font-serif text-5xl font-semibold italic">{title}</h1>
      <div className="mt-8 space-y-5 leading-relaxed text-muted-foreground [&_h2]:mt-8 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:text-foreground">
        {children}
      </div>
    </div>
  );
}

export const meta = (title: string, description: string) => ({
  meta: [
    { title: `${title} | CAVENHURST` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} | CAVENHURST` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ],
});
