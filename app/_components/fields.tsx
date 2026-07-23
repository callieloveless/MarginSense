"use client";

import type { ReactNode } from "react";

/**
 * Phone-first form field building blocks (constitution §1), shared by the onboarding wizard
 * and full settings. Money and percent inputs carry a visible unit affix; values are plain
 * human strings here — conversion to integer cents/bp happens on the server (§3.1). Each
 * renders a hidden input under its own `name` so controlled values submit with the form.
 */

export function Label({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium">
      {children}
    </label>
  );
}

export function MoneyInput({
  id,
  value,
  onChange,
  placeholder,
  className = "",
}: {
  id?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <div
      className={`flex items-center rounded-md border border-neutral-300 px-3 dark:border-neutral-700 dark:bg-neutral-900 ${className}`}
    >
      <span className="text-neutral-400">$</span>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder={placeholder}
        className="w-full min-w-0 bg-transparent py-2 pl-1 text-base outline-none"
      />
    </div>
  );
}

export function MoneyField(props: {
  name: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={props.name}>{props.label}</Label>
      {props.hint ? <p className="text-sm text-neutral-500">{props.hint}</p> : null}
      <MoneyInput id={props.name} value={props.value} onChange={props.onChange} placeholder={props.placeholder} />
      <input type="hidden" name={props.name} value={props.value} />
    </div>
  );
}

export function PercentField(props: {
  name: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={props.name}>{props.label}</Label>
      {props.hint ? <p className="text-sm text-neutral-500">{props.hint}</p> : null}
      <div className="flex items-center rounded-md border border-neutral-300 px-3 dark:border-neutral-700 dark:bg-neutral-900">
        <input
          id={props.name}
          name={props.name}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          inputMode="decimal"
          placeholder={props.placeholder}
          className="w-full min-w-0 bg-transparent py-2 text-base outline-none"
        />
        <span className="text-neutral-400">%</span>
      </div>
    </div>
  );
}

export function TextField(props: {
  name: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={props.name}>{props.label}</Label>
      {props.hint ? <p className="text-sm text-neutral-500">{props.hint}</p> : null}
      <input
        id={props.name}
        name={props.name}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
      />
    </div>
  );
}

export function NumberField(props: {
  name: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={props.name}>{props.label}</Label>
      {props.hint ? <p className="text-sm text-neutral-500">{props.hint}</p> : null}
      <input
        id={props.name}
        name={props.name}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        inputMode="numeric"
        placeholder={props.placeholder}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
      />
    </div>
  );
}
