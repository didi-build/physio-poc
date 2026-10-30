import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import { useProgramsApi } from "../api/programs-context.js";
import { NewProgramSheet } from "./NewProgramSheet.js";

export function ProgramsNewPage() {
  const client = useProgramsApi();
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);

  const close = () => {
    setOpen(false);
    navigate(fillPhysioAppRoutePattern("programs"), { replace: true });
  };

  return (
    <NewProgramSheet
      open={open}
      onClose={close}
      onFromScratch={() => {
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
          .catch(close);
      }}
    />
  );
}
