import { TooltipPosition } from "../../packages/tooltip";
import { queryElement, queryElements } from "../../util/queryElement";
import cloneObject from "../../util/cloneObject";
import { Tour } from "./tour";
import {
  dataDisableInteraction,
  dataHighlightClass,
  dataIntroAttribute,
  dataIntroGroupAttribute,
  dataPosition,
  dataScrollTo,
  dataStepAttribute,
  dataTitleAttribute,
  dataTooltipClass,
} from "./dataAttributes";
import { showElement } from "./showElement";

export type ScrollTo = "off" | "element" | "tooltip";

export type TourStep = {
  step: number;
  title: string;
  intro: string;
  tooltipClass?: string;
  highlightClass?: string;
  element?: Element | HTMLElement | string | null;
  elementSelector?: string;
  position: TooltipPosition;
  scrollTo: ScrollTo;
  disableInteraction?: boolean;
  onComplete?: () => Promise<void> | void;
  skipIf?: () => boolean | Promise<boolean>;
};

/**
 * Go to next step on intro
 *
 * @api private
 */
export async function nextStep(tour: Tour) {
  const initialStepIndex = tour.getCurrentStep();
  
  if (tour.isEnd()) {
    await tour.callback("complete")?.call(tour, tour.getCurrentStep(), "end");
    await tour.exit();
    return false;
  }

  // Call onComplete callback for the current step before moving to the next step
  // Only call onComplete if we've actually shown the step (not if it was skipped)
  // We detect if a step was skipped by checking if the index didn't change after incrementing
  const currentStepIndex = tour.getCurrentStep();
  let stepWasShown = true; // Track if the current step was actually shown
  
  await tour.incrementCurrentStep();
  let targetStepIndex = tour.getCurrentStep();

  // Check if increment failed (step index didn't change) - this means we're at the last step
  const incrementFailed = targetStepIndex === initialStepIndex;

  // Check if we've reached the end after incrementing
  if (tour.isEnd() || incrementFailed) {
    // Call onComplete for the last step if it was shown
    if (currentStepIndex !== undefined && currentStepIndex !== targetStepIndex && stepWasShown) {
      const currentStep = tour.getStep(currentStepIndex);
      if (currentStep?.onComplete) {
        await currentStep.onComplete();
      }
    }
    await tour.callback("complete")?.call(tour, tour.getCurrentStep(), "end");
    await tour.exit();
    return false;
  }

  // Safety check: ensure targetStep exists before checking skipIf
  if (targetStepIndex === undefined || targetStepIndex >= tour.getSteps().length) {
    await tour.callback("complete")?.call(tour, targetStepIndex, "end");
    await tour.exit();
    return false;
  }

  let targetStep = tour.getStep(targetStepIndex);
  
  // Safety check: ensure targetStep exists
  if (!targetStep) {
    await tour.callback("complete")?.call(tour, targetStepIndex, "end");
    await tour.exit();
    return false;
  }
  
  // Check if this step should be skipped BEFORE calling onComplete or showing it
  if (targetStep.skipIf) {
    const shouldSkip = await targetStep.skipIf();
    if (shouldSkip) {
      // If we're trying to skip the last step, just end the tour
      if (targetStepIndex >= tour.getSteps().length - 1) {
        // Call onComplete for the previous step if it was shown
        if (currentStepIndex !== undefined && currentStepIndex !== targetStepIndex && stepWasShown) {
          const currentStep = tour.getStep(currentStepIndex);
          if (currentStep?.onComplete) {
            await currentStep.onComplete();
          }
        }
        await tour.callback("complete")?.call(tour, targetStepIndex, "end");
        await tour.exit();
        return false;
      }
      
      // Skip this step and continue to the next one
      // Keep incrementing until we find a step that shouldn't be skipped or reach the end
      let nextStepIndex = targetStepIndex + 1;
      while (nextStepIndex < tour.getSteps().length) {
        const nextStep = tour.getStep(nextStepIndex);
        if (!nextStep) break;
        
        if (nextStep.skipIf) {
          const shouldSkipNext = await nextStep.skipIf();
          if (!shouldSkipNext) {
            // Found a step that shouldn't be skipped
            break;
          }
        } else {
          // Found a step without skipIf, so we'll show it
          break;
        }
        
        nextStepIndex++;
      }
      
      // Check if we've run out of steps
      if (nextStepIndex >= tour.getSteps().length) {
        // Call onComplete for the previous step if it was shown
        if (currentStepIndex !== undefined && currentStepIndex !== targetStepIndex && stepWasShown) {
          const currentStep = tour.getStep(currentStepIndex);
          if (currentStep?.onComplete) {
            await currentStep.onComplete();
          }
        }
        await tour.callback("complete")?.call(tour, targetStepIndex, "end");
        await tour.exit();
        return false;
      }
      
      // Set the step to the next non-skipped step and continue to show it
      await tour.setCurrentStep(nextStepIndex);
      // Update targetStepIndex to the next non-skipped step
      targetStepIndex = nextStepIndex;
      const updatedStep = tour.getStep(targetStepIndex);
      if (!updatedStep) {
        await tour.callback("complete")?.call(tour, targetStepIndex, "end");
        await tour.exit();
        return false;
      }
      // Continue to the common code path below to show the step
      targetStep = updatedStep;
    }
  }
  
  // Common code path: call onComplete for the previous step and show the current step
  // Only call onComplete for the previous step if it was actually shown (not skipped)
  if (currentStepIndex !== undefined && currentStepIndex !== targetStepIndex && stepWasShown) {
    const currentStep = tour.getStep(currentStepIndex);
    if (currentStep?.onComplete) {
      await currentStep.onComplete();
    }
  }
  
  await showElement(tour, targetStep);

  return true;
}

/**
 * Go to previous step on intro
 *
 * @api private
 */
export async function previousStep(tour: Tour) {
  const currentStep = tour.getCurrentStep();
  if (currentStep === undefined || currentStep <= 0) {
    return false;
  }

  // Find the first eligible (non-skipped) step going backwards
  let targetStepIndex = currentStep - 1;
  
  // Keep going back until we find a step that shouldn't be skipped
  while (targetStepIndex >= 0) {
    const candidateStep = tour.getStep(targetStepIndex);
    if (!candidateStep) {
      // Step doesn't exist, go back further
      targetStepIndex--;
      continue;
    }
    
    // Check if this step should be skipped
    if (candidateStep.skipIf) {
      const shouldSkip = await candidateStep.skipIf();
      if (shouldSkip) {
        // This step should be skipped, continue going back
        targetStepIndex--;
        continue;
      }
    }
    
    // Found an eligible step that shouldn't be skipped
    break;
  }
  
  // If we went past the beginning, there's no eligible step to go back to
  if (targetStepIndex < 0) {
    return false;
  }
  
  // Call onComplete callback from the step before the target step to 'set up' the target state
  // (e.g., if going to step 1, run step 0's onComplete to set up step 1)
  const setupStepIndex = targetStepIndex - 1;
  if (setupStepIndex >= 0) {
    const setupStep = tour.getStep(setupStepIndex);
    if (setupStep?.onComplete) {
      await setupStep.onComplete();
    }
  }

  // Set the current step to the target step
  await tour.setCurrentStep(targetStepIndex);

  const targetStep = tour.getStep(targetStepIndex);
  if (!targetStep) {
    return false;
  }
  
  await showElement(tour, targetStep);

  return true;
}

/**
 * Finds all Intro steps from the data-* attributes and the options.steps array
 *
 * @api private
 */
export const fetchSteps = (tour: Tour) => {
  let steps: TourStep[] = [];

  if (tour.getOption("steps")?.length) {
    //use steps passed programmatically
    for (const _step of tour.getOption("steps")) {
      const step = cloneObject(_step);

      //set the step
      step.step = steps.length + 1;

      step.title = step.title || "";

      //use querySelector function only when developer used CSS selector
      if (typeof step.element === "string") {
        //store the selector string for later re-querying
        step.elementSelector = step.element;
        //grab the element with given selector from the page
        step.element = queryElement(step.element) || undefined;
      }

      // tour without element
      if (!step.element) {
        step.element = tour.appendFloatingElement();
        step.position = "floating";
      }

      step.position = step.position || tour.getOption("tooltipPosition");
      step.scrollTo = step.scrollTo || tour.getOption("scrollTo");

      if (typeof step.disableInteraction === "undefined") {
        step.disableInteraction = tour.getOption("disableInteraction");
      }

      if (step.element !== null) {
        steps.push(step as TourStep);
      }
    }
  } else {
    const elements = Array.from(
      queryElements(`*[${dataIntroAttribute}]`, tour.getTargetElement())
    );

    // if there's no element to intro
    if (elements.length < 1) {
      return [];
    }

    const itemsWithoutStep: TourStep[] = [];

    for (const element of elements) {
      // start intro for groups of elements
      if (
        tour.getOption("group") &&
        element.getAttribute(dataIntroGroupAttribute) !==
          tour.getOption("group")
      ) {
        continue;
      }

      // skip hidden elements
      if (element.style.display === "none") {
        continue;
      }

      // get the step for the current element or set as 0 if is not present
      const stepIndex = parseInt(
        element.getAttribute(dataStepAttribute) || "0",
        10
      );

      let disableInteraction = tour.getOption("disableInteraction");
      if (element.hasAttribute(dataDisableInteraction)) {
        disableInteraction = !!element.getAttribute(dataDisableInteraction);
      }

      const newIntroStep: TourStep = {
        step: stepIndex,
        element,
        title: element.getAttribute(dataTitleAttribute) || "",
        intro: element.getAttribute(dataIntroAttribute) || "",
        tooltipClass: element.getAttribute(dataTooltipClass) || undefined,
        highlightClass: element.getAttribute(dataHighlightClass) || undefined,
        position: (element.getAttribute(dataPosition) ||
          tour.getOption("tooltipPosition")) as TooltipPosition,
        scrollTo:
          (element.getAttribute(dataScrollTo) as ScrollTo) ||
          tour.getOption("scrollTo"),
        disableInteraction,
      };

      if (stepIndex > 0) {
        steps[stepIndex - 1] = newIntroStep;
      } else {
        itemsWithoutStep.push(newIntroStep);
      }
    }

    // fill items without step in blanks and update their step
    for (let i = 0; itemsWithoutStep.length > 0; i++) {
      if (typeof steps[i] === "undefined") {
        const newStep = itemsWithoutStep.shift();
        if (!newStep) break;

        newStep.step = i + 1;
        steps[i] = newStep;
      }
    }
  }

  // removing undefined/null elements
  steps = steps.filter((n) => n);

  // Sort all items with given steps
  steps.sort((a, b) => a.step - b.step);

  return steps;
};
