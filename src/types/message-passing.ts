// * ===================
// * message passing types
namespace message_pass {
  export type MessageType =
    | "event_data"
    | "reverse_pgn_request"
    | "reverse_pgn_response"
    | "request_tb_eval"
    | "onload"
    | "ping"
    | "tab_update"
    | "response_tb_standard"
    | "response_tb_mainline"
    | "remove_query";

  export type message =
    | Payload_event_data
    | Payload_pgn_response
    | Payload_onload
    | Payload_get_pgn
    | Payload_request_tb
    | Payload_ping
    | Payload_tab_update
    | Payload_response_tb_standard
    | Payload_response_tb_mainline
    | Remove_Tab_Query;

  type RuntimeMessage_gen<K extends MessageType, T extends object | null> = {
    type: K;
    payload: T extends object ? T : null;
  };

  type Payload_event_data = RuntimeMessage_gen<
    "event_data",
    {
      eventName: string;
      gameNumber: number;
    }
  >;

  type Payload_pgn_response = RuntimeMessage_gen<
    "reverse_pgn_response",
    {
      pgn: string[] | null;
      gameNumber: number;
      reverseGameNumber: number;
    }
  >;

  type Payload_get_pgn = RuntimeMessage_gen<
    "reverse_pgn_request",
    {
      gameNumber: number;
      event: string;
    }
  >;

  // todo delete
  type Payload_ping = RuntimeMessage_gen<
    "ping",
    {
      ping: "pong";
    }
  >;

  type Payload_onload = RuntimeMessage_gen<"onload", null>;

  type Payload_request_tb = RuntimeMessage_gen<
    "request_tb_eval",
    {
      fen: string;
      currentPly: number;
    }
  >;

  type Payload_tab_update = RuntimeMessage_gen<
    "tab_update",
    {
      event: string | null;
      game: number | null;
    }
  >;

  type Payload_response_tb_standard = RuntimeMessage_gen<
    "response_tb_standard",
    {
      response: lila.standard_response;
      ply: number;
    }
  >;

  type Payload_response_tb_mainline = RuntimeMessage_gen<
    "response_tb_mainline",
    {
      response: lila.mainline_response;
      ply: number;
    }
  >;

  type Remove_Tab_Query = RuntimeMessage_gen<"remove_query", null>;
}
