export const REQUEST_WITHDRAWN_EVENT = "physio_request_withdrawn";

export type RequestWithdrawnLogPayload = {
  event: typeof REQUEST_WITHDRAWN_EVENT;
  request_id: string;
  practitioner_id: string;
  requester_practitioner_id: string;
  previous_status: string;
};

export function logRequestWithdrawn(input: {
  requestId: string;
  practitionerId: string;
  requesterPractitionerId: string;
  previousStatus: string;
}): void {
  const payload: RequestWithdrawnLogPayload = {
    event: REQUEST_WITHDRAWN_EVENT,
    request_id: input.requestId,
    practitioner_id: input.practitionerId,
    requester_practitioner_id: input.requesterPractitionerId,
    previous_status: input.previousStatus,
  };
  console.log(JSON.stringify(payload));
}
