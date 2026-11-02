import { coordsText, distanceText } from '../utils/attendance';

// Coordinates of a punch, with its distance from the office underneath and,
// optionally, a note about the farthest punch of the day
export default function LocationCell({ location, farthest }) {
  const distance = distanceText(location);
  return (
    <span className="cell-stack">
      <span dir="ltr">{coordsText(location)}</span>
      {distance && <small>{distance}</small>}
      {farthest && <small className="cell-warning">{farthest}</small>}
    </span>
  );
}
