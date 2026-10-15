export type PhaseCommandSource = "idle" | "battle" | undefined;

/** The wire command, rather than the displayed phase, owns the response encoding. */
export function legalPhaseCommands(
  source: PhaseCommandSource,
  flags: { enableBp: boolean; enableM2: boolean; enableEp: boolean },
) {
  return [
    { key: "main1", text: "MAIN 1", enabled: false, response: -1 },
    {
      key: "battle",
      text: "BATTLE",
      enabled: source === "idle" && flags.enableBp,
      response: 6,
    },
    {
      key: "main2",
      text: "MAIN 2",
      enabled: source === "battle" && flags.enableM2,
      response: 2,
    },
    {
      key: "end",
      text: "END",
      enabled: !!source && flags.enableEp,
      response: source === "battle" ? 3 : 7,
    },
  ];
}
