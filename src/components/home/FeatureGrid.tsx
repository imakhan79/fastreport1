"use client";

import { motion } from "framer-motion";
import {
  Brain,
  PaintBrush,
  Database,
  Paperclip,
  SealCheck,
  UsersThree,
  type Icon,
} from "@phosphor-icons/react";

type Feature = { icon: Icon; title: string; description: string };

const FEATURES: Feature[] = [
  {
    icon: Brain,
    title: "AI Orchestrator",
    description:
      "Reads a plain-language request and decides exactly what design, query, and attachment work is actually required.",
  },
  {
    icon: PaintBrush,
    title: "Automatic Design",
    description:
      "Generates the full layout, KPIs, and charts, then runs its own QA pass and self-corrects before anyone sees it.",
  },
  {
    icon: Database,
    title: "Automatic Query",
    description:
      "Writes schema-aware SQL, validates it for safety and syntax, and executes it in a read-only transaction.",
  },
  {
    icon: Paperclip,
    title: "Automatic Attachments",
    description:
      "Requests missing documents, classifies whatever gets uploaded, and matches it against the requirement.",
  },
  {
    icon: SealCheck,
    title: "Confidence-Gated Approval",
    description:
      "Every automated decision carries a confidence score. Only the uncertain ones ever reach a human.",
  },
  {
    icon: UsersThree,
    title: "Human Review, When It Matters",
    description:
      "A dedicated dashboard surfaces exactly what needs a decision — nothing more, nothing less.",
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const card = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
};

export default function FeatureGrid() {
  return (
    <section id="features" className="px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Everything the spec demanded. Nothing you have to click.
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          Design, Query, and Attachment tasks are never created by hand &mdash; they&apos;re
          detected, generated, and resolved automatically.
        </p>
      </div>

      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-100px" }}
        className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        {FEATURES.map((feature) => (
          <motion.div
            key={feature.title}
            variants={card}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl border border-[var(--color-border)] bg-card/70 p-6 backdrop-blur transition-shadow hover:shadow-lg hover:shadow-primary/5"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-primary">
              <feature.icon size={22} weight="bold" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-base font-semibold text-foreground">{feature.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
