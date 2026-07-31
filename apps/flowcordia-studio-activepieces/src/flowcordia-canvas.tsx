import { useReactFlow } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { FlowCanvas as ActivepiecesFlowCanvas } from "@flowcordia/activepieces-flow-canvas-upstream";

type FlowCanvasProps = {
  setHasCanvasBeenInitialised(value: boolean): void;
};

const MAX_INITIAL_FIT_ATTEMPTS = 30;

function InitialViewport({ canvasReady }: { canvasReady: boolean }) {
  const { fitView, getNodes } = useReactFlow();
  const hasFitted = useRef(false);

  useEffect(() => {
    if (!canvasReady || hasFitted.current) return;

    let cancelled = false;
    let frame = 0;
    let attempts = 0;

    const tryFit = () => {
      if (cancelled || hasFitted.current) return;
      attempts += 1;

      if (getNodes().length === 0) {
        if (attempts < MAX_INITIAL_FIT_ATTEMPTS) {
          frame = window.requestAnimationFrame(tryFit);
        }
        return;
      }

      void fitView({ padding: 0.18, maxZoom: 1, duration: 0 }).then((didFit) => {
        if (cancelled) return;
        if (didFit) {
          hasFitted.current = true;
          return;
        }
        if (attempts < MAX_INITIAL_FIT_ATTEMPTS) {
          frame = window.requestAnimationFrame(tryFit);
        }
      });
    };

    frame = window.requestAnimationFrame(tryFit);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [canvasReady, fitView, getNodes]);

  return null;
}

/**
 * Flowcordia keeps Activepieces' real canvas and adds only the missing embedded
 * viewport bootstrap. The fit runs once, after measured nodes exist, so later
 * panning and zooming remain entirely user-controlled.
 */
export function FlowCanvas({ setHasCanvasBeenInitialised }: FlowCanvasProps) {
  const [canvasReady, setCanvasReady] = useState(false);
  const handleCanvasReady = useCallback(
    (ready: boolean) => {
      setCanvasReady(ready);
      setHasCanvasBeenInitialised(ready);
    },
    [setHasCanvasBeenInitialised]
  );

  return (
    <>
      <ActivepiecesFlowCanvas setHasCanvasBeenInitialised={handleCanvasReady} />
      <InitialViewport canvasReady={canvasReady} />
    </>
  );
}
