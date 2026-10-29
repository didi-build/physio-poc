/** Program identity fields allowed in storage (no patient information). */
export type ProgramIdentity = {
  id: string;
  code: string;
  /** Optional non-identifying title chosen by the practitioner. */
  title: string | null;
};

/** CTO model: row params stored as JSON TEXT in SQL. */
export type ProgramParamsJson = string;

export type ProgramRecord = ProgramIdentity & {
  paramsJson: ProgramParamsJson;
};

export function isNonEmptyCode(code: string): boolean {
  return code.trim().length > 0;
}
