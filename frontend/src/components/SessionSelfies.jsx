import { selfiesOf } from '../utils/attendance';

// Thumbnails of the day's selfies (every check-in and check-out, in order).
// `firstOnly` keeps wide tables to the first check-in photo.
export default function SessionSelfies({ record, onOpen, firstOnly }) {
  const selfies = selfiesOf(record);
  const shown = firstOnly ? selfies.slice(0, 1) : selfies;
  if (!shown.length) return null;
  return (
    <span className="selfie-pair">
      {shown.map((s) => (
        <img
          key={s.label}
          className="selfie-thumb"
          src={s.src}
          alt={s.label}
          title={s.label}
          onClick={() => onOpen(s.src)}
        />
      ))}
    </span>
  );
}
