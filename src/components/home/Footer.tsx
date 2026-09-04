import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-[var(--color-border)] px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <span className="text-sm font-semibold text-foreground">FastReport</span>
        <div className="flex gap-6 text-sm text-muted-foreground">
          <Link href="/reports/new" className="hover:text-foreground">
            New report
          </Link>
          <Link href="/tasks" className="hover:text-foreground">
            Review dashboard
          </Link>
        </div>
        <span className="text-xs text-muted-foreground">Autonomous reporting platform</span>
      </div>
    </footer>
  );
}
