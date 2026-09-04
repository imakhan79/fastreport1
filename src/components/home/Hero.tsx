"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CheckCircle } from "@phosphor-icons/react";

const TRUST_ITEMS = ["Design", "Query", "Attachments", "Approval", "Export"];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
};

export default function Hero() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative isolate overflow-hidden px-6 pt-20 pb-28 sm:pt-28 sm:pb-36">
      <AnimatedBackground reduceMotion={!!reduceMotion} />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="mx-auto flex max-w-3xl flex-col items-center text-center"
      >
        <motion.span
          variants={item}
          className="rounded-full border border-[var(--color-border)] bg-card/70 px-4 py-1.5 text-xs font-semibold tracking-wide text-primary backdrop-blur"
        >
          AUTONOMOUS REPORTING PLATFORM
        </motion.span>

        <motion.h1
          variants={item}
          className="mt-6 text-4xl font-bold tracking-tight text-foreground sm:text-6xl"
        >
          Reports that build
          <br />
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            themselves.
          </span>
        </motion.h1>

        <motion.p variants={item} className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Describe what you need in plain language. DataReportQ&apos;s AI orchestrator
          plans the design, writes the SQL, chases down attachments, and routes only
          the uncertain calls to a human &mdash; straight through to a downloadable
          PDF and Excel file.
        </motion.p>

        <motion.div variants={item} className="mt-10 flex flex-col gap-4 sm:flex-row">
          <Link
            href="/reports/new"
            className="group flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-on-primary shadow-lg shadow-primary/25 transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            Try a report request
            <ArrowRight size={18} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/tasks"
            className="flex items-center justify-center rounded-full border border-[var(--color-border)] bg-card/60 px-7 py-3.5 text-sm font-semibold text-foreground backdrop-blur transition-colors hover:bg-card"
          >
            Open review dashboard
          </Link>
        </motion.div>

        <motion.ul variants={item} className="mt-14 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {TRUST_ITEMS.map((label, i) => (
            <motion.li
              key={label}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.9 + i * 0.1, duration: 0.4 }}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
            >
              <CheckCircle size={16} weight="fill" className="text-primary" aria-hidden="true" />
              {label}
            </motion.li>
          ))}
        </motion.ul>
      </motion.div>
    </section>
  );
}

function AnimatedBackground({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <motion.div
        className="absolute -top-32 left-1/4 h-[28rem] w-[28rem] rounded-full bg-primary/25 blur-3xl"
        animate={
          reduceMotion
            ? undefined
            : { x: [0, 40, -20, 0], y: [0, 30, -10, 0] }
        }
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-1/3 right-1/4 h-[24rem] w-[24rem] rounded-full bg-accent/20 blur-3xl"
        animate={
          reduceMotion
            ? undefined
            : { x: [0, -30, 20, 0], y: [0, -20, 20, 0] }
        }
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,transparent_0%,var(--color-background)_75%)]" />
    </div>
  );
}
