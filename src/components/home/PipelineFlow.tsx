"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  Brain,
  PaintBrush,
  Database,
  Paperclip,
  SealCheck,
  FileArrowDown,
  type Icon,
} from "@phosphor-icons/react";

type Stage = { icon: Icon; label: string; description: string };

const PARALLEL_STAGES: Stage[] = [
  { icon: PaintBrush, label: "Design", description: "Layout, charts & KPIs" },
  { icon: Database, label: "Query", description: "Schema-aware SQL" },
  { icon: Paperclip, label: "Attachments", description: "Requested & classified" },
];

const nodeVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.94 },
  show: { opacity: 1, y: 0, scale: 1 },
};

export default function PipelineFlow() {
  const reduceMotion = useReducedMotion();

  return (
    <section id="pipeline" className="px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          One request. Six automated stages.
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          Only the stages a request actually needs run &mdash; and only a low-confidence
          decision ever reaches the human review dashboard.
        </p>
      </div>

      <div className="mx-auto mt-16 flex max-w-3xl flex-col items-center">
        <StageNode icon={Brain} label="Orchestrator" description="Understands the request" primary />

        <Connector reduceMotion={!!reduceMotion} />

        <div className="relative w-full">
          <div
            className="absolute top-0 left-[16.67%] right-[16.67%] hidden h-px bg-[var(--color-border)] sm:block"
            aria-hidden="true"
          />
          <div className="grid grid-cols-1 gap-6 pt-0 sm:grid-cols-3 sm:gap-4 sm:pt-6">
            {PARALLEL_STAGES.map((stage, i) => (
              <div key={stage.label} className="flex flex-col items-center">
                <div className="mb-4 hidden h-6 w-px bg-[var(--color-border)] sm:block" aria-hidden="true" />
                <StageNode {...stage} delay={i * 0.1} />
              </div>
            ))}
          </div>
        </div>

        <Connector reduceMotion={!!reduceMotion} />

        <StageNode icon={SealCheck} label="Confidence Gate" description="Auto-approve or escalate" />

        <Connector reduceMotion={!!reduceMotion} />

        <StageNode icon={FileArrowDown} label="Generate & Distribute" description="PDF, Excel, email" primary />
      </div>
    </section>
  );
}

function StageNode({
  icon: IconComponent,
  label,
  description,
  primary,
  delay = 0,
}: Stage & { primary?: boolean; delay?: number }) {
  return (
    <motion.div
      variants={nodeVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`flex w-full max-w-[15rem] items-center gap-3 rounded-2xl border px-5 py-4 backdrop-blur ${
        primary
          ? "border-primary/30 bg-primary/5"
          : "border-[var(--color-border)] bg-card/70"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          primary ? "bg-primary text-on-primary" : "bg-muted text-primary"
        }`}
      >
        <IconComponent size={20} weight="bold" aria-hidden="true" />
      </span>
      <span className="text-left">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </motion.div>
  );
}

function Connector({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div className="relative h-10 w-px bg-[var(--color-border)]" aria-hidden="true">
      {!reduceMotion && (
        <motion.span
          className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]"
          animate={{ top: ["0%", "90%"] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
    </div>
  );
}
