import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import { useProgramsApi } from "../api/programs-context.js";
import { NewProgramSheet } from "./NewProgramSheet.js";
import { ProgramsListErrorSlot } from "./ProgramsStates.js";

export function ProgramsNewPage() {
  const client = useProgramsApi();
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const [createFailed, setCreateFailed] = useState(false);

  const close = () => {
    setOpen(false);
    navigate(fillPhysioAppRoutePattern("programs"), { replace: true });
  };

  return (
    <section className="pg-page ex-page">
      {createFailed ? <ProgramsListErrorSlot /> : null}
      <NewProgramSheet
        open={open}
        onClose={close}
        onFromScratch={() => {
          setCreateFailed(false);
          const programId = crypto.randomUUID();
          void client
            .createProgram({ program_id: programId })
            .then((result) => {
              navigate(
                fillPhysioAppRoutePattern("programBuilder", {
                  programCode: result.program.code,
                }),
                { replace: true },
              );
            })
            .catch(() => {
              setCreateFailed(true);
            });
        }}
      />
    </section>
  );
}
