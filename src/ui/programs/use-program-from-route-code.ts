import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { ProgramBuilderView } from "../../services/programs/types.js";
import { useProgramsApi } from "../api/programs-context.js";

export function useProgramFromRouteCode(): {
  programCode: string;
  program: ProgramBuilderView | null;
  loading: boolean;
  loadFailed: boolean;
  reload: () => void;
} {
  const { programCode = "" } = useParams();
  const client = useProgramsApi();
  const [program, setProgram] = useState<ProgramBuilderView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const reload = useCallback(() => {
    if (programCode.trim().length === 0) {
      setProgram(null);
      setLoading(false);
      setLoadFailed(true);
      return;
    }
    setLoading(true);
    setLoadFailed(false);
    void client
      .getProgramByCode(programCode)
      .then(setProgram)
      .catch(() => {
        setProgram(null);
        setLoadFailed(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [client, programCode]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { programCode, program, loading, loadFailed, reload };
}
