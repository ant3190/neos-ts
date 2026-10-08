import { resetAnnounceModal } from "./AnnounceModal";
import { closeCardListModal } from "./CardListModal";
import { closeCardModal } from "./CardModal";
import { resetCheckCounterModal } from "./CheckCounterModal";
import { resetOptionModal } from "./OptionModal";
import { resetPositionModal } from "./PositionModal";
import { cancelSelectActionsModal } from "./SelectActionsModal";
import { resetSimpleSelectCardsModal } from "./SimpleSelectCardsModal";
import { resetSortCardModal } from "./SortCardModal";
import { resetYesNoModal } from "./YesNoModal";

/** Close prompts from the previous duel before a new session can render. */
export function resetDuelDialogs() {
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
