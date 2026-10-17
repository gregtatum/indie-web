import * as React from 'react';
import {
  IMPORT_BITRATE_TOLERANCE_PERCENT,
  IMPORT_QUALITY_LEVELS,
  LOSSY_FORMATS,
  type ImportQualitySettings,
} from 'shared';
import './ImportQualityPicker.css';

interface ImportQualityPickerProps {
  idPrefix: string;
  value: ImportQualitySettings;
  onChange(value: ImportQualitySettings): void;
}

export function ImportQualityPicker({
  idPrefix,
  value,
  onChange,
}: ImportQualityPickerProps) {
  const selected = IMPORT_QUALITY_LEVELS.find(
    (level) => level.id === value.maximumQuality,
  );
  const isLossyLevel = selected !== undefined && selected.maxKbps !== null;
  const formatLabel =
    LOSSY_FORMATS.find((format) => format.id === value.lossyFormat)?.label ??
    '';

  return (
    <div className="importQualityPicker">
      <fieldset className="importQualityPickerGroup">
        {IMPORT_QUALITY_LEVELS.map((level) => {
          const id = `${idPrefix}-quality-${level.id}`;
          const detail =
            typeof level.detail === 'string'
              ? level.detail
              : level.detail[value.lossyFormat];
          return (
            <div key={level.id} className="importQualityPickerOption">
              <input
                type="radio"
                id={id}
                name={`${idPrefix}-maximum-quality`}
                checked={value.maximumQuality === level.id}
                onChange={() =>
                  onChange({ ...value, maximumQuality: level.id })
                }
              />
              <label htmlFor={id}>
                <span className="importQualityPickerName">{level.label}</span>
                <span className="importQualityPickerDetail">{detail}</span>
              </label>
            </div>
          );
        })}
      </fieldset>
      <div className="importQualityPickerSide">
        {selected && <p>{selected.description}</p>}
        {selected && (
          <ul className="importQualityPickerHow">
            {getHowItWorks(selected, formatLabel).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {isLossyLevel && (
          <fieldset className="importQualityPickerGroup">
            <legend>Convert FLAC to</legend>
            {LOSSY_FORMATS.map((format) => {
              const id = `${idPrefix}-lossy-format-${format.id}`;
              return (
                <div key={format.id} className="importQualityPickerOption">
                  <input
                    type="radio"
                    id={id}
                    name={`${idPrefix}-lossy-format`}
                    checked={value.lossyFormat === format.id}
                    onChange={() =>
                      onChange({ ...value, lossyFormat: format.id })
                    }
                  />
                  <label htmlFor={id}>
                    <span className="importQualityPickerName">
                      {format.label}
                    </span>
                  </label>
                </div>
              );
            })}
          </fieldset>
        )}
      </div>
    </div>
  );
}

function getHowItWorks(
  level: (typeof IMPORT_QUALITY_LEVELS)[number],
  formatLabel: string,
): string[] {
  switch (level.id) {
    case 'original':
      return [
        'Files are imported exactly as they are, with nothing converted.',
      ];
    case 'lossless':
      return [
        'FLAC files above 16-bit / 44.1 kHz are reduced to CD quality.',
        'Other FLAC files, MP3s and m4a files are left alone.',
        'Converted originals are not kept.',
      ];
    default:
      return [
        `FLAC files are converted to ${formatLabel} at up to ${level.maxKbps} kbps.`,
        `MP3 and m4a files more than ${IMPORT_BITRATE_TOLERANCE_PERCENT}% above ${level.maxKbps} kbps are re-encoded in their own format, which slightly reduces quality.`,
        'Everything else is left alone.',
        'Converted originals are not kept.',
      ];
  }
}
