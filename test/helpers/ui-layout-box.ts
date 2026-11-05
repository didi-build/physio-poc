/** Shared layout metrics for real-browser UI tests (padding-aware content boxes). */

export type PaddingContentBox = {
  left: number;
  right: number;
  width: number;
  scrollWidth: number;
};

export function readPaddingContentBox(element: Element): PaddingContentBox {
  const style = getComputedStyle(element);
  const box = element.getBoundingClientRect();
  const padLeft = Number.parseFloat(style.paddingLeft);
  const padRight = Number.parseFloat(style.paddingRight);
  const left = box.left + padLeft;
  const right = box.right - padRight;
  const width = right - left;
  const scrollWidth = Math.max(0, element.scrollWidth - padLeft - padRight);
  return { left, right, width, scrollWidth };
}

export function readHorizontalOverflow(element: HTMLElement): {
  clientWidth: number;
  scrollWidth: number;
} {
  return { clientWidth: element.clientWidth, scrollWidth: element.scrollWidth };
}
