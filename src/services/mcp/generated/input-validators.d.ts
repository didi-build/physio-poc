export type StandaloneValidateFunction = ((data: unknown) => boolean) & {
  errors?: Array<{ message?: string }> | null;
};

export declare const search_approved_exercises: StandaloneValidateFunction;
export declare const search_routines: StandaloneValidateFunction;
export declare const build_or_edit_program: StandaloneValidateFunction;
export declare const get_program_share_link_or_pdf: StandaloneValidateFunction;
