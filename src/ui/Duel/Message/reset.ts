import { resetCardOrigins } from "../animation/origins";
import { resetCombatPresentation } from "../animation/present";
import { duelTimeline } from "../animation/runtime";
import { closeCardActions } from "../interaction/CardActions";
import { resetFieldSelection } from "../interaction/fieldSelection";
import { resetAnimationStall } from "../PlayMat/Card/springs/asyncStart";
import { resetAnnounceModal } from "./AnnounceModal";
import { closeCardListModal } from "./CardListModal";
import { closeCardModal } from "./CardModal";
import { resetCheckCounterModal } from "./CheckCounterModal";
import { resetOptionModal } from "./OptionModal";
import { resetPositionModal } from "./PositionModal";
import { cancelSelectActionsModal } from "./SelectActionsModal";
import { resetDuelPromptSession } from "./session";
import { resetSimpleSelectCardsModal } from "./SimpleSelectCardsModal";
import { resetSortCardModal } from "./SortCardModal";
import { resetYesNoModal } from "./YesNoModal";

/** Close prompts from the previous duel before a new session can render. */
export function resetDuelDialogs() {
  resetDuelPromptSession();
  closeCardActions();
  resetFieldSelection();
  duelTimeline.clear();
  resetCombatPresentation();
  resetAnimationStall();
  resetCardOrigins();
  resetAnnounceModal();
  closeCardListModal();
  closeCardModal();
  resetCheckCounterModal();
  resetOptionModal();
  resetPositionModal();
  cancelSelectActionsModal();
  resetSimpleSelectCardsModal();
  resetSortCardModal();
  resetYesNoModal();
}
