import type { TrackMetadata, TrackTagsResponse } from 'shared/@types/shared';
import {
  PREFER_COMPOSER_GROUPING_TAG_DESCRIPTION,
  parseBooleanTagValue,
  preferComposerGroupingFormValue,
} from 'shared/music';
export { getTrackFilterArtist } from 'shared/music';

const PRIORITY_IDS = [
  'TIT2', // Title
  'TPE1', // Artist
  'TPE2', // Album Artist
  'TALB', // Album
  'TRCK', // Track Number
  'TPOS', // Disc Number
  'TCON', // Genre
  'TYER', // Year
  'TCOM', // Composer
  'TEXT', // Lyricist
  'COMM', // Comments
  'USLT', // Lyrics
  'APIC', // Attached Picture
  'TBPM', // BPM
  'TKEY', // Initial Key
];

const priorityIndex = new Map(PRIORITY_IDS.map((id, i) => [id, i]));

export function sortTags<T extends { id: string }>(tags: T[]): T[] {
  return [...tags].sort((a, b) => {
    const ai = priorityIndex.get(a.id);
    const bi = priorityIndex.get(b.id);
    if (ai !== undefined && bi !== undefined) {
      return ai - bi;
    }
    if (ai !== undefined) {
      return -1;
    }
    if (bi !== undefined) {
      return 1;
    }
    const aLabel = id3FrameLabels[a.id as keyof typeof id3FrameLabels] ?? a.id;
    const bLabel = id3FrameLabels[b.id as keyof typeof id3FrameLabels] ?? b.id;
    return aLabel.localeCompare(bLabel);
  });
}

export const id3FrameLabels = {
  AENC: 'Audio Encryption',
  APIC: 'Attached Picture',
  COMM: 'Comments',
  COMR: 'Commercial Frame',
  ENCR: 'Encryption Method Registration',
  EQUA: 'Equalization',
  ETCO: 'Event Timing Codes',
  GEOB: 'General Encapsulated Object',
  GRID: 'Group Identification Registration',
  IPLS: 'Involved People List',
  LINK: 'Linked Information',
  MCDI: 'Music CD Identifier',
  MLLT: 'MPEG Location Lookup Table',
  OWNE: 'Ownership',
  PCNT: 'Play Counter',
  POPM: 'Popularimeter',
  POSS: 'Position Synchronisation',
  PRIV: 'Private Frame',
  RBUF: 'Recommended Buffer Size',
  RVAD: 'Relative Volume Adjustment',
  RVRB: 'Reverb',
  SYLT: 'Synchronized Lyrics',
  SYTC: 'Synchronized Tempo Codes',
  TALB: 'Album',
  TBPM: 'BPM',
  TCOM: 'Composer',
  TCON: 'Genre',
  TCOP: 'Copyright',
  TDAT: 'Date',
  TDLY: 'Playlist Delay',
  TENC: 'Encoded By',
  TEXT: 'Lyricist',
  TFLT: 'File Type',
  TIME: 'Time',
  TIT1: 'Content Group',
  TIT2: 'Title',
  TIT3: 'Subtitle',
  TKEY: 'Initial Key',
  TLAN: 'Languages',
  TLEN: 'Length',
  TMED: 'Media Type',
  TOAL: 'Original Album',
  TOFN: 'Original Filename',
  TOLY: 'Original Lyricist',
  TOPE: 'Original Artist',
  TORY: 'Original Release Year',
  TOWN: 'File Owner',
  TPE1: 'Artist',
  TPE2: 'Album Artist',
  TPE3: 'Conductor',
  TPE4: 'Remixed By',
  TPOS: 'Disc Number',
  TPUB: 'Publisher',
  TRCK: 'Track Number',
  TRDA: 'Recording Dates',
  TRSN: 'Internet Radio Station Name',
  TRSO: 'Internet Radio Station Owner',
  TSIZ: 'Size',
  TSRC: 'ISRC',
  TSSE: 'Encoding Software',
  TXXX: 'Custom Text',
  TYER: 'Year',
  UFID: 'Unique File Identifier',
  USER: 'Terms Of Use',
  USLT: 'Lyrics',
  WCOM: 'Commercial Information URL',
  WCOP: 'Copyright Information URL',
  WOAF: 'Official Audio File URL',
  WOAR: 'Official Artist URL',
  WOAS: 'Official Audio Source URL',
  WORS: 'Official Radio Station URL',
  WPAY: 'Payment URL',
  WPUB: 'Publisher URL',
  WXXX: 'Custom URL',
};

/**
 * From: https://id3.org/id3v2.3.0#Text_information_frames
 */
export const id3FrameTooltips = {
  TALB: `The 'Album/Movie/Show title' frame is intended for the title of the recording(/source of sound) which the audio in the file is taken from.`,
  TBPM: `The 'BPM' frame contains the number of beats per minute in the mainpart of the audio. The BPM is an integer and represented as a numerical string.`,
  TCOM: `The 'Composer(s)' frame is intended for the name of the composer(s). They are seperated with the "/" character.`,
  TCON: `The 'Content type', which previously was stored as a one byte numeric value only, is now a numeric string. You may use one or several of the types as ID3v1.1 did or, since the category list would be impossible to maintain with accurate and up to date categories, define your own.`,
  TCOP: `The 'Copyright message' frame, which must begin with a year and a space character (making five characters), is intended for the copyright holder of the original sound, not the audio file itself. The absence of this frame means only that the copyright information is unavailable or has been removed, and must not be interpreted to mean that the sound is public domain. Every time this field is displayed the field must be preceded with "Copyright © ".`,
  TDAT: `The 'Date' frame is a numeric string in the DDMM format containing the date for the recording. This field is always four characters long.`,
  TDLY: `The 'Playlist delay' defines the numbers of milliseconds of silence between every song in a playlist. The player should use the "ETC" frame, if present, to skip initial silence and silence at the end of the audio to match the 'Playlist delay' time. The time is represented as a numeric string.`,
  TENC: `The 'Encoded by' frame contains the name of the person or organisation that encoded the audio file. This field may contain a copyright message, if the audio file also is copyrighted by the encoder.`,
  TEXT: `The 'Lyricist(s)/Text writer(s)' frame is intended for the writer(s) of the text or lyrics in the recording. They are seperated with the "/" character.`,
  TFLT: `The 'File type' frame indicates which type of audio this tag defines. The following type and refinements are defined:\n\n\tMPG       MPEG Audio\n\t/1        MPEG 1/2 layer I\n\t/2        MPEG 1/2 layer II\n\t/3        MPEG 1/2 layer III\n\t/2.5      MPEG 2.5\n\t/AAC     Advanced audio compression\n\tVQF       Transform-domain Weighted Interleave Vector Quantization\n\tPCM       Pulse Code Modulated audio\n\nbut other types may be used, not for these types though. This is used in a similar way to the predefined types in the "TMED" frame, but without parentheses. If this frame is not present audio type is assumed to be "MPG".`,
  TIME: `The 'Time' frame is a numeric string in the HHMM format containing the time for the recording. This field is always four characters long.`,
  TIT1: `The 'Content group description' frame is used if the sound belongs to a larger category of sounds/music. For example, classical music is often sorted in different musical sections (e.g. "Piano Concerto", "Weather - Hurricane").`,
  TIT2: `The 'Title/Songname/Content description' frame is the actual name of the piece (e.g. "Adagio", "Hurricane Donna").`,
  TIT3: `The 'Subtitle/Description refinement' frame is used for information directly related to the contents title (e.g. "Op. 16" or "Performed live at Wembley").`,
  TKEY: `The 'Initial key' frame contains the musical key in which the sound starts. It is represented as a string with a maximum length of three characters. The ground keys are represented with "A","B","C","D","E", "F" and "G" and halfkeys represented with "b" and "#". Minor is represented as "m". Example "Cbm". Off key is represented with an "o" only.`,
  TLAN: `The 'Language(s)' frame should contain the languages of the text or lyrics spoken or sung in the audio. The language is represented with three characters according to ISO-639-2. If more than one language is used in the text their language codes should follow according to their usage.`,
  TLEN: `The 'Length' frame contains the length of the audiofile in milliseconds, represented as a numeric string.`,
  TMED: `The 'Media type' frame describes from which media the sound originated. This may be a text string or a reference to the predefined media types found in the list below. References are made within "(" and ")" and are optionally followed by a text refinement, e.g. "(MC) with four channels". If a text refinement should begin with a "(" character it should be replaced with "((" in the same way as in the "TCO" frame. Predefined refinements is appended after the media type, e.g. "(CD/A)" or "(VID/PAL/VHS)".`,
  TOAL: `The 'Original album/movie/show title' frame is intended for the title of the original recording (or source of sound), if for example the music in the file should be a cover of a previously released song.`,
  TOFN: `The 'Original filename' frame contains the preferred filename for the file, since some media doesn't allow the desired length of the filename. The filename is case sensitive and includes its suffix.`,
  TOLY: `The 'Original lyricist(s)/text writer(s)' frame is intended for the text writer(s) of the original recording, if for example the music in the file should be a cover of a previously released song. The text writers are seperated with the "/" character.`,
  TOPE: `The 'Original artist(s)/performer(s)' frame is intended for the performer(s) of the original recording, if for example the music in the file should be a cover of a previously released song. The performers are seperated with the "/" character.`,
  TORY: `The 'Original release year' frame is intended for the year when the original recording, if for example the music in the file should be a cover of a previously released song, was released. The field is formatted as in the "TYER" frame.`,
  TOWN: `The 'File owner/licensee' frame contains the name of the owner or licensee of the file and it's contents.`,
  TPE1: `The 'Lead artist(s)/Lead performer(s)/Soloist(s)/Performing group' is used for the main artist(s). They are seperated with the "/" character.`,
  TPE2: `The 'Band/Orchestra/Accompaniment' frame is used for additional information about the performers in the recording.`,
  TPE3: `The 'Conductor' frame is used for the name of the conductor.`,
  TPE4: `The 'Interpreted, remixed, or otherwise modified by' frame contains more information about the people behind a remix and similar interpretations of another existing piece.`,
  TPOS: `The 'Part of a set' frame is a numeric string that describes which part of a set the audio came from. This frame is used if the source described in the "TALB" frame is divided into several mediums, e.g. a double CD. The value may be extended with a "/" character and a numeric string containing the total number of parts in the set. E.g. "1/2".`,
  TPUB: `The 'Publisher' frame simply contains the name of the label or publisher.`,
  TRCK: `The 'Track number/Position in set' frame is a numeric string containing the order number of the audio-file on its original recording. This may be extended with a "/" character and a numeric string containing the total numer of tracks/elements on the original recording. E.g. "4/9".`,
  TRDA: `The 'Recording dates' frame is a intended to be used as complement to the "TYER", "TDAT" and "TIME" frames. E.g. "4th-7th June, 12th June" in combination with the "TYER" frame.`,
  TRSN: `The 'Internet radio station name' frame contains the name of the internet radio station from which the audio is streamed.`,
  TRSO: `The 'Internet radio station owner' frame contains the name of the owner of the internet radio station from which the audio is streamed.`,
  TSIZ: `The 'Size' frame contains the size of the audiofile in bytes, excluding the ID3v2 tag, represented as a numeric string.`,
  TSRC: `The 'ISRC' frame should contain the International Standard Recording Code (ISRC) (12 characters).`,
  TSSE: `The 'Software/Hardware and settings used for encoding' frame includes the used audio encoder and its settings when the file was encoded. Hardware refers to hardware encoders, not the computer on which a program was run.`,
  TYER: `The 'Year' frame is a numeric string with a year of the recording. This frames is always four characters long (until the year 10000).`,
};

export type DetailFieldType = 'text' | 'number' | 'split';
export type DetailFieldGroup = 'core' | 'position' | 'classification' | 'notes';

/**
 * The editable properties shown in the Details tab
 */
export interface DetailField<Key extends string = string> {
  frameId: string;
  key: Key;
  label: string;
  type: DetailFieldType;
  group: DetailFieldGroup;
}

export interface SplitDetailField<
  Key extends string = string,
  TotalKey extends string = string,
> extends DetailField<Key> {
  type: 'split';
  /** State key for the denominator (total) half of "N/total". */
  totalKey: TotalKey;
}

export type AnyDetailField = DetailField | SplitDetailField;

/**
 * Maps each DetailField's key (and totalKey for split fields) to its current string value.
 * e.g.
 *  {
 *   title: 'Reykjavik',
 *   artist: 'Sigur Rós',
 *   trackNum: '3',
 *   trackTotal: '10',
 *   ...
 *  }
 */
export function isSplitField(field: AnyDetailField): field is SplitDetailField {
  return field.type === 'split';
}

export const DETAIL_FIELDS = [
  // core
  {
    frameId: 'TIT2',
    key: 'title',
    label: 'Title',
    type: 'text',
    group: 'core',
  },
  {
    frameId: 'TPE1',
    key: 'artist',
    label: 'Artist',
    type: 'text',
    group: 'core',
  },
  {
    frameId: 'TPE2',
    key: 'albumArtist',
    label: 'Album Artist',
    type: 'text',
    group: 'core',
  },
  {
    frameId: 'TALB',
    key: 'album',
    label: 'Album',
    type: 'text',
    group: 'core',
  },
  {
    frameId: 'TCOM',
    key: 'composer',
    label: 'Composer',
    type: 'text',
    group: 'core',
  },
  // position — track/disc use "N/total" split inputs
  {
    frameId: 'TRCK',
    key: 'trackNum',
    totalKey: 'trackTotal',
    label: 'Track',
    type: 'split',
    group: 'position',
  },
  {
    frameId: 'TPOS',
    key: 'discNum',
    totalKey: 'discTotal',
    label: 'Disc',
    type: 'split',
    group: 'position',
  },
  {
    frameId: 'TYER',
    key: 'year',
    label: 'Year',
    type: 'number',
    group: 'position',
  },
  // classification
  {
    frameId: 'TCON',
    key: 'genre',
    label: 'Genre',
    type: 'text',
    group: 'classification',
  },
  {
    frameId: 'TBPM',
    key: 'bpm',
    label: 'BPM',
    type: 'number',
    group: 'classification',
  },
  // notes
  {
    frameId: 'COMM',
    key: 'comment',
    label: 'Comment',
    type: 'text',
    group: 'notes',
  },
] as const satisfies readonly AnyDetailField[];

export type DetailFieldPrimaryKey = (typeof DETAIL_FIELDS)[number]['key'];
export type DetailFieldTotalKey = Extract<
  (typeof DETAIL_FIELDS)[number],
  { type: 'split' }
>['totalKey'];
export type DetailFieldValueKey = DetailFieldPrimaryKey | DetailFieldTotalKey;
export type DetailFormValueKey = DetailFieldValueKey | 'preferComposerGrouping';
export type DetailFieldValues = Record<DetailFormValueKey, string>;

export type TrackTagsLoadState =
  | { status: 'loading' }
  | { status: 'loaded'; data: TrackTagsResponse }
  | { status: 'error'; message: string };

/**
 * e.g. { title: "", artist: "", albumArtist: "", … }
 */
export function emptyDetailFieldValues(): DetailFieldValues {
  const values = {} as DetailFieldValues;
  for (const field of DETAIL_FIELDS) {
    values[field.key] = '';
    if (isSplitField(field)) {
      values[field.totalKey] = '';
    }
  }
  values.preferComposerGrouping = 'false';
  return values;
}

export function detailFieldValues(
  track: TrackMetadata | null,
  tagsResponse: TrackTagsResponse | null,
): DetailFieldValues {
  const state = emptyDetailFieldValues();
  let nativePreferComposerGrouping: boolean | null = null;
  let hasNativePreferComposerGrouping = false;

  if (tagsResponse) {
    const frameMap = new Map<string, string>();
    for (const block of tagsResponse.native) {
      for (const tag of block.tags) {
        if (!frameMap.has(tag.id) && tag.binary === undefined) {
          frameMap.set(tag.id, tag.value);
        }
      }
    }
    const preferComposerValue = frameMap.get(
      `TXXX:${PREFER_COMPOSER_GROUPING_TAG_DESCRIPTION}`,
    );
    if (preferComposerValue !== undefined) {
      hasNativePreferComposerGrouping = true;
      nativePreferComposerGrouping = parseBooleanTagValue(preferComposerValue);
    }

    for (const field of DETAIL_FIELDS) {
      const raw = frameMap.get(field.frameId) ?? '';
      if (isSplitField(field)) {
        const slash = raw.indexOf('/');
        state[field.key] = slash === -1 ? raw : raw.slice(0, slash);
        state[field.totalKey] = slash === -1 ? '' : raw.slice(slash + 1);
      } else if (field.frameId === 'COMM') {
        try {
          const parsed = JSON.parse(raw) as { text?: string };
          state[field.key] = parsed.text ?? '';
        } catch {
          state[field.key] = raw;
        }
      } else {
        state[field.key] = raw;
      }
    }
  }

  // Fall back to TrackMetadata for the fields it tracks, where native tags are empty
  if (track) {
    if (!state.title && track.title) {
      state.title = track.title;
    }
    if (!state.artist && track.artist) {
      state.artist = track.artist;
    }
    if (!state.albumArtist && track.albumArtist) {
      state.albumArtist = track.albumArtist;
    }
    if (!state.album && track.album) {
      state.album = track.album;
    }
    if (!state.genre && track.genre) {
      state.genre = track.genre;
    }
    if (!state.trackNum && track.track !== null) {
      state.trackNum = String(track.track);
    }
  }

  state.preferComposerGrouping = preferComposerGroupingFormValue(
    hasNativePreferComposerGrouping
      ? nativePreferComposerGrouping
      : (track?.preferComposerGrouping ?? null),
    state.genre,
  );

  return state;
}
