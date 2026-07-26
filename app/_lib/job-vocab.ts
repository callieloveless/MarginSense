/**
 * The chip vocabularies a job is described with — shared by the new-job wizard (which captures them)
 * and the hub sub-line (which renders them), so the two can't drift. Plain string lists to match the
 * wizard's `Chips` inputs; the solo-crew value is singled out so prose reads "Just me", not
 * "Just me crew".
 */

export const JOB_TYPES: string[] = ["Kitchen", "Bath", "Addition", "Deck", "Whole house", "Repair"];
export const CREW_SIZES: string[] = ["Just me", "2", "3", "4+"];

/** The crew-size option that means one person — rendered verbatim rather than "… crew". */
export const SOLO_CREW = "Just me";

/** How a crew size reads in a sentence: the solo option as-is, any team size as "N crew". */
export function crewLabel(crewSize: string): string {
  return crewSize === SOLO_CREW ? SOLO_CREW : `${crewSize} crew`;
}
