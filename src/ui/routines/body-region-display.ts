/** DIDI-1204: API stores body region labels in lowercase; mockups use sentence case. */
export function capitalizeBodyRegionLabel(label: string): string {
  if (label.length === 0) {
    return label;
  }
  return label.charAt(0).toUpperCase() + label.slice(1);
}
