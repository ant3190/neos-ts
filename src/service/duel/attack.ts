import { ygopro } from "@/api";
import { Container } from "@/container";

import { fetchEsHintMeta } from "./util";

export default async (
  container: Container,
  attack: ygopro.StocGameMessage.MsgAttack,
) => {
  const context = container.context;
  fetchEsHintMeta({
    context,
    originMsg: "「[?]」攻击时",
    location: attack.attacker_location,
  });

  // Attack declaration draws the aim line; MSG_BATTLE performs the hit.
};
