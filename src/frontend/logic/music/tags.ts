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
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
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
