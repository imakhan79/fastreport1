"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "@phosphor-icons/react";

export default function CtaSection() {
  return (
    <section className="px-6 pb-24 sm:pb-32">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-accent px-8 py-16 text-center sm:px-16"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, white 0%, transparent 40%), radial-gradient(circle at 80% 80%, white 0%, transparent 40%)",
          }}
          aria-hidden="true"
        />
        <h2 className="relative text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Stop building reports by hand.
        </h2>
        <p className="relative mx-auto mt-4 max-w-xl text-white/85">
          Describe what you need once. Let the pipeline handle design, data, and approval.
        </p>
        <Link
          href="/reports/new"
          className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-primary shadow-lg transition-transform hover:scale-[1.03] active:scale-[0.98]"
        >
          Start a request
          <ArrowRight size={18} weight="bold" />
        </Link>
      </motion.div>
    </section>
  );
}
