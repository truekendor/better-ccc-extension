// eslint-disable-next-line @typescript-eslint/no-namespace, @typescript-eslint/no-unused-vars
namespace message_pass {
  type BgToContentMessageTypes =
    | "tab_update"
    | "reverse_pgn_response"
    | "response_interceptor"
    | "full_event_response-wss"
    | "full_event_response-https";

  type ContentToBgMessageTypes =
    | "event_data"
    | "reverse_pgn_request"
    | "request_tb_eval"
    | "onload"
    | "response_tb_standard"
    | "response_tb_mainline"
    | "remove_query"
    // todo remove
    | "_dev_disconnect_socket";

  type RuntimeMessageBuilder<
    T extends BgToContentMessageTypes | ContentToBgMessageTypes,
    P extends object | null = null
  > = {
    type: T;
    payload: P;
  };

  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace ContentToBg {
    export type message =
      | EventData
      | OnloadEvent
      | GetPGN
      | RequestTB
      | TBResponseStandard
      | TBResponseMainline
      | RemoveTabQuery
      | DisconnectSocket;

    type DisconnectSocket = RuntimeMessageBuilder<
      "_dev_disconnect_socket",
      null
    >;

    type EventData = RuntimeMessageBuilder<
      "event_data",
      {
        eventName: string;
        gameNumber: number;
      }
    >;

    type GetPGN = RuntimeMessageBuilder<
      "reverse_pgn_request",
      {
        gameNumber: number;
        event: string;
      }
    >;

    type OnloadEvent = RuntimeMessageBuilder<
      "onload",
      {
        doRequest: boolean;
      }
    >;

    type RequestTB = RuntimeMessageBuilder<
      "request_tb_eval",
      {
        fen: string;
        currentPly: number;
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
  }

  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace BgToContent {
    export type message =
      | PGNResponse
      | TabUpdate
      | WebsocketEventFullUpdate
      | DebugMessage
      | FullEventResponseHTTPS;

    type WebsocketEventFullUpdate = RuntimeMessageBuilder<
      "full_event_response-wss",
      chess_com.full_event_response
    >;

    type FullEventResponseHTTPS = RuntimeMessageBuilder<
      "full_event_response-https",
      chess_com.full_event_response
    >;

    type TabUpdate = RuntimeMessageBuilder<
      "tab_update",
      {
        event: string | null;
        game: number | null;
      }
    >;

    type DebugMessage = RuntimeMessageBuilder<
      "response_interceptor",
      {
        details: chrome.webRequest.WebResponseCacheDetails;
      }
    >;

    type PGNResponse = RuntimeMessageBuilder<
      "reverse_pgn_response",
      {
        pgn: string[] | null;
        gameNumber: number;
        reverseGameNumber: number;
        // unused
        // todo delete?
        eventId: string;
      }
    >;
  }
}
