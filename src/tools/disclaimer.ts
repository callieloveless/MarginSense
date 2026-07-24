/**
 * The licensed-professional, non-authoritative disclaimer (constitution §5 "Tool safety", §7
 * "AI honesty & liability").
 *
 * Any tool that gives advice about **physical work** or **code compliance** attaches this to its
 * conversation message and shows it on its surface. It lives here, once, for a reason: the
 * product will expand to electrical and plumbing, where the gap between "an assistant looked at a
 * photo" and "a licensed professional inspected it" is the difference between a helpful tool and
 * a dangerous one. Wording that is copy-pasted per tool drifts, and the weakest copy becomes the
 * one a court reads.
 *
 * Consumers: Photo Advisor (#8b) and Code Finder (#9). The runner appends `message.disclaimer` to
 * the post it writes, so it lands in the durable record beside the advice it qualifies.
 */

/** The one disclaimer text for physical-work and code advice. */
export const PHYSICAL_WORK_DISCLAIMER =
  "MarginSense is not a substitute for a licensed professional's judgment or an official " +
  "inspection. This is assistive guidance from a photo, not an authoritative assessment — " +
  "verify anything structural, electrical, or safety-related on site before you rely on it.";
