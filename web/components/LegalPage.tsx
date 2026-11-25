import PageHeader from "./PageHeader";

export const EFFECTIVE_DATE = "November 25, 2026";

/** Shared layout for Privacy / Terms / About. */
export default function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <PageHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 text-slate-300">
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        <div className="mt-4 space-y-4 text-sm leading-relaxed [&_a]:text-emerald-400 [&_a:hover]:underline [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white [&_li]:ml-4 [&_li]:list-disc [&_ul]:space-y-1">
          {children}
        </div>
      </main>
    </>
  );
}
