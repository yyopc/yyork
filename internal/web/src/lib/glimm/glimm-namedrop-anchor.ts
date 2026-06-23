import type { NamedropController, ShaderController } from 'glimm';

export const ADD_PROJECT_ANCHOR_ATTR = 'data-glimm-add-project-anchor';

export type AddProjectAnchorId = 'copy' | 'preview' | 'sidebar';

export type AddProjectSource = {
  anchorEl?: HTMLElement | null;
};

type StoredNamedropAnchor = {
  u: number;
  v: number;
  el: WeakRef<HTMLElement>;
};

/** Matches glimm namedrop travel-mode X: mix(-0.2, 1.2, progress). */
const NAMEDROP_TRAVEL_X0 = -0.2;
const NAMEDROP_TRAVEL_X1 = 1.2;

let glimmController: ShaderController | null = null;
let pendingNamedropAnchor: StoredNamedropAnchor | null = null;

function isNamedropController(
  controller: ShaderController
): controller is NamedropController {
  return 'setAnchor' in controller && 'setTravelMode' in controller;
}

export function registerGlimmShaderController(
  controller: ShaderController | null
) {
  glimmController = controller;

  if (controller) {
    applyStagedNamedropAnchor();
  }
}

function clampAnchorUnit(value: number) {
  return Math.min(Math.max(value, 0.04), 0.96);
}

function clampProgress(value: number) {
  return Math.min(Math.max(value, 0), 0.999);
}

/** Map a viewport U coordinate to travel-mode progress so the bulge starts there. */
export function namedropTravelProgressForAnchorX(u: number) {
  return clampProgress(
    (u - NAMEDROP_TRAVEL_X0) / (NAMEDROP_TRAVEL_X1 - NAMEDROP_TRAVEL_X0)
  );
}

/** Viewport-normalized UV for the center of an element (glimm namedrop anchor space). */
export function elementToNamedropAnchor(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return {
    u: clampAnchorUnit((rect.left + rect.width / 2) / window.innerWidth),
    v: clampAnchorUnit((rect.top + rect.height / 2) / window.innerHeight),
  };
}

export function stageNamedropAnchor(source?: AddProjectSource) {
  let anchorEl = source?.anchorEl ?? null;

  if (!anchorEl?.isConnected) {
    anchorEl = document.querySelector<HTMLElement>(
      `[${ADD_PROJECT_ANCHOR_ATTR}="sidebar"]`
    );
  }

  if (!anchorEl) {
    pendingNamedropAnchor = null;
    return;
  }

  const anchor = elementToNamedropAnchor(anchorEl);
  pendingNamedropAnchor = {
    ...anchor,
    el: new WeakRef(anchorEl),
  };
}

function resolveNamedropAnchor() {
  if (!pendingNamedropAnchor) {
    return null;
  }

  const liveElement = pendingNamedropAnchor.el.deref();
  if (liveElement?.isConnected) {
    return elementToNamedropAnchor(liveElement);
  }

  return {
    u: pendingNamedropAnchor.u,
    v: pendingNamedropAnchor.v,
  };
}

function applyAnchorToController(
  controller: NamedropController,
  anchor: { u: number; v: number }
) {
  // Travel mode sweeps left→right at anchor.y. Progress positions anchor.x.
  controller.setTravelMode(1);
  controller.setAnchor(anchor.u, anchor.v);
  controller.setProgress(namedropTravelProgressForAnchorX(anchor.u));
}

/** Applies the staged anchor to a namedrop controller before a sweep runs. */
export function applyStagedNamedropAnchor() {
  const anchor = resolveNamedropAnchor();

  if (!anchor || !glimmController || !isNamedropController(glimmController)) {
    // Controller is created lazily on the first sweep — keep the staged
    // anchor until registerGlimmShaderController runs.
    return false;
  }

  applyAnchorToController(glimmController, anchor);
  pendingNamedropAnchor = null;
  return true;
}

export function clearStagedNamedropAnchor() {
  pendingNamedropAnchor = null;
}
