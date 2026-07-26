"use client";

/**
 * The two-step guided new-job wizard (revamp-project-setup). Step 1 *Who & where*, step 2
 * *Money & schedule* — chips over typing, on the shell primitives. Values live in local state and
 * post to `createProjectAction` (which stamps the business id from the session); on success we land
 * on the new job. The margin/contingency captured here become the project's defaults that seed the
 * first estimate.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProjectAction } from "../actions";
import { SteppedProgress } from "@/app/_components/ui";
import { Label, PercentField, TextField, inputClassName } from "@/app/_components/fields";
import { CREW_SIZES, JOB_TYPES } from "@/app/_lib/job-vocab";

type Values = Record<string, string>;

export function NewJobWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [v, setV] = useState<Values>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, val: string) => setV((s) => ({ ...s, [k]: val }));
  const clientReady = (v.clientName ?? "").trim() !== "";

  const submit = async () => {
    setPending(true);
    setError(null);
    const fd = new FormData();
    for (const [k, val] of Object.entries(v)) fd.set(k, val);
    const res = await createProjectAction(fd);
    if (res.ok) {
      router.push(`/projects/${res.id}`);
    } else {
      setError(res.error);
      setPending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-muted">Step {step + 1} of 2</p>
        <div className="mt-1.5">
          <SteppedProgress step={step + 1} total={2} />
        </div>
        <h1 className="mt-3 text-xl font-bold tracking-tight text-ink">
          {step === 0 ? "Who & where" : "Money & schedule"}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {step === 0
            ? "The basics. The address sets which building code this job answers to."
            : "How this job should price, and who's on it. All optional — you can change it later."}
        </p>
      </div>

      {step === 0 ? (
        <div className="space-y-4">
          <TextField
            name="clientName"
            label="Client name"
            value={v.clientName ?? ""}
            onChange={(x) => set("clientName", x)}
            placeholder="Jane Whitmore"
          />
          <TextField
            name="address"
            label="Job address"
            hint="Sets the jurisdiction for code lookups on this job."
            value={v.address ?? ""}
            onChange={(x) => set("address", x)}
            placeholder="214 Alder St, Brookfield"
          />
          <Chips label="Job type" options={JOB_TYPES} value={v.jobType ?? ""} onPick={(x) => set("jobType", x)} />
          <div className="space-y-1">
            <Label htmlFor="scope">Scope note</Label>
            <textarea
              id="scope"
              rows={3}
              value={v.scope ?? ""}
              onChange={(e) => set("scope", e.target.value)}
              placeholder="Full gut — cabinets, quartz, tile backsplash, new electrical"
              className={inputClassName}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <PercentField
              name="targetMargin"
              label="Target margin"
              value={v.targetMargin ?? ""}
              onChange={(x) => set("targetMargin", x)}
              placeholder="30"
            />
            <PercentField
              name="contingency"
              label="Contingency"
              value={v.contingency ?? ""}
              onChange={(x) => set("contingency", x)}
              placeholder="10"
            />
          </div>
          <Chips label="Crew on this job" options={CREW_SIZES} value={v.crewSize ?? ""} onPick={(x) => set("crewSize", x)} />
          <TextField
            name="startWindow"
            label="Start window"
            value={v.startWindow ?? ""}
            onChange={(x) => set("startWindow", x)}
            placeholder="Week of Oct 13"
          />
          <div className="rounded-xl bg-brand-soft px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-brand">Auto-run on this job</div>
            <p className="mt-1.5 text-sm leading-relaxed text-brand">
              A photo you add gets checked against local building code automatically. You confirm
              every result before it touches an estimate — nothing changes on its own.
            </p>
          </div>
          <p className="text-xs text-muted">
            Margin &amp; contingency here become this job&apos;s defaults — they start each new
            estimate and can be changed on the estimate itself. Left blank, they use your business
            defaults from Settings.
          </p>
        </div>
      )}

      {error ? <p className="text-sm text-danger-fg">{error}</p> : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => (step > 0 ? setStep(0) : router.push("/projects"))}
          className="flex-1 rounded-xl border border-line px-3 py-3 text-base font-semibold text-ink"
        >
          Back
        </button>
        {step === 0 ? (
          <button
            type="button"
            onClick={() => setStep(1)}
            disabled={!clientReady}
            className="flex-1 rounded-xl bg-brand px-3 py-3 text-base font-semibold text-brand-ink disabled:opacity-50"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={pending || !clientReady}
            className="flex-1 rounded-xl bg-brand px-3 py-3 text-base font-semibold text-brand-ink disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create job"}
          </button>
        )}
      </div>
    </div>
  );
}

/** A row of single-select chips (tap a selected chip to clear it). */
function Chips({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: string[];
  value: string;
  onPick: (val: string) => void;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value === o;
          return (
            <button
              key={o}
              type="button"
              onClick={() => onPick(on ? "" : o)}
              aria-pressed={on}
              className={`min-h-[44px] rounded-full border px-4 text-sm font-medium ${
                on
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-line bg-surface text-ink-soft"
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
