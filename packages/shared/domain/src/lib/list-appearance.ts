/**
 * The colour and icon a list can wear (D26): a fixed palette and a curated set, so every
 * client draws them the same and the server can refuse anything else. The web app maps a colour
 * name to its light and dark tones (`--lister-list-*`, styles.scss).
 */
export const LIST_COLOURS = [
  'red',
  'orange',
  'amber',
  'lime',
  'green',
  'teal',
  'cyan',
  'blue',
  'indigo',
  'purple',
  'pink',
  'grey',
] as const;

export type ListColour = (typeof LIST_COLOURS)[number];

/**
 * Material Symbols ligature names, with the label the picker reads out. The icon font is cut
 * down to the icons in use, and this file is one of the places `subset-icons` scans.
 */
export const LIST_ICONS = [
  { icon: 'luggage', label: 'Luggage' },
  { icon: 'backpack', label: 'Backpack' },
  { icon: 'work', label: 'Bag' },
  { icon: 'camping', label: 'Tent' },
  { icon: 'beach_access', label: 'Beach' },
  { icon: 'directions_car', label: 'Car' },
  { icon: 'flight', label: 'Plane' },
  { icon: 'train', label: 'Train' },
  { icon: 'directions_bike', label: 'Bike' },
  { icon: 'hiking', label: 'Hiking' },
  { icon: 'sailing', label: 'Sailing' },
  { icon: 'pool', label: 'Swimming' },
  { icon: 'downhill_skiing', label: 'Skiing' },
  { icon: 'child_care', label: 'Baby' },
  { icon: 'pets', label: 'Pets' },
  { icon: 'home', label: 'Home' },
  { icon: 'cottage', label: 'Cottage' },
  { icon: 'restaurant', label: 'Food' },
  { icon: 'shopping_cart', label: 'Shopping' },
  { icon: 'local_laundry_service', label: 'Laundry' },
  { icon: 'checkroom', label: 'Clothes' },
  { icon: 'medication', label: 'Medicine' },
  { icon: 'medical_services', label: 'First aid' },
  { icon: 'cleaning_services', label: 'Cleaning' },
  { icon: 'build', label: 'Tools' },
  { icon: 'school', label: 'School' },
  { icon: 'celebration', label: 'Party' },
  { icon: 'cake', label: 'Cake' },
  { icon: 'fitness_center', label: 'Fitness' },
  { icon: 'sports_soccer', label: 'Sports' },
  { icon: 'park', label: 'Trees' },
  { icon: 'water_drop', label: 'Water' },
  { icon: 'wb_sunny', label: 'Sun' },
  { icon: 'ac_unit', label: 'Snow' },
  { icon: 'event', label: 'Event' },
  { icon: 'favorite', label: 'Heart' },
  { icon: 'star', label: 'Star' },
  { icon: 'photo_camera', label: 'Camera' },
  { icon: 'laptop_mac', label: 'Laptop' },
  { icon: 'music_note', label: 'Music' },
] as const;

export type ListIconName = (typeof LIST_ICONS)[number]['icon'];

/** The icon names, for schemas. */
export const LIST_ICON_NAMES = LIST_ICONS.map(
  (entry) => entry.icon,
) as unknown as readonly [ListIconName, ...ListIconName[]];
