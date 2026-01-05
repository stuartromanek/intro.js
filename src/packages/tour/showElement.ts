import { addClass } from "../../util/className";
import { TourStep } from "./steps";
import { Tour } from "./tour";
import getPropValue from "../../util/getPropValue";
import { queryElement, queryElementsByClassName } from "../../util/queryElement";
import { removeClass } from "../../util/className";
import { showElementClassName } from "./classNames";

/**
 * To set the show element
 * This function set a relative (in most cases) position and changes the z-index
 *
 * @api private
 */
function setShowElement(targetElement: HTMLElement) {
  addClass(targetElement, "introjs-showElement");

  const currentElementPosition = getPropValue(targetElement, "position");
  if (
    currentElementPosition !== "absolute" &&
    currentElementPosition !== "relative" &&
    currentElementPosition !== "sticky" &&
    currentElementPosition !== "fixed"
  ) {
    //change to new intro item
    addClass(targetElement, "introjs-relativePosition");
  }
}

/**
 * Show an element on the page
 *
 * @api private
 */
export async function showElement(tour: Tour, step: TourStep) {
  // Re-query the element from DOM if we have a selector string
  // This ensures we're always in sync with the current DOM state
  if (step.elementSelector) {
    const freshElement = queryElement(step.elementSelector);
    if (freshElement) {
      // Only reset position if the fresh element is not the floating element
      // Steps without an element (no elementSelector) should remain floating
      const isFloatingElement = freshElement.classList?.contains("introjsFloatingElement");
      
      if (!isFloatingElement) {
        step.element = freshElement;
        
        // If position was set to "floating" because element wasn't found initially,
        // reset it to allow auto-position to calculate the correct position
        // But only if we have an elementSelector (meaning it was originally a selector string)
        if (step.position === "floating" && step.elementSelector) {
          step.position = tour.getOption("tooltipPosition") || "bottom";
        }
        
        // Also update the step in the steps array to ensure consistency
        const currentStepIndex = tour.getCurrentStep();
        if (currentStepIndex !== undefined) {
          const steps = tour.getSteps();
          if (steps[currentStepIndex]) {
            steps[currentStepIndex].element = freshElement;
            if (step.position !== "floating") {
              steps[currentStepIndex].position = step.position;
            }
          }
        }
      }
    }
  }

  // Ensure we have a valid element before proceeding
  if (!step.element) {
    return;
  }

  tour.callback("change")?.call(tour, step.element);

  //remove old classes if the element still exist
  removeShowElement();

  setShowElement(step.element as HTMLElement);

  // Refresh the tooltip position after re-querying the element and applying styles
  // Use requestAnimationFrame to ensure DOM layout is complete before recalculating position
  // We always trigger this to ensure targetOffset is set, even if element wasn't re-queried
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // Double RAF to ensure layout is complete after setShowElement
      const refreshesSignal = tour.getRefreshesSignal();
      if (refreshesSignal.val !== undefined) {
        refreshesSignal.val += 1;
      }
    });
  });

  await tour.callback("afterChange")?.call(tour, step.element);
}

/**
 * To remove all show element(s)
 *
 * @api private
 */
export function removeShowElement() {
  const elms = Array.from(queryElementsByClassName(showElementClassName));

  for (const elm of elms) {
    removeClass(elm, /introjs-[a-zA-Z]+/g);
  }
}
