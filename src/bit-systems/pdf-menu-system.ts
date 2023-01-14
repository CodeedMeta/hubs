import { defineQuery, entityExists, hasComponent } from "bitecs";
import type { HubsWorld } from "../app";
import { HoveredRemoteRight, Interacted, MediaPDF, NetworkedPDF, PDFMenu } from "../bit-components";
import { anyEntityWith, findAncestorWithComponent } from "../utils/bit-utils";
import type { EntityID } from "../utils/networking-types";
import { takeOwnership } from "../utils/take-ownership";
import { setMatrixWorld } from "../utils/three-utils";
import { PDFComponentMap } from "./pdf-system";

function clicked(world: HubsWorld, eid: EntityID) {
  return hasComponent(world, Interacted, eid);
}

function findPDFMenuTarget(world: HubsWorld, menu: EntityID, sceneIsFrozen: boolean) {
  if (sceneIsFrozen) {
    PDFMenu.targetRef[menu] = 0;
    PDFMenu.clearTargetTimer[menu] = 0;
    return;
  }

  const hovered = hoveredQuery(world);
  const target = hovered.find(eid => findAncestorWithComponent(world, MediaPDF, eid));
  if (target) {
    PDFMenu.targetRef[menu] = target;
    PDFMenu.clearTargetTimer[menu] = world.time.elapsed + 1000;
    return;
  }

  if (PDFMenu.targetRef[menu] && !entityExists(world, PDFMenu.targetRef[menu])) {
    // Invalid entity reference. (The pdf entity was removed).
    // TODO Should this be handled in removeObject3DSystem instead?
    PDFMenu.targetRef[menu] = 0;
    PDFMenu.clearTargetTimer[menu] = 0;
    return;
  }

  if (hovered.find(eid => findAncestorWithComponent(world, PDFMenu, eid))) {
    PDFMenu.clearTargetTimer[menu] = world.time.elapsed + 1000;
    return;
  }

  if (world.time.elapsed > PDFMenu.clearTargetTimer[menu]) {
    PDFMenu.targetRef[menu] = 0;
    return;
  }
}

function moveToTarget(world: HubsWorld, menu: EntityID) {
  const targetObj = world.eid2obj.get(PDFMenu.targetRef[menu])!;
  targetObj.updateMatrices();

  const menuObj = world.eid2obj.get(menu)!;

  // TODO: position the menu more carefully...
  setMatrixWorld(menuObj, targetObj.matrixWorld);
}

function handleClicks(world: HubsWorld, menu: EntityID) {
  if (clicked(world, PDFMenu.nextButtonRef[menu])) {
    const pdf = PDFMenu.targetRef[menu];
    takeOwnership(world, pdf);
    const numPages = (MediaPDF.map as PDFComponentMap).get(pdf)!.pdf.numPages;
    NetworkedPDF.page[pdf] = NetworkedPDF.page[pdf] === numPages ? 1 : NetworkedPDF.page[pdf] + 1;
  } else if (clicked(world, PDFMenu.prevButtonRef[menu])) {
    const pdf = PDFMenu.targetRef[menu];
    takeOwnership(world, pdf);
    const numPages = (MediaPDF.map as PDFComponentMap).get(pdf)!.pdf.numPages;
    NetworkedPDF.page[pdf] = NetworkedPDF.page[pdf] === 1 ? numPages : NetworkedPDF.page[pdf] - 1;
  }
}

function updateVisibility(world: HubsWorld, menu: EntityID, frozen: boolean) {
  const target = PDFMenu.targetRef[menu];
  const visible = !!(target && !frozen);

  const obj = world.eid2obj.get(menu)!;
  obj.visible = visible;

  [PDFMenu.prevButtonRef[menu], PDFMenu.nextButtonRef[menu]].forEach(buttonRef => {
    const buttonObj = world.eid2obj.get(buttonRef)!;
    // Parent visibility doesn't block raycasting, so we must set each button to be invisible
    // TODO: Ensure that children of invisible entities aren't raycastable
    buttonObj.visible = visible;
  });
}

const hoveredQuery = defineQuery([HoveredRemoteRight]);
export function pdfMenuSystem(world: HubsWorld, sceneIsFrozen: boolean) {
  const menu = anyEntityWith(world, PDFMenu) as EntityID | null;
  if (!menu) {
    return; // TODO: Fix initialization so that this is assigned via preload.
  }

  findPDFMenuTarget(world, menu, sceneIsFrozen);
  if (PDFMenu.targetRef[menu]) {
    moveToTarget(world, menu);
    handleClicks(world, menu);
  }
  updateVisibility(world, menu, sceneIsFrozen);
}
