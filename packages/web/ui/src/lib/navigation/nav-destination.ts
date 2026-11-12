/** A top-level destination in the navigation bar and rail. */
export interface NavDestination {
  /** Router path, e.g. `/lists`. */
  readonly path: string;
  readonly label: string;
  /** Material Symbols icon name. */
  readonly icon: string;
}
