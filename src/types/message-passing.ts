// eslint-disable-next-line @typescript-eslint/no-namespace, @typescript-eslint/no-unused-vars
namespace message_pass {
  export type MessageType =
    | "event_data"
    | "reverse_pgn_request"
    | "reverse_pgn_response"
    | "request_tb_eval"
    | "onload"
    | "tab_update"
    | "response_tb_standard"
    | "response_tb_mainline"
    | "remove_query"
    | "response_interceptor";

  export type message =
    | EventData
    | PGNResponse
    | OnloadEvent
    | GetPGN
    | RequestTB
    | TabUpdate
    | TBResponseStandard
    | TBResponseMainline
    | RemoveTabQuery
    | DebugMessage;

  type RuntimeMessageBuilder<
    T extends MessageType,
    P extends object | null = null
  > = {
    type: T;
    payload: P;
  };

  type EventData = RuntimeMessageBuilder<
    "event_data",
    {
      eventName: string;
      gameNumber: number;
    }
  >;

  type PGNResponse = RuntimeMessageBuilder<
    "reverse_pgn_response",
    {
      pgn: string[] | null;
      gameNumber: number;
      reverseGameNumber: number;
      eventId: string;
    }
  >;

  type GetPGN = RuntimeMessageBuilder<
    "reverse_pgn_request",
    {
      gameNumber: number;
      event: string;
    }
  >;

  type OnloadEvent = RuntimeMessageBuilder<"onload", null>;

  type RequestTB = RuntimeMessageBuilder<
    "request_tb_eval",
    {
      fen: string;
      currentPly: number;
    }
  >;

  type TabUpdate = RuntimeMessageBuilder<
    "tab_update",
    {
      event: string | null;
      game: number | null;
    }
  >;

  type TBResponseStandard = RuntimeMessageBuilder<
    "response_tb_standard",
    {
      response: lila.standard_response;
      ply: number;
    }
  >;

  type TBResponseMainline = RuntimeMessageBuilder<
    "response_tb_mainline",
    {
      response: lila.mainline_response;
      ply: number;
    }
  >;

  type RemoveTabQuery = RuntimeMessageBuilder<"remove_query", null>;

  type DebugMessage = RuntimeMessageBuilder<
    "response_interceptor",
    {
      details: chrome.webRequest.WebResponseCacheDetails;
    }
  >;
}
